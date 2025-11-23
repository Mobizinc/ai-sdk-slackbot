/**
 * Change Validation Service
 * Orchestrates automated validation of ServiceNow Standard Changes
 * Uses Claude with QA Analyst skill for intelligent synthesis
 */

import { withLangSmithTrace, traceLLMCall } from "../observability";
import { getChangeValidationRepository } from "../db/repositories/change-validation-repository";
import type { ChangeValidation } from "../db/schema";
import {
  ServiceNowChangeWebhookSchema,
  type ServiceNowChangeWebhook,
  detectComponentType,
  extractDocumentationFields,
  type ComponentType
} from "../schemas/servicenow-change-webhook";
import { getServiceNowConfig } from "../config/helpers";
import {
  getAnthropicClient,
  getConfiguredModel,
  calculateCost as calculateAnthropicCost,
  formatUsageMetrics
} from "../anthropic-provider";
import { jsonrepair } from "jsonrepair";
import {
  getChangeRepository,
  createChangeRepositoryInstance,
  getTableApiClient,
} from "../infrastructure/servicenow/repositories/factory";
import type { ChangeRequest } from "../infrastructure/servicenow/repositories/change-repository.impl";
import type { CMDBRepository } from "../infrastructure/servicenow/repositories/cmdb-repository.interface";
import type { ServiceCatalogRepository } from "../infrastructure/servicenow/repositories/catalog-repository.interface";
import { serviceNowClient } from "../tools/servicenow";

// ServiceNow API timeout (prevent hanging)
const SERVICENOW_TIMEOUT_MS = 8000; // 8 seconds

interface ValidationPayload {
  change_sys_id: string;
  change_number: string;
  component_type: string;
  component_sys_id?: string;
  submitted_by?: string;
  [key: string]: any;
}

interface ValidationRequest {
  changeSysId: string;
  changeNumber: string;
  componentType: string;
  componentSysId?: string;
  payload: ValidationPayload;
  hmacSignature?: string;
  requestedBy?: string;
}

interface ValidationResult {
  overall_status: "APPROVE" | "APPROVE_WITH_CONDITIONS" | "REJECT";
  documentation_assessment: string;
  risks: string[];
  required_actions: string[];
  synthesis: string;
  checks?: Record<string, boolean>;
}

interface ComponentFactBlock {
  component_type: ComponentType;
  sys_id?: string;
  name?: string;
  source: "servicenow" | "archived";
  archived?: boolean;
  facts: Record<string, any>;
  warnings: string[];
}

interface CloneFreshnessResult {
  status: "ok" | "stale" | "not_found" | "error" | "skipped";
  target_instance: string;
  source_instance: string;
  last_clone_date: string | null;
  age_days: number | null;
  is_fresh: boolean | null;
  message?: string;
}

class ChangeValidationService {
  private repository = getChangeValidationRepository();
  private changeRepository = getChangeRepository();
  private tableClient = getTableApiClient();
  private anthropic = getAnthropicClient();
  private anthropicModel = getConfiguredModel();
  private readonly skillBetaHeader = "skills-2025-10-02";
  private readonly codeExecutionBetaHeader = "code-execution-2025-08-25";

  private getCabSkillId(): string | undefined {
    const skillId = undefined; // TODO: Add to consolidated config
    return skillId ? skillId : undefined;
  }

  /**
   * Receive and queue a change validation request from webhook
   */
  async receiveWebhook(
    payload: unknown,
    hmacSignature?: string,
    requestedBy?: string
  ): Promise<ChangeValidation> {
    const startTime = Date.now();

    try {
      // Validate payload schema
      const validated = ServiceNowChangeWebhookSchema.parse(payload);

      console.log(`[Change Validation] Received webhook for ${validated.change_number}`);

      // Detect component type and sys_id from payload
      const component = detectComponentType(validated);
      console.log(`[Change Validation] Detected component: ${component.type} (${component.sysId || 'no sys_id'})`);

      // Extract documentation fields for archival
      const documentationFields = extractDocumentationFields(validated);

      // Enrich payload with archived documentation for fallback
      const enrichedPayload = {
        ...validated,
        archived_documentation: documentationFields
      };

      // Create DB record with detected component type
      const record = await this.repository.create({
        changeNumber: validated.change_number,
        changeSysId: validated.change_sys_id,
        componentType: component.type,  // Use detected type
        componentSysId: component.sysId, // Use detected sys_id
        payload: enrichedPayload as Record<string, any>,
        hmacSignature: hmacSignature,
        requestedBy: requestedBy,
        status: "received",
      });

      console.log(`[Change Validation] Created DB record: ${record.id}`);

      return record;
    } catch (error) {
      console.error("[Change Validation] Error in receiveWebhook:", error);
      throw error;
    }
  }

  /**
   * Process a queued change validation request
   */
  async processValidation(changeSysId: string): Promise<ValidationResult> {
    const startTime = Date.now();

    try {
      // Fetch the validation record
      const record = await this.repository.getByChangeSysId(changeSysId);
      if (!record) {
        throw new Error(`Validation record not found: ${changeSysId}`);
      }

      console.log(`[Change Validation] Processing ${record.changeNumber}`);

      // Mark as processing
      await this.repository.markProcessing(changeSysId);

      // Collect validation facts from ServiceNow
      const facts = await this.collectValidationFacts(record);

      // Synthesize results using Claude (falls back to rules on failure)
      const validationResult = await this.synthesizeWithClaude(record, facts);

      // Calculate processing time
      const processingTimeMs = Date.now() - startTime;

      // Update DB with results
      const updated = await this.repository.markCompleted(
        changeSysId,
        validationResult,
        processingTimeMs
      );

      // Post results back to ServiceNow
      await this.postResultsToServiceNow(record, validationResult);

      console.log(`[Change Validation] Completed ${record.changeNumber} in ${processingTimeMs}ms`);

      return validationResult;
    } catch (error) {
      console.error(`[Change Validation] Error processing ${changeSysId}:`, error);

      const processingTimeMs = Date.now() - startTime;
      const errorMsg = error instanceof Error ? error.message : String(error);

      try {
        await this.repository.markFailed(changeSysId, errorMsg, processingTimeMs);
      } catch (dbError) {
        console.error("[Change Validation] Failed to mark error in DB:", dbError);
      }

      throw error;
    }
  }

  /**
   * Timeout wrapper for ServiceNow API calls
   */
  private async withTimeout<T>(
    promise: Promise<T>,
    timeoutMs: number,
    operationName: string
  ): Promise<T | null> {
    return new Promise<T | null>((resolve, reject) => {
      const timeoutHandle = setTimeout(() => {
        console.warn(`[Change Validation] ${operationName} timed out after ${timeoutMs}ms`);
        resolve(null);
      }, timeoutMs);

      promise
        .then((value) => {
          clearTimeout(timeoutHandle);
          resolve(value);
        })
        .catch((error) => {
          clearTimeout(timeoutHandle);
          reject(error);
        });
    });
  }

  /**
   * Check if a date string is within the specified number of days
   */
  private isRecentlyUpdated(dateStr: string, days: number): boolean {
    try {
      const date = new Date(dateStr);
      const cutoffDate = new Date();
      cutoffDate.setDate(cutoffDate.getDate() - days);
      return date > cutoffDate;
    } catch (error) {
      console.warn("[Change Validation] Invalid date for recency check:", dateStr);
      return false;
    }
  }

  /**
   * Collect validation facts from ServiceNow
   * Runs collectors in parallel with timeouts to prevent hanging
   */
  private async collectValidationFacts(
    record: ChangeValidation
  ): Promise<Record<string, any>> {
    const facts: Record<string, any> = {
      component_type: record.componentType,
      component_sys_id: record.componentSysId,
      collection_errors: [],
      checks: {} as Record<string, boolean>,
      component_facts: [] as ComponentFactBlock[],
    };

    if (record.payload?.archived_documentation) {
      facts.documentation = record.payload.archived_documentation;
    }

    try {
      // Phase 1: Environment Health Check - UAT Clone Freshness
      const cloneFreshness = await this.collectCloneFreshness(record);
      facts.clone_freshness_check = cloneFreshness;
      if (cloneFreshness && typeof cloneFreshness.is_fresh === "boolean") {
        facts.checks.clone_is_fresh = cloneFreshness.is_fresh;
      }
      if (
        cloneFreshness?.message &&
        (cloneFreshness.status === "error" || cloneFreshness.status === "not_found")
      ) {
        facts.collection_errors.push(cloneFreshness.message);
      }

      const changeDetails = await this.loadChangeDetails(record.changeSysId);
      if (!changeDetails) {
        throw new Error("Change details not found");
      }
      facts.change_details = changeDetails;

      // Component-specific collectors - run in parallel
      const componentFacts = await this.collectComponentFacts(record, facts);
      facts.component_facts = componentFacts;

      // Build documentation snapshot from live change data with archived fallback
      const documentation = this.buildDocumentationFields(
        facts.change_details,
        record.payload?.archived_documentation
      );
      facts.documentation = documentation;

      // Add checks for documentation completeness
      facts.checks.has_implementation_plan = !!documentation.implementation_plan;
      facts.checks.has_rollback_plan = !!documentation.rollback_plan;
      facts.checks.has_test_plan = !!documentation.test_plan;
      facts.checks.has_justification = !!documentation.justification;

    } catch (error) {
      console.warn("[Change Validation] Error collecting facts:", error);
      // Continue - facts might be incomplete but validation can proceed
      facts.collection_errors.push(error instanceof Error ? error.message : String(error));
    }

    // Determine data source for audit trail
    const hasArchivedComponents =
      Array.isArray(facts.component_facts) &&
      facts.component_facts.some(
        (component: ComponentFactBlock) => component.source === "archived" || component.archived
      );

    if (hasArchivedComponents) {
      facts.data_source = "archived";
    } else if (facts.collection_errors.length > 0) {
      facts.data_source = "partial";
    } else {
      facts.data_source = "api";
    }

    return facts;
  }

  /**
   * Synthesize validation using Claude (ReACT pattern)
   * Uses LangSmith tracing for observability
   *
   * IMPORTANT: Do NOT use Anthropic Agent Skills for this task.
   *
   * Agent Skills are designed for:
   * - Multi-step file generation (PowerPoint, Excel, PDF, Word)
   * - Complex code execution workflows requiring filesystem operations
   * - Tasks requiring iterative code execution
   *
   * This task is a pure reasoning operation:
   * - Input: Validation facts bundle (~10-15K tokens)
   * - Process: Reason over standards and facts
   * - Output: Structured JSON verdict (~1K tokens)
   *
   * Using skills would add:
   * - ❌ 10-30K extra tokens for skill loading
   * - ❌ Code execution overhead (no benefit)
   * - ❌ 5-10x slower response time
   * - ❌ Potential for infinite loops if misconfigured
   * - ❌ 7-10x higher cost per validation
   *
   * The current implementation using standard messages.create() is correct.
   * See Issue #89 for details on why skills were removed.
   */
  private async synthesizeWithClaude(
    record: ChangeValidation,
    facts: Record<string, any>
  ): Promise<ValidationResult> {
    if (!this.anthropic) {
      console.warn("[Change Validation] Claude not configured, falling back to rules-based validation");
      return this.synthesizeWithRules(record, facts);
    }

    const cabSkillId = this.getCabSkillId();
    if (!cabSkillId) {
      console.warn("[Change Validation] CAB skill ID not configured; falling back to rules-based validation");
      return this.synthesizeWithRules(record, facts);
    }

    const userPrompt = `Evaluate the following change:

Change Number: ${record.changeNumber}
Component Type: ${record.componentType}
Requested By: ${record.requestedBy || "Unknown"}

<change_request_data>
${JSON.stringify(facts, null, 2)}
</change_request_data>

<scratchpad>
Assess documentation, environment readiness, downstream impact, historical patterns, and CAB decision.
</scratchpad>

Before responding, load the ServiceNow Architect skill instructions by reading /skills/servicenow-architect/SKILL.md (and any referenced assets) using the code execution tool, follow its guidance precisely, then respond ONLY with the JSON object described above.`;
    const skillBootstrap = `<skill_bootstrap>
1. Use the code_execution tool to run: cat /skills/servicenow-architect/SKILL.md
2. Read and internalize those instructions (and any referenced files).
3. Only after completing steps 1-2 may you analyze the fact bundle and produce the CAB JSON output.
</skill_bootstrap>`;

    try {
      const userMessage = {
        role: "user" as const,
        content: `${skillBootstrap}\n\n${userPrompt}`,
      };

      const tracedFn = traceLLMCall(
        async () => {
          console.log(`[Change Validation] Using CAB skill ${cabSkillId}`);

          const conversationMessages: Array<{ role: "user" | "assistant"; content: any }> = [
            userMessage,
          ];
          let containerId: string | undefined;
          let response: any;
          const maxSkillIterations = 6; // TODO: Add to consolidated config
          const skillTimeoutMs = 30000; // TODO: Add to consolidated config
          const perCallMaxTokens = 1024; // TODO: Add to consolidated config

          const fetchSkillResponse = async (): Promise<any> => {
            const timeoutController = new AbortController();
            const timeoutHandle = setTimeout(() => timeoutController.abort(), skillTimeoutMs);
            try {
              return await this.anthropic.beta.messages.create(
                {
                  model: this.anthropicModel,
                  max_tokens: perCallMaxTokens,
                  messages: conversationMessages,
                  betas: [this.codeExecutionBetaHeader, this.skillBetaHeader],
                  container: containerId
                    ? { id: containerId }
                    : {
                        skills: [
                          {
                            skill_id: cabSkillId,
                            type: "custom",
                            version: "latest",
                          },
                        ],
                      },
                  tools: [
                    {
                      type: "code_execution_20250825",
                      name: "code_execution",
                    } as any,
                  ],
                  tool_choice: { type: "auto" } as any,
                },
                { signal: timeoutController.signal }
              );
            } finally {
              clearTimeout(timeoutHandle);
            }
          };

          const extractResponseText = (content: any): string => {
            if (!content) {
              return "";
            }
            if (typeof content === "string") {
              return content;
            }
            if (Array.isArray(content)) {
              return content
                .map((item) => {
                  if (!item) return "";
                  if (typeof item === "string") return item;
                  if (item.type === "text" && typeof item.text === "string") {
                    return item.text;
                  }
                  if (typeof item.input_text === "string") {
                    return item.input_text;
                  }
                  return "";
                })
                .filter(Boolean)
                .join("\n")
                .trim();
            }
            if (typeof content === "object" && typeof content.text === "string") {
              return content.text;
            }
            return "";
          };

          let responseText = "";

          for (let attempt = 0; attempt < maxSkillIterations; attempt++) {
            response = await fetchSkillResponse();

            containerId = response?.container?.id ?? containerId;
            const stopReason = response?.stop_reason ?? "unknown";
            console.log(`[Change Validation] Skill response stop_reason: ${stopReason}`);
            if (stopReason !== "pause_turn" && stopReason !== "max_tokens") {
              responseText = extractResponseText(response?.content);
              break;
            }

            if (attempt === maxSkillIterations - 1) {
              throw new Error(
                `Skill container exceeded ${maxSkillIterations} iterations without producing CAB JSON (last stop_reason=${stopReason})`
              );
            }

            conversationMessages.push({
              role: "assistant",
              content: response?.content ?? [],
            });
          }

          if (response?.stop_reason === "pause_turn") {
            throw new Error("Skill response did not complete after multiple iterations");
          }

          if (!responseText) {
            responseText = extractResponseText(response?.content);
          }

          if (!responseText) {
            throw new Error("Claude skill response did not include any text content");
          }

          const parsed = this.parseClaudeResponse(responseText);
          return this.normalizeValidationResult(parsed);
        },
        {
          name: "claude-change-validation-synthesis",
          tags: {
            component: "llm",
            operation: "validation-synthesis",
            service: "servicenow",
            model: this.anthropicModel
          },
          metadata: {
            change_number: record.changeNumber,
            component_type: record.componentType,
            model: this.anthropicModel,
          },
        }
      );

      return await tracedFn();
    } catch (error) {
      console.error("[Change Validation] Error synthesizing with Claude:", {
        error: error instanceof Error ? error.message : String(error),
        change_number: record.changeNumber,
      });
      // Fall back to rules-based validation
      return this.synthesizeWithRules(record, facts);
    }
  }

  /**
   * Synthesize validation using rules (fallback)
   */
  private synthesizeWithRules(
    record: ChangeValidation,
    facts: Record<string, any>
  ): ValidationResult {
    const checks = facts.checks || {};
    const allChecksPassed = Object.values(checks).every((v) => v === true);

    let legacyStatus: "PASSED" | "FAILED" | "WARNING" = "PASSED";
    if (!allChecksPassed) {
      const criticalChecks = Object.entries(checks).filter(([k]) =>
        k.includes("has_") || k.includes("is_")
      );
      const criticalFailures = criticalChecks.filter(([, v]) => v === false);
      legacyStatus = criticalFailures.length > 0 ? "FAILED" : "WARNING";
    }

    const failedChecks = Object.entries(checks)
      .filter(([, v]) => v === false)
      .map(([k]) => k.replace(/_/g, " "));

    const overall_status: ValidationResult["overall_status"] =
      legacyStatus === "PASSED"
        ? "APPROVE"
        : legacyStatus === "WARNING"
          ? "APPROVE_WITH_CONDITIONS"
          : "REJECT";

    let synthesis = "";
    if (overall_status === "APPROVE") {
      synthesis = `✅ Change validation passed in fallback mode. All configuration checks completed successfully.`;
    } else if (overall_status === "REJECT") {
      synthesis = `❌ Change validation failed. Missing or invalid configuration: ${failedChecks.join(
        ", "
      )}. Please remediate before proceeding.`;
    } else {
      synthesis = `⚠️ Change validation returned warnings. Review the following checks before deployment: ${failedChecks.join(
        ", "
      )}.`;
    }

    const documentation_assessment =
      overall_status === "APPROVE"
        ? "Documentation and configuration checks passed automated fallback review."
        : `Configuration gaps detected: ${failedChecks.join(", ") || "unspecified issues"}.`;

    const risks = failedChecks.length > 0 ? failedChecks : [];
    const required_actions =
      overall_status === "APPROVE"
        ? []
        : failedChecks.map((check) => `Resolve configuration gap: ${check}`);

    return this.normalizeValidationResult({
      overall_status,
      documentation_assessment,
      risks,
      required_actions,
      synthesis,
      checks: Object.keys(checks).length ? checks : undefined,
    });
  }

  private parseClaudeResponse(text: string): ValidationResult {
    const candidates: string[] = [];
    const trimmed = text.trim();
    if (trimmed) {
      candidates.push(trimmed);
    }

    const codeBlockRegex = /```(?:json)?\s*([\s\S]*?)```/gi;
    let codeMatch: RegExpExecArray | null;
    while ((codeMatch = codeBlockRegex.exec(text)) !== null) {
      const block = codeMatch[1]?.trim();
      if (block) {
        candidates.push(block);
      }
    }

    const braceMatch = text.match(/\{[\s\S]*\}/);
    if (braceMatch) {
      candidates.push(braceMatch[0]);
    }

    const seen = new Set<string>();
    for (const candidate of candidates) {
      if (!candidate || seen.has(candidate)) continue;
      seen.add(candidate);
      const attempts = [candidate, jsonrepair(candidate)];
      for (const attempt of attempts) {
        try {
          const parsed = JSON.parse(attempt) as ValidationResult;
          if (parsed && typeof parsed === "object" && parsed.overall_status) {
            return parsed;
          }
        } catch {
          continue;
        }
      }
    }

    throw new Error("Could not extract JSON from Claude response");
  }

  private normalizeValidationResult(result: Partial<ValidationResult>): ValidationResult {
    const normalized: ValidationResult = {
      overall_status: result.overall_status ?? "REJECT",
      documentation_assessment:
        result.documentation_assessment ??
        "Documentation review unavailable; treat as incomplete until revalidated.",
      risks: Array.isArray(result.risks) ? result.risks.filter(Boolean) : [],
      required_actions: Array.isArray(result.required_actions)
        ? result.required_actions.filter(Boolean)
        : [],
      synthesis:
        result.synthesis ??
        (result.overall_status === "APPROVE"
          ? "✅ Automated validation passed without issues."
          : "❌ Automated validation failed; documentation and readiness details are incomplete."),
      checks: result.checks,
    };

    if (normalized.overall_status !== "APPROVE" && normalized.required_actions.length === 0) {
      normalized.required_actions.push(
        "Provide complete documentation (implementation, rollback, test plans) before resubmission."
      );
    }

    return normalized;
  }

  private async collectCloneFreshness(record: ChangeValidation): Promise<CloneFreshnessResult> {
    const snConfig = getServiceNowConfig();
    const targetInstance = snConfig.cloneTargetInstance || "mobizuat";
    const sourceInstance = snConfig.cloneSourceInstance || "mobizprod";

    if (!this.shouldCheckCloneFreshness(record)) {
      return {
        status: "skipped",
        target_instance: targetInstance,
        source_instance: sourceInstance,
        last_clone_date: null,
        age_days: null,
        is_fresh: null,
        message: "Clone freshness check skipped for non-Platform Update templates.",
      };
    }

    try {
      const cloneInfo = await this.withTimeout(
        serviceNowClient.getCloneInfo(targetInstance, sourceInstance),
        SERVICENOW_TIMEOUT_MS,
        "getCloneInfo"
      );

      if (!cloneInfo) {
        return {
          status: "not_found",
          target_instance: targetInstance,
          source_instance: sourceInstance,
          last_clone_date: null,
          age_days: null,
          is_fresh: null,
          message: `Clone info unavailable for target instance '${targetInstance}'.`,
        };
      }

      const ageDays =
        typeof cloneInfo.clone_age_days === "number"
          ? cloneInfo.clone_age_days
          : cloneInfo.clone_age_days ?? null;
      const isFresh = typeof ageDays === "number" ? ageDays <= 30 : null;

      return {
        status: isFresh === null ? "error" : isFresh ? "ok" : "stale",
        target_instance: cloneInfo.target_instance || targetInstance,
        source_instance: cloneInfo.source_instance || sourceInstance,
        last_clone_date: cloneInfo.last_clone_date || null,
        age_days: ageDays,
        is_fresh: isFresh,
        message:
          isFresh === null
            ? "Clone record missing age_days information."
            : undefined,
      };
    } catch (error) {
      return {
        status: "error",
        target_instance: targetInstance,
        source_instance: sourceInstance,
        last_clone_date: null,
        age_days: null,
        is_fresh: null,
        message: error instanceof Error ? error.message : String(error),
      };
    }
  }

  private async loadChangeDetails(changeSysId: string): Promise<ChangeRequest | null> {
    try {
      const change = await this.changeRepository.fetchChangeById(changeSysId);
      if (change) {
        return change;
      }
    } catch (error) {
      console.warn("[Change Validation] Primary change repository failed:", error);
    }

    try {
      const fallbackRepo = createChangeRepositoryInstance();
      if (fallbackRepo) {
        const change = await fallbackRepo.fetchChangeById(changeSysId);
        if (change) {
          return change;
        }
      }
    } catch (error) {
      console.warn("[Change Validation] Fallback change repository failed:", error);
    }

    return null;
  }

  private async collectComponentFacts(
    record: ChangeValidation,
    facts: Record<string, any>
  ): Promise<ComponentFactBlock[]> {
    const componentFacts: ComponentFactBlock[] = [];
    const payload = (record.payload ?? {}) as Record<string, any>;
    const checks = (facts.checks = facts.checks ?? {});

    const registerWarnings = (warnings: string[] = []) => {
      for (const warning of warnings) {
        if (warning) {
          facts.collection_errors.push(warning);
        }
      }
    };

    const pushEntry = (entry?: ComponentFactBlock | null) => {
      if (entry) {
        componentFacts.push(entry);
        registerWarnings(entry.warnings);
      }
    };

    // Template metadata
    const templateSysId =
      (record.componentType === "std_change_template" && record.componentSysId) ||
      payload.std_change_producer_version?.value;

    if (templateSysId) {
      try {
        const metadata = await this.loadTemplateMetadata(templateSysId);
        if (metadata) {
          const normalized = this.normalizeTemplateMetadata(metadata, record);
          const entry: ComponentFactBlock = {
            component_type: "std_change_template",
            sys_id: templateSysId,
            name:
              normalized.version?.name ||
              payload.std_change_producer_version?.display_value ||
              payload.std_change_producer_version?.name,
            source: "servicenow",
            facts: normalized,
            warnings: [],
          };
          pushEntry(entry);

          checks.template_active = normalized.active === true || normalized.producer?.active === true;
          checks.template_published = normalized.published === true;
          checks.template_has_workflow = Boolean(normalized.workflow);
          if (normalized.last_updated) {
            checks.template_recently_updated = this.isRecentlyUpdated(normalized.last_updated, 120);
          }
          if (normalized.version?.percent_successful !== undefined) {
            const successRate = Number(normalized.version.percent_successful);
            if (!Number.isNaN(successRate)) {
              checks.template_success_rate_95 = successRate >= 95;
            }
          }
        } else {
          const warnings = ["Template metadata unavailable from ServiceNow"];
          pushEntry({
            component_type: "std_change_template",
            sys_id: templateSysId,
            name: payload.std_change_producer_version?.display_value,
            source: "archived",
            archived: true,
            facts: {
              template_version: payload.std_change_producer_version,
              note: "Using webhook payload fallback because template metadata could not be retrieved.",
            },
            warnings,
          });
          checks.template_active = false;
          checks.template_published = false;
          checks.template_has_workflow = false;
        }
      } catch (error) {
        const warnings = [
          `Template metadata fetch failed: ${error instanceof Error ? error.message : String(error)}`,
        ];
        pushEntry({
          component_type: "std_change_template",
          sys_id: templateSysId,
          name: payload.std_change_producer_version?.display_value,
          source: "archived",
          archived: true,
          facts: {
            template_version: payload.std_change_producer_version,
            note: "Falling back to archived template data after ServiceNow API error.",
          },
          warnings,
        });
        checks.template_active = false;
        checks.template_published = false;
        checks.template_has_workflow = false;
      }
    }

    // CMDB CI facts
    const cmdbSysId =
      (record.componentType === "cmdb_ci" && record.componentSysId) ||
      payload.cmdb_ci?.sys_id;

    if (cmdbSysId) {
      try {
        const rawDetails = await this.fetchCmdbDetails(cmdbSysId);
        if (rawDetails) {
          const normalized = {
            sys_id: this.normalizeReference(rawDetails.sys_id),
            name: this.normalizeReference(rawDetails.name),
            sys_class_name: this.normalizeReference(rawDetails.sys_class_name),
            owner: this.normalizeReference(rawDetails.owned_by),
            environment: this.normalizeReference(rawDetails.environment),
            install_status: this.normalizeReference(rawDetails.install_status),
            operational_status: this.normalizeReference(rawDetails.operational_status),
            business_criticality: this.normalizeReference(rawDetails.business_criticality),
            relationships: rawDetails.relationships ?? [],
          };

          pushEntry({
            component_type: "cmdb_ci",
            sys_id: cmdbSysId,
            name: normalized.name,
            source: "servicenow",
            facts: normalized,
            warnings: [],
          });

          checks.cmdb_owner_defined = Boolean(normalized.owner);
          checks.cmdb_environment_defined = Boolean(normalized.environment);
          const status = (normalized.install_status || "").toString().toLowerCase();
          checks.cmdb_operational =
            status.length === 0 || (status !== "retired" && status !== "retiring");
        } else {
          const warnings = [`CMDB CI ${cmdbSysId} not found or inaccessible.`];
          pushEntry({
            component_type: "cmdb_ci",
            sys_id: cmdbSysId,
            name: payload.cmdb_ci?.name,
            source: "archived",
            archived: true,
            facts: {
              cmdb_ci: payload.cmdb_ci,
              note: "Using webhook payload fallback because CMDB CI could not be retrieved.",
            },
            warnings,
          });
          checks.cmdb_owner_defined = false;
          checks.cmdb_environment_defined = false;
          checks.cmdb_operational = false;
        }
      } catch (error) {
        const warnings = [
          `CMDB CI fetch failed: ${error instanceof Error ? error.message : String(error)}`,
        ];
        pushEntry({
          component_type: "cmdb_ci",
          sys_id: cmdbSysId,
          name: payload.cmdb_ci?.name,
          source: "archived",
          archived: true,
          facts: {
            cmdb_ci: payload.cmdb_ci,
            note: "Falling back to archived CMDB payload after ServiceNow API error.",
          },
          warnings,
        });
        checks.cmdb_owner_defined = false;
        checks.cmdb_environment_defined = false;
        checks.cmdb_operational = false;
      }
    }

    const catalogSysId =
      (record.componentType === "catalog_item" && record.componentSysId) ||
      payload.catalog_item?.sys_id ||
      payload.catalog_item?.value ||
      (typeof payload.catalog_item === "string" ? payload.catalog_item : undefined);

    if (catalogSysId) {
      try {
        const catalogItem = await this.fetchTableRecord(
          "sc_cat_item",
          catalogSysId,
          ["sys_id", "name", "short_description", "active", "workflow", "category", "owner", "sys_updated_on"]
        );

        if (catalogItem) {
          const normalized = {
            sys_id: this.normalizeReference(catalogItem.sys_id),
            name: this.normalizeReference(catalogItem.name),
            short_description: this.normalizeReference(catalogItem.short_description),
            active: this.normalizeBoolean(catalogItem.active),
            workflow: this.normalizeReference(catalogItem.workflow),
            category: this.normalizeReference(catalogItem.category),
            owner: this.normalizeReference(catalogItem.owner),
            last_updated: catalogItem.sys_updated_on,
          };

          pushEntry({
            component_type: "catalog_item",
            sys_id: catalogSysId,
            name: normalized.name,
            source: "servicenow",
            facts: normalized,
            warnings: [],
          });

          checks.catalog_active = normalized.active === true;
          checks.catalog_has_workflow = Boolean(normalized.workflow);
          checks.catalog_has_category = Boolean(normalized.category);
        } else {
          const warnings = [`Catalog item ${catalogSysId} not found.`];
          pushEntry({
            component_type: "catalog_item",
            sys_id: catalogSysId,
            name: undefined,
            source: "archived",
            archived: true,
            facts: {
              note: "Catalog item metadata unavailable from ServiceNow.",
            },
            warnings,
          });
          checks.catalog_active = false;
          checks.catalog_has_workflow = false;
          checks.catalog_has_category = false;
        }
      } catch (error) {
        const warnings = [
          `Catalog item fetch failed: ${error instanceof Error ? error.message : String(error)}`,
        ];
        pushEntry({
          component_type: "catalog_item",
          sys_id: catalogSysId,
          name: undefined,
          source: "archived",
          archived: true,
          facts: {
            note: "Catalog item metadata unavailable due to ServiceNow API error.",
          },
          warnings,
        });
        checks.catalog_active = false;
        checks.catalog_has_workflow = false;
        checks.catalog_has_category = false;
      }
    }

    const workflowSysId =
      (record.componentType === "workflow" && record.componentSysId) ||
      payload.workflow?.sys_id ||
      payload.workflow?.value ||
      (typeof payload.workflow === "string" ? payload.workflow : undefined);

    if (workflowSysId) {
      try {
        const workflow = await this.fetchTableRecord(
          "wf_workflow",
          workflowSysId,
          ["sys_id", "name", "published", "checked_out", "scoped_app", "description"]
        );

        if (workflow) {
          const normalized = {
            sys_id: this.normalizeReference(workflow.sys_id),
            name: this.normalizeReference(workflow.name),
            published: this.normalizeBoolean(workflow.published),
            checked_out: this.normalizeBoolean(workflow.checked_out),
            scoped_app: this.normalizeReference(workflow.scoped_app),
            description: this.normalizeReference(workflow.description),
          };

          pushEntry({
            component_type: "workflow",
            sys_id: workflowSysId,
            name: normalized.name,
            source: "servicenow",
            facts: normalized,
            warnings: [],
          });

          checks.workflow_is_published = normalized.published === true;
          checks.workflow_not_checked_out = normalized.checked_out !== true;
          checks.workflow_has_scope = Boolean(normalized.scoped_app);
        } else {
          const warnings = [`Workflow ${workflowSysId} not found.`];
          pushEntry({
            component_type: "workflow",
            sys_id: workflowSysId,
            name: undefined,
            source: "archived",
            archived: true,
            facts: {
              note: "Workflow metadata unavailable from ServiceNow.",
            },
            warnings,
          });
          checks.workflow_is_published = false;
          checks.workflow_not_checked_out = false;
          checks.workflow_has_scope = false;
        }
      } catch (error) {
        const warnings = [
          `Workflow fetch failed: ${error instanceof Error ? error.message : String(error)}`,
        ];
        pushEntry({
          component_type: "workflow",
          sys_id: workflowSysId,
          name: undefined,
          source: "archived",
          archived: true,
          facts: {
            note: "Workflow metadata unavailable due to ServiceNow API error.",
          },
          warnings,
        });
        checks.workflow_is_published = false;
        checks.workflow_not_checked_out = false;
        checks.workflow_has_scope = false;
      }
    }

    const ldapSysId =
      (record.componentType === "ldap_server" && record.componentSysId) ||
      payload.ldap_server?.sys_id ||
      payload.ldap_server?.value ||
      (typeof payload.ldap_server === "string" ? payload.ldap_server : undefined);

    if (ldapSysId) {
      try {
        const ldapServer = await this.fetchTableRecord(
          "cmdb_ci_ldap_server",
          ldapSysId,
          ["sys_id", "name", "listener_enabled", "mid_server", "urls", "paging_enabled"]
        );

        if (ldapServer) {
          const normalized = {
            sys_id: this.normalizeReference(ldapServer.sys_id),
            name: this.normalizeReference(ldapServer.name),
            listener_enabled: this.normalizeBoolean(ldapServer.listener_enabled),
            mid_server: this.normalizeReference(ldapServer.mid_server),
            urls: ldapServer.urls,
            paging_enabled: this.normalizeBoolean(ldapServer.paging_enabled),
          };

          pushEntry({
            component_type: "ldap_server",
            sys_id: ldapSysId,
            name: normalized.name,
            source: "servicenow",
            facts: normalized,
            warnings: [],
          });

          checks.ldap_listener_enabled = normalized.listener_enabled === true;
          checks.ldap_has_mid_server = Boolean(normalized.mid_server);
          if (Array.isArray(normalized.urls)) {
            checks.ldap_has_urls = normalized.urls.length > 0;
          } else {
            checks.ldap_has_urls = Boolean(normalized.urls);
          }
        } else {
          const warnings = [`LDAP server ${ldapSysId} not found.`];
          pushEntry({
            component_type: "ldap_server",
            sys_id: ldapSysId,
            name: undefined,
            source: "archived",
            archived: true,
            facts: {
              note: "LDAP server metadata unavailable from ServiceNow.",
            },
            warnings,
          });
          checks.ldap_listener_enabled = false;
          checks.ldap_has_mid_server = false;
          checks.ldap_has_urls = false;
        }
      } catch (error) {
        const warnings = [
          `LDAP server fetch failed: ${error instanceof Error ? error.message : String(error)}`,
        ];
        pushEntry({
          component_type: "ldap_server",
          sys_id: ldapSysId,
          name: undefined,
          source: "archived",
          archived: true,
          facts: {
            note: "LDAP server metadata unavailable due to ServiceNow API error.",
          },
          warnings,
        });
        checks.ldap_listener_enabled = false;
        checks.ldap_has_mid_server = false;
        checks.ldap_has_urls = false;
      }
    }

    const midServerSysId =
      (record.componentType === "mid_server" && record.componentSysId) ||
      payload.mid_server?.sys_id ||
      payload.mid_server?.value ||
      (typeof payload.mid_server === "string" ? payload.mid_server : undefined);

    if (midServerSysId) {
      try {
        const midServer = await this.fetchTableRecord(
          "ecc_agent",
          midServerSysId,
          ["sys_id", "name", "status", "capabilities", "last_check_in", "version"]
        );

        if (midServer) {
          const normalized = {
            sys_id: this.normalizeReference(midServer.sys_id),
            name: this.normalizeReference(midServer.name),
            status: this.normalizeReference(midServer.status),
            capabilities: midServer.capabilities,
            last_check_in: midServer.last_check_in,
            version: this.normalizeReference(midServer.version),
          };

          pushEntry({
            component_type: "mid_server",
            sys_id: midServerSysId,
            name: normalized.name,
            source: "servicenow",
            facts: normalized,
            warnings: [],
          });

          const status = (normalized.status || "").toString().toLowerCase();
          checks.mid_is_up = status === "up";
          checks.mid_has_capabilities =
            Array.isArray(normalized.capabilities) && normalized.capabilities.length > 0
              ? true
              : Boolean(normalized.capabilities);
          checks.mid_recent_check_in = normalized.last_check_in
            ? this.isRecentlyUpdated(normalized.last_check_in, 1)
            : false;
        } else {
          const warnings = [`MID server ${midServerSysId} not found.`];
          pushEntry({
            component_type: "mid_server",
            sys_id: midServerSysId,
            name: undefined,
            source: "archived",
            archived: true,
            facts: {
              note: "MID server metadata unavailable from ServiceNow.",
            },
            warnings,
          });
          checks.mid_is_up = false;
          checks.mid_has_capabilities = false;
          checks.mid_recent_check_in = false;
        }
      } catch (error) {
        const warnings = [
          `MID server fetch failed: ${error instanceof Error ? error.message : String(error)}`,
        ];
        pushEntry({
          component_type: "mid_server",
          sys_id: midServerSysId,
          name: undefined,
          source: "archived",
          archived: true,
          facts: {
            note: "MID server metadata unavailable due to ServiceNow API error.",
          },
          warnings,
        });
        checks.mid_is_up = false;
        checks.mid_has_capabilities = false;
        checks.mid_recent_check_in = false;
      }
    }

    return componentFacts;
  }

  private normalizeReference(value: any): string | undefined {
    if (value === null || value === undefined) {
      return undefined;
    }
    if (typeof value === "string") {
      return value;
    }
    if (typeof value === "object") {
      if (typeof value.display_value === "string") {
        return value.display_value;
      }
      if (typeof value.name === "string") {
        return value.name;
      }
      if (typeof value.value === "string") {
        return value.value;
      }
    }
    return undefined;
  }

  private normalizeBoolean(value: any): boolean | undefined {
    if (typeof value === "boolean") {
      return value;
    }
    if (typeof value === "string") {
      const normalized = value.toLowerCase();
      if (normalized === "true") return true;
      if (normalized === "false") return false;
    }
    return undefined;
  }

  private async fetchTableRecord(
    table: string,
    sysId?: string | null,
    fields?: string[]
  ): Promise<Record<string, any> | null> {
    if (!sysId) {
      return null;
    }

    try {
      return await this.tableClient.fetchById<Record<string, any>>(table, sysId, {
        sysparm_display_value: "all",
        ...(fields && fields.length ? { sysparm_fields: fields.join(",") } : {}),
      });
    } catch (error) {
      console.warn(`[Change Validation] Failed to fetch ${table}/${sysId}:`, error);
      return null;
    }
  }

  private async loadTemplateMetadata(templateVersionSysId: string): Promise<{
    version?: Record<string, any>;
    producer?: Record<string, any>;
    catalog_item?: Record<string, any>;
  } | null> {
    const version = await this.fetchTableRecord(
      "std_change_producer_version",
      templateVersionSysId,
      [
        "sys_id",
        "name",
        "sys_updated_on",
        "percent_successful",
        "closed_change_count",
        "unsuccessful_change_count",
        "std_change_producer",
        "description",
      ]
    );

    if (!version) {
      return null;
    }

    const producerSysId =
      version.std_change_producer?.value || version.std_change_producer;

    const producer = await this.fetchTableRecord(
      "std_change_record_producer",
      producerSysId,
      [
        "sys_id",
        "name",
        "short_description",
        "description",
        "owner",
        "category",
        "workflow",
        "active",
        "catalog_item",
        "published_ref",
        "sys_updated_on",
      ]
    );

    const catalogSysId = producer?.catalog_item?.value || producer?.catalog_item;
    const catalogItem = await this.fetchTableRecord(
      "sc_cat_item",
      catalogSysId,
      [
        "sys_id",
        "name",
        "workflow",
        "active",
        "category",
        "owner",
      ]
    );

    return {
      version,
      producer: producer ?? undefined,
      catalog_item: catalogItem ?? undefined,
    };
  }

  private normalizeTemplateMetadata(
    metadata: {
      version?: Record<string, any>;
      producer?: Record<string, any>;
      catalog_item?: Record<string, any>;
    },
    record: ChangeValidation
  ): Record<string, any> {
    const rawValue = (value: any): any => {
      if (value === null || value === undefined) return undefined;
      if (typeof value === "object") {
        if ("value" in value) return value.value;
        if ("display_value" in value) return value.display_value;
      }
      return value;
    };

    const normalizedVersion = metadata.version
      ? {
          sys_id: rawValue(metadata.version.sys_id),
          name: rawValue(metadata.version.name),
          last_updated: rawValue(metadata.version.sys_updated_on),
          percent_successful: rawValue(metadata.version.percent_successful),
          closed_change_count: rawValue(metadata.version.closed_change_count),
          unsuccessful_change_count: rawValue(metadata.version.unsuccessful_change_count),
        }
      : record.payload?.std_change_producer_version;

    const normalizedProducer = metadata.producer
      ? {
          sys_id: rawValue(metadata.producer.sys_id),
          name: rawValue(metadata.producer.name),
          short_description: rawValue(metadata.producer.short_description),
          description: rawValue(metadata.producer.description),
          owner: rawValue(
            metadata.producer.owner?.display_value || metadata.producer.owner
          ),
          category: rawValue(
            metadata.producer.category?.display_value || metadata.producer.category
          ),
          workflow: rawValue(metadata.producer.workflow),
          active: metadata.producer.active === true || metadata.producer.active === "true",
          catalog_item: rawValue(metadata.producer.catalog_item),
          published_ref: rawValue(metadata.producer.published_ref),
          sys_updated_on: rawValue(metadata.producer.sys_updated_on),
        }
      : undefined;

    const normalizedCatalogItem = metadata.catalog_item
      ? {
          sys_id: rawValue(metadata.catalog_item.sys_id),
          name: rawValue(metadata.catalog_item.name),
          workflow: rawValue(metadata.catalog_item.workflow),
          active: metadata.catalog_item.active === true || metadata.catalog_item.active === "true",
          category: rawValue(metadata.catalog_item.category),
          owner: rawValue(metadata.catalog_item.owner),
        }
      : undefined;

    const workflow =
      rawValue(metadata.producer?.workflow) ||
      rawValue(metadata.catalog_item?.workflow);

    const lastUpdated =
      rawValue(metadata.version?.sys_updated_on) ||
      rawValue(metadata.producer?.sys_updated_on);

    return {
      component_sys_id: record.componentSysId,
      version: normalizedVersion,
      producer: normalizedProducer,
      catalog_item: normalizedCatalogItem,
      workflow,
      last_updated: lastUpdated,
      published: normalizedProducer?.published_ref ? true : undefined,
      active: normalizedProducer?.active,
      description:
        normalizedProducer?.description ||
        (typeof normalizedVersion === "object" ? (normalizedVersion as any)?.description : undefined),
    };
  }

  private async fetchCmdbDetails(ciSysId: string): Promise<Record<string, any> | null> {
    const baseRecord = await this.fetchTableRecord(
      "cmdb_ci",
      ciSysId,
      [
        "sys_id",
        "name",
        "sys_class_name",
        "owned_by",
        "environment",
        "install_status",
        "operational_status",
        "business_criticality",
      ]
    );

    if (!baseRecord) {
      return null;
    }

    let relationships: Array<{ type: string; target: string }> = [];

    try {
      const rels = await this.tableClient.fetchAll<Record<string, any>>("cmdb_rel_ci", {
        sysparm_query: `parent=${ciSysId}^ORchild=${ciSysId}`,
        sysparm_display_value: "all",
        sysparm_limit: 10,
      });

      relationships = rels.map((rel) => {
        const parentSysId = rel.parent?.value || rel.parent;
        const childSysId = rel.child?.value || rel.child;

        return {
          type: rel.type?.display_value || rel.type?.value || rel.type || "unknown",
          target: parentSysId === ciSysId ? childSysId : parentSysId,
        };
      });
    } catch (error) {
      console.warn("[Change Validation] Could not fetch CI relationships", error);
    }

    return {
      ...baseRecord,
      relationships,
    };
  }

  private buildDocumentationFields(
    changeDetails?: ChangeRequest | null,
    archived?: Record<string, any>
  ): {
    implementation_plan: string;
    rollback_plan: string;
    test_plan: string;
    justification: string;
  } {
    const normalizeDocField = (value: any): string | undefined => {
      if (typeof value === "string") {
        return value.trim() || undefined;
      }
      if (value && typeof value === "object") {
        return (
          (typeof value.display_value === "string" && value.display_value.trim()) ||
          (typeof value.value === "string" && value.value.trim()) ||
          undefined
        );
      }
      return undefined;
    };

    const implementationPlan =
      normalizeDocField(changeDetails?.implementation_plan) ||
      normalizeDocField(archived?.implementation_plan);
    const rollbackPlan =
      normalizeDocField(changeDetails?.rollback_plan) ||
      normalizeDocField(archived?.rollback_plan);
    const testPlan =
      normalizeDocField(changeDetails?.test_plan) ||
      normalizeDocField(changeDetails?.testing_plan) ||
      normalizeDocField(archived?.test_plan) ||
      normalizeDocField(archived?.testing_plan);
    const justification =
      normalizeDocField(changeDetails?.justification) ||
      normalizeDocField(changeDetails?.business_justification) ||
      normalizeDocField(archived?.justification) ||
      normalizeDocField(archived?.business_justification);

    return {
      implementation_plan: implementationPlan || "",
      rollback_plan: rollbackPlan || "",
      test_plan: testPlan || "",
      justification: justification || "",
    };
  }

  /**
   * Post validation results back to ServiceNow
   */
  private async postResultsToServiceNow(
    record: ChangeValidation,
    result: ValidationResult
  ): Promise<void> {
    try {
      const statusEmoji =
        result.overall_status === "APPROVE"
          ? "✅"
          : result.overall_status === "REJECT"
            ? "❌"
            : "⚠️";

      const sections: string[] = [];

      if (result.synthesis) {
        sections.push(result.synthesis);
      }

      if (result.documentation_assessment) {
        sections.push(`Documentation: ${result.documentation_assessment}`);
      }

      if (result.risks && result.risks.length > 0) {
        sections.push(
          `Risks:\n${result.risks.map((risk) => `  • ${risk}`).join("\n")}`
        );
      }

      if (result.required_actions && result.required_actions.length > 0) {
        sections.push(
          `Required Actions:\n${result.required_actions
            .map((action) => `  • ${action}`)
            .join("\n")}`
        );
      }

      if (result.checks && Object.keys(result.checks).length > 0) {
        sections.push(
          `Checks:\n${Object.entries(result.checks)
            .map(([key, value]) => `  • ${key}: ${value ? "✓" : "✗"}`)
            .join("\n")}`
        );
      }

      const body =
        sections.length > 0
          ? sections.join("\n\n")
          : "No additional details captured.";

      const workNote = `${statusEmoji} Automated Validation Result: ${result.overall_status}

${body}

Validation completed at ${new Date().toISOString()}`;

      // Add work note to change request
      await serviceNowClient.addChangeWorkNote(record.changeSysId, workNote);

      console.log(`[Change Validation] Posted results to ServiceNow: ${record.changeNumber}`);
    } catch (error) {
      console.error("[Change Validation] Error posting to ServiceNow:", error);
      // Don't throw - change was still validated, just posting failed
    }
  }

  private shouldCheckCloneFreshness(record: ChangeValidation): boolean {
    if (record.componentType !== "std_change_template") {
      return false;
    }

    const templateName =
      record.payload?.std_change_producer_version?.display_value ||
      record.payload?.std_change_producer_version?.name ||
      record.payload?.template?.name ||
      record.payload?.short_description ||
      "";

    if (!templateName) {
      return false;
    }

    return templateName.toLowerCase().includes("servicenow platform update");
  }
}


// Singleton instance
let instance: ChangeValidationService | null = null;

export function getChangeValidationService(): ChangeValidationService {
  if (!instance) {
    instance = new ChangeValidationService();
  }
  return instance;
}

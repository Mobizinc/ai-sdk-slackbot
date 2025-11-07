/**
 * Change Validation Service
 * Orchestrates automated validation of ServiceNow Standard Changes
 * Uses Claude with QA Analyst skill for intelligent synthesis
 */

import { withLangSmithTrace, traceLLMCall } from "../observability";
import { getChangeValidationRepository } from "../db/repositories/change-validation-repository";
import type { ChangeValidation } from "../db/schema";
import { ServiceNowChangeWebhookSchema, type ServiceNowChangeWebhook } from "../schemas/servicenow-change-webhook";
import { serviceNowClient } from "../tools/servicenow";
import Anthropic from "@anthropic-ai/sdk";
import { config } from "../config";

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
  overall_status: "PASSED" | "FAILED" | "WARNING";
  checks: Record<string, boolean>;
  synthesis?: string;
}

class ChangeValidationService {
  private repository = getChangeValidationRepository();
  private anthropic: Anthropic | null = null;

  constructor() {
    if (config.anthropicApiKey) {
      this.anthropic = new Anthropic({
        apiKey: config.anthropicApiKey,
      });
    }
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

      // Create DB record
      const record = await this.repository.create({
        changeNumber: validated.change_number,
        changeSysId: validated.change_sys_id,
        componentType: validated.component_type,
        componentSysId: validated.component_sys_id,
        payload: validated as Record<string, any>,
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

      // Synthesize results using Claude (if available)
      let validationResult: ValidationResult;
      if (this.anthropic) {
        validationResult = await this.synthesizeWithClaude(record, facts);
      } else {
        validationResult = this.synthesizeWithRules(record, facts);
      }

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
    const timeoutPromise = new Promise<null>((resolve) =>
      setTimeout(() => {
        console.warn(`[Change Validation] ${operationName} timed out after ${timeoutMs}ms`);
        resolve(null);
      }, timeoutMs)
    );

    return Promise.race([promise, timeoutPromise]);
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
    };

    try {
      // Phase 1: Environment Health Check - UAT Clone Freshness
      const cloneInfo = await this.withTimeout(
        serviceNowClient.getCloneInfo('uat', 'prod'),
        SERVICENOW_TIMEOUT_MS,
        "getCloneInfo"
      );

      if (cloneInfo) {
        facts.clone_info = cloneInfo;
        // UAT clone should be less than 30 days old
        const MAX_CLONE_AGE_DAYS = 30;
        facts.clone_freshness_check = {
          is_fresh: cloneInfo.clone_age_days !== undefined && cloneInfo.clone_age_days <= MAX_CLONE_AGE_DAYS,
          age_days: cloneInfo.clone_age_days,
          last_clone_date: cloneInfo.last_clone_date,
        };
      } else {
        facts.collection_errors.push("Clone info fetch timed out or unavailable");
        facts.clone_freshness_check = {
          is_fresh: false,
          age_days: null,
          last_clone_date: null,
        };
      }

      // Phase 2: Fetch change details with timeout
      const changeDetails = await this.withTimeout(
        serviceNowClient.getChangeDetails(record.changeSysId),
        SERVICENOW_TIMEOUT_MS,
        "getChangeDetails"
      );

      if (changeDetails) {
        facts.change_details = changeDetails;
      } else {
        facts.collection_errors.push("Change details fetch timed out");
      }

      // Component-specific collectors - run in parallel
      if (record.componentType === "catalog_item" && record.componentSysId) {
        const catalogItem = await this.withTimeout(
          serviceNowClient.getCatalogItem(record.componentSysId),
          SERVICENOW_TIMEOUT_MS,
          "getCatalogItem"
        );

        if (catalogItem) {
          facts.catalog_item = catalogItem;

          // Check key catalog item fields
          facts.checks = {
            has_name: !!catalogItem.name,
            has_category: !!catalogItem.category,
            has_workflow: !!catalogItem.workflow || !!catalogItem.workflow_start,
            is_active: catalogItem.active === true || catalogItem.active === "true",
          };
        } else {
          facts.collection_errors.push("Catalog item fetch timed out");
          facts.checks = {
            has_name: false,
            has_category: false,
            has_workflow: false,
            is_active: false,
          };
        }
      } else if (record.componentType === "ldap_server" && record.componentSysId) {
        const ldapServer = await this.withTimeout(
          serviceNowClient.getLDAPServer(record.componentSysId),
          SERVICENOW_TIMEOUT_MS,
          "getLDAPServer"
        );

        if (ldapServer) {
          facts.ldap_server = ldapServer;

          facts.checks = {
            has_listener_enabled: ldapServer.listener_enabled === true || ldapServer.listener_enabled === "true",
            has_mid_server: !!ldapServer.mid_server,
            has_urls: !!ldapServer.urls && ldapServer.urls.length > 0,
          };
        } else {
          facts.collection_errors.push("LDAP server fetch timed out");
          facts.checks = {
            has_listener_enabled: false,
            has_mid_server: false,
            has_urls: false,
          };
        }
      } else if (record.componentType === "mid_server" && record.componentSysId) {
        const midServer = await this.withTimeout(
          serviceNowClient.getMIDServer(record.componentSysId),
          SERVICENOW_TIMEOUT_MS,
          "getMIDServer"
        );

        if (midServer) {
          facts.mid_server = midServer;

          facts.checks = {
            is_up: midServer.status === "Up" || midServer.status === "up",
            has_capabilities: !!midServer.capabilities,
            recently_checked_in: !!midServer.last_check_in,
          };
        } else {
          facts.collection_errors.push("MID server fetch timed out");
          // Set explicit failure checks to prevent false PASS
          facts.checks = {
            is_up: false,
            has_capabilities: false,
            recently_checked_in: false,
          };
        }
      } else if (record.componentType === "workflow" && record.componentSysId) {
        const workflow = await this.withTimeout(
          serviceNowClient.getWorkflow(record.componentSysId),
          SERVICENOW_TIMEOUT_MS,
          "getWorkflow"
        );

        if (workflow) {
          facts.workflow = workflow;

          facts.checks = {
            is_published: workflow.published === true || workflow.published === "true",
            not_checked_out: !workflow.checked_out || workflow.checked_out === "false",
            has_scope: !!workflow.scoped_app,
          };
        } else {
          facts.collection_errors.push("Workflow fetch timed out");
          // Set explicit failure checks to prevent false PASS
          facts.checks = {
            is_published: false,
            not_checked_out: false,
            has_scope: false,
          };
        }
      }
    } catch (error) {
      console.warn("[Change Validation] Error collecting facts:", error);
      // Continue - facts might be incomplete but validation can proceed
      facts.collection_errors.push(error instanceof Error ? error.message : String(error));
    }

    return facts;
  }

  /**
   * Synthesize validation using Claude (ReACT pattern)
   * Uses LangSmith tracing for observability
   */
  private async synthesizeWithClaude(
    record: ChangeValidation,
    facts: Record<string, any>
  ): Promise<ValidationResult> {
    if (!this.anthropic) {
      console.warn("[Change Validation] Claude not configured, falling back to rules-based validation");
      return this.synthesizeWithRules(record, facts);
    }

    const systemPrompt = `You are a ServiceNow QA Analyst evaluating Standard Changes.
Your role is to assess whether changes to system components meet our quality gates.
Apply the ReACT pattern: Review facts → Evaluate risks → Act on findings → Communicate clearly.

Use these standards:
- Environment Health: UAT clone MUST be fresh (< 30 days from production)
- Catalog items MUST have: name, category, workflow, and must be active
- LDAP servers MUST have: listener enabled, valid MID server binding, working URLs
- Workflows MUST be: published, not checked out, properly scoped
- MID servers MUST be: Up status, have capabilities, recently checked in
- All changes MUST have: clear justification, documented rollback plan

IMPORTANT: Respond ONLY with valid JSON, no markdown formatting or code blocks.

Required JSON format:
{
  "overall_status": "PASSED|FAILED|WARNING",
  "checks": { "check_name": boolean, ... },
  "synthesis": "Brief explanation for ServiceNow work note",
  "remediation_steps": [ "step1", "step2" ] (only if FAILED or WARNING)
}`;

    const userPrompt = `Evaluate this Standard Change:

Change: ${record.changeNumber}
Component Type: ${record.componentType}
Requested By: ${record.requestedBy || "Unknown"}

Validation Facts:
${JSON.stringify(facts, null, 2)}

${facts.collection_errors && facts.collection_errors.length > 0 ? `\nCollection Errors: ${facts.collection_errors.join(", ")}` : ""}

Provide your assessment in the required JSON format.`;

    try {
      const tracedFn = traceLLMCall(
        async () => {
          const response = await this.anthropic!.messages.create({
            model: "claude-sonnet-4-5",  // Claude Sonnet 4.5
            max_tokens: 1024,
            system: systemPrompt,
            messages: [
              {
                role: "user",
                content: userPrompt,
              },
            ],
          });

          const content = response.content[0];
          if (content.type !== "text") {
            throw new Error("Unexpected response type from Claude");
          }

          // Improved JSON extraction: try multiple strategies
          let result: ValidationResult;

          // Strategy 1: Try parsing the entire response
          try {
            result = JSON.parse(content.text) as ValidationResult;
            return result;
          } catch {
            // Strategy 2: Try extracting from markdown code block
            const markdownMatch = content.text.match(/```(?:json)?\s*(\{[\s\S]*?\})\s*```/);
            if (markdownMatch) {
              try {
                result = JSON.parse(markdownMatch[1]) as ValidationResult;
                return result;
              } catch {
                // Continue to strategy 3
              }
            }

            // Strategy 3: Try finding any JSON object
            const jsonMatch = content.text.match(/\{[\s\S]*\}/);
            if (jsonMatch) {
              result = JSON.parse(jsonMatch[0]) as ValidationResult;
              return result;
            }

            throw new Error("Could not extract JSON from Claude response");
          }
        },
        {
          name: "claude-change-validation-synthesis",
          tags: {
            component: "llm",
            operation: "validation-synthesis",
            service: "servicenow",
            model: "claude"
          },
          metadata: {
            change_number: record.changeNumber,
            component_type: record.componentType,
            model: "claude-sonnet-4-5",
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

    let overall_status: "PASSED" | "FAILED" | "WARNING" = "PASSED";
    if (!allChecksPassed) {
      // Check if critical failures
      const criticalChecks = Object.entries(checks).filter(([k]) =>
        k.includes("has_") || k.includes("is_")
      );
      const criticalFailures = criticalChecks.filter(([, v]) => v === false);
      overall_status = criticalFailures.length > 0 ? "FAILED" : "WARNING";
    }

    const failedChecks = Object.entries(checks)
      .filter(([, v]) => v === false)
      .map(([k]) => k);

    let synthesis = "";
    if (overall_status === "PASSED") {
      synthesis = `✅ Change validation PASSED. All required configuration checks completed successfully.`;
    } else if (overall_status === "FAILED") {
      synthesis = `❌ Change validation FAILED. Missing or invalid configuration: ${failedChecks.join(", ")}. Please review and correct before proceeding.`;
    } else {
      synthesis = `⚠️ Change validation returned WARNINGS. Some configuration items need review: ${failedChecks.join(", ")}. Consider addressing before implementation.`;
    }

    return {
      overall_status,
      checks,
      synthesis,
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
        result.overall_status === "PASSED"
          ? "✅"
          : result.overall_status === "FAILED"
            ? "❌"
            : "⚠️";

      const workNote = `${statusEmoji} Automated Validation Result: ${result.overall_status}

${result.synthesis}

Check Results:
${Object.entries(result.checks)
  .map(([key, value]) => `  • ${key}: ${value ? "✓" : "✗"}`)
  .join("\n")}

Validation completed at ${new Date().toISOString()}`;

      // Add work note to change request
      await serviceNowClient.addChangeWorkNote(record.changeSysId, workNote);

      console.log(`[Change Validation] Posted results to ServiceNow: ${record.changeNumber}`);
    } catch (error) {
      console.error("[Change Validation] Error posting to ServiceNow:", error);
      // Don't throw - change was still validated, just posting failed
    }
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

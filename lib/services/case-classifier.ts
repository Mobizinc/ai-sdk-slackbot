/**
 * Case Classification Service
 * Classifies ServiceNow cases into categories using AI with similar case and KB article context
 */

import { generateText } from 'ai';
import { modelProvider, getActiveModelId } from '../model-provider';
import { getBusinessContextService, type BusinessEntityContext } from './business-context-service';
import { searchKBArticles, type KBArticle } from './kb-article-search';
import { getWorkflowRouter, type RoutingResult } from './workflow-router';
import { getBusinessContextService as getNewBusinessContextService } from './business-context';
import { getCaseIntelligenceService } from './case-intelligence';
import { getEntityStoreService, type DiscoveredEntity } from './entity-store';
import { getCaseClassificationRepository } from '../db/repositories/case-classification-repository';
import { getCategoryMismatchRepository } from '../db/repositories/category-mismatch-repository';
import { createAzureSearchClient } from './azure-search-client';
import type { SimilarCaseResult } from '../schemas/servicenow-webhook';

export interface CaseData {
  case_number: string;
  sys_id: string;
  short_description: string;
  description?: string;
  priority?: string;
  urgency?: string;
  state?: string;
  assignment_group?: string;
  company?: string;
  company_name?: string;
  current_category?: string;
  sys_created_on?: string;
}

export interface TechnicalEntities {
  ip_addresses: string[];
  systems: string[];
  users: string[];
  software: string[];
  error_codes: string[];
}

export interface BusinessIntelligence {
  project_scope_detected: boolean;
  project_scope_reason?: string;
  client_technology?: string;
  client_technology_context?: string;
  related_entities?: string[];
  outside_service_hours: boolean;
  service_hours_note?: string;
  executive_visibility?: boolean;
  executive_visibility_reason?: string;
  compliance_impact?: boolean;
  compliance_impact_reason?: string;
  financial_impact?: boolean;
  financial_impact_reason?: string;
  // NEW: Pattern recognition for systemic issues
  systemic_issue_detected?: boolean;
  systemic_issue_reason?: string;
  affected_cases_same_client?: number;
}

export interface RecordTypeSuggestion {
  type: "Problem" | "Incident" | "Change" | "Case";
  is_major_incident: boolean;
  reasoning: string;
}

export interface CaseClassification {
  category: string;
  subcategory?: string;
  // DUAL CATEGORIZATION: When creating Incident from Case, use separate categories
  incident_category?: string; // Only populated when record_type_suggestion.type is "Incident" or "Problem"
  incident_subcategory?: string; // Only populated when record_type_suggestion.type is "Incident" or "Problem"
  confidence_score: number;
  reasoning: string;
  keywords: string[];
  quick_summary?: string;
  immediate_next_steps?: string[];
  technical_entities?: TechnicalEntities;
  urgency_level?: string;
  business_intelligence?: BusinessIntelligence;
  // ITSM record type suggestion
  record_type_suggestion?: RecordTypeSuggestion;
  // Token usage and cost tracking
  token_usage_input?: number;
  token_usage_output?: number;
  total_tokens?: number;
  // Model info
  model_used?: string;
  llm_provider?: string;
  // Context from search - using new SimilarCaseResult with MSP attribution
  similar_cases?: SimilarCaseResult[];
  kb_articles?: KBArticle[];
  similar_cases_count?: number;
  kb_articles_count?: number;
}

export class CaseClassifier {
  private businessContextService = getBusinessContextService();
  private searchClient = createAzureSearchClient(); // NEW: Use vector search client with MSP attribution
  private workflowRouter = getWorkflowRouter();
  private newBusinessContextService = getNewBusinessContextService();
  private caseIntelligenceService = getCaseIntelligenceService();
  private entityStoreService = getEntityStoreService();
  private repository = getCaseClassificationRepository();
  private mismatchRepository = getCategoryMismatchRepository();
  // DUAL CATEGORIZATION: Store categories separately by table
  private availableCaseCategories: string[] = [];
  private availableCaseSubcategories: string[] = [];
  private availableIncidentCategories: string[] = [];
  private availableIncidentSubcategories: string[] = [];
  private currentCaseData: CaseData | null = null; // For mismatch logging

  /**
   * Set available categories from ServiceNow cache (TABLE-SPECIFIC)
   * Should be called before classification to use real ServiceNow categories
   */
  setCategories(
    caseCategories: string[],
    incidentCategories: string[],
    caseSubcategories: string[] = [],
    incidentSubcategories: string[] = []
  ): void {
    this.availableCaseCategories = caseCategories;
    this.availableCaseSubcategories = caseSubcategories;
    this.availableIncidentCategories = incidentCategories;
    this.availableIncidentSubcategories = incidentSubcategories;
    console.log(
      `[CaseClassifier] Loaded categories: ` +
      `Cases (${caseCategories.length} categories, ${caseSubcategories.length} subcategories), ` +
      `Incidents (${incidentCategories.length} categories, ${incidentSubcategories.length} subcategories)`
    );
  }

  /**
   * Enhanced classification using new architecture services
   */
  async classifyCaseEnhanced(caseData: CaseData): Promise<CaseClassification & {
    processingTimeMs: number;
    workflowId: string;
    discoveredEntities: DiscoveredEntity[];
    businessContextConfidence: number;
  }> {
    const startTime = Date.now();

    try {
      // Determine workflow routing
      const routingResult = this.workflowRouter.determineWorkflow({
        assignmentGroup: caseData.assignment_group,
        category: caseData.current_category,
        caseNumber: caseData.case_number,
        description: caseData.short_description + ' ' + (caseData.description || '')
      });

      // Get enhanced business context
      const businessContextResult = await this.newBusinessContextService.getCaseClassificationContext(
        caseData.case_number,
        caseData.short_description + ' ' + (caseData.description || ''),
        caseData.assignment_group
      );

      // Get case intelligence
      const intelligenceResult = await this.caseIntelligenceService.getCaseIntelligence({
        caseNumber: caseData.case_number,
        description: caseData.short_description + ' ' + (caseData.description || ''),
        category: caseData.current_category,
        assignmentGroup: caseData.assignment_group,
        priority: caseData.priority,
        maxSimilarCases: 3,
        maxKBArticles: 3
      });

      // Extract entities using regex
      const regexEntities = this.entityStoreService.extractEntitiesWithRegex(
        caseData.short_description + ' ' + (caseData.description || '')
      );

      // Get existing business context for compatibility
      const companyIdentifier = caseData.company_name || caseData.company || 'unknown';
      console.log(`[CaseClassifier] Looking up business context for company: ${companyIdentifier}`);

      const businessContext = await this.businessContextService.getContextForCompany(companyIdentifier);

      if (businessContext) {
        console.log(
          `[CaseClassifier] Business context found: ${businessContext.entityName || 'Unknown'} ` +
          `(${businessContext.relatedEntities?.length || 0} related entities)`
        );
      } else {
        console.log(`[CaseClassifier] No business context available for ${companyIdentifier}`);
      }

      // Use existing classification method with enhanced context
      const classification = await this.classifyCase(caseData, businessContext, {
        includeSimilarCases: true,
        includeKBArticles: true,
        workflowId: routingResult.workflowId
      });

      // Merge entities from different sources
      const llmEntities: DiscoveredEntity[] = [];
      
      // Convert technical entities from classification
      if (classification.technical_entities) {
        classification.technical_entities.ip_addresses?.forEach(ip => {
          llmEntities.push({
            entityType: 'IP_ADDRESS',
            entityValue: ip,
            confidence: 0.8,
            source: 'llm'
          });
        });

        classification.technical_entities.systems?.forEach(system => {
          llmEntities.push({
            entityType: 'SYSTEM',
            entityValue: system,
            confidence: 0.7,
            source: 'llm'
          });
        });

        classification.technical_entities.users?.forEach(user => {
          llmEntities.push({
            entityType: 'USER',
            entityValue: user,
            confidence: 0.8,
            source: 'llm'
          });
        });

        classification.technical_entities.software?.forEach(software => {
          llmEntities.push({
            entityType: 'SOFTWARE',
            entityValue: software,
            confidence: 0.7,
            source: 'llm'
          });
        });

        classification.technical_entities.error_codes?.forEach(code => {
          llmEntities.push({
            entityType: 'ERROR_CODE',
            entityValue: code,
            confidence: 0.9,
            source: 'llm'
          });
        });
      }

      const allEntities = this.entityStoreService.mergeEntities(llmEntities, regexEntities);

      // Save discovered entities
      await this.entityStoreService.saveDiscoveredEntities(
        caseData.case_number,
        caseData.sys_id,
        allEntities
      );

      // Save classification result
      await this.repository.saveClassificationResult({
        caseNumber: caseData.case_number,
        workflowId: routingResult.workflowId,
        classificationJson: classification,
        tokenUsage: {
          promptTokens: classification.token_usage_input || 0,
          completionTokens: classification.token_usage_output || 0,
          totalTokens: classification.total_tokens || 0
        },
        cost: this.calculateCost(classification),
        provider: classification.llm_provider || 'unknown',
        model: classification.model_used || 'unknown',
        processingTimeMs: Date.now() - startTime,
        servicenowUpdated: false,
        entitiesCount: allEntities.length,
        similarCasesCount: intelligenceResult.similarCases.length,
        kbArticlesCount: intelligenceResult.kbArticles.length,
        businessIntelligenceDetected: !!(
          classification.business_intelligence?.project_scope_detected ||
          classification.business_intelligence?.executive_visibility ||
          classification.business_intelligence?.compliance_impact ||
          classification.business_intelligence?.financial_impact
        ),
        confidenceScore: classification.confidence_score,
        retryCount: 0
      });

      return {
        ...classification,
        processingTimeMs: Date.now() - startTime,
        workflowId: routingResult.workflowId,
        discoveredEntities: allEntities,
        businessContextConfidence: businessContextResult.confidence
      };
    } catch (error) {
      console.error(`[CaseClassifier] Enhanced classification failed for ${caseData.case_number}:`, error);
      throw error;
    }
  }

  /**
   * Calculate cost based on token usage
   */
  private calculateCost(classification: CaseClassification): number {
    const promptTokens = classification.token_usage_input || 0;
    const completionTokens = classification.token_usage_output || 0;
    
    // Simple cost calculation - adjust based on actual pricing
    const promptCostPer1K = 0.003;
    const completionCostPer1K = 0.004;
    
    const promptCost = (promptTokens / 1000) * promptCostPer1K;
    const completionCost = (completionTokens / 1000) * completionCostPer1K;
    
    return promptCost + completionCost;
  }

  /**
   * Classify a case using AI with similar case and KB article context
   */
  async classifyCase(
    caseData: CaseData,
    businessContext?: BusinessEntityContext | null,
    options?: {
      includeSimilarCases?: boolean;
      includeKBArticles?: boolean;
      workflowId?: string;
    }
  ): Promise<CaseClassification> {
    const {
      includeSimilarCases = true,
      includeKBArticles = true,
      workflowId = 'default'
    } = options || {};

    const startTime = Date.now();

    // Store case data for mismatch logging
    this.currentCaseData = caseData;

    // Fetch similar cases if enabled (using NEW vector search with MSP attribution)
    let similarCases: SimilarCaseResult[] = [];
    if (includeSimilarCases && this.searchClient) {
      try {
        const queryText = `${caseData.short_description} ${caseData.description || ''}`.trim();
        similarCases = await this.searchClient.searchSimilarCases(queryText, {
          topK: 5,
          accountSysId: caseData.company, // For MSP attribution
          crossClient: true, // Enable cross-client search
        });
        console.log(`[CaseClassifier] Found ${similarCases.length} similar cases via vector search`);
      } catch (error) {
        console.warn('[CaseClassifier] Failed to fetch similar cases:', error);
      }
    }

    // Fetch KB articles if enabled
    let kbArticles: KBArticle[] = [];
    if (includeKBArticles) {
      try {
        const queryText = `${caseData.short_description} ${caseData.description || ''}`.trim();
        kbArticles = await searchKBArticles(queryText, 3);
        console.log(`[CaseClassifier] Found ${kbArticles.length} KB articles`);
      } catch (error) {
        console.warn('[CaseClassifier] Failed to fetch KB articles:', error);
      }
    }

    // Build classification prompt with context
    const prompt = await this.buildClassificationPrompt(
      caseData,
      businessContext,
      similarCases,
      kbArticles
    );

    // Use AI Gateway via model provider
    const model = modelProvider.languageModel("chat-model");

    // Log prompt size for performance analysis
    const promptSize = prompt.length;
    const promptLines = prompt.split('\n').length;
    console.log(
      `[CaseClassifier] Prompt prepared for case ${caseData.case_number}: ` +
      `${promptSize.toLocaleString()} chars, ${promptLines} lines`
    );

    // Create AbortController with 120s timeout to prevent hanging
    const abortController = new AbortController();
    const timeoutId = setTimeout(() => {
      console.warn(`[CaseClassifier] AI call timeout (120s) for case ${caseData.case_number}`);
      abortController.abort();
    }, 120000); // 120 seconds

    try {
      const aiCallStart = Date.now();
      const activeModel = getActiveModelId();
      console.log(
        `[CaseClassifier] Starting AI classification for case ${caseData.case_number} | ` +
        `Model: ${activeModel} | Provider: AI Gateway (ai-gateway.vercel.sh)`
      );

      const result = await generateText({
        model,
        prompt,
        temperature: 0.1, // Low temperature for consistent classification
        abortSignal: abortController.signal, // Add timeout signal
        // Note: Sonnet 4.5 has 200K context window, no maxTokens needed
        // Output will be complete based on prompt complexity
      });

      const aiCallDuration = Date.now() - aiCallStart;
      const usage = result.usage as any;
      console.log(
        `[CaseClassifier] AI call completed in ${aiCallDuration}ms for case ${caseData.case_number} | ` +
        `Tokens: ${usage?.promptTokens || 0} in / ${usage?.completionTokens || 0} out | ` +
        `Finish: ${result.finishReason || 'unknown'}`
      );
      clearTimeout(timeoutId);

      // Parse the JSON response
      const classificationText = result.text.trim();

      // Log AI response for debugging (truncate if too long)
      if (classificationText.length > 2000) {
        console.log(
          `[CaseClassifier] AI response for ${caseData.case_number} (truncated): ` +
          classificationText.substring(0, 2000) + '... [+' +
          (classificationText.length - 2000) + ' more chars]'
        );
      } else {
        console.log(
          `[CaseClassifier] AI response for ${caseData.case_number}:\n${classificationText}`
        );
      }

      // Try to extract JSON from the response
      const jsonMatch = classificationText.match(/\{[\s\S]*\}/);
      if (!jsonMatch) {
        throw new Error('No JSON found in classification response');
      }

      const classification = JSON.parse(jsonMatch[0]);

      // Log parsed classification for visibility
      console.log(
        `[CaseClassifier] Parsed classification for ${caseData.case_number}: ` +
        `${classification.category}` +
        `${classification.subcategory ? ` > ${classification.subcategory}` : ''}` +
        ` (${Math.round((classification.confidence_score || 0) * 100)}% confidence)`
      );

      // Validate and normalize the classification
      const validatedClassification = await this.validateClassification(classification);

      // Add metadata from AI SDK response
      const processingTime = Date.now() - startTime;

      // Extract token usage (using type assertion due to SDK type definitions)
      const promptTokens = usage?.promptTokens || 0;
      const completionTokens = usage?.completionTokens || 0;

      return {
        ...validatedClassification,
        // Token usage from AI SDK
        token_usage_input: promptTokens,
        token_usage_output: completionTokens,
        total_tokens: promptTokens + completionTokens,
        // Model info
        model_used: result.finishReason || 'unknown',
        llm_provider: 'ai-gateway', // Using Vercel AI Gateway
        // Context
        similar_cases: similarCases,
        kb_articles: kbArticles,
        similar_cases_count: similarCases.length,
        kb_articles_count: kbArticles.length,
      };

    } catch (error) {
      clearTimeout(timeoutId); // Clean up timeout on error

      // Check if error is due to timeout/abort
      if (error instanceof Error && error.name === 'AbortError') {
        console.error(`[CaseClassifier] AI call aborted (timeout) for case ${caseData.case_number}`);
      } else {
        console.error('[CaseClassifier] Classification failed:', error);
      }

      // Fallback classification
      return this.getFallbackClassification(caseData);
    }
  }

  /**
   * Build the classification prompt
   */
  private async buildClassificationPrompt(
    caseData: CaseData,
    businessContext?: BusinessEntityContext | null,
    similarCases?: SimilarCaseResult[],
    kbArticles?: KBArticle[]
  ): Promise<string> {
    const businessContextText = businessContext
      ? this.businessContextService.toPromptText(businessContext)
      : 'No specific business context available.';

    console.log(`[DEBUG] Business context text for prompt:\n---\n${businessContextText}\n---`);

    // CRITICAL: Use the EXACT system prompt from Python for quality
    let prompt = `You are a senior L2/L3 Technical Support Engineer triaging this case for a junior engineer who will work it. Analyze the case, classify it accurately, and provide diagnostic guidance that teaches while troubleshooting. Be specific with commands and technical details, but explain your reasoning so they understand the 'why' behind each step.

Case Information:
- Case Number: ${caseData.case_number}
- Short Description: ${caseData.short_description}`;

    if (caseData.description) {
      prompt += `\n- Detailed Description: ${caseData.description}`;
    }

    if (caseData.priority) {
      prompt += `\n- Priority: ${caseData.priority}`;
    }

    if (caseData.urgency) {
      prompt += `\n- Urgency: ${caseData.urgency}`;
    }

    if (caseData.current_category) {
      prompt += `\n- Current Category: ${caseData.current_category}`;
    }

    if (caseData.company_name || caseData.company) {
      prompt += `\n- Company: ${caseData.company_name || caseData.company}`;
    }

    // Add business context (client-specific intelligence)
    if (businessContext) {
      prompt += `\n\n--- BUSINESS CONTEXT ---\n`;
      prompt += businessContextText;
      prompt += `\n`;
    }

    // Add similar cases context if available (using NEW structure with MSP attribution)
    if (similarCases && similarCases.length > 0) {
      prompt += `\n\n--- SIMILAR RESOLVED CASES (for context) ---\n`;
      prompt += `CRITICAL: ANALYZE THESE FOR PATTERNS! Don't just reference them.\n\n`;

      // Get current case client name from business context or company name
      const currentClientName = (businessContext?.entityName || caseData.company_name || '').toLowerCase();

      // Pattern analysis: Count cases from same client using BOTH same_client flag AND name matching
      const sameClientCases = similarCases.filter(c => {
        // Check same_client flag first (ID-based matching)
        if (c.same_client) return true;

        // Fallback to name-based matching if client names available
        if (currentClientName && c.client_name) {
          const caseClientName = c.client_name.toLowerCase();
          // Check if names match (exact or contains)
          if (caseClientName === currentClientName) return true;
          if (caseClientName.includes(currentClientName) || currentClientName.includes(caseClientName)) return true;
        }

        return false;
      });

      // Check for related entity patterns (subsidiaries, sister companies)
      let relatedEntityCases = 0;
      if (businessContext?.relatedEntities && businessContext.relatedEntities.length > 0) {
        const relatedEntityNames = businessContext.relatedEntities.map(e => e.toLowerCase());
        relatedEntityCases = similarCases.filter(c =>
          !sameClientCases.includes(c) && // Don't double-count
          c.client_name && relatedEntityNames.some(re =>
            c.client_name!.toLowerCase().includes(re.toLowerCase()) ||
            re.toLowerCase().includes(c.client_name!.toLowerCase())
          )
        ).length;
      }

      const totalRelatedCases = sameClientCases.length + relatedEntityCases;

      if (totalRelatedCases >= 2) {
        prompt += `⚠️ PATTERN ALERT: ${totalRelatedCases} similar cases from THE SAME CLIENT/RELATED ENTITIES detected.\n`;
        if (relatedEntityCases > 0) {
          prompt += `   (${sameClientCases.length} from same client + ${relatedEntityCases} from related entities sharing infrastructure)\n`;
        }
        prompt += `This suggests a SYSTEMIC/INFRASTRUCTURE issue, not isolated user problems.\n`;
        prompt += `Escalate your troubleshooting from user-level to infrastructure/server-level.\n\n`;
      }

      prompt += `Similar cases:\n\n`;

      similarCases.slice(0, 5).forEach((case_, index) => {
        const clientLabel = case_.same_client ? '[Same Client]' :
                           case_.client_name ? `[${case_.client_name}]` : '[Different Client]';
        prompt += `${index + 1}. Case ${case_.case_number} ${clientLabel} (similarity: ${(case_.similarity_score || 0).toFixed(2)}):\n`;
        prompt += `   - Description: ${(case_.short_description || case_.description || '').substring(0, 200)}...\n`;
        if (case_.category) {
          prompt += `   - Category: ${case_.category}\n`;
        }
        prompt += `\n`;
      });

      prompt += `\nIMPORTANT PATTERN ANALYSIS RULES:\n`;
      prompt += `- If 2+ cases from SAME CLIENT or RELATED ENTITIES with SAME ISSUE → This is a SYSTEMIC problem\n`;
      prompt += `- Related entities = subsidiaries/sister companies sharing infrastructure (check business context)\n`;
      prompt += `- If cases are from DIFFERENT UNRELATED CLIENTS → Individual/isolated issues\n`;
      prompt += `- Check client labels [Same Client] vs [Different Client] vs [Related Entity] to identify patterns\n\n`;

      prompt += `CRITICAL TROUBLESHOOTING LOGIC:\n`;
      prompt += `IF systemic_issue_detected=true (2+ cases from same client/related entities):\n`;
      prompt += `→ Your NEXT STEPS **MUST** focus on INFRASTRUCTURE/SERVERS affecting ALL users\n`;
      prompt += `→ Examples: "Check domain controller replication", "Verify file server status for ALL users", "Review AD infrastructure health"\n`;
      prompt += `→ DO NOT provide individual user account troubleshooting (no "Check kdevries account")\n`;
      prompt += `→ Start with: "Verify if [server/service] is operational for ALL users"\n\n`;

      prompt += `IF systemic_issue_detected=false (appears individual/isolated):\n`;
      prompt += `→ ALWAYS start with infrastructure validation FIRST (user might be first to report systemic issue)\n`;
      prompt += `→ Step 1: Ask "Can OTHER users access [resource]?" - determines if systemic or individual\n`;
      prompt += `→ Step 2: Quick infrastructure check - ping server, verify service running\n`;
      prompt += `→ Step 3-5: THEN proceed to individual user troubleshooting IF infrastructure checks pass\n`;
      prompt += `→ Rationale: Validates shared resources work before assuming user-specific problem\n\n`;
    }

    // Add KB articles context if available
    if (kbArticles && kbArticles.length > 0) {
      prompt += `\n\n--- RELEVANT KB ARTICLES ---\n`;
      prompt += `These KB articles may help resolve this case:\n\n`;

      kbArticles.forEach((kb, index) => {
        prompt += `${index + 1}. ${kb.kb_number}: ${kb.title} (similarity: ${kb.similarity_score.toFixed(2)})\n`;
        if (kb.category) {
          prompt += `   Category: ${kb.category}\n`;
        }
        if (kb.summary) {
          prompt += `   Summary: ${kb.summary.substring(0, 150)}...\n`;
        }
        prompt += `\n`;
      });

      prompt += `Consider these KB articles when suggesting next steps or troubleshooting guidance.\n`;
    }

    // Use real ServiceNow categories if available, otherwise use default list
    const caseCategoryList = this.availableCaseCategories.length > 0
      ? this.availableCaseCategories.map(c => `- ${c}`).join('\n')
      : `- User Access Management
- Networking
- Application Support
- Infrastructure
- Security
- Database
- Hardware
- Email & Collaboration
- Telephony
- Cloud Services
- Unclassified`;

    const incidentCategoryList = this.availableIncidentCategories.length > 0
      ? this.availableIncidentCategories.map(c => `- ${c}`).join('\n')
      : caseCategoryList; // Fallback to case categories if incident categories not loaded

    prompt += `

Available Categories for CASE record (sn_customerservice_case table):
${caseCategoryList}

Available Categories for INCIDENT record (incident table):
${incidentCategoryList}

Analyze the case and provide:
1. The most appropriate CASE category from the CASE categories list above
2. An optional CASE subcategory (be specific, e.g., "Password Reset", "VPN Access", "Switch Configuration")
3. **IF AND ONLY IF** record_type_suggestion.type is "Incident" or "Problem":
   - Select the most appropriate INCIDENT category from the INCIDENT categories list
   - An optional INCIDENT subcategory
4. A confidence score between 0.0 and 1.0
5. A brief reasoning (1-2 sentences) explaining why this category was chosen
6. Key keywords that influenced your decision (list 3-5 relevant terms)

Additionally, provide quick triage guidance for the support agent:
6. SUMMARY: Write a brief technical diagnostic as a senior engineer would explain it to a junior (2-3 sentences):
   - What's happening (the symptom)
   - What's likely causing it (root cause hypothesis with reasoning)
   - What this means for troubleshooting (diagnostic direction)
   - **CRITICAL:** If you found a pattern in similar cases (2+ from same client), EXPLICITLY MENTION IT in summary
   Style: Conversational but technical. Include "likely" or "probably" for hypotheses.

7. NEXT STEPS: List 3-5 diagnostic steps like you're walking a junior engineer through the triage. Format each step as: [Action with command/path] - [Brief rationale or what to look for]
   - Start with what to check/gather (include WHY briefly)
   - Provide specific commands/paths/settings
   - Note prerequisites inline only when critical (e.g., licensing, permissions)
   - Explain what you're looking for in results

8. ENTITIES: Extract technical entities like IP addresses, hostnames, usernames, software names, error codes
9. URGENCY: Assess urgency as Low/Medium/High/Critical based on business impact

EXCEPTION-BASED BUSINESS INTELLIGENCE:
If you detect any of the following exceptions based on the client's business context (technology, service hours, related entities), populate the relevant fields. ONLY populate when exceptions are detected - leave fields null/empty otherwise:
10. PROJECT SCOPE: If work appears to require professional services engagement (server migrations, new infrastructure, extensive coordination, not typical BAU support), set project_scope_detected=true and explain why
11. CLIENT TECHNOLOGY: If case mentions client-specific technology from their portfolio (e.g., EPD EMR, GoRev, Palo Alto 460), capture the technology name and context
12. RELATED ENTITIES: If case may affect sibling companies or related entities, list them
13. OUTSIDE SERVICE HOURS: If case arrived outside contracted service hours (e.g., weekend/after-hours for 12x5 support), flag it with service hours note
14. SYSTEMIC ISSUE: **CRITICAL** - If you found 2+ similar cases from SAME CLIENT (check both same_client flag AND client_name text) in the similar cases list above, you MUST set systemic_issue_detected=true, explain what the pattern is, and note how many cases (affected_cases_same_client). This indicates infrastructure/server-level problem affecting multiple users, not isolated issue. DO NOT miss this - patterns are the most valuable intelligence we can provide.

--- ITSM RECORD TYPE SYNTHESIS ---

Based on the business intelligence you just analyzed, determine the correct ITSM record type using these synthesis rules:

**Rule 1: PROBLEM** (Highest Priority)
IF business_intelligence.systemic_issue_detected === true
→ type: "Problem"
→ reasoning: "Recurring pattern from [X] similar cases indicates root cause investigation needed"
→ Example: 3+ file server access failures from same client = underlying problem requiring RCA

**Rule 2: MAJOR INCIDENT**
IF business_intelligence.executive_visibility === true
OR keywords present: "production down", "entire team", "all users", "system unavailable", "outage affecting"
→ type: "Incident"
→ is_major_incident: true
→ reasoning: "High-impact service disruption requiring coordinated response"
→ Escalation: Immediate on-call notification

**Rule 3: STANDARD INCIDENT**
IF unplanned service disruption (doesn't meet above criteria)
→ type: "Incident"
→ is_major_incident: false
→ Indicators: Something that should be working is broken/unavailable/degraded/erroring
→ Examples: "cannot connect to VPN", "email not working", "error when logging in"

**Rule 4: CHANGE**
IF requesting new service, modification, access, or planned work
→ type: "Change"
→ Keywords: "install", "add user", "new server", "upgrade", "configure", "provision", "setup new"
→ Examples: "install Photoshop", "add me to Marketing group", "configure new printer"
→ Note: Changes require Change Management approval process

**Rule 5: CASE (Default)**
IF question, how-to, inquiry, or doesn't match above
→ type: "Case"
→ Examples: "How do I reset password?", "What are service desk hours?", "Request laptop for new hire"
→ Indicators: "how do I", "what is", "can you explain", general inquiry

SYNTHESIS DECISION TREE:
1. First check: systemic_issue_detected=true? → Problem
2. Then check: executive_visibility OR widespread outage keywords? → Major Incident
3. Then check: Service disruption (broken/down/error)? → Standard Incident
4. Then check: Requesting something new/different? → Change
5. Default: → Case

FEW-SHOT EXAMPLES (follow these patterns):

EXAMPLE 1 - SYSTEMIC ISSUE (2+ cases from same client):
Input: "User can't access L drive" + Similar cases: 3 L drive issues from Neighbors
Pattern: SYSTEMIC (3 cases from same client with same issue)
Summary: "Shift-wide L drive failures affecting multiple Neighbors users - file server or network infrastructure problem"
Next Steps (INFRASTRUCTURE-FOCUSED):
1. "Verify file server status: Check if file server hosting L drive is online for ALL users - ping server, check SMB service (Test-NetConnection -Port 445)"
2. "Test UNC path from different workstation: Access \\\\servername\\sharename from another user's PC - confirms if issue is server-wide"
3. "Check domain controller health: Verify AD replication status (repadmin /showrepl) - AD auth failures affect all file share access"
4. "Review file server event logs: Check for SMB errors (EventID 1020) or disk failures affecting all connections"
Business Intelligence: systemic_issue_detected=true, affected_cases_same_client=3
Record Type: Problem (systemic pattern detected requiring RCA)

EXAMPLE 2 - INDIVIDUAL ISSUE (no pattern, appears isolated):
Input: "User kdevries can't access L drive" + Similar cases: None from same client
Pattern: INDIVIDUAL (no similar cases from same client)
Summary: "Single user L drive access issue - need to validate if infrastructure problem or user-specific"
Next Steps (INFRASTRUCTURE VALIDATION FIRST, THEN INDIVIDUAL):
1. "Verify if systemic: Ask if OTHER users can currently access L drive - if multiple can't, escalate to infrastructure team; if only kdevries affected, proceed to user troubleshooting"
2. "Quick infrastructure sanity check: Ping file server hostname and test UNC path \\\\servername\\sharename from your workstation - confirms server is operational before troubleshooting user"
3. "Check kdevries AD account status: ADUC → Find user → Account tab - look for locked/disabled/expired"
4. "Verify kdevries group memberships: Get-ADUser kdevries -Properties MemberOf - confirm has security group for L drive access"
Business Intelligence: systemic_issue_detected=false
Record Type: Incident (service disruption, but individual user - not systemic)

Key Difference: Systemic = infrastructure-only steps. Individual = infrastructure validation FIRST, then user troubleshooting.

Respond with a JSON object in this exact format:
{
  "category": "exact CASE category name from CASE categories list",
  "subcategory": "specific CASE subcategory or null",
  "incident_category": "exact INCIDENT category name from INCIDENT categories list (ONLY if record_type_suggestion.type is 'Incident' or 'Problem', otherwise null)",
  "incident_subcategory": "specific INCIDENT subcategory (ONLY if record_type_suggestion.type is 'Incident' or 'Problem', otherwise null)",
  "confidence_score": 0.95,
  "reasoning": "explanation here",
  "keywords": ["keyword1", "keyword2", "keyword3"],
  "quick_summary": "VPN dropping every 5-10min - textbook DTLS keepalive or NAT timeout issue. AnyConnect defaults to UDP (DTLS) for performance but it's sensitive to NAT session timers and firewall idle timeouts. Need to see if it's failing over to TCP or just dying, plus check for any network-side packet loss during disconnect windows.",
  "immediate_next_steps": [
    "Grab AnyConnect client logs from %ProgramData%\\\\Cisco\\\\Cisco AnyConnect Secure Mobility Client\\\\Logs - look for DTLS negotiation failures or keepalive timeouts around the disconnect times",
    "Check gateway session protocol: show vpn-sessiondb detail anyconnect | include Protocol - if it says 'DTLS-Tunnel' we know UDP is working, if 'TLS-Tunnel' it fell back to TCP",
    "Test with DTLS disabled: edit AnyConnect profile XML, set <DTLSEnable>false</DTLSEnable> and reconnect - if drops stop, confirms DTLS/NAT issue",
    "Run continuous ping to gateway during next disconnect: ping -t <gateway_ip> - we're looking for packet loss or timeout patterns when VPN fails"
  ],
  "technical_entities": {
    "ip_addresses": ["192.168.1.79"],
    "systems": ["AVD thin client", "Palo Alto PA-460"],
    "users": ["laura.garciamata"],
    "software": ["Mainline", "Azure Virtual Desktop"],
    "error_codes": []
  },
  "urgency_level": "Medium",
  "business_intelligence": {
    "project_scope_detected": true,
    "project_scope_reason": "Server migration mentioned requiring professional services",
    "client_technology": "EPD EMR",
    "client_technology_context": "Epowerdocs EMR hosted on 10.101.1.11",
    "related_entities": ["Neighbors Emergency Center"],
    "outside_service_hours": false,
    "service_hours_note": null,
    "systemic_issue_detected": false,
    "systemic_issue_reason": null,
    "affected_cases_same_client": 0
  },
  "record_type_suggestion": {
    "type": "Incident",
    "is_major_incident": false,
    "reasoning": "VPN connectivity failure is an unplanned service disruption. Not major incident as it affects single user and no executive visibility flags."
  }
}

Important: Return ONLY the JSON object, no additional text.`;

    return prompt;
  }

  /**
   * Validate and normalize classification result (DUAL CATEGORIZATION)
   */
  private async validateClassification(classification: any): Promise<CaseClassification> {
    // Use available categories from ServiceNow (table-specific)
    const validCaseCategories = this.availableCaseCategories.length > 0
      ? this.availableCaseCategories
      : [
          'User Access Management',
          'Networking',
          'Application Support',
          'Infrastructure',
          'Security',
          'Hardware',
          'Email & Collaboration',
          'Database',
          'Backup & Recovery',
          'Monitoring & Alerts'
        ];

    const validIncidentCategories = this.availableIncidentCategories.length > 0
      ? this.availableIncidentCategories
      : validCaseCategories; // Fallback to case categories

    // Validate CASE category
    const originalCaseCategory = classification.category;
    const originalCaseSubcategory = classification.subcategory;

    if (!validCaseCategories.includes(classification.category)) {
      // Log mismatch for ServiceNow team review (CASE table)
      if (this.currentCaseData) {
        await this.mismatchRepository.logMismatch({
          caseNumber: this.currentCaseData.case_number,
          caseSysId: this.currentCaseData.sys_id,
          targetTable: 'sn_customerservice_case', // DUAL CATEGORIZATION: specify table
          aiSuggestedCategory: originalCaseCategory,
          aiSuggestedSubcategory: originalCaseSubcategory,
          correctedCategory: 'Application Support',
          confidenceScore: classification.confidence_score || 0.5,
          caseDescription: this.currentCaseData.short_description,
        });
      }

      console.warn(
        `[CaseClassifier] AI suggested invalid CASE category: "${originalCaseCategory}" ` +
        `(confidence: ${Math.round((classification.confidence_score || 0) * 100)}%) - ` +
        `defaulting to "Application Support" | ` +
        `This mismatch has been logged for ServiceNow team review (table: sn_customerservice_case)`
      );
      classification.category = 'Application Support'; // Safe default
    }

    // Validate INCIDENT category (only if provided)
    if (classification.incident_category) {
      const originalIncidentCategory = classification.incident_category;
      const originalIncidentSubcategory = classification.incident_subcategory;

      if (!validIncidentCategories.includes(classification.incident_category)) {
        // Log mismatch for ServiceNow team review (INCIDENT table)
        if (this.currentCaseData) {
          await this.mismatchRepository.logMismatch({
            caseNumber: this.currentCaseData.case_number,
            caseSysId: this.currentCaseData.sys_id,
            targetTable: 'incident', // DUAL CATEGORIZATION: specify table
            aiSuggestedCategory: originalIncidentCategory,
            aiSuggestedSubcategory: originalIncidentSubcategory,
            correctedCategory: 'Application Support',
            confidenceScore: classification.confidence_score || 0.5,
            caseDescription: this.currentCaseData.short_description,
          });
        }

        console.warn(
          `[CaseClassifier] AI suggested invalid INCIDENT category: "${originalIncidentCategory}" ` +
          `(confidence: ${Math.round((classification.confidence_score || 0) * 100)}%) - ` +
          `defaulting to "Application Support" | ` +
          `This mismatch has been logged for ServiceNow team review (table: incident)`
        );
        classification.incident_category = 'Application Support'; // Safe default
      }
    }

    // Ensure confidence score is valid
    if (typeof classification.confidence_score !== 'number' ||
        classification.confidence_score < 0 ||
        classification.confidence_score > 1) {
      classification.confidence_score = 0.5;
    }

    // Ensure arrays exist
    if (!Array.isArray(classification.keywords)) {
      classification.keywords = [];
    }
    if (!Array.isArray(classification.immediate_next_steps)) {
      classification.immediate_next_steps = [];
    }

    // Ensure urgency level is valid
    const validUrgencyLevels = ['High', 'Medium', 'Low'];
    if (!validUrgencyLevels.includes(classification.urgency_level)) {
      classification.urgency_level = 'Medium';
    }

    // Validate technical entities
    if (!classification.technical_entities || typeof classification.technical_entities !== 'object') {
      classification.technical_entities = {
        ip_addresses: [],
        systems: [],
        users: [],
        software: [],
        error_codes: []
      };
    } else {
      // Ensure each array exists
      classification.technical_entities.ip_addresses = classification.technical_entities.ip_addresses || [];
      classification.technical_entities.systems = classification.technical_entities.systems || [];
      classification.technical_entities.users = classification.technical_entities.users || [];
      classification.technical_entities.software = classification.technical_entities.software || [];
      classification.technical_entities.error_codes = classification.technical_entities.error_codes || [];
    }

    // Validate business intelligence
    if (!classification.business_intelligence || typeof classification.business_intelligence !== 'object') {
      classification.business_intelligence = {
        project_scope_detected: false,
        outside_service_hours: false
      };
    } else {
      // Ensure boolean fields have valid values
      classification.business_intelligence.project_scope_detected = !!classification.business_intelligence.project_scope_detected;
      classification.business_intelligence.outside_service_hours = !!classification.business_intelligence.outside_service_hours;
    }

    return classification as CaseClassification;
  }

  /**
   * Fallback classification for when AI fails
   */
  private getFallbackClassification(caseData: CaseData): CaseClassification {
    const text = `${caseData.short_description} ${caseData.description || ''}`.toLowerCase();
    
    // Simple keyword-based fallback
    let category = 'Application Support'; // Default
    let subcategory = 'General Issue';
    let keywords: string[] = [];
    let urgency = 'Medium';

    // User Access Management
    if (text.includes('password') || text.includes('account') || text.includes('login') || text.includes('vpn')) {
      category = 'User Access Management';
      subcategory = text.includes('password') ? 'Password Reset' : 'Account Access';
      keywords = ['password', 'account', 'access'];
    }
    // Networking
    else if (text.includes('network') || text.includes('connect') || text.includes('internet') || text.includes('firewall')) {
      category = 'Networking';
      subcategory = 'Connectivity Issue';
      keywords = ['network', 'connectivity', 'firewall'];
    }
    // Security
    else if (text.includes('virus') || text.includes('malware') || text.includes('security') || text.includes('threat')) {
      category = 'Security';
      subcategory = 'Security Incident';
      keywords = ['security', 'malware', 'threat'];
      urgency = 'High';
    }
    // Hardware
    else if (text.includes('laptop') || text.includes('computer') || text.includes('printer') || text.includes('device')) {
      category = 'Hardware';
      subcategory = 'Device Issue';
      keywords = ['hardware', 'device', 'equipment'];
    }
    // Email & Collaboration
    else if (text.includes('email') || text.includes('outlook') || text.includes('teams') || text.includes('sharepoint')) {
      category = 'Email & Collaboration';
      subcategory = 'Email Issue';
      keywords = ['email', 'outlook', 'collaboration'];
    }

    // Extract keywords from text
    const words = text.split(/\s+/).filter(word => word.length > 3);
    if (keywords.length < 3 && words.length > 0) {
      keywords = [...keywords, ...words.slice(0, 3 - keywords.length)];
    }

    return {
      category,
      subcategory,
      confidence_score: 0.3, // Low confidence for fallback
      reasoning: `Fallback classification based on keyword matching. Original AI classification failed.`,
      keywords: keywords.slice(0, 5),
      quick_summary: `Issue reported for ${caseData.case_number}. ${caseData.short_description}. Requires investigation and resolution.`,
      immediate_next_steps: ['Investigate the reported issue', 'Contact user if more information needed', 'Provide resolution or escalate'],
      urgency_level: urgency,
    };
  }
}

// Singleton instance
let classifier: CaseClassifier | null = null;

export function getCaseClassifier(): CaseClassifier {
  if (!classifier) {
    classifier = new CaseClassifier();
  }
  return classifier;
}
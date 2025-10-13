/**
 * ServiceNow Webhook Schemas
 * Matches original Python Pydantic models from mobiz-intelligence-analytics
 */

import { z } from "zod";

/**
 * ServiceNow Case Webhook Schema
 * Inbound webhook payload from ServiceNow when a new case is created or updated
 *
 * Original: api/app/schemas.py:1544-1575 (ServiceNowCaseWebhook)
 */
export const ServiceNowCaseWebhookSchema = z.object({
  // Required fields
  case_number: z.string().describe("ServiceNow case number (e.g., CS0001234)"),
  sys_id: z.string().describe("ServiceNow case sys_id"),
  short_description: z.string().describe("Brief case description"),

  // Optional fields
  description: z.string().optional().describe("Detailed case description"),
  priority: z.string().optional().describe("Case priority (1-5)"),
  urgency: z.string().optional().describe("Case urgency"),
  impact: z.string().optional().describe("Case impact"),
  category: z.string().optional().describe("Current case category"),
  subcategory: z.string().optional().describe("Current case subcategory"),
  state: z.string().optional().describe("Case state"),
  assignment_group: z.string().optional().describe("Assigned group"),
  assignment_group_sys_id: z.string().optional().describe("Assigned group sys_id"),
  assigned_to: z.string().optional().describe("Assigned user"),
  caller_id: z.string().optional().describe("Case caller/requester"),
  contact_type: z.string().optional().describe("How case was created"),
  company: z.string().optional().describe("Customer company sys_id"),
  account_id: z.string().optional().describe("Customer account sys_id"),
  opened_at: z.string().datetime().optional().describe("Case creation timestamp"),

  // Additional metadata
  configuration_item: z.string().optional().describe("Related CI from CMDB"),
  business_service: z.string().optional().describe("Related business service"),
  additional_comments: z.string().optional().describe("Additional notes"),

  // Routing context for workflow determination
  routing_context: z
    .record(z.any())
    .optional()
    .describe("Optional routing metadata (e.g., escalation source, reason, quick_classify flag)"),
}).passthrough(); // Allow additional fields not defined in schema

export type ServiceNowCaseWebhook = z.infer<typeof ServiceNowCaseWebhookSchema>;

/**
 * Case Classification Request Schema
 * Internal request format for case classification service
 *
 * Original: api/app/schemas.py:1592-1611 (CaseClassificationRequest)
 */
export const CaseClassificationRequestSchema = z.object({
  case_number: z.string().describe("Case number"),
  sys_id: z.string().optional().describe("ServiceNow case sys_id"),
  short_description: z.string().describe("Brief case description"),
  description: z.string().optional().describe("Detailed description"),
  priority: z.string().optional().describe("Case priority"),
  urgency: z.string().optional().describe("Case urgency"),
  current_category: z.string().optional().describe("Existing category if any"),
  company: z.string().optional().describe("Customer company sys_id"),
  company_name: z.string().optional().describe("Customer company name"),
  assignment_group: z.string().optional().describe("Assigned group at time of webhook"),
  assignment_group_sys_id: z.string().optional().describe("Assigned group sys_id at time of webhook"),
  routing_context: z
    .record(z.any())
    .optional()
    .describe("Optional routing metadata (e.g., escalation chain)"),
});

export type CaseClassificationRequest = z.infer<typeof CaseClassificationRequestSchema>;

/**
 * Business Intelligence Schema
 * Exception-based business intelligence - only populated when exceptions detected
 *
 * Original: api/app/schemas.py:1613-1622 (BusinessIntelligence)
 */
export const BusinessIntelligenceSchema = z.object({
  project_scope_detected: z.boolean().optional().describe("True if work appears to require professional services engagement"),
  project_scope_reason: z.string().optional().describe("Why this appears to be project work"),
  client_technology: z.string().optional().describe("Client-specific technology identified"),
  client_technology_context: z.string().optional().describe("Context about the client-specific technology"),
  related_entities: z.array(z.string()).optional().describe("Sibling companies/entities that may be affected"),
  outside_service_hours: z.boolean().optional().describe("True if case arrived outside contracted service hours"),
  service_hours_note: z.string().optional().describe("Note about service hours"),
  executive_visibility: z.boolean().optional().describe("True if case involves executive/VIP"),
  executive_visibility_reason: z.string().optional().describe("Why this has executive visibility"),
  compliance_impact: z.boolean().optional().describe("True if case has compliance implications"),
  compliance_impact_reason: z.string().optional().describe("Compliance impact details"),
  financial_impact: z.boolean().optional().describe("True if case has financial impact"),
  financial_impact_reason: z.string().optional().describe("Financial impact details"),
  // Pattern recognition for systemic issues
  systemic_issue_detected: z.boolean().optional().describe("True if 2+ similar cases from same client detected"),
  systemic_issue_reason: z.string().optional().describe("What pattern was detected (e.g., '3 L drive cases from Neighbors')"),
  affected_cases_same_client: z.number().optional().describe("Number of similar cases from same client"),
});

export type BusinessIntelligence = z.infer<typeof BusinessIntelligenceSchema>;

/**
 * Record Type Suggestion Schema
 * AI's determination of correct ITSM record type based on business intelligence synthesis
 */
export const RecordTypeSuggestionSchema = z.object({
  type: z.enum(["Problem", "Incident", "Change", "Case"]).describe("ITSM record type determined via synthesis rules"),
  is_major_incident: z.boolean().default(false).describe("True if Incident meets Major Incident criteria (executive impact, widespread outage)"),
  reasoning: z.string().describe("Explanation of record type decision based on business intelligence flags")
});

export type RecordTypeSuggestion = z.infer<typeof RecordTypeSuggestionSchema>;

/**
 * Technical Entities Schema
 * Extracted technical entities from case description
 */
export const TechnicalEntitiesSchema = z.object({
  ip_addresses: z.array(z.string()).default([]),
  systems: z.array(z.string()).default([]),
  users: z.array(z.string()).default([]),
  software: z.array(z.string()).default([]),
  error_codes: z.array(z.string()).default([]),
});

export type TechnicalEntities = z.infer<typeof TechnicalEntitiesSchema>;

/**
 * Similar Case Result Schema
 * Similar case from vector/keyword search
 *
 * Original: api/app/schemas.py:1663-1678 (SimilarCaseResult)
 */
export const SimilarCaseResultSchema = z.object({
  case_number: z.string(),
  short_description: z.string(),
  description: z.string().optional(),
  category: z.string().optional(),
  subcategory: z.string().optional(),
  resolution_notes: z.string().optional(),
  state: z.string().optional(),
  similarity_score: z.number().describe("Similarity score (vector cosine 0-1, semantic ranker 0-4, BM25 can be 50+)"),
  // MSP cross-client attribution fields
  client_id: z.string().optional(),
  client_name: z.string().optional(),
  same_client: z.boolean().optional(),
});

export type SimilarCaseResult = z.infer<typeof SimilarCaseResultSchema>;

/**
 * KB Article Result Schema
 * KB article from vector search
 *
 * Original: api/app/schemas.py:1680-1691 (KBArticleResult)
 */
export const KBArticleResultSchema = z.object({
  kb_number: z.string(),
  title: z.string(),
  content: z.string().optional(),
  category: z.string().optional(),
  view_count: z.number().int().optional(),
  helpful_count: z.number().int().optional(),
  similarity_score: z.number().min(0).max(10).describe("Similarity score (RRF/cosine 0-1, semantic ranker 0-4, boosted up to 10)"),
  url: z.string().optional(),
});

export type KBArticleResult = z.infer<typeof KBArticleResultSchema>;

/**
 * Case Classification Result Schema
 * Result of case classification
 *
 * Original: api/app/schemas.py:1624-1661 (CaseClassificationResult)
 */
export const CaseClassificationResultSchema = z.object({
  case_number: z.string(),
  category: z.string().describe("Classified category (from ServiceNow or default list)"),
  subcategory: z.string().optional().describe("Recommended subcategory"),
  confidence_score: z.number().min(0).max(1).describe("Classification confidence (0-1)"),
  reasoning: z.string().describe("Why this category was chosen"),
  suggested_assignment_group: z.string().optional().describe("Recommended assignment group"),
  keywords_detected: z.array(z.string()).default([]).describe("Key terms that influenced classification"),
  model_used: z.string().describe("LLM model used for classification"),
  classified_at: z.date().describe("Classification timestamp"),

  // Quick triage fields (agent-facing guidance)
  quick_summary: z.string().optional().describe("3-sentence technical summary for support agent"),
  immediate_next_steps: z.array(z.string()).optional().describe("2-4 immediate actionable steps for agent"),
  technical_entities: TechnicalEntitiesSchema.optional().describe("Extracted technical entities"),
  urgency_level: z.string().optional().describe("Assessed urgency: Low/Medium/High/Critical"),

  // Token usage and cost tracking
  token_usage_input: z.number().int().optional().describe("Input tokens consumed by LLM"),
  token_usage_output: z.number().int().optional().describe("Output tokens generated by LLM"),
  input_cost_usd: z.number().optional().describe("Cost of input tokens in USD"),
  output_cost_usd: z.number().optional().describe("Cost of output tokens in USD"),
  total_cost_usd: z.number().optional().describe("Total cost of classification in USD"),
  pricing_tier: z.string().default("standard").describe("Pricing tier used (batch, flex, standard, priority)"),
  llm_provider: z.string().optional().describe("LLM provider used (openai, anthropic)"),

  // Vector search context (case intelligence)
  similar_cases_count: z.number().int().optional().describe("Number of similar cases used as context"),
  similar_cases: z.array(SimilarCaseResultSchema).optional().describe("Similar resolved cases from hybrid search (up to 5 cases)"),
  kb_articles: z.array(KBArticleResultSchema).optional().describe("Relevant KB articles from hybrid search (up to 3 articles)"),

  // Exception-based business intelligence
  business_intelligence: BusinessIntelligenceSchema.optional().describe("Exception-based business intelligence (only populated when exceptions detected)"),

  // ITSM record type suggestion
  record_type_suggestion: RecordTypeSuggestionSchema.optional().describe("AI's suggested ITSM record type based on business intelligence synthesis"),
});

export type CaseClassificationResult = z.infer<typeof CaseClassificationResultSchema>;

/**
 * Workflow Decision Schema
 * Determines which workflow to use for case classification
 */
export const WorkflowDecisionSchema = z.object({
  workflow_id: z.string().describe("Workflow identifier (e.g., 'tech_triage', 'quick_classify')"),
  task_type: z.enum(["TECHNICAL", "GENERAL"]).describe("Task type for LLM provider routing"),
  prompt_config: z
    .object({
      include_triage: z.boolean().optional(),
      include_business_context: z.boolean().optional(),
      include_similar_cases: z.boolean().optional(),
      system_prompt: z.string().optional(),
      additional_instructions: z.string().optional(),
      notes_header: z.string().optional(),
    })
    .optional(),
});

export type WorkflowDecision = z.infer<typeof WorkflowDecisionSchema>;

/**
 * Helper function to convert ServiceNow webhook payload to classification request
 */
export function webhookToClassificationRequest(webhook: ServiceNowCaseWebhook): CaseClassificationRequest {
  return {
    case_number: webhook.case_number,
    sys_id: webhook.sys_id,
    short_description: webhook.short_description,
    description: webhook.description,
    priority: webhook.priority,
    urgency: webhook.urgency,
    current_category: webhook.category,
    company: webhook.company,
    company_name: webhook.account_id, // Map account_id to company_name if available
    assignment_group: webhook.assignment_group,
    assignment_group_sys_id: webhook.assignment_group_sys_id,
    routing_context: webhook.routing_context,
  };
}

/**
 * Validation helper with detailed error messages
 */
export function validateServiceNowWebhook(payload: unknown): {
  success: boolean;
  data?: ServiceNowCaseWebhook;
  error?: string;
  errors?: z.ZodIssue[];
} {
  const result = ServiceNowCaseWebhookSchema.safeParse(payload);

  if (result.success) {
    return {
      success: true,
      data: result.data,
    };
  }

  return {
    success: false,
    error: "Invalid ServiceNow webhook payload",
    errors: result.error.issues,
  };
}

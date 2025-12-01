/**
 * Classification Result Validator
 * 
 * Validates AI classification results for consistency, quality, and compliance
 * to prevent issues like SCS0051638 where non-BAU alerts were ignored
 * and inappropriate actions were taken.
 */

import type { CaseClassificationResult } from "../schemas/servicenow-webhook";
import type { ServiceNowCaseWebhook } from "../schemas/servicenow-webhook";

export interface ValidationResult {
  approved: boolean;
  reason?: string;
  warnings: string[];
  errors: string[];
  recommendations: string[];
  requiresEscalation: boolean;
  requiresHumanReview: boolean;
  confidenceScore: number;
}

export interface ValidationConfig {
  thresholds: {
    classificationConfidence: number;
    businessIntelligenceScore: number;
    escalationBiScore: number;
  };
  rules: {
    requireIncidentForCompliance: boolean;
    requireEscalationForNonBau: boolean;
    requireHrApprovalForAccountAccess: boolean;
    validateCategoryConsistency: boolean;
  };
  categories: {
    hrRequired: string[];
    highRisk: string[];
    emergency: string[];
  };
}

const DEFAULT_CONFIG: ValidationConfig = {
  thresholds: {
    classificationConfidence: 0.7,
    businessIntelligenceScore: 0.6,
    escalationBiScore: 0.8
  },
  rules: {
    requireIncidentForCompliance: true,
    requireEscalationForNonBau: true,
    requireHrApprovalForAccountAccess: true,
    validateCategoryConsistency: true
  },
  categories: {
    hrRequired: ['Access Management', 'Account Access', 'Identity Management', 'HR Services'],
    highRisk: ['Security', 'Compliance', 'Data Privacy', 'HIPAA'],
    emergency: ['Outage', 'Critical', 'Emergency', 'Major Incident']
  }
};

/**
 * Main validation function for classification results
 */
export async function validateClassificationResult(
  classification: CaseClassificationResult,
  webhook: ServiceNowCaseWebhook,
  config: Partial<ValidationConfig> = {}
): Promise<ValidationResult> {
  const fullConfig = { ...DEFAULT_CONFIG, ...config };
  const warnings: string[] = [];
  const errors: string[] = [];
  const recommendations: string[] = [];
  let requiresEscalation = false;
  let requiresHumanReview = false;
  let confidenceScore = 1.0;

  // Validate business intelligence consistency
  const biValidation = validateBusinessIntelligence(classification, fullConfig);
  warnings.push(...biValidation.warnings);
  errors.push(...biValidation.errors);
  requiresEscalation = requiresEscalation || biValidation.requiresEscalation;
  requiresHumanReview = requiresHumanReview || biValidation.requiresHumanReview;

  // Validate record type suggestions
  const recordTypeValidation = validateRecordTypeSuggestions(classification, fullConfig);
  warnings.push(...recordTypeValidation.warnings);
  errors.push(...recordTypeValidation.errors);
  requiresEscalation = requiresEscalation || recordTypeValidation.requiresEscalation;

  // Validate category consistency
  if (fullConfig.rules.validateCategoryConsistency) {
    const categoryValidation = validateCategoryConsistency(classification, webhook, fullConfig);
    warnings.push(...categoryValidation.warnings);
    errors.push(...categoryValidation.errors);
    requiresHumanReview = requiresHumanReview || categoryValidation.requiresHumanReview;
  }

  // Validate confidence scores
  const confidenceValidation = validateConfidenceScores(classification, fullConfig);
  warnings.push(...confidenceValidation.warnings);
  errors.push(...confidenceValidation.errors);
  confidenceScore = confidenceValidation.score;

  // Generate recommendations based on validation results
  recommendations.push(...generateRecommendations(classification, warnings, errors, fullConfig));

  const approved = errors.length === 0;
  const reason = !approved ? errors.join('; ') : undefined;

  return {
    approved,
    reason,
    warnings,
    errors,
    recommendations,
    requiresEscalation,
    requiresHumanReview,
    confidenceScore
  };
}

/**
 * Validate business intelligence flags and consistency
 */
function validateBusinessIntelligence(
  classification: CaseClassificationResult,
  config: ValidationConfig
): { warnings: string[]; errors: string[]; requiresEscalation: boolean; requiresHumanReview: boolean } {
  const warnings: string[] = [];
  const errors: string[] = [];
  let requiresEscalation = false;
  let requiresHumanReview = false;

  const bi = classification.business_intelligence;

  if (!bi) {
    return { warnings, errors, requiresEscalation, requiresHumanReview };
  }

  // Check compliance impact handling
  if (bi.compliance_impact) {
    if (config.rules.requireIncidentForCompliance && classification.record_type_suggestion?.type !== 'Incident') {
      errors.push('Compliance impact detected but no incident suggested');
      requiresEscalation = true;
    }

    warnings.push('Compliance impact detected - consider escalation');
    requiresHumanReview = true;
  }

  // Check non-BAU work handling
  if (bi.project_scope_detected) {
    if (config.rules.requireEscalationForNonBau) {
      errors.push('Non-BAU work detected - escalation required');
      requiresEscalation = true;
    }

    if (!bi.project_scope_reason) {
      warnings.push('Non-BAU work detected but no reason provided');
      requiresHumanReview = true;
    }
  }

  // Check executive visibility
  if (bi.executive_visibility) {
    warnings.push('Executive visibility detected - consider escalation');
    requiresHumanReview = true;
  }

  // Check financial impact
  if (bi.financial_impact) {
    warnings.push('Financial impact detected - consider escalation');
    requiresHumanReview = true;
  }

  return { warnings, errors, requiresEscalation, requiresHumanReview };
}

/**
 * Validate record type suggestions
 */
function validateRecordTypeSuggestions(
  classification: CaseClassificationResult,
  config: ValidationConfig
): { warnings: string[]; errors: string[]; requiresEscalation: boolean } {
  const warnings: string[] = [];
  const errors: string[] = [];
  let requiresEscalation = false;

  const suggestion = classification.record_type_suggestion;
  const bi = classification.business_intelligence;

  // Check if incident is suggested for high-risk situations
  if (bi?.compliance_impact && classification.record_type_suggestion?.type !== 'Incident') {
    errors.push('Incident should be suggested for compliance impact cases');
    requiresEscalation = true;
  }

  if (bi?.executive_visibility && classification.record_type_suggestion?.type !== 'Incident') {
    warnings.push('Consider incident for executive visibility cases');
  }

  // Check if problem is suggested for systemic issues
  if (bi?.systemic_issue_detected && classification.record_type_suggestion?.type !== 'Problem') {
    warnings.push('Problem record should be suggested for systemic issues');
  }

  if (bi?.executive_visibility && suggestion?.type !== 'Incident') {
    warnings.push('Consider incident for executive visibility cases');
  }

  // Check if problem is suggested for systemic issues
  if (bi?.systemic_issue_detected && suggestion?.type !== 'Problem') {
    warnings.push('Problem record should be suggested for systemic issues');
  }

  return { warnings, errors, requiresEscalation };
}

/**
 * Validate category consistency
 */
function validateCategoryConsistency(
  classification: CaseClassificationResult,
  webhook: ServiceNowCaseWebhook,
  config: ValidationConfig
): { warnings: string[]; errors: string[]; requiresHumanReview: boolean } {
  const warnings: string[] = [];
  const errors: string[] = [];
  let requiresHumanReview = false;

  const category = classification.category;
  const subcategory = classification.subcategory;

  if (!category) {
    warnings.push('No category assigned');
    return { warnings, errors, requiresHumanReview };
  }

  // Check HR-required categories
  const isHrRequired = config.categories.hrRequired.some(hrCat =>
    category.toLowerCase().includes(hrCat.toLowerCase())
  );

  if (isHrRequired) {
    warnings.push('HR approval should be considered for this category');
    requiresHumanReview = true;
  }

  // Check high-risk categories
  const isHighRisk = config.categories.highRisk.some(riskCat =>
    category.toLowerCase().includes(riskCat.toLowerCase()) ||
    subcategory?.toLowerCase().includes(riskCat.toLowerCase())
  );

  if (isHighRisk) {
    const bi = classification.business_intelligence;
    if (!bi?.compliance_impact) {
      warnings.push('Consider escalation for high-risk category');
      requiresHumanReview = true;
    }
  }

  return { warnings, errors, requiresHumanReview };
}

/**
 * Validate confidence scores
 */
function validateConfidenceScores(
  classification: CaseClassificationResult,
  config: ValidationConfig
): { warnings: string[]; errors: string[]; score: number } {
  const warnings: string[] = [];
  const errors: string[] = [];
  let score = 1.0;

  // Check overall confidence if available
  if (classification.confidence_score !== undefined) {
    if (classification.confidence_score < config.thresholds.classificationConfidence) {
      warnings.push(`Low classification confidence: ${classification.confidence_score}`);
      score = Math.min(score, classification.confidence_score);
    }
  }

  return { warnings, errors, score };
}

/**
 * Generate recommendations based on validation results
 */
function generateRecommendations(
  classification: CaseClassificationResult,
  warnings: string[],
  errors: string[],
  config: ValidationConfig
): string[] {
  const recommendations: string[] = [];

  const bi = classification.business_intelligence;

  // Recommendations for compliance issues
  if (bi?.compliance_impact) {
    recommendations.push('Escalate to compliance team immediately');
    recommendations.push('Document all compliance-related actions');
    recommendations.push('Consider regulatory reporting requirements');
  }

  // Recommendations for non-BAU work
  if (bi?.project_scope_detected) {
    recommendations.push('Route to project management team');
    recommendations.push('Create change request for non-BAU work');
    recommendations.push('Update project scope documentation');
  }

  // Recommendations for access management
  if (classification.category?.includes('Access Management')) {
    recommendations.push('Verify HR approval before account creation');
    recommendations.push('Check if user exists in identity system');
    recommendations.push('Consider routing to onboarding catalog for new employees');
  }

  // Recommendations based on validation issues
  if (errors.length > 0) {
    recommendations.push('Human review required before proceeding');
    recommendations.push('Address validation errors before incident creation');
  }

  if (warnings.length > 0) {
    recommendations.push('Review warnings and consider additional validation');
  }

  return recommendations;
}

/**
 * Generate validation summary for logging
 */
export function generateValidationSummary(result: ValidationResult): string {
  if (result.approved) {
    return `✅ Classification validation passed (Confidence: ${(result.confidenceScore * 100).toFixed(1)}%)`;
  }

  const issues = [];
  if (result.errors.length > 0) issues.push(`${result.errors.length} errors`);
  if (result.warnings.length > 0) issues.push(`${result.warnings.length} warnings`);
  if (result.requiresEscalation) issues.push('escalation');
  if (result.requiresHumanReview) issues.push('human review');

  return `❌ Classification validation failed: ${issues.join(', ')} (Confidence: ${(result.confidenceScore * 100).toFixed(1)}%)`;
}
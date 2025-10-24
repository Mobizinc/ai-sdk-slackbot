/**
 * Business Intelligence Analyzer
 * Analyzes cases for business context and alerts
 */

import type { BusinessEntityContext } from './business-context-service';

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
  contact_type?: string;
  caller_id?: string;
}

export interface BusinessIntelligence {
  project_scope_detected?: boolean;
  project_scope_reason?: string;
  client_technology?: string;
  client_technology_context?: string;
  related_entities?: string[];
  outside_service_hours?: boolean;
  service_hours_note?: string;
  executive_visibility?: boolean;
  executive_visibility_reason?: string;
  compliance_impact?: boolean;
  compliance_impact_reason?: string;
  financial_impact?: boolean;
  financial_impact_reason?: string;
}

/**
 * Analyze business intelligence from case data and context
 */
export async function analyzeBusinessIntelligence(
  caseData: CaseData,
  businessContext?: BusinessEntityContext | null
): Promise<BusinessIntelligence> {
  const fullText = `${caseData.short_description} ${caseData.description || ''}`.toLowerCase();
  
  // Check for project scope keywords
  const projectKeywords = [
    'migration', 'implementation', 'deployment', 'setup', 'installation',
    'new infrastructure', 'server setup', 'network design', 'cloud migration',
    'data center', 'hardware refresh', 'system upgrade', 'new system',
    'go live', 'cut over', 'rollout', 'launch', 'implementation project',
    'professional services', 'consulting', 'project management'
  ];

  const hasProjectScope = projectKeywords.some(keyword => 
    fullText.includes(keyword.toLowerCase())
  );

  // Determine project scope reason
  let projectScopeReason: string | undefined;
  if (hasProjectScope) {
    const foundKeyword = projectKeywords.find(keyword => 
      fullText.includes(keyword.toLowerCase())
    );
    projectScopeReason = `Case involves "${foundKeyword}" indicating project scope work requiring professional services`;
  }

  // Check client technology from business context
  const clientTech = businessContext?.technologyPortfolio;
  const clientTechContext = businessContext?.serviceDetails;

  // Find related entities
  const relatedEntities = businessContext?.relatedEntities || [];

  // Check service hours
  const caseTime = caseData.sys_created_on ? new Date(caseData.sys_created_on) : new Date();
  const isWeekend = caseTime.getDay() === 0 || caseTime.getDay() === 6;
  const hour = caseTime.getHours();
  const outsideHours = isWeekend || hour < 8 || hour > 17;
  
  let serviceHoursNote: string | undefined;
  if (outsideHours) {
    if (isWeekend) {
      serviceHoursNote = 'Case submitted during weekend hours';
    } else if (hour < 8) {
      serviceHoursNote = 'Case submitted before standard 8 AM service hours';
    } else if (hour > 17) {
      serviceHoursNote = 'Case submitted after 5 PM service hours';
    }
  }

  // Check for executive visibility indicators
  const executiveKeywords = [
    'ceo', 'cto', 'cfo', 'cio', 'president', 'vice president', 'director',
    'executive', 'board', 'leadership', 'management', 'senior leadership',
    'executive team', 'c-level', 'c-suite'
  ];

  const highImpactKeywords = [
    'critical', 'urgent', 'emergency', 'production down', 'outage',
    'business impact', 'revenue impact', 'customer impact', 'service disruption',
    'system unavailable', 'cannot work', 'business stopped', 'major issue'
  ];

  const hasExecutiveKeywords = executiveKeywords.some(keyword => 
    fullText.includes(keyword.toLowerCase())
  );

  const hasHighImpact = highImpactKeywords.some(keyword => 
    fullText.includes(keyword.toLowerCase())
  );

  const executiveVisibility = hasExecutiveKeywords || hasHighImpact || 
    caseData.priority === '1' || caseData.urgency === '1';

  let executiveVisibilityReason: string | undefined;
  if (hasExecutiveKeywords) {
    const foundKeyword = executiveKeywords.find(keyword => 
      fullText.includes(keyword.toLowerCase())
    );
    executiveVisibilityReason = `Executive visibility due to mention of "${foundKeyword}"`;
  } else if (hasHighImpact) {
    const foundKeyword = highImpactKeywords.find(keyword => 
      fullText.includes(keyword.toLowerCase())
    );
    executiveVisibilityReason = `Executive visibility due to high impact: "${foundKeyword}"`;
  } else if (caseData.priority === '1' || caseData.urgency === '1') {
    executiveVisibilityReason = 'Executive visibility due to Priority 1/Urgency 1 classification';
  }

  // Check for compliance impact
  const complianceKeywords = [
    'hipaa', 'phi', 'pii', 'personal data', 'protected health information',
    'compliance', 'audit', 'regulation', 'sox', 'sarbanes', 'pci', 'dss',
    'gdpr', 'ccpa', 'privacy', 'security breach', 'data breach', 'incident',
    'reportable', 'regulatory', 'federal', 'state law', 'compliance violation'
  ];

  const hasComplianceImpact = complianceKeywords.some(keyword => 
    fullText.includes(keyword.toLowerCase())
  );

  let complianceImpactReason: string | undefined;
  if (hasComplianceImpact) {
    const foundKeyword = complianceKeywords.find(keyword => 
      fullText.includes(keyword.toLowerCase())
    );
    complianceImpactReason = `Compliance impact due to mention of "${foundKeyword}"`;
  }

  // Check for financial impact
  const financialKeywords = [
    'financial', 'revenue', 'cost', 'billing', 'invoice', 'payment',
    'money', 'loss', 'profit', 'budget', 'financial impact', 'cost impact',
    'billing issue', 'payment issue', 'financial loss', 'revenue loss',
    'cost overrun', 'budget impact', 'financial system', 'accounting'
  ];

  const hasFinancialImpact = financialKeywords.some(keyword => 
    fullText.includes(keyword.toLowerCase())
  );

  let financialImpactReason: string | undefined;
  if (hasFinancialImpact) {
    const foundKeyword = financialKeywords.find(keyword => 
      fullText.includes(keyword.toLowerCase())
    );
    financialImpactReason = `Financial impact due to mention of "${foundKeyword}"`;
  }

  return {
    project_scope_detected: hasProjectScope,
    project_scope_reason: projectScopeReason,
    client_technology: clientTech,
    client_technology_context: clientTechContext,
    related_entities: relatedEntities,
    outside_service_hours: outsideHours,
    service_hours_note: serviceHoursNote,
    executive_visibility: executiveVisibility,
    executive_visibility_reason: executiveVisibilityReason,
    compliance_impact: hasComplianceImpact,
    compliance_impact_reason: complianceImpactReason,
    financial_impact: hasFinancialImpact,
    financial_impact_reason: financialImpactReason,
  };
}

/**
 * Generate business intelligence summary
 */
export function generateBusinessIntelligenceSummary(bi: BusinessIntelligence): string[] {
  const alerts: string[] = [];

  if (bi.project_scope_detected) {
    alerts.push(`🔧 PROJECT SCOPE: ${bi.project_scope_reason}`);
  }

  if (bi.executive_visibility) {
    alerts.push(`👔 EXECUTIVE VISIBILITY: ${bi.executive_visibility_reason}`);
  }

  if (bi.compliance_impact) {
    alerts.push(`⚖️ COMPLIANCE IMPACT: ${bi.compliance_impact_reason}`);
  }

  if (bi.financial_impact) {
    alerts.push(`💰 FINANCIAL IMPACT: ${bi.financial_impact_reason}`);
  }

  if (bi.outside_service_hours) {
    alerts.push(`🕐 OUTSIDE HOURS: ${bi.service_hours_note}`);
  }

  if (bi.client_technology) {
    alerts.push(`💻 CLIENT TECH: ${bi.client_technology}`);
  }

  if (bi.related_entities && bi.related_entities.length > 0) {
    alerts.push(`🔗 RELATED ENTITIES: ${bi.related_entities.join(', ')}`);
  }

  return alerts;
}

/**
 * Calculate business intelligence priority score
 */
export function calculateBusinessIntelligenceScore(bi: BusinessIntelligence): number {
  let score = 0;

  // Project scope adds 20 points
  if (bi.project_scope_detected ?? false) score += 20;

  // Executive visibility adds 30 points
  if (bi.executive_visibility ?? false) score += 30;

  // Compliance impact adds 25 points
  if (bi.compliance_impact ?? false) score += 25;

  // Financial impact adds 25 points
  if (bi.financial_impact ?? false) score += 25;

  // Outside service hours adds 10 points
  if (bi.outside_service_hours ?? false) score += 10;

  // Client technology context adds 5 points
  if (bi.client_technology) score += 5;

  // Related entities add 5 points each (max 15)
  score += Math.min((bi.related_entities?.length || 0) * 5, 15);

  return Math.min(score, 100); // Cap at 100
}
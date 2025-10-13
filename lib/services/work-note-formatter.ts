/**
 * Work Note Formatter
 * Formats classification results as ServiceNow work notes
 */

import type { CaseClassification, BusinessIntelligence, TechnicalEntities } from './case-classifier';
import type { DiscoveredEntity } from './entity-store';
import type { SimilarCase } from './case-intelligence';
import type { KBArticle } from './case-intelligence';

export interface CompleteClassification {
  category: string;
  subcategory?: string;
  confidence_score: number;
  reasoning: string;
  keywords: string[];
  quick_summary?: string;
  immediate_next_steps?: string[];
  technical_entities?: TechnicalEntities;
  urgency_level?: string;
  business_intelligence?: BusinessIntelligence;
  similar_cases?: any[];
  kb_articles?: any[];
}

/**
 * Format classification result as compact work note
 */
export function formatWorkNote(classification: CompleteClassification): string {
  let note = `━━━ AI TRIAGE ━━━\n`;
  note += `${classification.category}`;
  
  if (classification.subcategory) {
    note += ` > ${classification.subcategory}`;
  }

  if (classification.urgency_level) {
    const emoji = classification.urgency_level === 'High' ? '🔴' : 
                  classification.urgency_level === 'Medium' ? '🟡' : '🟢';
    note += ` | ${emoji} ${classification.urgency_level}`;
  }

  if (classification.confidence_score) {
    note += ` | ${(classification.confidence_score * 100).toFixed(0)}% confidence`;
  }

  note += `\n\n`;

  // Business alerts (exception-based)
  if (classification.business_intelligence) {
    const bi = classification.business_intelligence;
    const alerts: string[] = [];

    // CRITICAL: Systemic issue alert FIRST (most important)
    if (bi.systemic_issue_detected) {
      alerts.push(`🚨 SYSTEMIC ISSUE: ${bi.systemic_issue_reason || `${bi.affected_cases_same_client || 'Multiple'} similar cases from same client - infrastructure problem likely`}`);
    }

    if (bi.project_scope_detected) {
      alerts.push(`• PROJECT SCOPE: ${bi.project_scope_reason}`);
    }

    if (bi.executive_visibility) {
      alerts.push(`• EXECUTIVE VISIBILITY: ${bi.executive_visibility_reason}`);
    }

    if (bi.compliance_impact) {
      alerts.push(`• COMPLIANCE IMPACT: ${bi.compliance_impact_reason}`);
    }

    if (bi.financial_impact) {
      alerts.push(`• FINANCIAL IMPACT: ${bi.financial_impact_reason}`);
    }

    if (bi.client_technology) {
      alerts.push(`• CLIENT TECH: ${bi.client_technology}`);
    }

    if (bi.outside_service_hours) {
      alerts.push(`• OUTSIDE SLA HOURS: ${bi.service_hours_note}`);
    }

    if (alerts.length > 0) {
      note += `⚠️ BUSINESS ALERTS:\n`;
      alerts.forEach(alert => {
        note += `${alert}\n`;
      });
      note += `\n`;
    }
  }

  // Next steps
  if (classification.immediate_next_steps?.length) {
    note += `NEXT STEPS:\n`;
    classification.immediate_next_steps.slice(0, 3).forEach((step, i) => {
      note += `${i + 1}. ${step}\n`;
    });
    note += `\n`;
  }

  // Technical summary
  if (classification.reasoning) {
    const summary = classification.reasoning.split('\n')[0].substring(0, 150);
    note += `TECHNICAL: ${summary}\n\n`;
  }

  // Technical entities
  if (classification.technical_entities) {
    const entities = classification.technical_entities;
    const entityParts: string[] = [];

    if (entities.ip_addresses.length > 0) {
      entityParts.push(`IPs: ${entities.ip_addresses.slice(0, 3).join(', ')}`);
    }

    if (entities.systems.length > 0) {
      entityParts.push(`Systems: ${entities.systems.slice(0, 2).join(', ')}`);
    }

    if (entities.users.length > 0) {
      entityParts.push(`Users: ${entities.users.slice(0, 2).join(', ')}`);
    }

    if (entities.error_codes.length > 0) {
      entityParts.push(`Errors: ${entities.error_codes.slice(0, 2).join(', ')}`);
    }

    if (entityParts.length > 0) {
      note += `🔍 ENTITIES: ${entityParts.join(' | ')}\n\n`;
    }
  }

  // Similar Cases with MSP Attribution
  // Original: api/app/routers/webhooks.py:654-673
  if (classification.similar_cases?.length) {
    note += `📚 SIMILAR CASES (${classification.similar_cases.length} found):\n`;

    classification.similar_cases.slice(0, 3).forEach((similarCase: any, i) => {
      const caseNum = similarCase.case_number || 'N/A';
      const desc = similarCase.short_description ?
        similarCase.short_description.substring(0, 50) : 'N/A';
      const score = similarCase.similarity_score || 0;

      // MSP Client attribution label
      let clientLabel = '';
      const sameClient = similarCase.same_client;
      const clientName = similarCase.client_name;

      if (sameClient) {
        clientLabel = '[Your Organization]';
      } else if (clientName) {
        clientLabel = `[${clientName}]`;
      } else {
        clientLabel = '[Different Client]';
      }

      note += `${i + 1}. ${caseNum} ${clientLabel} - ${desc} (Score: ${score.toFixed(2)})\n`;
    });
    note += `\n`;
  }

  // KB Articles
  // Original: api/app/routers/webhooks.py:675-684
  if (classification.kb_articles?.length) {
    note += `📖 KB ARTICLES (${classification.kb_articles.length} found):\n`;

    classification.kb_articles.slice(0, 3).forEach((kb: any, i) => {
      const kbNum = kb.kb_number || 'N/A';
      const title = kb.title ? kb.title.substring(0, 50) : 'N/A';
      const score = kb.similarity_score || 0;

      note += `${i + 1}. ${kbNum} - ${title} (Score: ${score.toFixed(2)})\n`;
    });
    note += `\n`;
  }

  // Keywords
  if (classification.keywords?.length) {
    note += `\n🏷️ KEYWORDS: ${classification.keywords.slice(0, 5).join(', ')}`;
  }

  note += `\n━━━ END AI TRIAGE ━━━`;

  return note;
}

/**
 * Format brief work note for quick updates
 */
export function formatBriefWorkNote(classification: CompleteClassification): string {
  let note = `AI: ${classification.category}`;
  
  if (classification.subcategory) {
    note += ` > ${classification.subcategory}`;
  }

  if (classification.urgency_level) {
    const emoji = classification.urgency_level === 'High' ? '🔴' : 
                  classification.urgency_level === 'Medium' ? '🟡' : '🟢';
    note += ` ${emoji}`;
  }

  // Add critical business alerts only
  if (classification.business_intelligence) {
    const bi = classification.business_intelligence;
    const criticalAlerts: string[] = [];

    if (bi.executive_visibility) {
      criticalAlerts.push('EXEC');
    }

    if (bi.compliance_impact) {
      criticalAlerts.push('COMPLIANCE');
    }

    if (bi.project_scope_detected) {
      criticalAlerts.push('PROJECT');
    }

    if (criticalAlerts.length > 0) {
      note += ` [${criticalAlerts.join('|')}]`;
    }
  }

  return note;
}

/**
 * Format detailed work note with full information
 */
export function formatDetailedWorkNote(classification: CompleteClassification): string {
  let note = formatWorkNote(classification);

  // Add detailed sections
  note += `\n\n━━━ DETAILED ANALYSIS ━━━\n`;

  // Similar cases details
  if (classification.similar_cases?.length) {
    note += `\n📋 SIMILAR CASES:\n`;
    classification.similar_cases.slice(0, 3).forEach((similarCase, i) => {
      note += `${i + 1}. ${similarCase.case_number} (${(similarCase.similarity_score * 100).toFixed(1)}%)\n`;
      if (similarCase.content_preview) {
        note += `   ${similarCase.content_preview.substring(0, 100)}...\n`;
      }
    });
  }

  // KB articles details
  if (classification.kb_articles?.length) {
    note += `\n📚 KNOWLEDGE BASE:\n`;
    classification.kb_articles.slice(0, 3).forEach((kb, i) => {
      note += `${i + 1}. ${kb.kb_number}: ${kb.title}\n`;
      if (kb.similarity_score) {
        note += `   Relevance: ${(kb.similarity_score * 100).toFixed(1)}%\n`;
      }
    });
  }

  // Full technical entities
  if (classification.technical_entities) {
    const entities = classification.technical_entities;
    note += `\n🔍 TECHNICAL ENTITIES:\n`;
    
    if (entities.ip_addresses.length > 0) {
      note += `IP Addresses: ${entities.ip_addresses.join(', ')}\n`;
    }

    if (entities.systems.length > 0) {
      note += `Systems/Hostnames: ${entities.systems.join(', ')}\n`;
    }

    if (entities.users.length > 0) {
      note += `Users/Emails: ${entities.users.join(', ')}\n`;
    }

    if (entities.software.length > 0) {
      note += `Software: ${entities.software.join(', ')}\n`;
    }

    if (entities.error_codes.length > 0) {
      note += `Error Codes: ${entities.error_codes.join(', ')}\n`;
    }
  }

  return note;
}

/**
 * Format work note for specific audience (technical vs business)
 */
export function formatWorkNoteForAudience(
  classification: CompleteClassification,
  audience: 'technical' | 'business' | 'executive'
): string {
  switch (audience) {
    case 'technical':
      return formatTechnicalWorkNote(classification);
    
    case 'business':
      return formatBusinessWorkNote(classification);
    
    case 'executive':
      return formatExecutiveWorkNote(classification);
    
    default:
      return formatWorkNote(classification);
  }
}

/**
 * Format work note for technical audience
 */
function formatTechnicalWorkNote(classification: CompleteClassification): string {
  let note = `━━━ TECHNICAL TRIAGE ━━━\n`;
  note += `${classification.category}`;
  
  if (classification.subcategory) {
    note += ` > ${classification.subcategory}`;
  }

  note += ` | ${(classification.confidence_score * 100).toFixed(0)}% confidence\n\n`;

  // Technical entities first
  if (classification.technical_entities) {
    const entities = classification.technical_entities;
    note += `🔍 DETECTED ENTITIES:\n`;
    
    if (entities.ip_addresses.length > 0) {
      note += `IPs: ${entities.ip_addresses.join(', ')}\n`;
    }
    if (entities.systems.length > 0) {
      note += `Systems: ${entities.systems.join(', ')}\n`;
    }
    if (entities.error_codes.length > 0) {
      note += `Errors: ${entities.error_codes.join(', ')}\n`;
    }
    note += `\n`;
  }

  // Technical reasoning
  if (classification.reasoning) {
    note += `💭 ANALYSIS: ${classification.reasoning}\n\n`;
  }

  // Next steps
  if (classification.immediate_next_steps?.length) {
    note += `⚡ IMMEDIATE ACTIONS:\n`;
    classification.immediate_next_steps.forEach((step, i) => {
      note += `${i + 1}. ${step}\n`;
    });
  }

  return note;
}

/**
 * Format work note for business audience
 */
function formatBusinessWorkNote(classification: CompleteClassification): string {
  let note = `━━━ BUSINESS IMPACT ━━━\n`;
  note += `${classification.category}`;
  
  if (classification.urgency_level) {
    const emoji = classification.urgency_level === 'High' ? '🔴' : 
                  classification.urgency_level === 'Medium' ? '🟡' : '🟢';
    note += ` | ${emoji} ${classification.urgency_level}`;
  }

  note += `\n\n`;

  // Business intelligence first
  if (classification.business_intelligence) {
    const bi = classification.business_intelligence;
    
    if (bi.project_scope_detected || bi.executive_visibility || 
        bi.compliance_impact || bi.financial_impact) {
      note += `⚠️ BUSINESS ALERTS:\n`;
      
      if (bi.executive_visibility) {
        note += `• Executive visibility: ${bi.executive_visibility_reason}\n`;
      }
      if (bi.financial_impact) {
        note += `• Financial impact: ${bi.financial_impact_reason}\n`;
      }
      if (bi.compliance_impact) {
        note += `• Compliance impact: ${bi.compliance_impact_reason}\n`;
      }
      if (bi.project_scope_detected) {
        note += `• Project scope: ${bi.project_scope_reason}\n`;
      }
      note += `\n`;
    }
  }

  // Business summary
  if (classification.quick_summary) {
    note += `📋 SUMMARY: ${classification.quick_summary}\n\n`;
  }

  // Business impact steps
  if (classification.immediate_next_steps?.length) {
    note += `🎯 BUSINESS ACTIONS:\n`;
    classification.immediate_next_steps.slice(0, 3).forEach((step, i) => {
      note += `${i + 1}. ${step}\n`;
    });
  }

  return note;
}

/**
 * Format work note for executive audience
 */
function formatExecutiveWorkNote(classification: CompleteClassification): string {
  let note = `━━━ EXECUTIVE SUMMARY ━━━\n`;
  
  // Most critical information first
  if (classification.urgency_level) {
    const emoji = classification.urgency_level === 'High' ? '🔴 CRITICAL' : 
                  classification.urgency_level === 'Medium' ? '🟡 ATTENTION' : '🟢 MONITOR';
    note += `${emoji} | ${classification.category}\n\n`;
  }

  // Executive-level alerts only
  if (classification.business_intelligence) {
    const bi = classification.business_intelligence;
    const executiveAlerts: string[] = [];

    if (bi.executive_visibility) {
      executiveAlerts.push(`Executive Visibility: ${bi.executive_visibility_reason}`);
    }
    if (bi.financial_impact) {
      executiveAlerts.push(`Financial Impact: ${bi.financial_impact_reason}`);
    }
    if (bi.compliance_impact) {
      executiveAlerts.push(`Compliance Impact: ${bi.compliance_impact_reason}`);
    }

    if (executiveAlerts.length > 0) {
      note += `🚨 EXECUTIVE ALERTS:\n`;
      executiveAlerts.forEach(alert => {
        note += `• ${alert}\n`;
      });
      note += `\n`;
    }
  }

  // High-level summary
  if (classification.quick_summary) {
    note += `📊 IMPACT SUMMARY:\n${classification.quick_summary}\n\n`;
  }

  // Strategic next steps
  if (classification.immediate_next_steps?.length) {
    note += `🎯 STRATEGIC ACTIONS:\n`;
    classification.immediate_next_steps.slice(0, 2).forEach((step, i) => {
      note += `${i + 1}. ${step}\n`;
    });
  }

  return note;
}
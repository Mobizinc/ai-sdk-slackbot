/**
 * Work Note Formatter
 * Formats classification results as ServiceNow work notes with HTML formatting
 *
 * Original: api/app/routers_minimal/webhooks.py:378-113 (_build_compact_work_note)
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
 * HTML escape helper for ServiceNow
 */
function escapeHtml(text: string | undefined): string {
  if (!text) return '';
  return String(text)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#039;');
}

/**
 * Format date for display in work notes
 * Shows relative time (e.g., "3 days ago") for recent dates, or absolute date for older ones
 */
function formatCaseDate(dateStr: string | undefined): string {
  if (!dateStr) return '';

  try {
    const date = new Date(dateStr);
    const now = new Date();
    const diffMs = now.getTime() - date.getTime();
    const diffDays = Math.floor(diffMs / (1000 * 60 * 60 * 24));

    // Show relative time for cases within last 30 days
    if (diffDays === 0) {
      return 'today';
    } else if (diffDays === 1) {
      return 'yesterday';
    } else if (diffDays < 30) {
      return `${diffDays} days ago`;
    } else {
      // Show absolute date for older cases
      const month = date.toLocaleDateString('en-US', { month: 'short' });
      const day = date.getDate();
      const year = date.getFullYear();
      const currentYear = now.getFullYear();

      // Omit year if it's current year
      if (year === currentYear) {
        return `${month} ${day}`;
      } else {
        return `${month} ${day}, ${year}`;
      }
    }
  } catch (error) {
    return '';
  }
}

/**
 * Format classification result as compact work note with HTML formatting
 *
 * Original: api/app/routers_minimal/webhooks.py:378-113
 */
export function formatWorkNote(classification: CompleteClassification): string {
  // Start [code] wrapper for HTML formatting in ServiceNow
  let note = '[code]\n';

  // Header with HTML formatting
  note += `<strong>━━━ AI TRIAGE ━━━</strong><br>\n`;
  note += `<strong>Category:</strong> ${escapeHtml(classification.category)}`;

  if (classification.subcategory) {
    note += ` &gt; ${escapeHtml(classification.subcategory)}`;
  }

  if (classification.urgency_level) {
    const emoji = classification.urgency_level === 'High' ? '🔴' :
                  classification.urgency_level === 'Medium' ? '🟡' : '🟢';
    const color = classification.urgency_level === 'High' ? 'red' :
                  classification.urgency_level === 'Medium' ? 'orange' : 'green';
    note += ` | <span style="color:${color}">${emoji} ${escapeHtml(classification.urgency_level)}</span>`;
  }

  if (classification.confidence_score) {
    note += ` | ${(classification.confidence_score * 100).toFixed(0)}% confidence`;
  }

  note += `<br><br>\n\n`;

  // Business alerts (exception-based) with HTML formatting
  if (classification.business_intelligence) {
    const bi = classification.business_intelligence;
    const hasAlerts = bi.systemic_issue_detected || bi.project_scope_detected ||
                      bi.executive_visibility || bi.compliance_impact ||
                      bi.financial_impact || bi.client_technology || bi.outside_service_hours;

    if (hasAlerts) {
      note += `<strong>⚠️ BUSINESS ALERTS:</strong><br>\n<ul>\n`;

      // CRITICAL: Systemic issue alert FIRST (most important)
      if (bi.systemic_issue_detected) {
        const reason = bi.systemic_issue_reason || `${bi.affected_cases_same_client || 'Multiple'} similar cases from same client - infrastructure problem likely`;
        note += `<li><span style="color:red"><strong>🚨 SYSTEMIC ISSUE:</strong></span> ${escapeHtml(reason)}</li>\n`;
      }

      if (bi.project_scope_detected) {
        note += `<li><strong>PROJECT SCOPE:</strong> ${escapeHtml(bi.project_scope_reason || '')}</li>\n`;
      }

      if (bi.executive_visibility) {
        note += `<li><strong>EXECUTIVE VISIBILITY:</strong> ${escapeHtml(bi.executive_visibility_reason || '')}</li>\n`;
      }

      if (bi.compliance_impact) {
        note += `<li><strong>COMPLIANCE IMPACT:</strong> ${escapeHtml(bi.compliance_impact_reason || '')}</li>\n`;
      }

      if (bi.financial_impact) {
        note += `<li><strong>FINANCIAL IMPACT:</strong> ${escapeHtml(bi.financial_impact_reason || '')}</li>\n`;
      }

      if (bi.client_technology) {
        note += `<li><strong>CLIENT TECH:</strong> ${escapeHtml(bi.client_technology)}</li>\n`;
      }

      if (bi.outside_service_hours) {
        note += `<li><strong>OUTSIDE SLA HOURS:</strong> ${escapeHtml(bi.service_hours_note || '')}</li>\n`;
      }

      note += `</ul>\n<br>\n\n`;
    }
  }

  // Next steps with HTML formatting
  if (classification.immediate_next_steps?.length) {
    note += `<strong>NEXT STEPS:</strong><br>\n<ol>\n`;
    classification.immediate_next_steps.slice(0, 5).forEach((step) => {
      note += `<li>${escapeHtml(step)}</li>\n`;
    });
    note += `</ol>\n<br>\n\n`;
  }

  // Technical summary - use quick_summary if available, otherwise full reasoning
  if (classification.quick_summary) {
    note += `<strong>SUMMARY:</strong> ${escapeHtml(classification.quick_summary)}<br><br>\n\n`;
  } else if (classification.reasoning) {
    // Use full reasoning, don't truncate - let Claude complete the thought
    const summary = classification.reasoning.split('\n')[0]; // First paragraph only
    note += `<strong>TECHNICAL:</strong> ${escapeHtml(summary)}<br><br>\n\n`;
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

  // Similar Cases with MSP Attribution and HTML formatting
  // Original: api/app/routers_minimal/webhooks.py:450-471
  if (classification.similar_cases?.length) {
    note += `<strong>📚 SIMILAR CASES (${classification.similar_cases.length} found):</strong><br>\n<ul>\n`;

    classification.similar_cases.slice(0, 3).forEach((similarCase: any) => {
      const caseNum = escapeHtml(similarCase.case_number || 'N/A');
      const desc = escapeHtml(similarCase.short_description?.substring(0, 50) || 'N/A');
      const score = similarCase.similarity_score || 0;

      // Format date (try opened_at first, fall back to sys_created_on)
      const dateStr = similarCase.opened_at || similarCase.sys_created_on;
      const dateDisplay = formatCaseDate(dateStr);
      const dateLabel = dateDisplay ? ` (${dateDisplay})` : '';

      note += `<li><strong>${caseNum}</strong>${dateLabel} - ${desc} (Score: ${score.toFixed(2)})</li>\n`;
    });
    note += `</ul>\n<br>\n\n`;
  }

  // KB Articles with HTML formatting
  // Original: api/app/routers_minimal/webhooks.py:474-478 (currently disabled in Python)
  if (classification.kb_articles?.length) {
    note += `<strong>📖 KB ARTICLES (${classification.kb_articles.length} found):</strong><br>\n<ul>\n`;

    classification.kb_articles.slice(0, 3).forEach((kb: any) => {
      const kbNum = escapeHtml(kb.kb_number || 'N/A');
      const title = escapeHtml(kb.title?.substring(0, 50) || 'N/A');
      const score = kb.similarity_score || 0;

      note += `<li><strong>${kbNum}</strong> - ${title} (Score: ${score.toFixed(2)})</li>\n`;
    });
    note += `</ul>\n<br>\n\n`;
  }

  // Keywords
  if (classification.keywords?.length) {
    const keywords = classification.keywords.slice(0, 5).map(k => escapeHtml(k)).join(', ');
    note += `<br>\n<strong>🏷️ KEYWORDS:</strong> ${keywords}\n`;
  }

  // Close [code] wrapper
  note += `[/code]`;

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
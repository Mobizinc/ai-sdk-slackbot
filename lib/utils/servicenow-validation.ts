/**
 * ServiceNow Partial Validation Utilities
 * 
 * Provides graceful degradation validation for ServiceNow payloads.
 * Instead of failing completely on invalid payloads, extracts valid fields
 * and provides warnings for invalid data.
 */

import { ServiceNowCaseWebhookSchema } from '../schemas/servicenow-webhook.js';
import { ServiceNowIncidentWebhookSchema } from '../schemas/servicenow-incident-webhook.js';
import type { ServiceNowCaseWebhook } from '../schemas/servicenow-webhook.js';
import type { ServiceNowIncidentWebhook } from '../schemas/servicenow-incident-webhook.js';

export interface PartialValidationResult<T> {
  success: boolean;
  data?: T;
  partialData?: Record<string, unknown>;
  errors: string[];
  warnings: string[];
  strategy: 'full' | 'partial' | 'minimal';
}

/**
 * Minimum required fields for a ServiceNow payload to be useful.
 */
const MINIMUM_REQUIRED_FIELDS = {
  case: ['case_number', 'sys_id', 'short_description'],
  incident: ['incident_number', 'incident_sys_id'],
} as const;

/**
 * Validate ServiceNow case webhook with graceful degradation.
 */
export function validateServiceNowCasePartial(payload: unknown): PartialValidationResult<ServiceNowCaseWebhook> {
  // Strategy 1: Try full validation first
  const fullResult = ServiceNowCaseWebhookSchema.safeParse(payload);
  if (fullResult.success) {
    // Still populate partialData for consistency
    const payloadObj = payload as Record<string, unknown>;
    const partialData: Record<string, unknown> = {};
    
    // Extract all fields for partialData
    for (const [key, value] of Object.entries(payloadObj)) {
      if (value !== null && value !== undefined) {
        partialData[key] = value;
      }
    }
    
    return {
      success: true,
      data: fullResult.data,
      partialData,
      errors: [],
      warnings: [],
      strategy: 'full',
    };
  }

  const errors: string[] = [];
  const warnings: string[] = [];
  const partialData: Record<string, unknown> = {};

  // Strategy 2: Extract valid fields individually
  const payloadObj = payload as Record<string, unknown>;
  
  // Extract minimum required fields first (filter out null/undefined)
  for (const field of MINIMUM_REQUIRED_FIELDS.case) {
    if (field in payloadObj && payloadObj[field] !== undefined && payloadObj[field] !== null) {
      partialData[field] = payloadObj[field];
    }
  }

  // Extract other common fields if they exist and look valid
  const commonFields = [
    'description', 'priority', 'urgency', 'impact', 'category', 'subcategory',
    'state', 'assignment_group', 'assigned_to', 'caller_id', 'contact',
    'company', 'opened_at', 'configuration_item', 'business_service'
  ];

  for (const field of commonFields) {
    if (field in payloadObj) {
      const value = payloadObj[field];
      // Basic validation - not null/undefined and reasonable type
      if (value !== null && value !== undefined) {
        // Additional type checking for common fields
        if (field === 'priority' || field === 'urgency' || field === 'impact') {
          if (typeof value === 'string') {
            partialData[field] = value;
          }
        } else {
          partialData[field] = value;
        }
      }
    }
  }

  // Extract any additional fields that might be useful
  for (const [key, value] of Object.entries(payloadObj)) {
    if (!MINIMUM_REQUIRED_FIELDS.case.includes(key as any) && 
        !commonFields.includes(key) && 
        value !== null && 
        value !== undefined) {
      partialData[key] = value;
    }
  }

  // Check if we have minimum viable data
  const hasMinimumFields = MINIMUM_REQUIRED_FIELDS.case.every(field => field in partialData);
  
  if (hasMinimumFields) {
    // Try to validate the partial data
    const partialResult = ServiceNowCaseWebhookSchema.safeParse(partialData);
    if (partialResult.success) {
      return {
        success: true,
        data: partialResult.data,
        partialData,
        errors: [],
        warnings: [
          'Payload partially validated - some fields may be missing or invalid',
          ...warnings,
        ],
        strategy: 'partial',
      };
    } else {
      // Even partial validation failed, create minimal object with essential fields
      const minimalData: Record<string, unknown> = {};
      for (const field of MINIMUM_REQUIRED_FIELDS.case) {
        if (field in partialData) {
          minimalData[field] = partialData[field];
        }
      }
      // Also include description if available (it's commonly needed)
      if ('description' in partialData && partialData.description !== undefined) {
        minimalData.description = partialData.description;
      }

      return {
        success: true,
        data: minimalData as ServiceNowCaseWebhook,
        partialData,
        errors: [],
        warnings: [
          'Using minimal payload validation - only essential fields validated',
          ...warnings,
          ...partialResult.error.issues.map(issue => `${issue.path.join('.')}: ${issue.message}`),
        ],
        strategy: 'minimal',
      };
    }
  }

  // Strategy 3: Complete failure
  return {
    success: false,
    errors: [
      'Missing minimum required fields',
      ...MINIMUM_REQUIRED_FIELDS.case.filter(field => !(field in payloadObj))
        .map(field => `Missing required field: ${field}`),
      ...fullResult.error.issues.map(issue => `${issue.path.join('.')}: ${issue.message}`),
    ],
    warnings,
    strategy: 'minimal',
  };
}

/**
 * Validate ServiceNow incident webhook with graceful degradation.
 */
export function validateServiceNowIncidentPartial(payload: unknown): PartialValidationResult<ServiceNowIncidentWebhook> {
  // Strategy 1: Try full validation first
  const fullResult = ServiceNowIncidentWebhookSchema.safeParse(payload);
  if (fullResult.success) {
    return {
      success: true,
      data: fullResult.data,
      errors: [],
      warnings: [],
      strategy: 'full',
    };
  }

  const errors: string[] = [];
  const warnings: string[] = [];
  const partialData: Record<string, unknown> = {};

  // Strategy 2: Extract valid fields individually
  const payloadObj = payload as Record<string, unknown>;
  
  // Extract minimum required fields first
  for (const field of MINIMUM_REQUIRED_FIELDS.incident) {
    if (field in payloadObj && payloadObj[field] !== undefined && payloadObj[field] !== null) {
      partialData[field] = payloadObj[field];
    }
  }

  // Extract other common incident fields
  const incidentFields = [
    'state', 'state_label', 'close_notes', 'close_code', 'resolved_at',
    'work_notes', 'comments', 'hold_reason', 'hold_until', 'parent_case_sys_id'
  ];

  for (const field of incidentFields) {
    if (field in payloadObj) {
      const value = payloadObj[field];
      if (value !== null && value !== undefined) {
        if (typeof value === 'string' || typeof value === 'object' || typeof value === 'number') {
          partialData[field] = value;
        } else {
          warnings.push(`Field ${field} has unexpected type: ${typeof value}`);
        }
      }
    }
  }

  // Check if we have minimum viable data
  const hasMinimumFields = MINIMUM_REQUIRED_FIELDS.incident.every(field => field in partialData);
  
  if (hasMinimumFields) {
    // Try to validate the partial data
    const partialResult = ServiceNowIncidentWebhookSchema.safeParse(partialData);
    if (partialResult.success) {
      return {
        success: true,
        data: partialResult.data,
        partialData,
        errors: [],
        warnings: [
          'Payload partially validated - some fields may be missing or invalid',
          ...warnings,
        ],
        strategy: 'partial',
      };
    } else {
      // Even partial validation failed, create minimal object
      const minimalData: Record<string, unknown> = {};
      for (const field of MINIMUM_REQUIRED_FIELDS.incident) {
        if (field in partialData) {
          minimalData[field] = partialData[field];
        }
      }

      return {
        success: true,
        data: minimalData as ServiceNowIncidentWebhook,
        partialData,
        errors: [],
        warnings: [
          'Using minimal payload validation - only essential fields validated',
          ...warnings,
          ...partialResult.error.issues.map(issue => `${issue.path.join('.')}: ${issue.message}`),
        ],
        strategy: 'minimal',
      };
    }
  }

  // Strategy 3: Complete failure
  return {
    success: false,
    errors: [
      'Missing minimum required fields',
      ...MINIMUM_REQUIRED_FIELDS.incident.filter(field => !(field in payloadObj))
        .map(field => `Missing required field: ${field}`),
      ...fullResult.error.issues.map(issue => `${issue.path.join('.')}: ${issue.message}`),
    ],
    warnings,
    strategy: 'minimal',
  };
}

/**
 * Generic validation function that detects payload type and validates accordingly.
 */
export function validateServiceNowPayloadPartial(payload: unknown): PartialValidationResult<ServiceNowCaseWebhook | ServiceNowIncidentWebhook> {
  const payloadObj = payload as Record<string, unknown>;
  
  // Detect payload type based on field presence
  const hasCaseNumber = 'case_number' in payloadObj;
  const hasIncidentNumber = 'incident_number' in payloadObj;
  
  if (hasCaseNumber && hasIncidentNumber) {
    // Ambiguous - try both and prefer case
    const caseResult = validateServiceNowCasePartial(payload);
    const incidentResult = validateServiceNowIncidentPartial(payload);
    
    if (caseResult.success) {
      return {
        ...caseResult,
        warnings: [...caseResult.warnings, 'Ambiguous payload type - treated as case'],
      };
    } else if (incidentResult.success) {
      return {
        ...incidentResult,
        warnings: [...incidentResult.warnings, 'Ambiguous payload type - treated as incident'],
      };
    } else {
      // Both failed
      return {
        success: false,
        errors: [
          'Unable to determine payload type',
          ...caseResult.errors,
          ...incidentResult.errors,
        ],
        warnings: [...caseResult.warnings, ...incidentResult.warnings, 'Ambiguous payload type - both case and incident fields present'],
        strategy: 'minimal',
      };
    }
  } else if (hasCaseNumber) {
    return validateServiceNowCasePartial(payload);
  } else if (hasIncidentNumber) {
    return validateServiceNowIncidentPartial(payload);
  } else {
    // Unknown payload type - try both validators
    const caseResult = validateServiceNowCasePartial(payload);
    const incidentResult = validateServiceNowIncidentPartial(payload);
    
    // Return the one with better success
    if (caseResult.success && !incidentResult.success) {
      return caseResult;
    } else if (!caseResult.success && incidentResult.success) {
      return incidentResult;
    } else if (caseResult.success && incidentResult.success) {
      // Both succeeded - prefer case (more common)
      return {
        ...caseResult,
        warnings: [...caseResult.warnings, 'Ambiguous payload type - treated as case'],
      };
    } else {
      // Both failed
      return {
        success: false,
        errors: [
          'Unable to determine payload type',
          ...caseResult.errors,
          ...incidentResult.errors,
        ],
        warnings: [...caseResult.warnings, ...incidentResult.warnings],
        strategy: 'minimal',
      };
    }
  }
}

/**
 * Check if a payload has enough information to be processed.
 */
export function isProcessablePayload(result: PartialValidationResult<any>): boolean {
  return result.success && (
    result.strategy === 'full' || 
    result.strategy === 'partial' || 
    (result.strategy === 'minimal' && result.data && Object.keys(result.data).length > 0)
  );
}

/**
 * Get validation statistics for monitoring.
 */
export function getValidationStats(results: PartialValidationResult<any>[]): {
  total: number;
  full: number;
  partial: number;
  minimal: number;
  failed: number;
  successRate: number;
} {
  const total = results.length;
  if (total === 0) {
    return {
      total: 0,
      full: 0,
      partial: 0,
      minimal: 0,
      failed: 0,
      successRate: 0,
    };
  }
  
  const full = results.filter(r => r.strategy === 'full').length;
  const partial = results.filter(r => r.strategy === 'partial').length;
  const minimal = results.filter(r => r.strategy === 'minimal' && r.success).length;
  const failed = results.filter(r => !r.success).length;
  const successRate = (full + partial + minimal) / total;

  return {
    total,
    full,
    partial,
    minimal,
    failed,
    successRate,
  };
}
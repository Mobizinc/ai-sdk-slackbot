/**
 * Resolution Detector
 *
 * Detects when a case has been resolved based on conversation patterns
 * and validates against ServiceNow state when available.
 *
 * Preserves exact resolution detection logic from original implementation.
 */

import type { CaseContext } from '../../context-manager';
import type { CaseDataService } from '../../services/case-data';
import { getCaseDataService } from '../../services/case-data';

export interface ResolutionDetectorDeps {
  caseDataService: CaseDataService;
}

export interface ResolutionCheckResult {
  isResolved: boolean;
  isValidatedByServiceNow: boolean;
  reason: string;
}

/**
 * Resolution Detector
 * Detects resolution based on conversation and ServiceNow state
 */
export class ResolutionDetector {
  constructor(private deps: ResolutionDetectorDeps) {}

  /**
   * Check if a case should trigger KB generation workflow
   * Validates against both conversation context and ServiceNow state
   */
  async shouldTriggerKBWorkflow(
    context: CaseContext
  ): Promise<ResolutionCheckResult> {
    // First check conversation-based resolution
    if (!context.isResolved) {
      return {
        isResolved: false,
        isValidatedByServiceNow: false,
        reason: 'Not marked as resolved in conversation',
      };
    }

    // Already notified, skip
    if (context._notified) {
      return {
        isResolved: false,
        isValidatedByServiceNow: false,
        reason: 'Already notified about resolution',
      };
    }

    // If ServiceNow not configured, rely on conversation only
    if (!this.deps.caseDataService.isConfigured()) {
      return {
        isResolved: true,
        isValidatedByServiceNow: false,
        reason: 'ServiceNow not configured, using conversation-based detection',
      };
    }

    // Validate against ServiceNow state
    try {
      const isValidated = await this.validateServiceNowResolution(
        context.caseNumber
      );

      if (isValidated) {
        return {
          isResolved: true,
          isValidatedByServiceNow: true,
          reason: 'Confirmed resolved in both conversation and ServiceNow',
        };
      } else {
        return {
          isResolved: false,
          isValidatedByServiceNow: false,
          reason: 'Conversation suggests resolution but ServiceNow state does not confirm',
        };
      }
    } catch (error) {
      console.log(
        `[Resolution Detector] Could not validate ServiceNow state for ${context.caseNumber}:`,
        error
      );

      // ServiceNow check failed, fall back to fail-safe (assume NOT resolved)
      // We don't want to trigger KB workflows on unverified conversational signals if the source of truth is unreachable.
      return {
        isResolved: false,
        isValidatedByServiceNow: false,
        reason: 'ServiceNow validation failed (fail-safe)',
      };
    }
  }

  /**
   * Validate resolution against ServiceNow state
   */
  private async validateServiceNowResolution(
    caseNumber: string
  ): Promise<boolean> {
    const caseDetails = await this.deps.caseDataService.getCase(caseNumber);

    if (!caseDetails) {
      return false;
    }

    const state = caseDetails.state?.toLowerCase() || '';

    // Check for resolved states
    return state.includes('closed') || state.includes('resolved');
  }

  /**
   * Check if case is in a resolved state (simple check)
   * Used for quick checks without full validation
   */
  async isResolved(caseNumber: string): Promise<boolean> {
    if (!this.deps.caseDataService.isConfigured()) {
      return false;
    }

    try {
      return await this.validateServiceNowResolution(caseNumber);
    } catch {
      return false;
    }
  }
}

// Singleton instance
let detector: ResolutionDetector | null = null;

/**
 * Get resolution detector singleton
 */
export function getResolutionDetector(): ResolutionDetector {
  if (!detector) {
    detector = new ResolutionDetector({
      caseDataService: getCaseDataService(),
    });
  }
  return detector;
}

/**
 * Reset the detector instance (for testing)
 */
export function __resetResolutionDetector(): void {
  detector = null;
}

/**
 * Set a custom detector instance (for testing)
 */
export function __setResolutionDetector(instance: ResolutionDetector): void {
  detector = instance;
}
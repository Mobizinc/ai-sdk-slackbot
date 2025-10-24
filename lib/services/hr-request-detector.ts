/**
 * HR Request Detector Service
 * Detects HR-related requests that should be submitted via catalog items
 * instead of generic IT support cases
 */

export type HRRequestType =
  | 'onboarding'
  | 'termination'
  | 'new_account'
  | 'account_modification'
  | 'offboarding'
  | 'transfer';

export interface HRDetectionResult {
  isHRRequest: boolean;
  requestType?: HRRequestType;
  matchedKeywords: string[];
  confidence: number; // 0-1
  suggestedCatalogItems: string[];
}

const GENERIC_KEYWORDS = new Set(['employee', 'user']);

export interface CatalogItemMapping {
  requestType: HRRequestType;
  keywords: string[];
  catalogItemNames: string[];
  priority: number; // Higher priority wins if multiple matches
}

/**
 * Default catalog item mappings
 * These can be overridden via configuration per client
 */
const DEFAULT_CATALOG_MAPPINGS: CatalogItemMapping[] = [
  {
    requestType: 'onboarding',
    keywords: [
      'onboarding',
      'onboard',
      'new hire',
      'new employee',
      'new user',
      'starting employee',
      'employee starting',
      'hire starting',
      'first day',
      'new team member',
    ],
    catalogItemNames: [
      'HR - Employee Onboarding Request',
      'Employee Onboarding',
      'New Employee Setup',
      'New Hire Request',
    ],
    priority: 10,
  },
  {
    requestType: 'termination',
    keywords: [
      'termination',
      'terminate',
      'terminated',
      'employee leaving',
      'user leaving',
      'last day',
      'final day',
      'resignation',
      'resigned',
      'quit',
      'quitting',
      'fired',
      'employee',
    ],
    catalogItemNames: [
      'HR - Employee Termination Request',
      'Employee Termination',
      'Employee Offboarding',
      'User Termination',
    ],
    priority: 10,
  },
  {
    requestType: 'offboarding',
    keywords: [
      'offboarding',
      'offboard',
      'deactivate user',
      'deactivate account',
      'deactivate',
      'disable user',
      'disable account',
      'remove access',
      'revoke access',
    ],
    catalogItemNames: [
      'HR - Employee Offboarding Request',
      'Employee Offboarding',
      'User Deactivation',
      'Access Removal',
    ],
    priority: 9,
  },
  {
    requestType: 'new_account',
    keywords: [
      'new account',
      'create account',
      'account creation',
      'setup account',
      'add user',
      'provision user',
      'user provisioning',
      'grant access',
    ],
    catalogItemNames: [
      'HR - New Account Request',
      'New User Account',
      'Account Creation Request',
      'User Provisioning',
    ],
    priority: 8,
  },
  {
    requestType: 'account_modification',
    keywords: [
      'account modification',
      'account change',
      'modify user',
      'update user',
      'change permissions',
      'permission change',
      'access change',
      'role change',
    ],
    catalogItemNames: [
      'HR - Account Modification Request',
      'User Account Modification',
      'Access Modification',
      'Permission Change Request',
    ],
    priority: 7,
  },
  {
    requestType: 'transfer',
    keywords: [
      'transfer',
      'transferring',
      'department change',
      'role change',
      'moving departments',
      'changing departments',
      'position change',
    ],
    catalogItemNames: [
      'HR - Employee Transfer Request',
      'Employee Transfer',
      'Department Transfer',
      'Role Change Request',
    ],
    priority: 6,
  },
];

export class HRRequestDetector {
  private catalogMappings: CatalogItemMapping[];

  constructor(customMappings?: CatalogItemMapping[]) {
    this.catalogMappings = customMappings || DEFAULT_CATALOG_MAPPINGS;
  }

  /**
   * Detect if a case is an HR-related request
   * Can optionally use custom mappings for client-specific detection
   */
  public detectHRRequest(input: {
    shortDescription: string;
    description?: string;
    category?: string;
    subcategory?: string;
    customMappings?: CatalogItemMapping[]; // Client-specific mappings
  }): HRDetectionResult {
    const text = `${input.shortDescription} ${input.description || ''} ${input.category || ''} ${input.subcategory || ''}`.toLowerCase();

    // Use custom mappings if provided, otherwise use instance mappings
    const mappingsToUse = input.customMappings || this.catalogMappings;

    let bestMatch: {
      mapping: CatalogItemMapping;
      matchedKeywords: string[];
      score: number;
    } | null = null;

    // Check each catalog mapping
    for (const mapping of mappingsToUse) {
      const matchedKeywords: string[] = [];
      let score = 0;

      for (const keyword of mapping.keywords) {
        if (text.includes(keyword.toLowerCase())) {
          matchedKeywords.push(keyword);
          // Weight by keyword length (longer = more specific)
          const baseWeight = GENERIC_KEYWORDS.has(keyword.toLowerCase()) ? 1 : keyword.length;
          score += baseWeight * mapping.priority;
        }
      }

      if (matchedKeywords.length > 0) {
        const currentScore = score + matchedKeywords.length * 10;
        if (!bestMatch || currentScore > bestMatch.score) {
          bestMatch = {
            mapping,
            matchedKeywords,
            score: currentScore,
          };
        }
      }
    }

    if (!bestMatch) {
      return {
        isHRRequest: false,
        matchedKeywords: [],
        confidence: 0,
        suggestedCatalogItems: [],
      };
    }

    const keywordContribution = bestMatch.matchedKeywords.reduce((sum, keyword) => {
      const normalizedKeyword = keyword.toLowerCase();
      const isMultiWord = normalizedKeyword.includes(' ');

      let weight = isMultiWord ? 0.2 : 0.12;
      if (GENERIC_KEYWORDS.has(normalizedKeyword)) {
        weight = 0.05;
      }

      const lengthBonus = Math.min(keyword.length / 20, 1) * 0.05;
      return sum + weight + lengthBonus;
    }, 0);

    const diversityBonus = bestMatch.matchedKeywords.length >= 3 ? 0.1 : 0;
    const priorityBonus = (bestMatch.mapping.priority / 10) * 0.15;

    const confidence = Math.min(
      0.28 + keywordContribution + diversityBonus + priorityBonus,
      1.0
    );

    return {
      isHRRequest: true,
      requestType: bestMatch.mapping.requestType,
      matchedKeywords: bestMatch.matchedKeywords,
      confidence,
      suggestedCatalogItems: bestMatch.mapping.catalogItemNames,
    };
  }

  /**
   * Check if a case should be auto-redirected
   * Returns true if confidence is above threshold
   */
  public shouldAutoRedirect(
    detectionResult: HRDetectionResult,
    confidenceThreshold: number = 0.5
  ): boolean {
    return detectionResult.isHRRequest && detectionResult.confidence >= confidenceThreshold;
  }

  /**
   * Get catalog item names for a specific request type
   */
  public getCatalogItemNamesForType(requestType: HRRequestType): string[] {
    const mapping = this.catalogMappings.find(m => m.requestType === requestType);
    return mapping?.catalogItemNames || [];
  }

  /**
   * Load custom catalog mappings from configuration
   */
  public static fromConfig(config?: string): HRRequestDetector {
    if (!config) {
      return new HRRequestDetector();
    }

    try {
      const parsed = JSON.parse(config);
      if (Array.isArray(parsed.mappings)) {
        return new HRRequestDetector(parsed.mappings as CatalogItemMapping[]);
      }
    } catch (error) {
      console.error('[HRRequestDetector] Failed to parse config:', error);
    }

    return new HRRequestDetector();
  }

  /**
   * Get all supported request types
   */
  public getSupportedRequestTypes(): HRRequestType[] {
    return this.catalogMappings.map(m => m.requestType);
  }

  /**
   * Add or update a catalog mapping
   */
  public addMapping(mapping: CatalogItemMapping): void {
    const existingIndex = this.catalogMappings.findIndex(
      m => m.requestType === mapping.requestType
    );

    if (existingIndex >= 0) {
      this.catalogMappings[existingIndex] = mapping;
    } else {
      this.catalogMappings.push(mapping);
    }

    // Re-sort by priority
    this.catalogMappings.sort((a, b) => b.priority - a.priority);
  }

  /**
   * Get statistics about detection patterns
   */
  public getStats(): {
    totalMappings: number;
    totalKeywords: number;
    requestTypes: HRRequestType[];
  } {
    const totalKeywords = this.catalogMappings.reduce(
      (sum, m) => sum + m.keywords.length,
      0
    );

    return {
      totalMappings: this.catalogMappings.length,
      totalKeywords,
      requestTypes: this.catalogMappings.map(m => m.requestType),
    };
  }
}

// Singleton instance
let hrRequestDetector: HRRequestDetector | null = null;

export function getHRRequestDetector(): HRRequestDetector {
  if (!hrRequestDetector) {
    const config = process.env.HR_REQUEST_DETECTOR_CONFIG;
    hrRequestDetector = HRRequestDetector.fromConfig(config);
  }
  return hrRequestDetector;
}

/**
 * Entity Resolution Service
 * 
 * Thin wrapper around BusinessContextService for entity alias resolution.
 * Reuses existing business context logic without duplicating functionality.
 */

import { getBusinessContextService } from "../business-context";
import type { ResolvedEntity, EntityType } from "./types";
import { CI_WORTHY_TYPES } from "./types";

export class EntityResolutionService {
  private businessContextService = getBusinessContextService();

  /**
   * Resolve an entity using business context alias resolution
   * 
   * This method wraps the existing BusinessContextService to provide
   * a clean interface for entity resolution in the reconciliation workflow.
   */
  async resolveEntity(entityValue: string, entityType: EntityType): Promise<ResolvedEntity> {
    // Check if entity type is CI-worthy
    const isCiWorthy = this.isCiWorthyEntity(entityType);
    
    if (!isCiWorthy) {
      return {
        originalValue: entityValue,
        resolvedValue: null,
        isAliasResolved: false,
        isCiWorthy: false,
      };
    }

    // Search business contexts for alias matches
    const contexts = await this.businessContextService.searchContextsByEntity(entityValue);
    
    if (contexts.length === 0) {
      // No business context match - use original value
      return {
        originalValue: entityValue,
        resolvedValue: entityValue,
        isAliasResolved: true,
        isCiWorthy: true,
      };
    }

    // Find exact alias match (reuse existing logic)
    for (const context of contexts) {
      const aliasMatch = this.findAliasMatch(entityValue, context);
      if (aliasMatch) {
        return {
          originalValue: entityValue,
          resolvedValue: aliasMatch.ciName || context.entityName,
          businessContextMatch: context.entityName,
          isAliasResolved: true,
          isCiWorthy: true,
        };
      }
    }

    // No exact alias match - use original value
    return {
      originalValue: entityValue,
      resolvedValue: entityValue,
      isAliasResolved: true,
      isCiWorthy: true,
    };
  }

  /**
   * Check if entity type is CI-worthy
   * Reuses existing logic from the original service
   */
  private isCiWorthyEntity(entityType: string): boolean {
    return CI_WORTHY_TYPES.includes(entityType as any);
  }

  /**
   * Find alias match in business context
   * Reuses existing alias matching logic from the original service
   */
  private findAliasMatch(entityValue: string, context: any): any {
    // Check if entityValue matches any alias
    const matchingAlias = context.aliases?.find((alias: string) => 
      alias.toLowerCase() === entityValue.toLowerCase()
    );

    if (matchingAlias) {
      return {
        businessContextName: context.entityName,
        ciName: context.cmdbIdentifiers?.[0]?.ciName,
        ciSysId: context.cmdbIdentifiers?.[0]?.sysId,
        ipAddresses: context.cmdbIdentifiers?.[0]?.ipAddresses,
      };
    }

    // Check if entityValue matches the main entity name
    if (context.entityName.toLowerCase() === entityValue.toLowerCase()) {
      return {
        businessContextName: context.entityName,
        ciName: context.cmdbIdentifiers?.[0]?.ciName,
        ciSysId: context.cmdbIdentifiers?.[0]?.sysId,
        ipAddresses: context.cmdbIdentifiers?.[0]?.ipAddresses,
      };
    }

    return null;
  }
}
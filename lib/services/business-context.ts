/**
 * Business Context Service
 * Loads and provides business context for case classification
 */

import { getBusinessContextRepository } from "../db/repositories/business-context-repository";
import type { BusinessContext } from "../db/schema";

export interface BusinessContextInfo {
  entityName: string;
  entityType: string;
  description?: string;
  industry?: string;
  technologyPortfolio?: string;
  serviceDetails?: string;
  keyContacts: Array<{ name: string; role: string; email?: string }>;
  slackChannels: Array<{ name: string; channelId?: string; notes?: string }>;
  cmdbIdentifiers: Array<{
    ciName?: string;
    sysId?: string;
    ipAddresses?: string[];
    description?: string;
    ownerGroup?: string;
    documentation?: string[];
  }>;
  contextStewards: Array<{
    type: "channel" | "user" | "usergroup";
    id?: string;
    name?: string;
    notes?: string;
  }>;
  aliases: string[];
  relatedEntities: string[];
}

export interface ContextQuery {
  entityNames?: string[];
  caseNumber?: string;
  description?: string;
  includeInactive?: boolean;
}

export interface ContextResult {
  contexts: BusinessContextInfo[];
  matchedEntities: string[];
  confidence: number;
}

export class BusinessContextService {
  private staticCache = new Map<string, BusinessContextInfo>();
  private cacheExpiry = new Map<string, number>();
  private readonly CACHE_TTL_MS = 5 * 60 * 1000; // 5 minutes

  constructor() {
    this.loadStaticContexts();
  }

  /**
   * Load static contexts from business-contexts.json file
   */
  private async loadStaticContexts(): Promise<void> {
    try {
      // In a real implementation, this would load from the JSON file
      // For now, we'll rely on the database repository
      console.log('[BusinessContextService] Static contexts will be loaded from database');
    } catch (error) {
      console.error('[BusinessContextService] Error loading static contexts:', error);
    }
  }

  /**
   * Get business contexts for entities mentioned in a case
   */
  public async getContexts(query: ContextQuery): Promise<ContextResult> {
    const repository = getBusinessContextRepository();
    const contexts: BusinessContextInfo[] = [];
    const matchedEntities: string[] = [];

    try {
      // If specific entity names provided, look them up directly
      if (query.entityNames && query.entityNames.length > 0) {
        for (const entityName of query.entityNames) {
          const context = await this.getEntityContext(entityName, query.includeInactive);
          if (context) {
            contexts.push(context);
            matchedEntities.push(entityName);
          }
        }
      }

      // If case description provided, try to extract entity names
      if (query.description && !query.entityNames?.length) {
        const extractedEntities = await this.extractEntitiesFromText(query.description);
        for (const entityName of extractedEntities) {
          const context = await this.getEntityContext(entityName, query.includeInactive);
          if (context) {
            contexts.push(context);
            matchedEntities.push(entityName);
          }
        }
      }

      // Remove duplicates
      const uniqueContexts = contexts.filter((context, index, self) =>
        index === self.findIndex(c => c.entityName === context.entityName)
      );

      // Calculate confidence based on match quality
      const confidence = this.calculateConfidence(matchedEntities, query);

      return {
        contexts: uniqueContexts,
        matchedEntities: [...new Set(matchedEntities)],
        confidence
      };
    } catch (error) {
      console.error('[BusinessContextService] Error getting contexts:', error);
      return {
        contexts: [],
        matchedEntities: [],
        confidence: 0
      };
    }
  }

  /**
   * Get context for a specific entity
   */
  private async getEntityContext(
    entityName: string, 
    includeInactive: boolean = false
  ): Promise<BusinessContextInfo | null> {
    // Check cache first
    const cacheKey = `${entityName}:${includeInactive}`;
    const cached = this.staticCache.get(cacheKey);
    const expiry = this.cacheExpiry.get(cacheKey);
    
    if (cached && expiry && Date.now() < expiry) {
      return cached;
    }

    const repository = getBusinessContextRepository();
    const context = includeInactive 
      ? await repository.findByName(entityName) || await repository.findById(parseInt(entityName))
      : await repository.findByName(entityName);

    if (!context) {
      return null;
    }

    const contextInfo: BusinessContextInfo = {
      entityName: context.entityName,
      entityType: context.entityType,
      description: context.description || undefined,
      industry: context.industry || undefined,
      technologyPortfolio: context.technologyPortfolio || undefined,
      serviceDetails: context.serviceDetails || undefined,
      keyContacts: context.keyContacts,
      slackChannels: context.slackChannels,
      cmdbIdentifiers: context.cmdbIdentifiers,
      contextStewards: context.contextStewards,
      aliases: context.aliases,
      relatedEntities: context.relatedEntities
    };

    // Cache the result
    this.staticCache.set(cacheKey, contextInfo);
    this.cacheExpiry.set(cacheKey, Date.now() + this.CACHE_TTL_MS);

    return contextInfo;
  }

  /**
   * Extract potential entity names from text using simple patterns
   */
  private async extractEntitiesFromText(text: string): Promise<string[]> {
    const repository = getBusinessContextRepository();
    const allContexts = await repository.getAllActive();
    const extractedEntities: string[] = [];

    const lowerText = text.toLowerCase();

    for (const context of allContexts) {
      // Check exact name match
      if (lowerText.includes(context.entityName.toLowerCase())) {
        extractedEntities.push(context.entityName);
        continue;
      }

      // Check alias matches
      for (const alias of context.aliases) {
        if (lowerText.includes(alias.toLowerCase())) {
          extractedEntities.push(context.entityName);
          break;
        }
      }

      // Check related entities
      for (const relatedEntity of context.relatedEntities) {
        if (lowerText.includes(relatedEntity.toLowerCase())) {
          extractedEntities.push(context.entityName);
          break;
        }
      }
    }

    return [...new Set(extractedEntities)];
  }

  /**
   * Calculate confidence score for context matches
   */
  private calculateConfidence(matchedEntities: string[], query: ContextQuery): number {
    if (matchedEntities.length === 0) return 0;

    let confidence = 0;

    // High confidence for explicit entity name matches
    if (query.entityNames && query.entityNames.length > 0) {
      const matchRatio = matchedEntities.length / query.entityNames.length;
      confidence = matchRatio * 0.9; // Max 0.9 for explicit matches
    } else if (query.description) {
      // Lower confidence for extracted entities
      const wordCount = query.description.split(/\s+/).length;
      const entityRatio = Math.min(matchedEntities.length / 5, 1); // Cap at 5 entities
      confidence = entityRatio * 0.6; // Max 0.6 for extracted matches
    }

    return Math.min(confidence, 1.0);
  }

  /**
   * Get enhanced context for case classification
   */
  public async getCaseClassificationContext(
    caseNumber: string,
    description: string,
    assignmentGroup?: string
  ): Promise<{
    businessContext: string;
    relevantEntities: string[];
    technologyStack: string[];
    keyContacts: string[];
    confidence: number;
  }> {
    const query: ContextQuery = {
      caseNumber,
      description,
      includeInactive: false
    };

    const result = await this.getContexts(query);
    
    // Build business context text
    const businessContextParts: string[] = [];
    
    if (result.contexts.length > 0) {
      businessContextParts.push("## Business Context");
      
      for (const context of result.contexts) {
        businessContextParts.push(`**${context.entityName} (${context.entityType})**`);
        
        if (context.description) {
          businessContextParts.push(`Description: ${context.description}`);
        }
        
        if (context.technologyPortfolio) {
          businessContextParts.push(`Technology: ${context.technologyPortfolio}`);
        }
        
        if (context.serviceDetails) {
          businessContextParts.push(`Services: ${context.serviceDetails}`);
        }
        
        businessContextParts.push(""); // Empty line
      }
    }

    // Extract relevant information
    const relevantEntities = result.contexts.map(c => c.entityName);
    const technologyStack = result.contexts
      .flatMap(c => c.technologyPortfolio ? [c.technologyPortfolio] : [])
      .filter(Boolean);
    const keyContacts = result.contexts
      .flatMap(c => c.keyContacts.map(kc => `${kc.name} (${kc.role})`));

    return {
      businessContext: businessContextParts.join("\n"),
      relevantEntities,
      technologyStack,
      keyContacts,
      confidence: result.confidence
    };
  }

  /**
   * Clear cache
   */
  public clearCache(): void {
    this.staticCache.clear();
    this.cacheExpiry.clear();
  }

  /**
   * Get cache statistics
   */
  public getCacheStats(): {
    size: number;
    ttl: number;
    expiredEntries: number;
  } {
    const now = Date.now();
    let expiredEntries = 0;

    for (const [, expiry] of this.cacheExpiry) {
      if (now >= expiry) {
        expiredEntries++;
      }
    }

    return {
      size: this.staticCache.size,
      ttl: this.CACHE_TTL_MS,
      expiredEntries
    };
  }

  /**
   * Search business contexts by entity value (name or alias)
   */
  public async searchContextsByEntity(entityValue: string): Promise<BusinessContextInfo[]> {
    const repository = getBusinessContextRepository();
    
    try {
      const allContexts = await repository.getAllActive();
      const lowerEntityValue = entityValue.toLowerCase();
      
      const matchingContexts = allContexts.filter(context => {
        // Check exact name match
        if (context.entityName.toLowerCase() === lowerEntityValue) {
          return true;
        }
        
        // Check alias matches
        return context.aliases.some(alias => 
          alias.toLowerCase() === lowerEntityValue
        );
      });
      
      return matchingContexts.map(context => ({
        entityName: context.entityName,
        entityType: context.entityType,
        description: context.description || undefined,
        industry: context.industry || undefined,
        technologyPortfolio: context.technologyPortfolio || undefined,
        serviceDetails: context.serviceDetails || undefined,
        keyContacts: context.keyContacts,
        slackChannels: context.slackChannels,
        cmdbIdentifiers: context.cmdbIdentifiers,
        contextStewards: context.contextStewards,
        aliases: context.aliases,
        relatedEntities: context.relatedEntities
      }));
    } catch (error) {
      console.error("[BusinessContext] Error searching contexts by entity:", error);
      return [];
    }
  }

  /**
   * Search business contexts by various criteria
   */
  public async searchContexts(criteria: {
    entityType?: string;
    industry?: string;
    technology?: string;
    limit?: number;
  }): Promise<BusinessContextInfo[]> {
    const repository = getBusinessContextRepository();
    
    try {
      // Use getAllActive and filter manually since search method doesn't exist
      const allContexts = await repository.getAllActive();
      let filteredContexts = allContexts;

      if (criteria.entityType) {
        filteredContexts = filteredContexts.filter(c => c.entityType === criteria.entityType);
      }
      if (criteria.industry) {
        filteredContexts = filteredContexts.filter(c => 
          c.industry?.toLowerCase().includes(criteria.industry!.toLowerCase())
        );
      }
      if (criteria.technology) {
        filteredContexts = filteredContexts.filter(c => 
          c.technologyPortfolio?.toLowerCase().includes(criteria.technology!.toLowerCase())
        );
      }

      if (criteria.limit) {
        filteredContexts = filteredContexts.slice(0, criteria.limit);
      }

      return filteredContexts.map((context: BusinessContext) => ({
        entityName: context.entityName,
        entityType: context.entityType,
        description: context.description || undefined,
        industry: context.industry || undefined,
        technologyPortfolio: context.technologyPortfolio || undefined,
        serviceDetails: context.serviceDetails || undefined,
        keyContacts: context.keyContacts,
        slackChannels: context.slackChannels,
        cmdbIdentifiers: context.cmdbIdentifiers,
        contextStewards: context.contextStewards,
        aliases: context.aliases,
        relatedEntities: context.relatedEntities
      }));
    } catch (error) {
      console.error('[BusinessContextService] Error searching contexts:', error);
      return [];
    }
  }
}

// Singleton instance
let businessContextService: BusinessContextService | null = null;

export function getBusinessContextService(): BusinessContextService {
  if (!businessContextService) {
    businessContextService = new BusinessContextService();
  }
  return businessContextService;
}
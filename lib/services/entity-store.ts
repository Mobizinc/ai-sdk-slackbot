/**
 * Entity Store Service
 * Handles discovered entity persistence and management
 */

import { getCaseClassificationRepository } from "../db/repositories/case-classification-repository";
import type { NewCaseDiscoveredEntities } from "../db/schema";

export interface DiscoveredEntity {
  entityType: 'IP_ADDRESS' | 'SYSTEM' | 'USER' | 'SOFTWARE' | 'ERROR_CODE' | 'NETWORK_DEVICE';
  entityValue: string;
  confidence: number;
  source: 'llm' | 'regex' | 'manual';
  metadata?: Record<string, any>;
}

export interface EntityExtractionResult {
  entities: DiscoveredEntity[];
  extractionTimeMs: number;
  sourceBreakdown: {
    llm: number;
    regex: number;
    manual: number;
  };
}

export interface EntityValidationResult {
  entity: DiscoveredEntity;
  isValid: boolean;
  reason?: string;
  suggestions?: string[];
}

export class EntityStoreService {
  private repository = getCaseClassificationRepository();

  /**
   * Extract entities from text using regex patterns
   */
  public extractEntitiesWithRegex(text: string): DiscoveredEntity[] {
    const entities: DiscoveredEntity[] = [];
    const startTime = Date.now();

    try {
      // IP Address patterns
      const ipPattern = /\b(?:(?:25[0-5]|2[0-4][0-9]|[01]?[0-9][0-9]?)\.){3}(?:25[0-5]|2[0-4][0-9]|[01]?[0-9][0-9]?)\b/g;
      const ipMatches = text.match(ipPattern);
      if (ipMatches) {
        for (const ip of [...new Set(ipMatches)]) {
          entities.push({
            entityType: 'IP_ADDRESS',
            entityValue: ip,
            confidence: 0.9,
            source: 'regex',
            metadata: { pattern: 'ipv4' }
          });
        }
      }

      // IP Network / CIDR patterns (e.g., 192.168.1.0/24)
      const cidrPattern = /\b(?:(?:25[0-5]|2[0-4][0-9]|[01]?[0-9][0-9]?)\.){3}(?:25[0-5]|2[0-4][0-9]|[01]?[0-9][0-9]?)\/\d{1,2}\b/g;
      const cidrMatches = text.match(cidrPattern);
      if (cidrMatches) {
        for (const cidr of [...new Set(cidrMatches)]) {
          entities.push({
            entityType: 'IP_ADDRESS',
            entityValue: cidr,
            confidence: 0.95,
            source: 'regex',
            metadata: { pattern: 'cidr', type: 'network' }
          });
        }
      }

      // Network Device patterns (Firewalls, Routers, Switches)
      const networkDevicePatterns = [
        // Palo Alto firewalls: PA-220, PA-3220, PA-850
        { pattern: /\bPA-\d+[A-Z]?\b/gi, vendor: 'Palo Alto', type: 'firewall' },
        // FortiGate firewalls: FortiGate-60F, FortiGate-100E, FortiGate 200F
        { pattern: /\bFortiGate-?\s*\d+[A-Z]?\b/gi, vendor: 'Fortinet', type: 'firewall' },
        // Cisco ASA firewalls: ASA-5516, ASA5525
        { pattern: /\bASA-?\d+[A-Z]?\b/gi, vendor: 'Cisco', type: 'firewall' },
        // Cisco Firepower: FTD-1120, Firepower-2130
        { pattern: /\b(?:FTD|Firepower)-?\s*\d+[A-Z]?\b/gi, vendor: 'Cisco', type: 'firewall' },
        // SonicWall: TZ-600, NSa-2700
        { pattern: /\b(?:TZ|NSa|NSsp)-?\s*\d+[A-Z]?\b/gi, vendor: 'SonicWall', type: 'firewall' },
        // Meraki firewalls/security appliances: MX64, MX84, MX100
        { pattern: /\bMX\d+[A-Z]?\b/g, vendor: 'Meraki', type: 'firewall' },
        // WatchGuard Firebox: Firebox-M370, Firebox-T80
        { pattern: /\bFirebox-?[A-Z]\d+[A-Z]?\b/gi, vendor: 'WatchGuard', type: 'firewall' },
        // Cisco routers: ISR-4331, ISR4451, ASR-1001
        { pattern: /\b(?:ISR|ASR|CSR)-?\s*\d+[A-Z]?\b/gi, vendor: 'Cisco', type: 'router' },
        // Cisco switches: C9300-48P, WS-C3850, Catalyst-9200
        { pattern: /\b(?:C\d{4}|WS-C\d{4}|Catalyst-?\s*\d{4})-?[A-Z0-9]*\b/gi, vendor: 'Cisco', type: 'switch' },
        // Generic firewall mentions with location/name
        { pattern: /\b(?:firewall|fw|dmz-?fw|edge-?fw|core-?fw)[-_]?[a-z0-9]+\b/gi, vendor: 'Generic', type: 'firewall' }
      ];

      for (const { pattern, vendor, type } of networkDevicePatterns) {
        const matches = text.match(pattern);
        if (matches) {
          for (const match of [...new Set(matches)]) {
            entities.push({
              entityType: 'NETWORK_DEVICE',
              entityValue: match.trim(),
              confidence: 0.85,
              source: 'regex',
              metadata: {
                pattern: pattern.source,
                vendor,
                deviceType: type
              }
            });
          }
        }
      }

      // Error code patterns (common formats)
      const errorCodePatterns = [
        /\b[A-Z]{2,}-\d{4,6}\b/g, // like ERROR-1234
        /\b0x[0-9A-Fa-f]{8}\b/g,   // like 0x80070005
        /\bE\d{6}\b/g,             // like E123456
        /\b\d{3,4}[A-Z]{2,}\b/g    // like 404NOTFOUND
      ];

      for (const pattern of errorCodePatterns) {
        const matches = text.match(pattern);
        if (matches) {
          for (const match of [...new Set(matches)]) {
            entities.push({
              entityType: 'ERROR_CODE',
              entityValue: match,
              confidence: 0.8,
              source: 'regex',
              metadata: { pattern: pattern.source }
            });
          }
        }
      }

      // Software/Service patterns
      const softwarePatterns = [
        /\b[A-Za-z]+(?:\s+[A-Za-z]+)*(?:\s+(?:Service|Server|Agent|Client|Application|System|Platform))\b/gi,
        /\b(?:Apache|Nginx|MySQL|PostgreSQL|MongoDB|Redis|Docker|Kubernetes|Jenkins|GitLab|GitHub|AWS|Azure|GCP|Oracle|SQL\s+Server|Windows\s+Server|Linux|Ubuntu|CentOS|Debian)\b/gi
      ];

      for (const pattern of softwarePatterns) {
        const matches = text.match(pattern);
        if (matches) {
          for (const match of [...new Set(matches)]) {
            entities.push({
              entityType: 'SOFTWARE',
              entityValue: match.trim(),
              confidence: 0.7,
              source: 'regex',
              metadata: { pattern: pattern.source }
            });
          }
        }
      }

      // System/Hostname patterns
      const systemPatterns = [
        /\b[a-zA-Z0-9](?:[a-zA-Z0-9-]{0,61}[a-zA-Z0-9])?(?:\.[a-zA-Z0-9](?:[a-zA-Z0-9-]{0,61}[a-zA-Z0-9])?)*\b/g,
        /\b[a-zA-Z]{2,}-[a-zA-Z0-9-]+\b/g // like PROD-WEB01
      ];

      for (const pattern of systemPatterns) {
        const matches = text.match(pattern);
        if (matches) {
          for (const match of [...new Set(matches)]) {
            // Filter out common words that match the pattern
            if (!this.isCommonWord(match.trim())) {
              entities.push({
                entityType: 'SYSTEM',
                entityValue: match.trim(),
                confidence: 0.6,
                source: 'regex',
                metadata: { pattern: pattern.source }
              });
            }
          }
        }
      }

      // User patterns (email addresses, usernames)
      const userPatterns = [
        /\b[A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\.[A-Z|a-z]{2,}\b/g, // Email
        /\b[a-zA-Z][a-zA-Z0-9_]{2,15}\b/g // Username (3-16 chars, starts with letter)
      ];

      for (const pattern of userPatterns) {
        const matches = text.match(pattern);
        if (matches) {
          for (const match of [...new Set(matches)]) {
            entities.push({
              entityType: 'USER',
              entityValue: match.trim(),
              confidence: pattern.source.includes('@') ? 0.95 : 0.5,
              source: 'regex',
              metadata: { pattern: pattern.source, isEmail: pattern.source.includes('@') }
            });
          }
        }
      }

      console.log(`[EntityStore] Extracted ${entities.length} entities via regex in ${Date.now() - startTime}ms`);
      return entities;
    } catch (error) {
      console.error('[EntityStore] Error extracting entities with regex:', error);
      return [];
    }
  }

  /**
   * Check if a word is too common to be a system name
   */
  private isCommonWord(word: string): boolean {
    const commonWords = new Set([
      'the', 'and', 'or', 'but', 'in', 'on', 'at', 'to', 'for', 'of', 'with', 'by',
      'from', 'up', 'about', 'into', 'through', 'during', 'before', 'after', 'above', 'below',
      'between', 'among', 'under', 'over', 'above', 'is', 'are', 'was', 'were', 'be', 'been',
      'have', 'has', 'had', 'do', 'does', 'did', 'will', 'would', 'could', 'should', 'may',
      'might', 'must', 'can', 'this', 'that', 'these', 'those', 'i', 'you', 'he', 'she', 'it',
      'we', 'they', 'what', 'which', 'who', 'when', 'where', 'why', 'how', 'all', 'any', 'both',
      'each', 'few', 'more', 'most', 'other', 'some', 'such', 'no', 'nor', 'not', 'only', 'own',
      'same', 'so', 'than', 'too', 'very', 'just', 'now', 'error', 'case', 'issue', 'problem'
    ]);
    
    return commonWords.has(word.toLowerCase());
  }

  /**
   * Save discovered entities to database
   */
  public async saveDiscoveredEntities(
    caseNumber: string,
    caseSysId: string,
    entities: DiscoveredEntity[]
  ): Promise<void> {
    if (entities.length === 0) return;

    try {
      const entityRecords: NewCaseDiscoveredEntities[] = entities.map(entity => ({
        caseNumber,
        caseSysId,
        entityType: entity.entityType,
        entityValue: entity.entityValue,
        confidence: entity.confidence,
        status: 'discovered',
        source: entity.source,
        metadata: entity.metadata || {}
      }));

      await this.repository.saveDiscoveredEntities(entityRecords);
      console.log(`[EntityStore] Saved ${entities.length} entities for case ${caseNumber}`);
    } catch (error) {
      console.error(`[EntityStore] Error saving entities for case ${caseNumber}:`, error);
      throw error;
    }
  }

  /**
   * Get discovered entities for a case
   */
  public async getDiscoveredEntities(caseNumber: string): Promise<DiscoveredEntity[]> {
    try {
      const dbEntities = await this.repository.getDiscoveredEntities(caseNumber);
      
      return dbEntities.map(entity => ({
        entityType: entity.entityType as DiscoveredEntity['entityType'],
        entityValue: entity.entityValue,
        confidence: entity.confidence,
        source: entity.source as DiscoveredEntity['source'],
        metadata: entity.metadata
      }));
    } catch (error) {
      console.error(`[EntityStore] Error getting entities for case ${caseNumber}:`, error);
      return [];
    }
  }

  /**
   * Validate and filter entities
   */
  public async validateEntities(entities: DiscoveredEntity[]): Promise<EntityValidationResult[]> {
    const results: EntityValidationResult[] = [];

    for (const entity of entities) {
      const validation = await this.validateEntity(entity);
      results.push(validation);
    }

    return results;
  }

  /**
   * Validate a single entity
   */
  private async validateEntity(entity: DiscoveredEntity): Promise<EntityValidationResult> {
    const isValid = await this.isValidEntity(entity);
    
    return {
      entity,
      isValid: isValid.valid,
      reason: isValid.reason,
      suggestions: isValid.suggestions
    };
  }

  /**
   * Check if an entity is valid
   */
  private async isValidEntity(entity: DiscoveredEntity): Promise<{
    valid: boolean;
    reason?: string;
    suggestions?: string[];
  }> {
    // Basic validation rules
    switch (entity.entityType) {
      case 'IP_ADDRESS':
        const ipRegex = /^(?:(?:25[0-5]|2[0-4][0-9]|[01]?[0-9][0-9]?)\.){3}(?:25[0-5]|2[0-4][0-9]|[01]?[0-9][0-9]?)$/;
        if (!ipRegex.test(entity.entityValue)) {
          return {
            valid: false,
            reason: 'Invalid IP address format',
            suggestions: ['Check for typos in the IP address']
          };
        }
        break;

      case 'ERROR_CODE':
        if (entity.entityValue.length < 3) {
          return {
            valid: false,
            reason: 'Error code too short',
            suggestions: ['Error codes should be at least 3 characters']
          };
        }
        break;

      case 'SYSTEM':
        if (entity.entityValue.length < 2) {
          return {
            valid: false,
            reason: 'System name too short',
            suggestions: ['System names should be at least 2 characters']
          };
        }
        break;

      case 'USER':
        if (entity.entityType === 'USER' && !entity.entityValue.includes('@') && entity.entityValue.length < 3) {
          return {
            valid: false,
            reason: 'Username too short',
            suggestions: ['Usernames should be at least 3 characters']
          };
        }
        break;

      case 'SOFTWARE':
        if (entity.entityValue.length < 2) {
          return {
            valid: false,
            reason: 'Software name too short',
            suggestions: ['Software names should be at least 2 characters']
          };
        }
        break;

      case 'NETWORK_DEVICE':
        if (entity.entityValue.length < 2) {
          return {
            valid: false,
            reason: 'Network device name too short',
            suggestions: ['Network device names should be at least 2 characters']
          };
        }
        break;
    }

    // Confidence threshold check
    if (entity.confidence < 0.3) {
      return {
        valid: false,
        reason: 'Confidence too low',
        suggestions: ['Consider manual verification for low-confidence entities']
      };
    }

    return { valid: true };
  }

  /**
   * Update entity status
   */
  public async updateEntityStatus(
    caseNumber: string,
    entityValue: string,
    status: 'discovered' | 'verified' | 'false_positive'
  ): Promise<void> {
    try {
      const entities = await this.getDiscoveredEntities(caseNumber);
      const entityToUpdate = entities.find(e => e.entityValue === entityValue);
      
      if (entityToUpdate) {
        // Note: This would need to be implemented in the repository
        console.log(`[EntityStore] Would update entity ${entityValue} status to ${status}`);
      }
    } catch (error) {
      console.error(`[EntityStore] Error updating entity status:`, error);
    }
  }

  /**
   * Get entity statistics
   */
  public async getEntityStatistics(days: number = 7): Promise<{
    totalEntities: number;
    entityTypeBreakdown: Record<string, number>;
    sourceBreakdown: Record<string, number>;
    averageConfidence: number;
    topEntities: Array<{ value: string; type: string; count: number }>;
  }> {
    try {
      // This would be implemented with actual database queries
      // For now, return placeholder data
      return {
        totalEntities: 0,
        entityTypeBreakdown: {
          IP_ADDRESS: 0,
          SYSTEM: 0,
          USER: 0,
          SOFTWARE: 0,
          ERROR_CODE: 0,
          NETWORK_DEVICE: 0
        },
        sourceBreakdown: {
          llm: 0,
          regex: 0,
          manual: 0
        },
        averageConfidence: 0,
        topEntities: []
      };
    } catch (error) {
      console.error('[EntityStore] Error getting entity statistics:', error);
      return {
        totalEntities: 0,
        entityTypeBreakdown: {},
        sourceBreakdown: {},
        averageConfidence: 0,
        topEntities: []
      };
    }
  }

  /**
   * Merge entities from different sources
   */
  public mergeEntities(
    llmEntities: DiscoveredEntity[],
    regexEntities: DiscoveredEntity[],
    manualEntities: DiscoveredEntity[] = []
  ): DiscoveredEntity[] {
    const entityMap = new Map<string, DiscoveredEntity>();

    // Add all entities to map, merging duplicates
    const allEntities = [...llmEntities, ...regexEntities, ...manualEntities];

    for (const entity of allEntities) {
      const key = `${entity.entityType}:${entity.entityValue}`;
      const existing = entityMap.get(key);

      if (!existing) {
        entityMap.set(key, entity);
      } else {
        // Merge with existing entity - keep higher confidence
        if (entity.confidence > existing.confidence) {
          entityMap.set(key, {
            ...existing,
            confidence: entity.confidence,
            source: entity.source,
            metadata: { ...existing.metadata, ...entity.metadata }
          });
        } else {
          // Update metadata even if confidence is lower
          entityMap.set(key, {
            ...existing,
            metadata: { ...existing.metadata, ...entity.metadata }
          });
        }
      }
    }

    return Array.from(entityMap.values());
  }
}

// Singleton instance
let entityStoreService: EntityStoreService | null = null;

export function getEntityStoreService(): EntityStoreService {
  if (!entityStoreService) {
    entityStoreService = new EntityStoreService();
  }
  return entityStoreService;
}
/**
 * CI Matching Service
 * Matches entities (IPs, hostnames, system names) to Configuration Items (CIs)
 * Uses ServiceNow CMDB repository with relationship-aware matching
 */

import { getCmdbRepository } from "../infrastructure/servicenow/repositories/factory";

interface CIMatch {
  sysId: string;
  name: string;
  class: string;
  confidence: number;
  source: "cmdb" | "manual";
  matchedAt: string;
  matchReason?: string;
}

interface ExtractedEntities {
  ip_addresses?: string[];
  hostnames?: string[];
  edge_names?: string[];
  error_messages?: string[];
  system_names?: string[];
  account_numbers?: string[];
}

export class CIMatchingService {
  private confidenceThreshold: number = 70;

  constructor(confidenceThreshold?: number) {
    if (confidenceThreshold !== undefined) {
      this.confidenceThreshold = confidenceThreshold;
    }
    console.log(`[CI Matching Service] Initialized with confidence threshold: ${this.confidenceThreshold}%`);
  }

  /**
   * Match entities against ServiceNow CMDB
   */
  private async matchCMDB(entities: ExtractedEntities): Promise<CIMatch[]> {
    const matches: CIMatch[] = [];

    try {
      const cmdbRepo = getCmdbRepository();

      // Match by IP address
      if (entities.ip_addresses) {
        for (const ip of entities.ip_addresses) {
          try {
            const cis = await cmdbRepo.findByIpAddress(ip);
            for (const ci of cis) {
        matches.push({
          sysId: ci.sysId,
          name: ci.name || '',
          class: ci.className || '',
          confidence: 95,
          source: "cmdb",
          matchedAt: new Date().toISOString(),
          matchReason: `IP address match: ${ip}`,
        });
            }
          } catch (error) {
            console.warn(`[CI Matching Service] CMDB lookup failed for IP ${ip}:`, error);
          }
        }
      }

      // Match by hostname/FQDN
      if (entities.hostnames) {
        for (const hostname of entities.hostnames) {
          try {
            const cis = await cmdbRepo.findByFqdn(hostname);
            for (const ci of cis) {
              matches.push({
                sysId: ci.sysId,
                name: ci.name || '',
                class: ci.className || "Unknown",
                confidence: 95,
                source: "cmdb",
                matchedAt: new Date().toISOString(),
                matchReason: `Hostname match: ${hostname}`,
              });
            }
          } catch (error) {
            console.warn(`[CI Matching Service] CMDB lookup failed for hostname ${hostname}:`, error);
          }
        }
      }

      // Match by name
      if (entities.system_names) {
        for (const name of entities.system_names) {
          try {
            // Use search instead of findByName to get all potential matches
            const ciMatches = await cmdbRepo.search({ name, limit: 5 });
            for (const ci of ciMatches) {
              matches.push({
                sysId: ci.sysId,
                name: ci.name || '',
                class: ci.className || "Unknown",
                confidence: 85,
                source: "cmdb",
                matchedAt: new Date().toISOString(),
                matchReason: `Name match: ${name}`,
              });
            }
          } catch (error) {
            console.warn(`[CI Matching Service] CMDB lookup failed for name ${name}:`, error);
          }
        }
      }
    } catch (error) {
      console.error("[CI Matching Service] CMDB matching error:", error);
    }

    return matches;
  }

  /**
   * Match entities to CIs with confidence scoring
   * Returns matches sorted by confidence (highest first)
   */
  public async matchEntities(entities: ExtractedEntities): Promise<{
    matches: CIMatch[];
    highConfidenceMatches: CIMatch[];
    lowConfidenceMatches: CIMatch[];
    overallConfidence: number;
  }> {
    console.log("[CI Matching Service] Starting CMDB-only entity matching", {
      ipCount: entities.ip_addresses?.length || 0,
      hostnameCount: entities.hostnames?.length || 0,
      systemNameCount: entities.system_names?.length || 0,
    });

    // Match against ServiceNow CMDB only
    const cmdbMatches = await this.matchCMDB(entities);
    console.log(`[CI Matching Service] Found ${cmdbMatches.length} CMDB matches`);

    // Deduplicate matches by sys_id (keep highest confidence)
    const uniqueMatches = new Map<string, CIMatch>();

    for (const match of cmdbMatches) {
      const existing = uniqueMatches.get(match.sysId);
      if (!existing || match.confidence > existing.confidence) {
        uniqueMatches.set(match.sysId, match);
      }
    }

    const matches = Array.from(uniqueMatches.values()).sort(
      (a, b) => b.confidence - a.confidence
    );

    // Separate high and low confidence matches
    const highConfidenceMatches = matches.filter(
      (m) => m.confidence >= this.confidenceThreshold
    );
    const lowConfidenceMatches = matches.filter(
      (m) => m.confidence < this.confidenceThreshold
    );

    // Calculate overall confidence
    const overallConfidence = matches.length > 0
      ? matches.reduce((sum, m) => sum + m.confidence, 0) / matches.length
      : 0;

    console.log("[CI Matching Service] Matching complete", {
      totalMatches: matches.length,
      highConfidence: highConfidenceMatches.length,
      lowConfidence: lowConfidenceMatches.length,
      overallConfidence: overallConfidence.toFixed(2),
    });

    return {
      matches,
      highConfidenceMatches,
      lowConfidenceMatches,
      overallConfidence,
    };
  }

  /**
   * Get recommended CI (highest confidence match)
   */
  public async getRecommendedCI(entities: ExtractedEntities): Promise<CIMatch | null> {
    const { highConfidenceMatches } = await this.matchEntities(entities);
    return highConfidenceMatches[0] || null;
  }
}

// Singleton instance
let serviceInstance: CIMatchingService | null = null;

export function getCIMatchingService(): CIMatchingService {
  if (!serviceInstance) {
    const confidenceThreshold = parseInt(
      process.env.INCIDENT_ENRICHMENT_CONFIDENCE_THRESHOLD || "70",
      10
    );
    serviceInstance = new CIMatchingService(confidenceThreshold);
  }
  return serviceInstance;
}

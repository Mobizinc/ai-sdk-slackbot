/**
 * Business Context Service
 * Provides domain knowledge about clients, vendors, and platforms to enrich LLM prompts.
 * Based on mobiz-intelligence-analytics business_context_service.py
 */

import type { BusinessContext } from "../db/schema";
import { getBusinessContextRepository } from "../db/repositories/business-context-repository";

export type EntityType = "CLIENT" | "VENDOR" | "PLATFORM";

export interface BusinessEntityContext {
  entityName: string;
  entityType: EntityType;
  industry?: string;
  description?: string;
  aliases: string[];
  relatedEntities: string[];
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
}

export class BusinessContextService {
  private repository = getBusinessContextRepository();
  private contextCache = new Map<string, BusinessEntityContext>();

  // Static fallback data (used when database has no entry)
  private static STATIC_CLIENTS: BusinessEntityContext[] = [
    {
      entityName: "Altus Community Healthcare",
      entityType: "CLIENT",
      industry: "Healthcare",
      description: "Managed services client operating healthcare facilities",
      aliases: ["Altus", "Altus Health", "Altus Healthcare"],
      relatedEntities: [],
      keyContacts: [],
      slackChannels: [],
      cmdbIdentifiers: [],
      contextStewards: [],
    },
    {
      entityName: "Neighbors Emergency Center",
      entityType: "CLIENT",
      industry: "Healthcare",
      description: "Emergency room and urgent care provider",
      aliases: ["Neighbors ER", "Neighbors"],
      relatedEntities: [],
      keyContacts: [],
      slackChannels: [],
      cmdbIdentifiers: [],
      contextStewards: [],
    },
    {
      entityName: "FPA Women's Health",
      entityType: "CLIENT",
      industry: "Healthcare",
      description: "Women's health medical services provider",
      aliases: ["FPA"],
      relatedEntities: [],
      keyContacts: [],
      slackChannels: [],
      cmdbIdentifiers: [],
      contextStewards: [],
    },
  ];

  private static STATIC_VENDORS: BusinessEntityContext[] = [
    {
      entityName: "Microsoft",
      entityType: "VENDOR",
      industry: "Software",
      description: "Office 365, Teams, Azure cloud services vendor",
      aliases: ["MS", "MSFT"],
      relatedEntities: ["Azure", "Office 365", "Teams"],
      keyContacts: [],
      slackChannels: [],
      cmdbIdentifiers: [],
      contextStewards: [],
    },
    {
      entityName: "Fortinet",
      entityType: "VENDOR",
      industry: "Networking",
      description: "Firewall and network security hardware/software vendor",
      aliases: [],
      relatedEntities: ["FortiGate"],
      keyContacts: [],
      slackChannels: [],
      cmdbIdentifiers: [],
      contextStewards: [],
    },
    {
      entityName: "Palo Alto Networks",
      entityType: "VENDOR",
      industry: "Security",
      description: "Network security and firewall vendor",
      aliases: ["Palo Alto", "PA"],
      relatedEntities: [],
      keyContacts: [],
      slackChannels: [],
      cmdbIdentifiers: [],
      contextStewards: [],
    },
  ];

  private static STATIC_PLATFORMS: BusinessEntityContext[] = [
    {
      entityName: "Azure",
      entityType: "PLATFORM",
      industry: "Cloud",
      description: "Microsoft cloud computing platform",
      aliases: ["Azure Cloud", "Microsoft Azure"],
      relatedEntities: ["Microsoft"],
      keyContacts: [],
      slackChannels: [],
      cmdbIdentifiers: [],
      contextStewards: [],
    },
    {
      entityName: "ServiceNow",
      entityType: "PLATFORM",
      industry: "ITSM",
      description: "IT service management platform",
      aliases: ["SNOW"],
      relatedEntities: [],
      keyContacts: [],
      slackChannels: [],
      cmdbIdentifiers: [],
      contextStewards: [],
    },
  ];

  constructor() {
    this.loadStaticContext();
  }

  private buildContextFromDbRecord(dbContext: BusinessContext): BusinessEntityContext {
    return {
      entityName: dbContext.entityName,
      entityType: dbContext.entityType as EntityType,
      industry: dbContext.industry || undefined,
      description: dbContext.description || undefined,
      aliases: dbContext.aliases || [],
      relatedEntities: dbContext.relatedEntities || [],
      technologyPortfolio: dbContext.technologyPortfolio || undefined,
      serviceDetails: dbContext.serviceDetails || undefined,
      keyContacts: dbContext.keyContacts || [],
      slackChannels: dbContext.slackChannels || [],
      cmdbIdentifiers: dbContext.cmdbIdentifiers || [],
      contextStewards: dbContext.contextStewards || [],
    };
  }

  private storeContextInCache(context: BusinessEntityContext): void {
    const keys = [context.entityName, ...context.aliases].map((name) =>
      name.toLowerCase().trim()
    );
    for (const key of keys) {
      this.contextCache.set(key, context);
    }
  }

  private removeContextFromCache(entityName: string): void {
    const normalized = entityName.toLowerCase().trim();
    for (const [key, value] of this.contextCache.entries()) {
      if (key === normalized || value.entityName.toLowerCase() === normalized) {
        this.contextCache.delete(key);
      }
    }
  }

  /**
   * Load static contexts into cache
   */
  private loadStaticContext(): void {
    const allStatic = [
      ...BusinessContextService.STATIC_CLIENTS,
      ...BusinessContextService.STATIC_VENDORS,
      ...BusinessContextService.STATIC_PLATFORMS,
    ];

    for (const entity of allStatic) {
      // Cache by entity name and all aliases (lowercase for case-insensitive lookup)
      const names = [entity.entityName, ...entity.aliases];
      for (const name of names) {
        this.contextCache.set(name.toLowerCase(), entity);
      }
    }
  }

  /**
   * Get business context for a company/entity name.
   * CRITICAL: Checks database FIRST (has full data), then falls back to cache (static/incomplete).
   */
  async getContextForCompany(companyName: string | undefined): Promise<BusinessEntityContext | null> {
    if (!companyName) return null;

    const companyKey = companyName.toLowerCase().trim();

    // Try database lookup FIRST (has complete data with technologyPortfolio, etc.)
    try {
      const dbContext = await this.repository.findByNameOrAlias(companyName);

      if (dbContext) {
        console.log(`✅ [Business Context] Loaded from database: ${companyName}`);

        const context = this.buildContextFromDbRecord(dbContext);
        // Update cache with database version (overwrites static fallback)
        this.storeContextInCache(context);
        return context;
      }
    } catch (error) {
      console.warn(`[Business Context] Database lookup failed for "${companyName}":`, error);
    }

    // Fall back to cache (static contexts) if database has no entry
    if (this.contextCache.has(companyKey)) {
      console.log(`⚠️  [Business Context] Using static fallback for: ${companyName}`);
      return this.contextCache.get(companyKey)!;
    }

    // Not found in database or cache
    return null;
  }

  /**
   * Refresh cache entry for an entity by refetching from DB
   */
  async refreshContext(entityName: string): Promise<BusinessEntityContext | null> {
    try {
      const dbContext = await this.repository.findByName(entityName);
      if (!dbContext) {
        this.removeContextFromCache(entityName);
        return null;
      }

      const context = this.buildContextFromDbRecord(dbContext);
      this.removeContextFromCache(entityName);
      this.storeContextInCache(context);
      return context;
    } catch (error) {
      console.warn(`[Business Context] Failed to refresh context for "${entityName}":`, error);
      return null;
    }
  }

  /**
   * Convert business context to text suitable for LLM prompts
   */
  toPromptText(context: BusinessEntityContext): string {
    const parts: string[] = [`• ${context.entityName}`];

    if (context.entityType) {
      parts.push(`(${context.entityType})`);
    }

    if (context.industry) {
      parts.push(`- ${context.industry} industry`);
    }

    if (context.description) {
      parts.push(`\n  ${context.description}`);
    }

    if (context.aliases.length > 0) {
      const aliasStr = context.aliases.slice(0, 3).join(", ");
      parts.push(`\n  Also known as: ${aliasStr}`);
    }

    if (context.technologyPortfolio) {
      parts.push(`\n  Technology: ${context.technologyPortfolio}`);
    }

    if (context.serviceDetails) {
      parts.push(`\n  Services: ${context.serviceDetails}`);
    }

    if (context.keyContacts.length > 0) {
      const contacts = context.keyContacts.slice(0, 2);
      const contactStr = contacts.map(c => `${c.name} (${c.role})`).join(", ");
      parts.push(`\n  Key contacts: ${contactStr}`);
    }

    if (context.slackChannels.length > 0) {
      const slackStr = context.slackChannels
        .map((channel) => channel.notes ? `#${channel.name} (${channel.notes})` : `#${channel.name}`)
        .join(", ");
      parts.push(`\n  Slack channels: ${slackStr}`);
    }

    if (context.cmdbIdentifiers.length > 0) {
      const ciSummaries = context.cmdbIdentifiers.slice(0, 2).map((ci) => {
        const name = ci.ciName || ci.sysId || "Unknown CI";
        const ips = ci.ipAddresses?.length ? ` [IP: ${ci.ipAddresses.join(", ")}]` : "";
        const owner = ci.ownerGroup ? ` Owner: ${ci.ownerGroup}.` : "";
        const description = ci.description ? ` ${ci.description}` : "";
        return `${name}${ips}.${owner}${description}`.trim();
      });
      parts.push(`\n  CMDB refs: ${ciSummaries.join(" | ")}`);
    }

    if (context.contextStewards.length > 0) {
      const stewardStr = context.contextStewards
        .map((steward) => steward.name || steward.id || steward.type)
        .join(", ");
      parts.push(`\n  Context stewards: ${stewardStr}`);
    }

    return parts.join(" ");
  }

  /**
   * Build classification rules text for prompt (similar to reference)
   */
  buildClassificationRules(): string {
    const rules: string[] = [];

    rules.push("--- BUSINESS CONTEXT & CLASSIFICATION RULES ---");
    rules.push("");
    rules.push("CRITICAL: Understand the difference between OUR CLIENTS vs VENDORS:");
    rules.push("");

    // Clients section
    rules.push("**OUR CLIENTS** (companies we provide managed services to):");
    for (const client of BusinessContextService.STATIC_CLIENTS) {
      rules.push(`  ${this.toPromptText(client)}`);
    }
    rules.push("");

    // Vendors section
    rules.push("**VENDORS** (software/hardware providers we use):");
    for (const vendor of BusinessContextService.STATIC_VENDORS) {
      rules.push(`  ${this.toPromptText(vendor)}`);
    }
    rules.push("");

    // Platforms section
    rules.push("**PLATFORMS** (cloud/software platforms):");
    for (const platform of BusinessContextService.STATIC_PLATFORMS) {
      rules.push(`  ${this.toPromptText(platform)}`);
    }
    rules.push("");

    return rules.join("\n");
  }

  /**
   * Enhance a prompt with business context for a specific company
   */
  async enhancePromptWithContext(
    basePrompt: string,
    companyName?: string,
    channelTopic?: string,
    channelPurpose?: string
  ): Promise<string> {
    const contextLines: string[] = [];

    contextLines.push("--- BUSINESS CONTEXT ---");
    contextLines.push("We (Mobiz IT) are a consulting and Managed Service Provider.");
    contextLines.push("");

    // Add channel metadata if available
    if (channelTopic) {
      contextLines.push(`Channel topic: ${channelTopic}`);
    }
    if (channelPurpose) {
      contextLines.push(`Channel purpose: ${channelPurpose}`);
    }
    if (channelTopic || channelPurpose) {
      contextLines.push("");
    }

    // Add company-specific context if available
    if (companyName) {
      const companyContext = await this.getContextForCompany(companyName);

      if (companyContext) {
        console.log(`📋 [Business Context] Enhancing prompt with context for "${companyName}"`);

        contextLines.push(`Company in this case: ${companyName}`);
        contextLines.push(`- Type: ${companyContext.entityType}`);

        if (companyContext.industry) {
          contextLines.push(`- Industry: ${companyContext.industry}`);
        }
        if (companyContext.description) {
          contextLines.push(`- Description: ${companyContext.description}`);
        }
        if (companyContext.aliases.length > 0) {
          const aliasesStr = companyContext.aliases.slice(0, 3).join(", ");
          contextLines.push(`- Also known as: ${aliasesStr}`);
        }
        if (companyContext.relatedEntities.length > 0) {
          const entitiesStr = companyContext.relatedEntities.slice(0, 3).join(", ");
          contextLines.push(`- Related entities: ${entitiesStr}`);
        }
        if (companyContext.technologyPortfolio) {
          contextLines.push(`- Technology: ${companyContext.technologyPortfolio}`);
        }
        if (companyContext.serviceDetails) {
          contextLines.push(`- Service info: ${companyContext.serviceDetails}`);
        }
        if (companyContext.keyContacts.length > 0) {
          const contactsStr = companyContext.keyContacts.slice(0, 2)
            .map(c => `${c.name} (${c.role})`)
            .join(", ");
          contextLines.push(`- Key contacts: ${contactsStr}`);
        }
        if (companyContext.slackChannels.length > 0) {
          const channelStr = companyContext.slackChannels
            .map((channel) => channel.notes ? `#${channel.name} (${channel.notes})` : `#${channel.name}`)
            .join(", ");
          contextLines.push(`- Slack channels: ${channelStr}`);
        }
        if (companyContext.cmdbIdentifiers.length > 0) {
          const ciStr = companyContext.cmdbIdentifiers.slice(0, 2)
            .map((ci) => {
              const name = ci.ciName || ci.sysId || "Unknown CI";
              const ips = ci.ipAddresses?.length ? ` IP: ${ci.ipAddresses.join(", ")}` : "";
              const doc = ci.documentation?.length ? ` Docs: ${ci.documentation.join("; ")}` : "";
              return `${name}${ips}${doc}`.trim();
            })
            .join(" | ");
          contextLines.push(`- CMDB references: ${ciStr}`);
        }
        if (companyContext.contextStewards.length > 0) {
          const stewardStr = companyContext.contextStewards
            .map((steward) => {
              const label = steward.name || steward.id || steward.type;
              return steward.notes ? `${label} (${steward.notes})` : label;
            })
            .join(", ");
          contextLines.push(`- Context stewards: ${stewardStr}`);
        }

        contextLines.push("");
      } else {
        console.log(`⚠️  [Business Context] No context found for company "${companyName}"`);
      }
    }

    const contextSection = contextLines.join("\n");

    // Insert context at the beginning of the prompt (after any existing system instructions)
    return `${contextSection}\n\n${basePrompt}`;
  }

  /**
   * Get all client names (for reference)
   */
  getAllClientNames(): string[] {
    return BusinessContextService.STATIC_CLIENTS.map((c) => c.entityName);
  }

  /**
   * Get all vendor names (for reference)
   */
  getAllVendorNames(): string[] {
    return BusinessContextService.STATIC_VENDORS.map((v) => v.entityName);
  }
}

// Singleton instance
let service: BusinessContextService | null = null;

export function getBusinessContextService(): BusinessContextService {
  if (!service) {
    service = new BusinessContextService();
  }
  return service;
}

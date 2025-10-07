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
    },
    {
      entityName: "Neighbors Emergency Center",
      entityType: "CLIENT",
      industry: "Healthcare",
      description: "Emergency room and urgent care provider",
      aliases: ["Neighbors ER", "Neighbors"],
      relatedEntities: [],
      keyContacts: [],
    },
    {
      entityName: "FPA Women's Health",
      entityType: "CLIENT",
      industry: "Healthcare",
      description: "Women's health medical services provider",
      aliases: ["FPA"],
      relatedEntities: [],
      keyContacts: [],
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
    },
    {
      entityName: "Fortinet",
      entityType: "VENDOR",
      industry: "Networking",
      description: "Firewall and network security hardware/software vendor",
      aliases: [],
      relatedEntities: ["FortiGate"],
      keyContacts: [],
    },
    {
      entityName: "Palo Alto Networks",
      entityType: "VENDOR",
      industry: "Security",
      description: "Network security and firewall vendor",
      aliases: ["Palo Alto", "PA"],
      relatedEntities: [],
      keyContacts: [],
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
    },
    {
      entityName: "ServiceNow",
      entityType: "PLATFORM",
      industry: "ITSM",
      description: "IT service management platform",
      aliases: ["SNOW"],
      relatedEntities: [],
      keyContacts: [],
    },
  ];

  constructor() {
    this.loadStaticContext();
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
   * First tries database, then falls back to static context.
   */
  async getContextForCompany(companyName: string | undefined): Promise<BusinessEntityContext | null> {
    if (!companyName) return null;

    const companyKey = companyName.toLowerCase().trim();

    // Check cache first
    if (this.contextCache.has(companyKey)) {
      return this.contextCache.get(companyKey)!;
    }

    // Try database lookup
    try {
      const dbContext = await this.repository.findByNameOrAlias(companyName);

      if (dbContext) {
        console.log(`✅ [Business Context] Loaded from database: ${companyName}`);

        const context: BusinessEntityContext = {
          entityName: dbContext.entityName,
          entityType: dbContext.entityType as EntityType,
          industry: dbContext.industry || undefined,
          description: dbContext.description || undefined,
          aliases: dbContext.aliases || [],
          relatedEntities: dbContext.relatedEntities || [],
          technologyPortfolio: dbContext.technologyPortfolio || undefined,
          serviceDetails: dbContext.serviceDetails || undefined,
          keyContacts: dbContext.keyContacts || [],
        };

        // Cache for future use
        this.contextCache.set(companyKey, context);
        return context;
      }
    } catch (error) {
      console.warn(`[Business Context] Database lookup failed for "${companyName}":`, error);
    }

    // Not found in cache or database
    return null;
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

    if (context.keyContacts.length > 0) {
      const contacts = context.keyContacts.slice(0, 2);
      const contactStr = contacts.map(c => `${c.name} (${c.role})`).join(", ");
      parts.push(`\n  Key contacts: ${contactStr}`);
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

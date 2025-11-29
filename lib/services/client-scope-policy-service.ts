import fs from "node:fs";
import path from "node:path";
import { z } from "zod";

const ClientScopePolicySchema = z.object({
  client: z.object({
    name: z.string(),
    aliases: z.array(z.string()).default([]),
    industry: z.string().optional(),
    accountSlug: z.string().optional(),
  }),
  effortThresholds: z
    .object({
      incidentHours: z.number().positive().optional(),
      serviceRequestHours: z.number().positive().optional(),
    })
    .optional(),
  onsiteSupport: z
    .object({
      includedHoursPerMonth: z.number().nonnegative().optional(),
      overageRateUsd: z.number().nonnegative().optional(),
      requiresPreapproval: z.boolean().optional(),
      emergencyOnlyDefinition: z.string().optional(),
      notes: z.string().optional(),
    })
    .optional(),
  allowedWorkExamples: z.array(z.string()).default([]),
  disallowedWorkExamples: z.array(z.string()).default([]),
  escalation: z
    .object({
      triggers: z.array(z.string()).default([]),
      contacts: z
        .array(
          z.object({
            name: z.string(),
            role: z.string().optional(),
            email: z.string().optional(),
            channel: z.string().optional(),
          })
        )
        .default([]),
    })
    .optional(),
  metadata: z
    .object({
      source: z.string().optional(),
      docReference: z.string().optional(),
      docUrl: z.string().optional(),
      lastUpdated: z.string().optional(),
    })
    .optional(),
});

export type ClientScopePolicy = z.infer<typeof ClientScopePolicySchema>;

export interface ClientScopePolicySummary {
  clientName: string;
  accountSlug?: string;
  effortThresholds?: ClientScopePolicy["effortThresholds"];
  onsiteSupport?: ClientScopePolicy["onsiteSupport"];
  allowedWorkExamples?: string[];
  disallowedWorkExamples?: string[];
  escalationTriggers?: string[];
  metadata?: ClientScopePolicy["metadata"];
}

class ClientScopePolicyService {
  private readonly policyDirectory: string;
  private readonly policies = new Map<string, ClientScopePolicy>();

  constructor(policyDirectory?: string) {
    this.policyDirectory =
      policyDirectory ?? path.join(process.cwd(), "config", "client-policies");
    this.loadPolicies();
  }

  private loadPolicies(): void {
    if (!fs.existsSync(this.policyDirectory)) {
      return;
    }

    const files = fs
      .readdirSync(this.policyDirectory)
      .filter((file) => file.endsWith(".json"));

    for (const file of files) {
      const fullPath = path.join(this.policyDirectory, file);

      try {
        const contents = fs.readFileSync(fullPath, "utf-8");
        const parsed = JSON.parse(contents);
        const policy = ClientScopePolicySchema.parse(parsed);

        this.indexPolicy(policy);
      } catch (error) {
        console.warn(`[ClientScopePolicyService] Failed to load ${fullPath}:`, error);
      }
    }
  }

  private indexPolicy(policy: ClientScopePolicy): void {
    const names = new Set<string>();
    names.add(policy.client.name);
    policy.client.aliases.forEach((alias) => names.add(alias));

    for (const name of names) {
      const normalized = name.toLowerCase().trim();
      if (!normalized) {
        continue;
      }
      this.policies.set(normalized, policy);
    }
  }

  getPolicy(searchTerm?: string | null): ClientScopePolicy | null {
    if (!searchTerm) {
      return null;
    }

    const normalized = searchTerm.toLowerCase().trim();
    return this.policies.get(normalized) ?? null;
  }

  getPolicySummary(searchTerm?: string | null): ClientScopePolicySummary | null {
    const policy = this.getPolicy(searchTerm);
    if (!policy) {
      return null;
    }

    return this.toSummary(policy);
  }

  toSummary(policy: ClientScopePolicy): ClientScopePolicySummary {
    return {
      clientName: policy.client.name,
      accountSlug: policy.client.accountSlug,
      effortThresholds: policy.effortThresholds,
      onsiteSupport: policy.onsiteSupport,
      allowedWorkExamples: policy.allowedWorkExamples,
      disallowedWorkExamples: policy.disallowedWorkExamples,
      escalationTriggers: policy.escalation?.triggers,
      metadata: policy.metadata,
    };
  }
}

let service: ClientScopePolicyService | null = null;

export function getClientScopePolicyService(): ClientScopePolicyService {
  if (!service) {
    service = new ClientScopePolicyService();
  }

  return service;
}

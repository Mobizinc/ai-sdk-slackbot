import { z } from "zod";
import { createTool, type AgentToolFactoryParams } from "./shared";
import { serviceNowClient } from "@/tools/servicenow";
import type { ServiceNowConfigurationItem } from "@/tools/servicenow";
import { formatConfigurationItemsForLLM } from "@/services/servicenow-formatters";
import { createServiceNowContext } from "@/infrastructure/servicenow-context";

export type SearchCmdbInput = {
  ciName?: string;
  ipAddress?: string;
  ciSysId?: string;
  ciClassName?: string;
  companyName?: string;
  ciLocation?: string;
  ciOwnerGroup?: string;
  ciEnvironment?: string;
  ciOperationalStatus?: string;
  limit?: number;
  includeRelationships?: boolean;
  relationshipType?: string;
  relationshipSampleSize?: number;
};

export type CreateCmdbRecordInput = {
  className: string;
  name: string;
  shortDescription?: string;
  ipAddress?: string;
  environment?: string;
  location?: string;
  ownerGroup?: string;
  supportGroup?: string;
  status?: string;
  installStatus?: string;
  company?: string;
  parentSysId?: string;
  relationshipType?: string;
  attributes?: Record<string, string>;
};

const cmdbInputSchema = z
  .object({
    ciName: z
      .string()
      .optional()
      .describe("Hostname or CI name (partial match allowed)."),
    ipAddress: z
      .string()
      .optional()
      .describe("Exact or partial IP address assigned to the CI."),
    ciSysId: z
      .string()
      .optional()
      .describe("Exact ServiceNow sys_id when you already know the CI."),
    ciClassName: z
      .string()
      .optional()
      .describe("CMDB class/table (e.g., cmdb_ci_server, cmdb_ci_appl)."),
    companyName: z
      .string()
      .optional()
      .describe("Customer or company name tied to the CI."),
    ciLocation: z
      .string()
      .optional()
      .describe("Datacenter, city, or site where the CI resides."),
    ciOwnerGroup: z
      .string()
      .optional()
      .describe("Owner/support group responsible for the CI."),
    ciEnvironment: z
      .string()
      .optional()
      .describe("Environment tag (production, staging, dev, DR, etc.)."),
    ciOperationalStatus: z
      .string()
      .optional()
      .describe("Operational status code (1=Operational, 2=Non-Operational, 6=Retired, etc.)."),
    limit: z
      .number()
      .min(1)
      .max(25)
      .optional()
      .describe("Maximum number of CIs to return (default 10, max 25)."),
    includeRelationships: z
      .boolean()
      .optional()
      .describe("When true, fetches first-level CI relationships for the top matches."),
    relationshipType: z
      .string()
      .optional()
      .describe("Optional relationship filter (e.g., 'Depends on', 'Contains::Contained by'). Requires includeRelationships=true."),
    relationshipSampleSize: z
      .number()
      .min(1)
      .max(5)
      .optional()
      .describe("How many of the top CIs to expand with relationship graphs (default 3)."),
  })
  .superRefine((data, ctx) => {
    if (
      !data.ciName &&
      !data.ipAddress &&
      !data.ciSysId &&
      !data.ciClassName &&
      !data.companyName &&
      !data.ciLocation &&
      !data.ciOwnerGroup &&
      !data.ciEnvironment &&
      !data.ciOperationalStatus
    ) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        message:
          "At least one filter is required (ciName, ipAddress, ciSysId, ciClassName, companyName, ciLocation, ciOwnerGroup, ciEnvironment, or ciOperationalStatus).",
      });
    }
  });

const createCmdbSchema = z.object({
  className: z
    .string()
    .min(3)
    .describe("ServiceNow CMDB class/table to create in (e.g., cmdb_ci_server, cmdb_ci_appl)."),
  name: z
    .string()
    .min(2)
    .max(120)
    .describe("Human-readable CI name or hostname."),
  shortDescription: z
    .string()
    .max(400)
    .optional()
    .describe("Optional description captured in short_description."),
  ipAddress: z
    .string()
    .optional()
    .describe("Primary IP address for the CI."),
  environment: z
    .string()
    .optional()
    .describe("Environment tag applied to u_environment (production, staging, etc.)."),
  location: z
    .string()
    .optional()
    .describe("Physical or logical location for the CI."),
  ownerGroup: z
    .string()
    .optional()
    .describe("Assignment/owner group sys_id or name reference."),
  supportGroup: z
    .string()
    .optional()
    .describe("Support group sys_id or name reference."),
  status: z
    .string()
    .optional()
    .describe("Operational status code."),
  installStatus: z
    .string()
    .optional()
    .describe("Install status value (e.g., 1=Installed, 6=Retired)."),
  company: z
    .string()
    .optional()
    .describe("Company/customer reference to link the CI against."),
  parentSysId: z
    .string()
    .optional()
    .describe("Optional parent CI sys_id to auto-link via cmdb_rel_ci."),
  relationshipType: z
    .string()
    .optional()
    .describe("Relationship type when parentSysId is supplied (e.g., 'Contains::Contained by')."),
  attributes: z
    .record(z.string().min(1), z.string().min(1))
    .optional()
    .describe("Additional ServiceNow field overrides (key/value)."),
});

export function createCmdbTool(params: AgentToolFactoryParams) {
  const { updateStatus, options } = params;

  return createTool({
    name: "searchCMDB",
    description:
      "Looks up configuration items in ServiceNow CMDB by hostname, IP address, class, owner, location, environment, or company. Use whenever infrastructure is mentioned so responses reflect authoritative CMDB data instead of cached business context.",
    inputSchema: cmdbInputSchema,
    execute: async ({
      ciName,
      ipAddress,
      ciSysId,
      ciClassName,
      companyName,
      ciLocation,
      ciOwnerGroup,
      ciEnvironment,
      ciOperationalStatus,
      limit,
      includeRelationships,
      relationshipType,
      relationshipSampleSize,
    }: SearchCmdbInput) => {
      if (!serviceNowClient.isConfigured()) {
        return {
          error:
            "ServiceNow CMDB is not configured. Please set SERVICENOW_INSTANCE_URL plus credentials to enable CMDB lookups.",
        };
      }

      if (
        !ciName &&
        !ipAddress &&
        !ciSysId &&
        !ciClassName &&
        !companyName &&
        !ciLocation &&
        !ciOwnerGroup &&
        !ciEnvironment &&
        !ciOperationalStatus
      ) {
        throw new Error(
          "At least one filter is required: ciName, ipAddress, ciSysId, ciClassName, companyName, ciLocation, ciOwnerGroup, ciEnvironment, or ciOperationalStatus."
        );
      }

      updateStatus?.("is querying ServiceNow CMDB for infrastructure...");

      const snContext = createServiceNowContext(undefined, options?.channelId);

      try {
        const items =
          (await serviceNowClient.searchConfigurationItems(
            {
              name: ciName,
              ipAddress,
              sysId: ciSysId,
              className: ciClassName,
              company: companyName,
              location: ciLocation,
              ownerGroup: ciOwnerGroup,
              environment: ciEnvironment,
              operationalStatus: ciOperationalStatus,
              limit: limit ?? 10,
            },
            snContext,
          )) ?? [];

        let relationships: Map<string, ServiceNowConfigurationItem[]> | undefined;
        if (includeRelationships && items.length > 0) {
          relationships = new Map();
          const sampleSize = Math.min(items.length, relationshipSampleSize ?? 3);
          const targets = items.slice(0, sampleSize);

          await Promise.all(
            targets.map(async (item) => {
              try {
                const related = await serviceNowClient.getCIRelationships(
                  {
                    ciSysId: item.sys_id,
                    relationshipType,
                    limit: 25,
                  },
                  snContext,
                );
                relationships?.set(item.sys_id, related);
              } catch (error) {
                console.error(`[searchCMDB] Failed to load relationships for ${item.sys_id}`, error);
              }
            }),
          );
        }

        const formatted = formatConfigurationItemsForLLM(items, relationships && relationships.size > 0 ? {
          includeRelationships: true,
          relationships,
        } : undefined);

        return {
          formattedItems: formatted?.summary ?? "Summary\nNo configuration items found.",
          items: formatted?.rawData ?? [],
          total: items.length,
        };
      } catch (error) {
        console.error("[searchCMDB] Failed to query ServiceNow:", error);
        throw error;
      }
    },
  });
}

export function createConfigurationItemTool(params: AgentToolFactoryParams) {
  const { updateStatus, options } = params;

  return createTool({
    name: "createConfigurationItem",
    description:
      "Creates a Configuration Item (CI) inside ServiceNow CMDB and optionally links it to a parent CI. Use only when a user explicitly requests that a missing asset be documented and they provide the required metadata (class, name, owner/environment).",
    inputSchema: createCmdbSchema,
    execute: async ({
      className,
      name,
      shortDescription,
      ipAddress,
      environment,
      location,
      ownerGroup,
      supportGroup,
      status,
      installStatus,
      company,
      parentSysId,
      relationshipType,
      attributes,
    }: CreateCmdbRecordInput) => {
      if (!serviceNowClient.isConfigured()) {
        return {
          error:
            "ServiceNow CMDB is not configured. Please set SERVICENOW_INSTANCE_URL plus credentials to enable CMDB writes.",
        };
      }

      updateStatus?.("is creating a CMDB record in ServiceNow...");
      const snContext = createServiceNowContext(undefined, options?.channelId);

      try {
        const ci = await serviceNowClient.createConfigurationItem(
          {
            className,
            name,
            shortDescription,
            ipAddress,
            environment,
            location,
            ownerGroup,
            supportGroup,
            status,
            installStatus,
            company,
            attributes,
          },
          snContext,
        );

        let relationshipCreated: string | undefined;
        if (parentSysId) {
          try {
            const rel = await serviceNowClient.createCIRelationship(
              {
                parentSysId,
                childSysId: ci.sys_id,
                relationshipType,
              },
              snContext,
            );
            relationshipCreated = rel.sys_id;
          } catch (error) {
            console.error("[createConfigurationItem] Failed to link CI relationship:", error);
          }
        }

        const formatted = formatConfigurationItemsForLLM([ci]);

        return {
          summary: formatted?.summary ?? `Created CI ${ci.name}`,
          ci,
          relationshipLinked: Boolean(relationshipCreated),
          parentSysId,
          relationshipType: relationshipType ?? "Contains::Contained by",
        };
      } catch (error) {
        console.error("[createConfigurationItem] Failed to create CI:", error);
        throw error;
      }
    },
  });
}

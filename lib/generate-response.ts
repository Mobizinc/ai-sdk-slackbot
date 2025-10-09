import { CoreMessage, generateText, tool, stepCountIs } from "ai";
import { z } from "zod";
import { exa } from "./utils";
import { serviceNowClient } from "./tools/servicenow";
import { createAzureSearchService } from "./services/azure-search";
import { getContextManager } from "./context-manager";
import { getKBGenerator } from "./services/kb-generator";
import { sanitizeModelConfig } from "./model-capabilities";
import { getBusinessContextService } from "./services/business-context-service";
import { modelProvider, getActiveModelId } from "./model-provider";
import { getContextUpdateManager, type ContextUpdateAction } from "./context-update-manager";
import { getCurrentIssuesService } from "./services/current-issues-service";

type WeatherToolInput = {
  latitude: number;
  longitude: number;
  city: string;
};

type SearchWebToolInput = {
  query: string;
  specificDomain: string | null;
};

type ServiceNowToolInput = {
  action:
    | "getIncident"
    | "getCase"
    | "getCaseJournal"
    | "searchKnowledge"
    | "searchConfigurationItem";
  number?: string;
  caseSysId?: string;
  query?: string;
  limit?: number;
  ciName?: string;
  ipAddress?: string;
  ciSysId?: string;
};

type SearchSimilarCasesInput = {
  query: string;
  clientId?: string;
  topK?: number;
};

type GenerateKBArticleInput = {
  caseNumber: string;
  threadTs?: string;
};

type ProposeContextUpdateInput = {
  entityName: string;
  caseNumber?: string;
  summary: string;
  details?: string;
  cmdbIdentifier: {
    ciName?: string;
    sysId?: string;
    ipAddresses?: string[];
    description?: string;
    ownerGroup?: string;
    documentation?: string[];
  };
  confidence?: "LOW" | "MEDIUM" | "HIGH";
  entityTypeIfCreate?: "CLIENT" | "VENDOR" | "PLATFORM";
};

type FetchCurrentIssuesInput = {
  channelId?: string;
  channelNameHint?: string;
};

const weatherInputSchema = z.object({
  latitude: z.number(),
  longitude: z.number(),
  city: z.string(),
});

const searchWebInputSchema = z.object({
  query: z.string(),
  specificDomain: z
    .string()
    .nullable()
    .describe(
      "a domain to search if the user specifies e.g. bbc.com. Should be only the domain name without the protocol",
    ),
});

const serviceNowInputSchema = z
  .object({
    action: z.enum([
      "getIncident",
      "getCase",
      "getCaseJournal",
      "searchKnowledge",
      "searchConfigurationItem",
    ]),
    number: z
      .string()
      .optional()
      .describe("Incident or case number to look up."),
    caseSysId: z
      .string()
      .optional()
      .describe(
        "ServiceNow case sys_id for fetching journal entries (comments, work notes).",
      ),
    query: z
      .string()
      .optional()
      .describe("Search phrase for knowledge base lookups."),
    limit: z
      .number()
      .min(1)
      .max(20)
      .optional()
      .describe("Maximum number of knowledge articles to return."),
    ciName: z
      .string()
      .optional()
      .describe("Configuration item name, hostname, or partial match to search for."),
    ipAddress: z
      .string()
      .optional()
      .describe("IP address associated with a configuration item."),
    ciSysId: z
      .string()
      .optional()
      .describe("Exact sys_id of the configuration item to retrieve."),
  })
  .describe("ServiceNow action parameters");

const searchSimilarCasesInputSchema = z.object({
  query: z
    .string()
    .describe("The case description or issue text to find similar cases for"),
  clientId: z
    .string()
    .optional()
    .describe("Optional client/company identifier to filter results to a specific customer"),
  topK: z
    .number()
    .min(1)
    .max(10)
    .optional()
    .describe("Number of similar cases to return (default: 5)"),
});

const generateKbArticleInputSchema = z.object({
  caseNumber: z
    .string()
    .describe("The case number to generate KB article for"),
  threadTs: z
    .string()
    .optional()
    .describe("Optional thread timestamp to get conversation context from"),
});

const proposeContextUpdateInputSchema = z.object({
  entityName: z
    .string()
    .min(2)
    .describe("Business entity/client name that should be updated."),
  caseNumber: z
    .string()
    .optional()
    .describe("Case number associated with the discovered context gap."),
  summary: z
    .string()
    .min(10)
    .describe("Short summary describing what needs to change."),
  details: z
    .string()
    .optional()
    .describe("Optional additional detail or justification."),
  cmdbIdentifier: z
    .object({
      ciName: z.string().optional(),
      sysId: z.string().optional(),
      ipAddresses: z.array(z.string()).optional(),
      description: z.string().optional(),
      ownerGroup: z.string().optional(),
      documentation: z.array(z.string()).optional(),
    })
    .describe("CMDB identifier payload to append if approved."),
  confidence: z
    .enum(["LOW", "MEDIUM", "HIGH"])
    .optional()
    .describe("Assistant confidence in this proposed update."),
  entityTypeIfCreate: z
    .enum(["CLIENT", "VENDOR", "PLATFORM"])
    .optional()
    .describe("If the entity does not exist, what type should be created."),
});

const fetchCurrentIssuesInputSchema = z.object({
  channelId: z
    .string()
    .optional()
    .describe("Slack channel ID where the question originated."),
  channelNameHint: z
    .string()
    .optional()
    .describe("Optional channel name hint if the ID is not available."),
});

const createTool = tool as unknown as (options: any) => any;

let generateTextImpl = generateText;

export const __setGenerateTextImpl = (
  impl: typeof generateText,
) => {
  generateTextImpl = impl;
};

export const __resetGenerateTextImpl = () => {
  generateTextImpl = generateText;
};

// Initialize Azure Search service (singleton)
const azureSearchService = createAzureSearchService();

export const generateResponse = async (
  messages: CoreMessage[],
  updateStatus?: (status: string) => void,
  options?: {
    channelId?: string;
    channelName?: string;
    threadTs?: string;
  },
) => {
  const activeModelId = getActiveModelId();

  let lastConfigBuilder: ((model: unknown) => Record<string, unknown>) | undefined;

  const runModel = async () => {
    // Extract case numbers and context for business context enrichment
    const contextManager = getContextManager();
    const businessContextService = getBusinessContextService();

    let companyName: string | undefined;
    let channelTopic: string | undefined;
    let channelPurpose: string | undefined;

    // Try to extract company from conversation context
    const messageText = messages.map(m => typeof m.content === 'string' ? m.content : '').join(' ');
    const caseNumbers = contextManager.extractCaseNumbers(messageText);

    if (caseNumbers.length > 0) {
      // Get context for the first case number mentioned
      const contexts = contextManager.getContextsForCase(caseNumbers[0]);
      if (contexts.length > 0) {
        const context = contexts[0];
        companyName = context.channelName; // Use channel name as company hint
        channelTopic = (context as any).channelTopic;
        channelPurpose = (context as any).channelPurpose;
      }
    }

    // Build base system prompt
    const baseSystemPrompt = `You are the Mobiz Service Desk Assistant in Slack for analysts and engineers.

IMPORTANT: Engineers are actively troubleshooting. Only respond when:
  • You have NEW, actionable information to contribute
  • User explicitly asks you a question
  • Never restate what engineers just said
  • Never generate summaries mid-conversation unless explicitly requested
  • If you would just be agreeing or acknowledging, stay silent
  • Observe and track, but don't interrupt active work

Tool usage:
  • Call ServiceNow tools to get details for cases explicitly mentioned in the conversation
  • When hosts, IPs, or server names are mentioned, use ServiceNow configuration item search. If no CMDB record is returned, say so plainly and request that an owner capture documentation/create the record (suggest the most relevant team if known).
  • When someone asks for current issues/outages, call fetchCurrentIssues before responding so you can summarize active ServiceNow cases and in-channel threads.
  • If the CMDB is missing critical information and you have concrete, verified details, call proposeContextUpdate to draft an update for steward approval. Only include durable facts the team just validated.
  • Use searchSimilarCases to find reference cases for context and pattern recognition
  • IMPORTANT: Similar cases are for REFERENCE ONLY - never display their journal entries, activity, or specific details
  • Only show journal entries and case details for cases explicitly mentioned in the current conversation
  • Web search only if it adds concrete value

Response format (use Slack markdown):
  *Summary*
  1-2 sentences max. What happened and why it matters. No filler text.

  *Latest Activity*
  • 2-3 most recent journal entries only - ONLY for cases explicitly mentioned in conversation
  • Format: \`Oct 5, 14:23 – jsmith: Updated configuration settings\`
  • Keep it short - skip verbose notes

  *Current State*
  Status: [state] | Priority: [priority] | Assigned: [name]

  *Next Actions*
  1. Specific actionable step
  2. Another step if needed

  *References*
  <https://servicenow.com/case|SCS1234567>

Guardrails:
  • Never show tool errors (like "Azure Search not configured") - handle silently
  • Never suggest using tools in your response (like "request via generateKBArticle tool")
  • Never display journal entries or details from similar/reference cases
  • Use bold headers with * not numbered lists
  • Short timestamps: "Oct 5, 14:23" not "2025-10-05 14:23:45 UTC"
  • If field missing: "Not provided"
  • Today: ${new Date().toISOString().split("T")[0]}`;

    // Enhance system prompt with business context
    const enhancedSystemPrompt = await businessContextService.enhancePromptWithContext(
      baseSystemPrompt,
      companyName,
      channelTopic,
      channelPurpose
    );

    const createTools = () => {
      const getWeatherTool = createTool({
        description: "Get the current weather at a location",
        inputSchema: weatherInputSchema,
        execute: async ({ latitude, longitude, city }: WeatherToolInput) => {
          updateStatus?.(`is getting weather for ${city}...`);

          const response = await fetch(
            `https://api.open-meteo.com/v1/forecast?latitude=${latitude}&longitude=${longitude}&current=temperature_2m,weathercode,relativehumidity_2m&timezone=auto`,
          );

          const weatherData = await response.json();
          return {
            temperature: weatherData.current.temperature_2m,
            weatherCode: weatherData.current.weathercode,
            humidity: weatherData.current.relativehumidity_2m,
            city,
          };
        },
      });

      const searchWebTool = createTool({
        description: "Use this to search the web for information",
        inputSchema: searchWebInputSchema,
        execute: async ({ query, specificDomain }: SearchWebToolInput) => {
          updateStatus?.(`is searching the web for ${query}...`);
          const exaClient = exa;

          if (!exaClient) {
            return { results: [] };
          }

          const { results } = await exaClient.searchAndContents(query, {
            livecrawl: "always",
            numResults: 3,
            includeDomains: specificDomain ? [specificDomain] : undefined,
          });

          return {
            results: results.map((result) => ({
              title: result.title,
              url: result.url,
              snippet: result.text.slice(0, 1000),
            })),
          };
        },
      });

      const serviceNowTool = createTool({
        description:
          "Read data from ServiceNow (incidents, cases, knowledge base, recent journal entries, and configuration items).",
        inputSchema: serviceNowInputSchema,
        execute: async ({
          action,
          number,
          caseSysId,
          query,
          limit,
          ciName,
          ipAddress,
          ciSysId,
        }: ServiceNowToolInput) => {
          if (!serviceNowClient.isConfigured()) {
            return {
              error:
                "ServiceNow integration is not configured. Set SERVICENOW_INSTANCE_URL and credentials to enable this tool.",
            };
          }

          try {
            if (action === "getIncident") {
              if (!number) {
                throw new Error(
                  "number is required to retrieve a ServiceNow incident.",
                );
              }

              updateStatus?.(`is looking up incident ${number} in ServiceNow...`);

              const incident = await serviceNowClient.getIncident(number);
              if (!incident) {
                return {
                  incident: null,
                  message: `Incident ${number} was not found in ServiceNow.`,
                };
              }

              return { incident };
            }

            if (action === "getCase") {
              if (!number) {
                throw new Error(
                  "number is required to retrieve a ServiceNow case.",
                );
              }

              updateStatus?.(`is looking up case ${number} in ServiceNow...`);

              const caseRecord = await serviceNowClient.getCase(number);

              if (!caseRecord) {
                return {
                  case: null,
                  message: `Case ${number} was not found in ServiceNow.`,
                };
              }

              return { case: caseRecord };
            }

            if (action === "getCaseJournal") {
              if (!caseSysId && !number) {
                throw new Error(
                  "Provide either caseSysId or number to retrieve journal entries.",
                );
              }

              let sysId = caseSysId ?? null;

              if (!sysId && number) {
                const caseRecord = await serviceNowClient.getCase(number);
                if (!caseRecord) {
                  return {
                    caseJournal: [],
                    message: `Case ${number} was not found in ServiceNow, so journal entries could not be retrieved.`,
                  };
                }
                sysId = caseRecord.sys_id;
              }

              if (!sysId) {
                throw new Error(
                  "Unable to determine case sys_id for journal lookup.",
                );
              }

              updateStatus?.("is fetching recent case activity from ServiceNow...");

              const journal = await serviceNowClient.getCaseJournal(sysId, {
                limit: limit ?? 20,
              });

              return { caseJournal: journal };
            }

            if (action === "searchKnowledge") {
              if (!query) {
                throw new Error(
                  "query is required to search the ServiceNow knowledge base.",
                );
              }

              updateStatus?.("is searching ServiceNow knowledge base...");

              const articles = await serviceNowClient.searchKnowledge({
                query,
                limit,
              });

              return { articles };
            }

            if (action === "searchConfigurationItem") {
              if (!ciName && !ipAddress && !ciSysId) {
                throw new Error(
                  "Provide at least ciName, ipAddress, or ciSysId to search the CMDB.",
                );
              }

              updateStatus?.("is checking ServiceNow CMDB for the requested asset...");

              const configurationItems = await serviceNowClient.searchConfigurationItems({
                name: ciName,
                ipAddress,
                sysId: ciSysId,
                limit,
              });

              if (!configurationItems.length) {
                return {
                  configurationItems: [],
                  notFound: true,
                  message: "No matching configuration items were found in ServiceNow.",
                };
              }

              return { configurationItems };
            }

            throw new Error(`Unsupported ServiceNow action: ${action}`);
          } catch (error) {
            console.error("ServiceNow tool error", error);
            return {
              error:
                error instanceof Error ? error.message : "Unknown ServiceNow error",
            };
          }
        },
      });

      const searchSimilarCasesTool = createTool({
        description:
          "Search for similar historical cases for REFERENCE and CONTEXT ONLY. Use this to understand patterns, similar issues, and technical contexts - but NEVER display specific details, journal entries, or activity from these reference cases. Only use them to inform your understanding. This searches the case intelligence knowledge base.",
        inputSchema: searchSimilarCasesInputSchema,
        execute: async ({ query, clientId, topK }: SearchSimilarCasesInput) => {
          if (!azureSearchService) {
            console.log("[searchSimilarCases] Azure Search not configured, returning empty results");
            return {
              similar_cases: [],
              message: "No similar cases found.",
            };
          }

          try {
            updateStatus?.(`is searching for similar cases...`);

            const results = await azureSearchService.searchSimilarCases(query, {
              topK: topK ?? 5,
              clientId,
            });

            if (results.length === 0) {
              return {
                similar_cases: [],
                message: "No similar cases found.",
              };
            }

            return {
              similar_cases: results.map((r) => ({
                case_number: r.case_number,
                similarity_score: r.score,
                content_preview: r.content.substring(0, 300) + (r.content.length > 300 ? "..." : ""),
                created_at: r.created_at,
              })),
              total_found: results.length,
            };
          } catch (error) {
            console.error("[searchSimilarCases] Error:", error);
            return {
              similar_cases: [],
              message: "No similar cases found.",
            };
          }
        },
      });

      const generateKbArticleTool = createTool({
        description:
          "INTERNAL ONLY: Generate KB article when user explicitly commands 'generate KB for [case]'. Do NOT mention or suggest this tool in responses - KB generation happens automatically for resolved cases.",
        inputSchema: generateKbArticleInputSchema,
        execute: async ({ caseNumber, threadTs }: GenerateKBArticleInput) => {
          try {
            updateStatus?.(`is generating KB article for ${caseNumber}...`);

            const contextManager = getContextManager();
            const contexts = contextManager.getContextsForCase(caseNumber);

            if (contexts.length === 0) {
              return {
                error: `No conversation context found for case ${caseNumber}. The case must have been discussed in a tracked thread first.`,
              };
            }

            const context = threadTs
              ? contexts.find((c) => c.threadTs === threadTs)
              : contexts[contexts.length - 1];

            if (!context) {
              return {
                error: `Context not found for the specified thread.`,
              };
            }

            const caseDetails = serviceNowClient.isConfigured()
              ? await serviceNowClient.getCase(caseNumber).catch(() => null)
              : null;

            const kbGenerator = getKBGenerator();
            const result = await kbGenerator.generateArticle(context, caseDetails);

            if (result.isDuplicate) {
              return {
                duplicate: true,
                similar_kbs: result.similarExistingKBs,
                message: `Similar KB articles already exist. Consider updating an existing article instead.`,
              };
            }

            return {
              success: true,
              article: result.article,
              confidence: result.confidence,
              similar_kbs: result.similarExistingKBs,
              message: `KB article generated with ${result.confidence}% confidence.`,
            };
          } catch (error) {
            console.error("KB generation error", error);
            return {
              error:
                error instanceof Error
                  ? error.message
                  : "Failed to generate KB article",
            };
          }
        },
      });

      const proposeContextUpdateTool = createTool({
        description:
          "Draft a context/CMDB update for steward approval. Only use when the conversation reveals durable infrastructure facts that are missing from business_contexts or ServiceNow.",
        inputSchema: proposeContextUpdateInputSchema,
        execute: async ({
          entityName,
          caseNumber,
          summary,
          details,
          cmdbIdentifier,
          confidence,
          entityTypeIfCreate,
        }: ProposeContextUpdateInput) => {
          const chosenCaseNumber = caseNumber ?? caseNumbers[0];
          if (!chosenCaseNumber) {
            return {
              error:
                "No case number available for the context update. Provide caseNumber in the tool invocation so the stewards can trace the source conversation.",
            };
          }

          const contextManager = getContextManager();
          const contexts = contextManager.getContextsForCase(chosenCaseNumber);

          if (!contexts.length) {
            return {
              error: `Unable to locate conversation history for ${chosenCaseNumber}. Wait until the case is tracked before proposing updates.`,
            };
          }

          const conversationContext = contexts[contexts.length - 1];
          const sourceChannelId = conversationContext.channelId;
          const sourceThreadTs = conversationContext.threadTs;

          const businessService = getBusinessContextService();
          const businessContext = await businessService.getContextForCompany(entityName);

          if (!businessContext && !entityTypeIfCreate) {
            return {
              error:
                `No business context exists for ${entityName}. Provide entityTypeIfCreate (CLIENT | VENDOR | PLATFORM) so a record can be bootstrapped when approved.`,
            };
          }

          const identifierHasSignal =
            Boolean(cmdbIdentifier.ciName) ||
            Boolean(cmdbIdentifier.sysId) ||
            Boolean(cmdbIdentifier.description) ||
            (cmdbIdentifier.ipAddresses?.length ?? 0) > 0;

          if (!identifierHasSignal) {
            return {
              error:
                "Provide at least one of ciName, sysId, description, or ipAddresses for the CMDB identifier so stewards have something actionable.",
            };
          }

          const normalizeIp = (value: string) => value.trim();
          const dedupeIps = (ips: string[] | undefined) =>
            Array.from(new Set((ips ?? []).map(normalizeIp))).filter(Boolean);

          const stewardChannel = businessContext?.contextStewards?.find(
            (steward) => steward.type === "channel" && steward.id
          );

          const stewardChannelId = stewardChannel?.id || sourceChannelId;

          const formatStewardMention = (steward: {
            type: "channel" | "user" | "usergroup";
            id?: string;
            name?: string;
            notes?: string;
          }): string => {
            const label = steward.name || steward.id || steward.type;
            let mention: string;
            if (steward.type === "channel") {
              mention = steward.id ? `<#${steward.id}${steward.name ? `|${steward.name}` : ""}>` : `#${label}`;
            } else if (steward.type === "usergroup") {
              mention = steward.id ? `<!subteam^${steward.id}${steward.name ? `|@${steward.name}` : ""}>` : `@${label}`;
            } else {
              mention = steward.id ? `<@${steward.id}>` : `@${label}`;
            }
            return steward.notes ? `${mention} (${steward.notes})` : mention;
          };

          const stewardMentions = (businessContext?.contextStewards ?? []).map(formatStewardMention);

          if (!stewardMentions.length) {
            stewardMentions.push("Context stewards not configured – please triage manually.");
          }

          const contextUpdateManager = getContextUpdateManager();
          const actions: ContextUpdateAction[] = [
            {
              type: "append_cmdb_identifier",
              identifier: {
                ciName: cmdbIdentifier.ciName,
                sysId: cmdbIdentifier.sysId,
                ipAddresses: dedupeIps(cmdbIdentifier.ipAddresses),
                description: cmdbIdentifier.description,
                ownerGroup: cmdbIdentifier.ownerGroup,
                documentation: cmdbIdentifier.documentation ?? [],
              },
              createEntityIfMissing: !businessContext,
              entityTypeIfCreate,
            },
          ];

          const proposal = await contextUpdateManager.postProposal({
            entityName,
            summary,
            details,
            actions,
            stewardMentions,
            stewardChannelId,
            sourceChannelId,
            sourceThreadTs,
            initiatedBy: "PeterPool",
            caseNumber: chosenCaseNumber,
            confidence,
          });

          return {
            status: "pending_approval",
            messageTs: proposal.messageTs,
            stewardChannelId,
          };
        },
      });

      const fetchCurrentIssuesTool = createTool({
        description:
          "Check ServiceNow and Slack for live issues affecting this customer.",
        inputSchema: fetchCurrentIssuesInputSchema,
        execute: async ({ channelId, channelNameHint }: FetchCurrentIssuesInput) => {
          const effectiveChannelId = channelId ?? options?.channelId;

          if (!effectiveChannelId) {
            return {
              error:
                "channelId is required to fetch current issues. Provide it in the tool call or ensure the assistant has channel metadata.",
            };
          }

          const currentIssuesService = getCurrentIssuesService();
          const result = await currentIssuesService.getCurrentIssues(effectiveChannelId);

          if (channelNameHint && !result.channelName) {
            result.channelName = channelNameHint;
          }

          return {
            result,
          };
        },
      });

      return {
        getWeather: getWeatherTool,
        searchWeb: searchWebTool,
        serviceNow: serviceNowTool,
        searchSimilarCases: searchSimilarCasesTool,
        generateKBArticle: generateKbArticleTool,
        proposeContextUpdate: proposeContextUpdateTool,
        fetchCurrentIssues: fetchCurrentIssuesTool,
      };
    };

    const createConfig = (model: unknown) => ({
      model,
      system: enhancedSystemPrompt,
      messages,
      stopWhen: stepCountIs(10),
      tools: createTools(),
    });

    lastConfigBuilder = createConfig;

    const baseModel = modelProvider.languageModel("chat-model");
    const baseConfig = createConfig(baseModel);
    const sanitizedConfig = sanitizeModelConfig(
      activeModelId,
      baseConfig as any,
    ) as any;
    return generateTextImpl(sanitizedConfig);

  };

  console.log(`[Model Router] Using ${activeModelId}`);

  let text: string;
  let result: any;

  // Helper function to run model with detailed logging
  const runModelWithLogging = async (modelId: string, isRetry = false) => {
    const retryLabel = isRetry ? " (RETRY)" : "";
    console.log(`[Model Request${retryLabel}] Model: ${modelId}`);
    console.log(`[Model Request${retryLabel}] Messages count: ${messages.length}`);
    console.log(`[Model Request${retryLabel}] Last message:`, messages[messages.length - 1]);

    const modelResult = await runModel();

    console.log(`[Model Response${retryLabel}] Full result:`, JSON.stringify(modelResult, null, 2).substring(0, 2000));
    console.log(`[Model Response${retryLabel}] Response keys:`, Object.keys(modelResult));
    console.log(`[Model Response${retryLabel}] Text length: ${modelResult.text?.length || 0}`);
    console.log(`[Model Response${retryLabel}] Raw text:`, modelResult.text);
    console.log(`[Model Response${retryLabel}] Finish reason:`, modelResult.finishReason);
    console.log(`[Model Response${retryLabel}] Usage:`, modelResult.usage);
    const responseMetadata = modelResult.response
      ? {
        modelId: modelResult.response.modelId,
        headers: modelResult.response.headers,
        messageCount: modelResult.response.messages?.length,
      }
      : undefined;
    console.log(`[Model Response${retryLabel}] Response metadata:`, JSON.stringify({
      finishReason: modelResult.finishReason,
      usage: modelResult.usage,
      warnings: modelResult.warnings,
      response: responseMetadata,
    }, null, 2));

    return modelResult;
  };

  try {
    result = await runModelWithLogging(activeModelId);
    text = result.text;

    // Check for tool calls or steps that might explain empty text
    if (result.steps) {
      console.log(`[Model Response] Steps taken: ${result.steps.length}`);
      result.steps.forEach((step: any, i: number) => {
        console.log(`[Model Response] Step ${i}:`, {
          stepType: step.stepType,
          text: step.text?.substring(0, 100),
          toolCalls: step.toolCalls?.length,
          toolResults: step.toolResults?.length,
          finishReason: step.finishReason,
        });

        // Log tool calls in detail
        if (step.toolCalls && step.toolCalls.length > 0) {
          step.toolCalls.forEach((call: any, j: number) => {
            console.log(`  [Tool Call ${j}]:`, {
              toolName: call.toolName,
              args: call.args,
            });
          });
        }

        // Log tool results in detail
        if (step.toolResults && step.toolResults.length > 0) {
          step.toolResults.forEach((result: any, j: number) => {
            const resultStr = typeof result.result === 'string'
              ? result.result.substring(0, 200)
              : result.result
                ? JSON.stringify(result.result).substring(0, 200)
                : 'undefined';
            console.log(`  [Tool Result ${j}]:`, {
              toolName: result.toolName,
              result: resultStr,
            });
          });
        }
      });
    }
  } catch (error) {
    console.error(`Model ${activeModelId} failed:`, error);
    console.error(`Error stack:`, error instanceof Error ? error.stack : 'No stack');
    throw error; // Don't fallback, just fail
  }

  // Handle empty response from GLM-4.6 with OpenAI fallback
  let finalText = text?.trim();

  if (!finalText) {
    console.warn(`[Empty Response] ${activeModelId} returned empty text`);
    console.warn(`[Empty Response] Finish reason: ${result.finishReason}`);
    console.warn(`[Empty Response] Usage:`, result.usage);
    console.warn(`[Empty Response] Steps:`, result.steps?.length || 0);

    // Check if this is GLM-4.6 and we can fallback to OpenAI
    const isGatewayModel = activeModelId.includes("glm");
    const openAiFallback = process.env.OPENAI_FALLBACK_MODEL?.trim() ?? "gpt-5-mini";

    if (isGatewayModel) {
      console.warn(`[Fallback] Retrying with ${openAiFallback} due to empty GLM response`);

      try {
        // Import openai provider for fallback
        const { openai } = await import("@ai-sdk/openai");

        const fallbackModel = openai(openAiFallback);
        if (!lastConfigBuilder) {
          throw new Error("Fallback configuration not available");
        }
        const fallbackConfig = lastConfigBuilder(fallbackModel);
        const sanitizedFallbackConfig = sanitizeModelConfig(
          openAiFallback,
          fallbackConfig as any,
        ) as any;
        const fallbackResult = await generateTextImpl(sanitizedFallbackConfig);

        console.log(`[Fallback] ${openAiFallback} response:`, fallbackResult.text?.substring(0, 200));
        console.log(`[Fallback] Finish reason:`, fallbackResult.finishReason);
        console.log(`[Fallback] Usage:`, fallbackResult.usage);

        finalText = fallbackResult.text?.trim();

        if (finalText) {
          console.log(`[Fallback] Successfully recovered using ${openAiFallback}`);
        }
      } catch (fallbackError) {
        console.error(`[Fallback] ${openAiFallback} also failed:`, fallbackError);
      }
    }

    // If still empty after fallback, provide helpful error message
    if (!finalText) {
      // Check if user's message is empty or just a mention
      const userMessage = messages[messages.length - 1];
      const userText = userMessage?.content?.toString().trim();

      if (!userText || userText.length < 10) {
        finalText = "Hi! I'm your Mobiz Service Desk Assistant. How can I help you today?";
        console.log(`[Empty Response] Returning friendly greeting for empty/short mention`);
      } else {
        throw new Error("No response text generated from any model");
      }
    }
  }

  // Convert markdown to Slack mrkdwn format
  return finalText
    .replace(/^#{1,6}\s+(.+)$/gm, "*$1*") // Convert markdown headers to bold
    .replace(/\[(.*?)\]\((.*?)\)/g, "<$2|$1>") // Convert markdown links to Slack links
    .replace(/\*\*/g, "*"); // Convert markdown bold to Slack bold
};

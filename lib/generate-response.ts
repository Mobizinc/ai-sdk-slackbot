import { openai } from "@ai-sdk/openai";
import { CoreMessage, generateText, tool } from "ai";
import { z } from "zod";
import { exa } from "./utils";
import { serviceNowClient } from "./tools/servicenow";
import { createAzureSearchService } from "./services/azure-search";
import { getContextManager } from "./context-manager";
import { getKBGenerator } from "./services/kb-generator";
import { classifyQueryComplexity, forceComplexModel } from "./services/query-complexity";

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

/**
 * Check if a model supports the temperature parameter.
 * GPT-5 models do not support temperature and will reject requests that include it.
 */
function supportsTemperature(modelName: string): boolean {
  const lowered = (modelName || "").toLowerCase();
  return !lowered.startsWith("gpt-5");
}

export const generateResponse = async (
  messages: CoreMessage[],
  updateStatus?: (status: string) => void,
) => {
  const runModel = async (modelName: string) => {
    const config: any = {
      model: openai(modelName),
      system: `You are the Mobiz Service Desk Assistant embedded in Slack threads between Service Desk analysts and Engineering.

Primary responsibilities:
  • Investigate ServiceNow cases, incidents, and knowledge articles using the provided tools.
  • Surface only the facts explicitly returned by ServiceNow (case fields, journal/work-note entries, KB metadata).
  • Recommend actionable next steps or prerequisites for the analyst/engineer audience.
  • Flag project-scope, client-technology, related-entity, or service-hours exceptions when the tools reveal them.

Tool usage:
  • Always call the ServiceNow tools before answering. Do not infer metadata from narrative text.
  • Use searchSimilarCases to find historical cases with similar issues, especially when patterns or context would help troubleshooting.
  • Default to the custom case table x_mobit_serv_case_service_case and journal name x_mobit_serv_case_service_case.
  • Web search and weather are optional—only invoke if they add concrete value to the conversation.

Response structure (use headings or bullet lists):
  1. Summary – ≤3 concise sentences explaining what changed and why it matters.
  2. Latest Activity – bullet the most recent journal/work-note entries chronologically (e.g. \`2025-10-06 15:49 UTC – agent@example.com: Issue acknowledged. Device rebooted.\`).
  3. Current State – status, priority, assignment, submitter/requester (only if present in ServiceNow).
  4. Next Actions – numbered, actionable steps or prerequisites (e.g. “Prerequisite: Confirm requester has VPN entitlement”).
  5. References – cite artefacts inline with Slack formatting (e.g. \`SCS0048402 – 2025-10-06 15:49 UTC\`, <https://kb-link|KB KBA0001234>).

Guardrails:
  • Never tag Slack users or fabricate values. If a field is absent, state “Not provided in ServiceNow.”
  • Do not treat approval names in notes as submitters; only use submitter/requester fields supplied by ServiceNow.
  • Make it explicit when follow-up in ServiceNow is required (e.g. “Manual update needed…”).
  • Today’s date is ${new Date().toISOString().split("T")[0]}.
  • You have read-only access—suggest actions instead of claiming completion.`,
      messages,
      maxSteps: 10,
      tools: {
      getWeather: tool({
        description: "Get the current weather at a location",
        parameters: z.object({
          latitude: z.number(),
          longitude: z.number(),
          city: z.string(),
        }),
        execute: async ({ latitude, longitude, city }) => {
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
      }),
      searchWeb: tool({
        description: "Use this to search the web for information",
        parameters: z.object({
          query: z.string(),
          specificDomain: z
            .string()
            .nullable()
            .describe(
              "a domain to search if the user specifies e.g. bbc.com. Should be only the domain name without the protocol",
            ),
        }),
        execute: async ({ query, specificDomain }) => {
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
      }),
      serviceNow: tool({
        description:
          "Read data from ServiceNow (incidents, cases, knowledge base, and recent journal entries).",
        parameters: z
          .object({
            action: z.enum([
              "getIncident",
              "getCase",
              "getCaseJournal",
              "searchKnowledge",
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
          })
          .describe("ServiceNow action parameters"),
        execute: async ({ action, number, caseSysId, query, limit }) => {
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

            throw new Error(`Unsupported ServiceNow action: ${action}`);
          } catch (error) {
            console.error("ServiceNow tool error", error);
            return {
              error:
                error instanceof Error ? error.message : "Unknown ServiceNow error",
            };
          }
        },
      }),
      searchSimilarCases: tool({
        description:
          "Search for similar historical cases using vector similarity. Use this to find cases with similar issues, error messages, or technical contexts. This searches the case intelligence knowledge base.",
        parameters: z.object({
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
        }),
        execute: async ({ query, clientId, topK }) => {
          if (!azureSearchService) {
            return {
              error:
                "Case intelligence search is not configured. Azure Search credentials are required.",
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
                message: "No similar cases found in the knowledge base.",
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
            console.error("Similar cases search error", error);
            return {
              error:
                error instanceof Error
                  ? error.message
                  : "Failed to search similar cases",
            };
          }
        },
      }),
      generateKBArticle: tool({
        description:
          "Generate a knowledge base article from a resolved case conversation. Use this when a user explicitly asks to create KB documentation from a case discussion.",
        parameters: z.object({
          caseNumber: z
            .string()
            .describe("The case number to generate KB article for"),
          threadTs: z
            .string()
            .optional()
            .describe("Optional thread timestamp to get conversation context from"),
        }),
        execute: async ({ caseNumber, threadTs }) => {
          try {
            updateStatus?.(`is generating KB article for ${caseNumber}...`);

            const contextManager = getContextManager();
            const contexts = contextManager.getContextsForCase(caseNumber);

            if (contexts.length === 0) {
              return {
                error: `No conversation context found for case ${caseNumber}. The case must have been discussed in a tracked thread first.`,
              };
            }

            // Use the most recent or specified thread context
            const context = threadTs
              ? contexts.find((c) => c.threadTs === threadTs)
              : contexts[contexts.length - 1];

            if (!context) {
              return {
                error: `Context not found for the specified thread.`,
              };
            }

            // Fetch case details from ServiceNow
            const caseDetails = serviceNowClient.isConfigured()
              ? await serviceNowClient.getCase(caseNumber).catch(() => null)
              : null;

            // Generate KB article
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
      }),
    },
    };

    // Only add temperature for models that support it (GPT-5 models do not)
    if (supportsTemperature(modelName)) {
      config.temperature = 0.3;
    }

    return generateTextImpl(config);
  };

  // Always use gpt-5-mini
  const selectedModel = "gpt-5-mini";
  console.log("[Model Router] Using gpt-5-mini");

  let text: string;

  try {
    ({ text } = await runModel(selectedModel));
  } catch (error) {
    console.error(`Model ${selectedModel} failed:`, error);
    throw error; // Don't fallback, just fail
  }

  // Convert markdown to Slack mrkdwn format
  const finalText = text?.trim();

  if (!finalText) {
    throw new Error("No response text generated");
  }

  return finalText
    .replace(/\[(.*?)\]\((.*?)\)/g, "<$2|$1>")
    .replace(/\*\*/g, "*");
};

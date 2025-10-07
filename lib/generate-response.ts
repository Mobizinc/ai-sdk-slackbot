import { openai } from "@ai-sdk/openai";
import { CoreMessage, generateText, tool } from "ai";
import { z } from "zod";
import { exa } from "./utils";
import { serviceNowClient } from "./tools/servicenow";

let generateTextImpl = generateText;

export const __setGenerateTextImpl = (
  impl: typeof generateText,
) => {
  generateTextImpl = impl;
};

export const __resetGenerateTextImpl = () => {
  generateTextImpl = generateText;
};

export const generateResponse = async (
  messages: CoreMessage[],
  updateStatus?: (status: string) => void,
) => {
  const runModel = async (modelName: string) =>
    generateTextImpl({
      model: openai(modelName),
      system: `You are the Mobiz Service Desk Assistant operating inside Slack conversations between Service Desk analysts and Engineering.
    Objectives:
      - Interpret requests about ServiceNow cases, incidents, and knowledge articles, adding useful operational context.
      - Proactively call the available tools (ServiceNow case/incident/journal/knowledge lookups, web search, weather) whenever they improve accuracy.
    Communication guidelines:
      - Keep every reply concise, professional, and action-oriented. Prefer short paragraphs or bullet lists for clarity.
      - Never tag Slack users (avoid the @ symbol entirely) and never invent data—state when information is missing or requires manual follow-up.
    References:
      - Always cite the data you surface. Reference ServiceNow artefacts inline using their identifiers and timestamps (e.g. \`SCS0048402 – 2025-10-06 15:49 UTC\`).
      - Format external sources with Slack links like <url|label>.
    Additional context:
      - Today’s date is ${new Date().toISOString().split("T")[0]}.
      - You only have read access; when updates in ServiceNow are needed, suggest the next actions for the analyst instead of claiming completion.`,
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
    },
  });

  let text: string;

  try {
    ({ text } = await runModel("gpt-5-mini"));
  } catch (error) {
    console.error("Primary model gpt-5-mini failed, falling back to gpt-4o", error);
    ({ text } = await runModel("gpt-4o"));
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

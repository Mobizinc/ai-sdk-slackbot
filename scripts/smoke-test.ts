#!/usr/bin/env node
import { generateResponse } from "../lib/generate-response";
import { AnthropicChatService, type ChatRequest, type ChatResponse } from "../lib/services/anthropic-chat";
import { serviceNowClient } from "../lib/tools/servicenow";

const originalFetch = globalThis.fetch;

process.env.SERVICENOW_INSTANCE_URL =
  process.env.SERVICENOW_INSTANCE_URL ?? "https://example.service-now.com";
process.env.SERVICENOW_CASE_TABLE =
  process.env.SERVICENOW_CASE_TABLE ?? "sn_customerservice_case";
process.env.SERVICENOW_CASE_JOURNAL_NAME =
  process.env.SERVICENOW_CASE_JOURNAL_NAME ?? "x_mobit_serv_case_service_case";

const jsonResponse = (data: unknown, status = 200) =>
  new Response(JSON.stringify(data), {
    status,
    headers: { "content-type": "application/json" },
  });

globalThis.fetch = async (input: RequestInfo | URL, init?: RequestInit) => {
  const url = typeof input === "string" ? input : input instanceof URL ? input.toString() : input.url;

  if (url.includes("/api/now/table/sn_customerservice_case")) {
    return jsonResponse({
      result: [
        {
          sys_id: "CASE_SYS_ID",
          number: "SCS0048402",
          short_description: "New PACS",
          priority: "4",
          state: "10",
        },
      ],
    });
  }

  if (url.includes("/api/now/table/sys_journal_field")) {
    return jsonResponse({
      result: [
        {
          sys_id: "JOURNAL1",
          element: "comments",
          element_id: "CASE_SYS_ID",
          name: "x_mobit_serv_case_service_case",
          sys_created_on: "2025-10-06 15:49:31",
          sys_created_by: "agent@example.com",
          value: "Issue acknowledged. Device rebooted.",
        },
      ],
    });
  }

  return jsonResponse({ result: [] }, 404);
};

const stubAnthropicService = {
  async send(request: ChatRequest): Promise<ChatResponse> {
    const lastMessage = [...request.messages].reverse().find((msg) => msg.role === "user");
    const caseMatch = lastMessage?.content.match(/[A-Z]{3}\d{7}/);
    const caseNumber = caseMatch?.[0] ?? "SCS0048402";

    const caseDetails = await serviceNowClient.getCase(caseNumber);
    const journalEntries = caseDetails?.sys_id
      ? await serviceNowClient.getCaseJournal(caseDetails.sys_id, { limit: 5 })
      : [];

    const latestEntry = journalEntries?.[0];
    const summary = latestEntry
      ? `${latestEntry.sys_created_on} by ${latestEntry.sys_created_by}: ${latestEntry.value}`
      : "No recent activity found.";

    const text = `Case ${caseNumber}: ${summary}`;

    return {
      message: {
        id: "stub-message",
        type: "message",
        role: "assistant",
        content: [{ type: "text", text }],
        usage: { input_tokens: 0, output_tokens: 0 },
      } as any,
      toolCalls: [],
      outputText: text,
      usage: { input_tokens: 0, output_tokens: 0 } as any,
    };
  },
};

(AnthropicChatService as unknown as { getInstance: () => typeof stubAnthropicService }).getInstance = () =>
  stubAnthropicService as any;

async function run() {
  try {
    const result = await generateResponse([
      {
        role: "user",
        content: "Summarise the most recent activity for case SCS0048402",
      },
    ]);

    console.log("Generated response:
");
    console.log(result);
  } catch (error) {
    console.error("Smoke test failed", error);
    process.exitCode = 1;
  } finally {
    if (originalFetch) {
      globalThis.fetch = originalFetch;
    }
  }
}

run();

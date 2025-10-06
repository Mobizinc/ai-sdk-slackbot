#!/usr/bin/env node
import { generateResponse, __resetGenerateTextImpl, __setGenerateTextImpl } from "../lib/generate-response";

const originalFetch = globalThis.fetch;

process.env.SERVICENOW_INSTANCE_URL =
  process.env.SERVICENOW_INSTANCE_URL ?? "https://example.service-now.com";
process.env.SERVICENOW_CASE_TABLE =
  process.env.SERVICENOW_CASE_TABLE ?? "sn_customerservice_case";
process.env.SERVICENOW_CASE_JOURNAL_NAME =
  process.env.SERVICENOW_CASE_JOURNAL_NAME ?? "x_mobit_serv_case_service_case";
process.env.OPENAI_API_KEY = process.env.OPENAI_API_KEY ?? "test-openai-key";

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

__setGenerateTextImpl(async ({ tools }) => {
  const caseLookup = await tools.serviceNow.execute({
    action: "getCase",
    number: "SCS0048402",
  });

  const journalLookup = await tools.serviceNow.execute({
    action: "getCaseJournal",
    caseSysId: caseLookup.case?.sys_id ?? "",
    limit: 5,
  });

  const latestEntry = journalLookup.caseJournal?.[0];
  const summary = latestEntry
    ? `${latestEntry.sys_created_on} by ${latestEntry.sys_created_by}: ${latestEntry.value}`
    : "No recent activity found.";

  return {
    text: `Case ${caseLookup.case?.number}: ${summary}`,
  };
});

async function run() {
  try {
    const result = await generateResponse([
      {
        role: "user",
        content: "Summarise the most recent activity for case SCS0048402",
      },
    ]);

    console.log("Generated response:\n");
    console.log(result);
  } catch (error) {
    console.error("Smoke test failed", error);
    process.exitCode = 1;
  } finally {
    __resetGenerateTextImpl();
    if (originalFetch) {
      globalThis.fetch = originalFetch;
    }
  }
}

run();

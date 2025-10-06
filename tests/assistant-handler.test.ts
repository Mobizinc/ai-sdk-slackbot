import { rest } from "msw";
import { describe, expect, it, beforeEach, afterEach, vi } from "vitest";

import { POST } from "../api/events";
import {
  __resetGenerateTextImpl,
  __setGenerateTextImpl,
} from "../lib/generate-response";
import { server } from "./setup";

vi.mock("@vercel/functions", () => ({
  waitUntil: <T>(promise: Promise<T>) => {
    promise.catch((error) => {
      console.error("waitUntil promise rejected in test", error);
    });
  },
}));

const postMessageMock = vi.fn();
const statusUpdates: Array<{ channel: string; thread: string; status: string }> = [];
const getThreadMock = vi.fn();

vi.mock("../lib/slack-utils", () => {
  return {
    client: {
      chat: {
        postMessage: postMessageMock,
      },
      assistant: {
        threads: {
          setStatus: vi.fn(),
          setSuggestedPrompts: vi.fn(),
        },
      },
      conversations: {
        replies: vi.fn(),
      },
      auth: {
        test: vi.fn().mockResolvedValue({ user_id: "BOT123" }),
      },
    },
    verifyRequest: vi.fn().mockResolvedValue(undefined),
    getBotId: vi.fn().mockResolvedValue("BOT123"),
    getThread: getThreadMock,
    updateStatusUtil: (channel: string, thread: string) => async (status: string) => {
      statusUpdates.push({ channel, thread, status });
    },
  };
});

vi.mock("../lib/handle-app-mention", () => ({
  handleNewAppMention: vi.fn().mockResolvedValue(undefined),
}));

describe("Slack events handler", () => {
  beforeEach(() => {
    statusUpdates.length = 0;
    postMessageMock.mockReset();
    getThreadMock.mockReset();

    server.use(
      rest.get(
        "https://example.service-now.com/api/now/table/sn_customerservice_case",
        (req, res, ctx) => {
          const query = req.url.searchParams.get("sysparm_query") ?? "";
          if (!query.includes("number=SCS0048402")) {
            return res(ctx.status(200), ctx.json({ result: [] }));
          }
          return res(
            ctx.status(200),
            ctx.json({
              result: [
                {
                  sys_id: "CASE_SYS_ID",
                  number: "SCS0048402",
                  short_description: "New PACS",
                  priority: "4",
                  state: "10",
                },
              ],
            }),
          );
        },
      ),
      rest.get(
        "https://example.service-now.com/api/now/table/sys_journal_field",
        (req, res, ctx) => {
          const result = [
            {
              sys_id: "JOURNAL1",
              element: "comments",
              element_id: "CASE_SYS_ID",
              name: "x_mobit_serv_case_service_case",
              sys_created_on: "2025-10-06 15:49:31",
              sys_created_by: "agent@example.com",
              value: "Issue acknowledged. Device rebooted.",
            },
            {
              sys_id: "JOURNAL2",
              element: "work_notes",
              element_id: "CASE_SYS_ID",
              name: "x_mobit_serv_case_service_case",
              sys_created_on: "2025-10-06 15:30:00",
              sys_created_by: "agent@example.com",
              value: "Initial investigation started.",
            },
          ];
          return res(ctx.status(200), ctx.json({ result }));
        },
      ),
    );

    getThreadMock.mockResolvedValue([
      {
        role: "user",
        content: "Please share the latest updates for case SCS0048402",
      },
    ]);

    __setGenerateTextImpl(
      vi.fn(async ({ tools }) => {
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
        const latestSummary = latestEntry
          ? `${latestEntry.sys_created_on} by ${latestEntry.sys_created_by}: ${latestEntry.value}`
          : "No recent activity found.";

        return {
          text: `Case ${caseLookup.case?.number}: ${latestSummary}`,
        };
      }),
    );
  });

  afterEach(() => {
    __resetGenerateTextImpl();
  });

  it("responds to a direct message by summarising the latest case activity", async () => {
    const payload = {
      type: "event_callback",
      event: {
        type: "message" as const,
        channel: "D123",
        channel_type: "im" as const,
        user: "U999",
        text: "Please share the latest updates for case SCS0048402",
        ts: "1728238123.000200",
        thread_ts: "1728238123.000200",
      },
    };

    const request = new Request("https://example.com/api/events", {
      method: "POST",
      headers: {
        "content-type": "application/json",
      },
      body: JSON.stringify(payload),
    });

    const response = await POST(request);

    expect(response.status).toBe(200);
    expect(await response.text()).toBe("Success!");

    expect(getThreadMock).toHaveBeenCalledTimes(1);

    expect(statusUpdates).toEqual([
      { channel: "D123", thread: "1728238123.000200", status: "is thinking..." },
      { channel: "D123", thread: "1728238123.000200", status: "" },
    ]);

    expect(postMessageMock).toHaveBeenCalledTimes(1);
    const postMessageArgs = postMessageMock.mock.calls[0][0];
    expect(postMessageArgs.channel).toBe("D123");
    expect(postMessageArgs.thread_ts).toBe("1728238123.000200");
    expect(postMessageArgs.text).toContain("Case SCS0048402");
    expect(postMessageArgs.text).toContain("Issue acknowledged. Device rebooted.");
  });
});

import { beforeEach, describe, expect, it, vi } from "vitest";

import { POST } from "../api/relay";
import { createRelaySignature } from "../lib/relay-auth";

const hoisted = vi.hoisted(() => {
  return {
    postMessageMock: vi.fn(),
    openConversationMock: vi.fn(),
  };
});

vi.mock("../lib/slack-utils", () => {
  return {
    client: {
      chat: {
        postMessage: hoisted.postMessageMock,
      },
      conversations: {
        open: hoisted.openConversationMock,
      },
    },
  };
});

describe("relay endpoint", () => {
  beforeEach(() => {
    hoisted.postMessageMock.mockReset();
    hoisted.openConversationMock.mockReset();
  });

  it("relays a message to a specified channel", async () => {
    hoisted.postMessageMock.mockResolvedValue({
      ok: true,
      channel: "C123",
      ts: "1728238123.000200",
    });

    const body = JSON.stringify({
      target: {
        channel: "C123",
        thread_ts: "1728237000.000100",
      },
      message: {
        text: "  Hello from the triage agent  ",
        unfurl_links: false,
      },
      metadata: {
        correlationId: "case-123",
        eventType: "triage.update",
        payload: { priority: "high" },
      },
      source: "triage-agent",
    });

    const { signature, timestamp } = createRelaySignature(body);

    const request = new Request("https://example.com/api/relay", {
      method: "POST",
      headers: {
        "content-type": "application/json",
        "x-relay-signature": signature,
        "x-relay-timestamp": String(timestamp),
      },
      body,
    });

    const response = await POST(request);
    expect(response.status).toBe(200);
    const data = await response.json();
    expect(data.ok).toBe(true);
    expect(data.channel).toBe("C123");
    expect(data.thread_ts).toBe("1728237000.000100");

    expect(hoisted.postMessageMock).toHaveBeenCalledTimes(1);
    expect(hoisted.postMessageMock.mock.calls[0][0]).toEqual({
      channel: "C123",
      text: "Hello from the triage agent",
      unfurl_links: false,
      thread_ts: "1728237000.000100",
      metadata: {
        event_type: "triage.update",
        event_payload: {
          correlationId: "case-123",
          priority: "high",
          source: "triage-agent",
        },
      },
    });
  });

  it("opens a DM when targeting a user and falls back to source label when text omitted", async () => {
    hoisted.openConversationMock.mockResolvedValue({
      ok: true,
      channel: { id: "D555" },
    });

    hoisted.postMessageMock.mockResolvedValue({
      ok: true,
      channel: "D555",
      ts: "1728239000.000100",
    });

    const body = JSON.stringify({
      target: {
        user: "U777",
      },
      message: {
        blocks: [
          {
            type: "section",
            text: { type: "mrkdwn", text: "Inventory notice" },
          },
        ],
      },
      source: "inventory-agent",
    });

    const { signature, timestamp } = createRelaySignature(body);

    const request = new Request("https://example.com/api/relay", {
      method: "POST",
      headers: {
        "content-type": "application/json",
        "x-relay-signature": signature,
        "x-relay-timestamp": String(timestamp),
      },
      body,
    });

    const response = await POST(request);
    expect(response.status).toBe(200);
    expect(hoisted.openConversationMock).toHaveBeenCalledWith({ users: "U777" });

    const posted = hoisted.postMessageMock.mock.calls[0][0];
    expect(posted.channel).toBe("D555");
    expect(posted.text).toBe("Relay from inventory-agent");
    expect(posted.blocks).toEqual([
      {
        type: "section",
        text: { type: "mrkdwn", text: "Inventory notice" },
      },
    ]);
  });

  it("rejects requests without a valid signature", async () => {
    const body = JSON.stringify({
      target: {
        channel: "C999",
      },
      message: {
        text: "Hello",
      },
    });

    const request = new Request("https://example.com/api/relay", {
      method: "POST",
      headers: {
        "content-type": "application/json",
        "x-relay-signature": "v1=bad",
        "x-relay-timestamp": String(Math.floor(Date.now() / 1000)),
      },
      body,
    });

    const response = await POST(request);
    expect(response.status).toBe(401);
    const payload = await response.json();
    expect(payload.error).toContain("signature");
    expect(hoisted.postMessageMock).not.toHaveBeenCalled();
  });
});

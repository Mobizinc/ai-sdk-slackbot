import { describe, it, expect, vi } from "vitest";
import { AnthropicChatService } from "../lib/services/anthropic-chat";

describe("AnthropicChatService", () => {
  it("converts chat request into Anthropic params", async () => {
    const mockCreate = vi.fn().mockResolvedValue({
      content: [
        { type: "text", text: "Hello there" },
      ],
      usage: { input_tokens: 10, output_tokens: 20 },
    });

    const mockClient = {
      messages: {
        create: mockCreate,
      },
    } as any;

    const service = new AnthropicChatService(mockClient);

    await service.send({
      messages: [
        { role: "system", content: "You are helpful." },
        { role: "user", content: "Hi!" },
      ],
      tools: [
        {
          name: "getWeather",
          description: "Fetches weather.",
          inputSchema: { type: "object" },
        },
      ],
    });

    expect(mockCreate).toHaveBeenCalledTimes(1);
    const params = mockCreate.mock.calls[0][0];

    expect(params.model).toBeDefined();
    expect(params.system).toBe("You are helpful.");
    expect(params.messages).toEqual([
      {
        role: "user",
        content: [{ type: "text", text: "Hi!" }],
      },
    ]);
    expect(params.tools).toHaveLength(1);
  });

  it("returns aggregated text and tool calls", async () => {
    const mockCreate = vi.fn().mockResolvedValue({
      content: [
        { type: "tool_use", id: "tool-1", name: "fetch", input: { query: "status" } },
        { type: "text", text: "Done." },
      ],
      usage: { input_tokens: 15, output_tokens: 5 },
    });

    const service = new AnthropicChatService({ messages: { create: mockCreate } } as any);

    const response = await service.send({
      messages: [{ role: "user", content: "Run tool" }],
    });

    expect(response.toolCalls).toHaveLength(1);
    expect(response.outputText).toBe("Done.");
    expect(response.usage).toEqual({ input_tokens: 15, output_tokens: 5 });
  });
});

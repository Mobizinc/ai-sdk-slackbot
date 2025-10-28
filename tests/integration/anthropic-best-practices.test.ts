
import { describe, it, expect, vi } from 'vitest';
import { Agent } from '../../../lib/agent'; // Adjust path
import { AnthropicChat } from '../../../lib/services/anthropic/anthropic-chat'; // Adjust path
import { Tool } from '../../../lib/tools/tool'; // Adjust path

// Mock the Anthropic API
const mockCreate = vi.fn();
vi.mock('@anthropic-ai/sdk', () => {
    const mockAnthropic = {
        messages: {
            create: (params: any) => mockCreate(params),
        },
    };
    return {
        default: vi.fn(() => mockAnthropic),
        Anthropic: vi.fn(() => mockAnthropic),
    };
});

// Define mock tools
class MockTool1 extends Tool {
    name = 'mock_tool_1';
    description = 'A mock tool';
    async execute() { return { success: true }; }
}

class MockTool2 extends Tool {
    name = 'mock_tool_2';
    description = 'Another mock tool';
    async execute() { return { success: true }; }
}

class FailingTool extends Tool {
    name = 'failing_tool';
    description = 'A tool that fails';
    async execute() { throw new Error('Tool failed'); }
}

describe.skip('Anthropic Best Practices Validation', () => {
    let agent: Agent;

    it('should send all tool results in a single user message', async () => {
        // Arrange
        agent = new Agent({
            chatProvider: new AnthropicChat({ apiKey: 'mock_key' }),
            tools: [new MockTool1(), new MockTool2()],
        });

        mockCreate.mockResolvedValueOnce({
            type: 'message',
            stop_reason: 'tool_use',
            content: [
                { type: 'tool_use', id: 'tu1', name: 'mock_tool_1', input: {} },
                { type: 'tool_use', id: 'tu2', name: 'mock_tool_2', input: {} },
            ],
        }).mockResolvedValueOnce({
            type: 'message',
            stop_reason: 'stop_sequence',
            content: [{ type: 'text', text: 'Final answer.' }],
        });

        // Act
        await agent.run('Run both tools');

        // Assert
        const secondCallParams = mockCreate.mock.calls[1][0];
        const userMessages = secondCallParams.messages.filter((m: any) => m.role === 'user');
        const lastUserMessage = userMessages[userMessages.length - 1];

        expect(lastUserMessage.content).toBeInstanceOf(Array);
        const toolResultContents = lastUserMessage.content.filter((c: any) => c.type === 'tool_result');
        expect(toolResultContents.length).toBe(2);
        expect(toolResultContents[0].tool_use_id).toBe('tu1');
        expect(toolResultContents[1].tool_use_id).toBe('tu2');
    });

    it('should send is_error: true for failed tools', async () => {
        agent = new Agent({
            chatProvider: new AnthropicChat({ apiKey: 'mock_key' }),
            tools: [new MockTool1(), new FailingTool()],
        });

        mockCreate.mockResolvedValueOnce({
            type: 'message',
            stop_reason: 'tool_use',
            content: [
                { type: 'tool_use', id: 'tu1', name: 'mock_tool_1', input: {} },
                { type: 'tool_use', id: 'tu2', name: 'failing_tool', input: {} },
            ],
        }).mockResolvedValueOnce({ /* ... final response ... */ });

        await agent.run('Run a failing tool');

        const lastUserMessage = mockCreate.mock.calls[1][0].messages.slice(-1)[0];
        const toolResults = lastUserMessage.content.filter((c: any) => c.type === 'tool_result');

        expect(toolResults[0].is_error).toBe(false);
        expect(toolResults[1].is_error).toBe(true);
        expect(toolResults[1].content).toContain('Tool failed');
    });

    it('should place tool_result content blocks before any text content', async () => {
        agent = new Agent({
            chatProvider: new AnthropicChat({ apiKey: 'mock_key' }),
            tools: [new MockTool1()],
        });

        mockCreate.mockResolvedValueOnce({
            type: 'message',
            stop_reason: 'tool_use',
            content: [{ type: 'tool_use', id: 'tu1', name: 'mock_tool_1', input: {} }],
        }).mockResolvedValueOnce({ /* ... final response ... */ });

        await agent.run('Run a tool and say something');

        const lastUserMessage = mockCreate.mock.calls[1][0].messages.slice(-1)[0];
        // This is a simplification. In reality, the agent would not add text here.
        // This test verifies that if both were present, tool_result comes first.
        lastUserMessage.content.push({ type: 'text', text: 'Here are the results.' });

        // The spec requires tool_result to come first.
        const contentTypes = lastUserMessage.content.map((c: any) => c.type);
        expect(contentTypes.indexOf('tool_result')).toBe(0);
    });
});

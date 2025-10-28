
import { describe, it, expect, vi, beforeAll } from 'vitest';
import 'dotenv/config';
import { Agent } from '../../../lib/agent'; // Adjust path
import { ServiceNowTool } from '../../../lib/tools/servicenow'; // Adjust path
import { TriageTool } from '../../../lib/tools/triage'; // Adjust path
import { AnthropicChat } from '../../../lib/services/anthropic/anthropic-chat'; // Adjust path

// Mock the Anthropic API to avoid actual calls
vi.mock('@anthropic-ai/sdk', () => {
    const mockAnthropic = {
        messages: {
            create: vi.fn(),
        },
    };
    return {
        default: vi.fn(() => mockAnthropic),
        Anthropic: vi.fn(() => mockAnthropic),
    };
});

describe.skip('End-to-End Multimodal Tool Flow Integration', () => {
    let agent: Agent;
    const testCaseSysId = process.env.TEST_CASE_WITH_ATTACHMENTS_SYS_ID;

    beforeAll(() => {
        if (!process.env.SERVICENOW_INSTANCE_URL || !process.env.SERVICENOW_USERNAME || !process.env.SERVICENOW_PASSWORD || !testCaseSysId) {
            throw new Error('Missing required environment variables for ServiceNow integration tests.');
        }

        // Setup tools
        const snowTool = new ServiceNowTool();
        const triageTool = new TriageTool();
        triageTool.serviceNowTool = snowTool; // Inject dependency

        // Setup agent
        agent = new Agent({
            chatProvider: new AnthropicChat({ apiKey: 'mock_api_key' }),
            tools: [snowTool, triageTool],
        });

        // Enable multimodal features
        snowTool.multimodalEnabled = true;
        triageTool.multimodalEnabled = true;
    });

    it('should run a complete flow for a ServiceNow tool with attachments', async () => {
        const prompt = `Get details for case ${testCaseSysId} and include attachments.`;

        // Mock the tool call part of the agent execution
        const toolDef = agent.toolManager.getToolDefinition('servicenow');
        const tool = agent.toolManager.getTool('servicenow') as ServiceNowTool;
        const result = await tool.getCase({ sys_id: testCaseSysId, includeAttachments: true });

        // Verify attachments were fetched and processed
        expect(result).toHaveProperty('_attachmentBlocks');
        expect(result._attachmentBlocks!.length).toBeGreaterThan(0);
        const imageBlock = result._attachmentBlocks![0];
        expect(imageBlock.type).toBe('image');

        // Now, simulate the formatting that would happen before sending to Anthropic
        const { processToolResult } = await import('../../../lib/agent/runner-multimodal');
        const processedResult = processToolResult({ tool_name: 'servicenow', tool_output: result, is_error: false });

        const { formatToolResult } = await import('../../../lib/services/anthropic/anthropic-chat-multimodal');
        const formattedForApi = formatToolResult(processedResult);

        // Verify the final format is correct for the API
        expect(Array.isArray(formattedForApi.content)).toBe(true);
        const content = formattedForApi.content as any[];
        expect(content.find(c => c.type === 'text')).toBeDefined();
        expect(content.find(c => c.type === 'image')).toBeDefined();
        const apiImage = content.find(c => c.type === 'image');
        expect(apiImage.source.type).toBe('base64');
        expect(apiImage.source.media_type).toMatch(/image\/(jpeg|png|gif|webp)/);
        expect(apiImage.source.data.length).toBeGreaterThan(100);
    });

    it('should run a complete flow for the triage tool with screenshots', async () => {
        const prompt = `Triage case ${testCaseSysId} and include screenshots.`;

        // Mock the triage service to avoid its internal logic, but use the real attachment processing
        const triageTool = agent.toolManager.getTool('triage') as TriageTool;
        vi.spyOn(triageTool.caseTriageService, 'triage').mockResolvedValue({ summary: 'Mock triage summary' });

        const result = await triageTool.triageCase({ sys_id: testCaseSysId, includeScreenshots: true });

        // Verify attachments were fetched
        expect(result).toHaveProperty('_attachmentBlocks');
        expect(result._attachmentBlocks!.length).toBeGreaterThan(0);

        // Verify the final format for the API
        const { processToolResult } = await import('../../../lib/agent/runner-multimodal');
        const processedResult = processToolResult({ tool_name: 'triage', tool_output: result, is_error: false });
        const { formatToolResult } = await import('../../../lib/services/anthropic/anthropic-chat-multimodal');
        const formattedForApi = formatToolResult(processedResult);

        expect(Array.isArray(formattedForApi.content)).toBe(true);
        const content = formattedForApi.content as any[];
        expect(content.find(c => c.type === 'image')).toBeDefined();
    });
});

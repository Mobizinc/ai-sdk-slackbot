
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { TriageTool } from '../../../lib/tools/triage'; // Adjust path
import { CaseTriageService } from '../../../lib/services/case-triage'; // Adjust path
import { ServiceNowTool } from '../../../lib/tools/servicenow'; // Adjust path

describe('Triage Tool Screenshot Logic', () => {
    let triageTool: TriageTool;
    const mockCaseTriageService = {
        triage: vi.fn(),
    };
    const mockServiceNowTool = {
        processAttachments: vi.fn(),
    };

    beforeEach(() => {
        triageTool = new TriageTool();
        triageTool.caseTriageService = mockCaseTriageService as unknown as CaseTriageService;
        triageTool.serviceNowTool = mockServiceNowTool as unknown as ServiceNowTool;
        triageTool.multimodalEnabled = true; // Default to enabled

        vi.clearAllMocks();
    });

    it('should work without screenshots for backward compatibility', async () => {
        mockCaseTriageService.triage.mockResolvedValue({ summary: 'Triage complete' });
        const result = await triageTool.triageCase({ sys_id: '123', includeScreenshots: false });

        expect(result.summary).toBe('Triage complete');
        expect(mockServiceNowTool.processAttachments).not.toHaveBeenCalled();
        expect(result).not.toHaveProperty('_attachmentBlocks');
    });

    it('should fetch images when includeScreenshots is true', async () => {
        mockCaseTriageService.triage.mockResolvedValue({ summary: 'Triage complete' });
        mockServiceNowTool.processAttachments.mockResolvedValue([
            { type: 'image', source: { data: 'screenshot1' } }
        ]);

        const result = await triageTool.triageCase({ sys_id: '123', includeScreenshots: true });

        expect(mockServiceNowTool.processAttachments).toHaveBeenCalledWith(
            'sn_customerservice_case',
            '123',
            true,
            { attachmentTypes: ['image/png', 'image/jpeg', 'image/gif', 'image/webp'], maxAttachments: 3 }
        );
        expect(result).toHaveProperty('_attachmentBlocks');
        expect(result._attachmentBlocks).toHaveLength(1);
    });

    it('should not fetch images when the feature is disabled, even if requested', async () => {
        triageTool.multimodalEnabled = false;
        mockCaseTriageService.triage.mockResolvedValue({ summary: 'Triage complete' });

        const result = await triageTool.triageCase({ sys_id: '123', includeScreenshots: true });

        expect(mockServiceNowTool.processAttachments).not.toHaveBeenCalled();
        expect(result).not.toHaveProperty('_attachmentBlocks');
    });

    it('should handle cases with no attachments gracefully', async () => {
        mockCaseTriageService.triage.mockResolvedValue({ summary: 'Triage complete' });
        mockServiceNowTool.processAttachments.mockResolvedValue([]);

        const result = await triageTool.triageCase({ sys_id: '123', includeScreenshots: true });

        expect(result.summary).toBe('Triage complete');
        expect(result._attachmentBlocks).toEqual([]);
    });

    it('should handle errors during screenshot fetching without breaking triage', async () => {
        mockCaseTriageService.triage.mockResolvedValue({ summary: 'Triage complete' });
        mockServiceNowTool.processAttachments.mockRejectedValue(new Error('SNOW error'));

        const result = await triageTool.triageCase({ sys_id: '123', includeScreenshots: true });

        // The main triage result should still be returned
        expect(result.summary).toBe('Triage complete');
        // No attachments should be added
        expect(result._attachmentBlocks).toEqual([]);
        // Should not throw an error
    });

    it('should return _attachmentBlocks with images when successful', async () => {
        const mockAttachments = [
            { type: 'image', source: { data: 'img1' } },
            { type: 'image', source: { data: 'img2' } },
        ];
        mockCaseTriageService.triage.mockResolvedValue({ summary: 'Triage complete' });
        mockServiceNowTool.processAttachments.mockResolvedValue(mockAttachments);

        const result = await triageTool.triageCase({ sys_id: '123', includeScreenshots: true });

        expect(result._attachmentBlocks).toEqual(mockAttachments);
    });
});

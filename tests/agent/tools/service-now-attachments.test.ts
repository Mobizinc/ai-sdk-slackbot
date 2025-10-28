
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { ServiceNowTool } from '../../../lib/tools/servicenow'; // Adjust path as needed
import { IServiceNowClient } from '../../../lib/services/servicenow/client'; // Adjust path as needed
import { optimizeBatch } from '../../../lib/utils/image-processing'; // Adjust path as needed

// Mock dependencies
vi.mock('../../../lib/utils/image-processing');

const mockServiceNowClient: IServiceNowClient = {
    getAttachments: vi.fn(),
    downloadAttachment: vi.fn(),
    getCase: vi.fn(),
    getIncident: vi.fn(),
    // Add other methods if the tool calls them
};

describe('ServiceNow Tool Attachment Logic', () => {
    let servicenowTool: ServiceNowTool;

    beforeEach(() => {
        servicenowTool = new ServiceNowTool();
        servicenowTool.serviceNowClient = mockServiceNowClient;
        servicenowTool.multimodalEnabled = true; // Default to enabled

        vi.clearAllMocks();
    });

    describe('processAttachments', () => {
        it('should return empty when feature is disabled', async () => {
            servicenowTool.multimodalEnabled = false;
            const attachments = await servicenowTool.processAttachments('case_table', 'sys_id_123', true);
            expect(attachments).toEqual([]);
            expect(mockServiceNowClient.getAttachments).not.toHaveBeenCalled();
        });

        it('should return empty when includeAttachments is false', async () => {
            const attachments = await servicenowTool.processAttachments('case_table', 'sys_id_123', false);
            expect(attachments).toEqual([]);
            expect(mockServiceNowClient.getAttachments).not.toHaveBeenCalled();
        });

        it('should fetch, optimize, and format images', async () => {
            const mockAttachments = [
                { sys_id: 'att1', file_name: 'a.jpg', content_type: 'image/jpeg' },
                { sys_id: 'att2', file_name: 'b.png', content_type: 'image/png' },
            ];
            (mockServiceNowClient.getAttachments as vi.Mock).mockResolvedValue(mockAttachments);
            (mockServiceNowClient.downloadAttachment as vi.Mock)
                .mockResolvedValueOnce(Buffer.from('jpeg_data'))
                .mockResolvedValueOnce(Buffer.from('png_data'));
            (optimizeBatch as vi.Mock).mockResolvedValue([
                { success: true, result: { base64Image: 'base64_jpeg', mediaType: 'image/jpeg' } },
                { success: true, result: { base64Image: 'base64_png', mediaType: 'image/png' } },
            ]);

            const processed = await servicenowTool.processAttachments('incident', 'inc_456', true);

            expect(processed.length).toBe(2);
            expect(processed[0].type).toBe('image');
            expect((processed[0] as any).source.data).toBe('base64_jpeg');
            expect(mockServiceNowClient.getAttachments).toHaveBeenCalledWith('incident', 'inc_456');
            expect(mockServiceNowClient.downloadAttachment).toHaveBeenCalledTimes(2);
            expect(optimizeBatch).toHaveBeenCalledTimes(1);
        });

        it('should respect maxAttachments limit', async () => {
            const mockAttachments = Array(5).fill(0).map((_, i) => ({
                sys_id: `att${i}`,
                file_name: `img${i}.jpg`,
                content_type: 'image/jpeg'
            }));
            (mockServiceNowClient.getAttachments as vi.Mock).mockResolvedValue(mockAttachments);

            await servicenowTool.processAttachments('problem', 'prb_789', true, { maxAttachments: 3 });

            expect(mockServiceNowClient.downloadAttachment).toHaveBeenCalledTimes(3);
        });

        it('should filter by attachmentTypes', async () => {
            const mockAttachments = [
                { sys_id: 'att1', file_name: 'a.jpg', content_type: 'image/jpeg' },
                { sys_id: 'att2', file_name: 'b.pdf', content_type: 'application/pdf' },
                { sys_id: 'att3', file_name: 'c.png', content_type: 'image/png' },
            ];
            (mockServiceNowClient.getAttachments as vi.Mock).mockResolvedValue(mockAttachments);

            await servicenowTool.processAttachments('change_request', 'chg_111', true, { attachmentTypes: ['image/jpeg'] });

            expect(mockServiceNowClient.downloadAttachment).toHaveBeenCalledTimes(1);
            expect(mockServiceNowClient.downloadAttachment).toHaveBeenCalledWith(mockAttachments[0]);
        });

        it('should skip unsupported formats', async () => {
            const mockAttachments = [
                { sys_id: 'att1', file_name: 'a.jpg', content_type: 'image/jpeg' },
                { sys_id: 'att2', file_name: 'b.txt', content_type: 'text/plain' },
            ];
            (mockServiceNowClient.getAttachments as vi.Mock).mockResolvedValue(mockAttachments);

            await servicenowTool.processAttachments('sc_req_item', 'ritm_222', true);

            expect(mockServiceNowClient.downloadAttachment).toHaveBeenCalledTimes(1);
            expect(mockServiceNowClient.downloadAttachment).toHaveBeenCalledWith(mockAttachments[0]);
        });

        it('should handle download errors gracefully', async () => {
            const mockAttachments = [{ sys_id: 'att1', file_name: 'a.jpg', content_type: 'image/jpeg' }];
            (mockServiceNowClient.getAttachments as vi.Mock).mockResolvedValue(mockAttachments);
            (mockServiceNowClien t.downloadAttachment as vi.Mock).mockRejectedValue(new Error('Download failed'));

            const processed = await servicenowTool.processAttachments('incident', 'inc_333', true);

            expect(processed.length).toBe(0);
            // Should not throw
        });

        it('should handle optimization errors', async () => {
            const mockAttachments = [{ sys_id: 'att1', file_name: 'a.jpg', content_type: 'image/jpeg' }];
            (mockServiceNowClient.getAttachments as vi.Mock).mockResolvedValue(mockAttachments);
            (mockServiceNowClient.downloadAttachment as vi.Mock).mockResolvedValue(Buffer.from('some_data'));
            (optimizeBatch as vi.Mock).mockResolvedValue([{ success: false, error: new Error('Opti failed') }]);

            const processed = await servicenowTool.processAttachments('incident', 'inc_444', true);

            expect(processed.length).toBe(0);
        });
    });

    describe('getCase and getIncident with attachments', () => {
        it('should return _attachmentBlocks when getCase is called with includeAttachments', async () => {
            const mockCase = { number: 'CASE001', short_description: 'Test case' };
            (mockServiceNowClient.getCase as vi.Mock).mockResolvedValue(mockCase);
            vi.spyOn(servicenowTool, 'processAttachments').mockResolvedValue([
                { type: 'image', source: { type: 'base64', media_type: 'image/jpeg', data: 'img_data' } }
            ]);

            const result = await servicenowTool.getCase({ sys_id: 'case_sys_id', includeAttachments: true });

            expect(result).toHaveProperty('_attachmentBlocks');
            expect(result._attachmentBlocks).toHaveLength(1);
            expect(servicenowTool.processAttachments).toHaveBeenCalledWith('sn_customerservice_case', 'case_sys_id', true, undefined);
        });

        it('should return _attachmentBlocks when getIncident is called with includeAttachments', async () => {
            const mockIncident = { number: 'INC001', short_description: 'Test incident' };
            (mockServiceNowClient.getIncident as vi.Mock).mockResolvedValue(mockIncident);
            vi.spyOn(servicenowTool, 'processAttachments').mockResolvedValue([
                { type: 'image', source: { type: 'base64', media_type: 'image/png', data: 'img_data_2' } }
            ]);

            const result = await servicenowTool.getIncident({ sys_id: 'inc_sys_id', includeAttachments: true });

            expect(result).toHaveProperty('_attachmentBlocks');
            expect(result._attachmentBlocks).toHaveLength(1);
            expect(servicenowTool.processAttachments).toHaveBeenCalledWith('incident', 'inc_sys_id', true, undefined);
        });
    });
});


import { describe, it, expect, beforeAll } from 'vitest';
import { ServiceNowClient } from '../../../lib/services/servicenow/client'; // Adjust path
import 'dotenv/config';

// This test requires a ServiceNow instance with a test case that has attachments.
// Set the following environment variables:
// SERVICENOW_INSTANCE_URL, SERVICENOW_USERNAME, SERVICENOW_PASSWORD
// TEST_CASE_WITH_ATTACHMENTS_SYS_ID

describe.skip('ServiceNow Attachment API Integration', () => {
    let client: ServiceNowClient;
    const testCaseSysId = process.env.TEST_CASE_WITH_ATTACHMENTS_SYS_ID;

    beforeAll(() => {
        if (!process.env.SERVICENOW_INSTANCE_URL || !process.env.SERVICENOW_USERNAME || !process.env.SERVICENOW_PASSWORD || !testCaseSysId) {
            throw new Error('Missing required environment variables for ServiceNow integration tests.');
        }
        client = new ServiceNowClient({
            instanceUrl: process.env.SERVICENOW_INSTANCE_URL,
            username: process.env.SERVICENOW_USERNAME,
            password: process.env.SERVICENOW_PASSWORD,
        });
    });

    it('should fetch real attachments from a test case', async () => {
        const attachments = await client.getAttachments('sn_customerservice_case', testCaseSysId!);
        expect(attachments).toBeInstanceOf(Array);
        expect(attachments.length).toBeGreaterThan(0);
        expect(attachments[0]).toHaveProperty('sys_id');
        expect(attachments[0]).toHaveProperty('file_name');
        expect(attachments[0]).toHaveProperty('content_type');
    });

    it('should return an empty array for a case with no attachments', async () => {
        // Assuming 'non_existent_sys_id' has no attachments or doesn't exist
        const attachments = await client.getAttachments('sn_customerservice_case', 'non_existent_sys_id');
        expect(attachments).toEqual([]);
    });

    it('should respect the limit parameter', async () => {
        const attachments = await client.getAttachments('sn_customerservice_case', testCaseSysId!, 1);
        expect(attachments.length).toBe(1);
    });

    it('should handle invalid table name', async () => {
        await expect(client.getAttachments('invalid_table', testCaseSysId!)).rejects.toThrow();
    });

    it('should download a real image file and return a valid Buffer', async () => {
        const attachments = await client.getAttachments('sn_customerservice_case', testCaseSysId!);
        const imageAttachment = attachments.find(a => a.content_type.startsWith('image/'));
        if (!imageAttachment) {
            throw new Error('Test case must have at least one image attachment.');
        }

        const buffer = await client.downloadAttachment(imageAttachment);
        expect(buffer).toBeInstanceOf(Buffer);
        expect(buffer.length).toBeGreaterThan(100); // Should have some data
    });

    it('should handle 404 errors when downloading a non-existent attachment', async () => {
        const fakeAttachment = { sys_id: 'fake_sys_id', content_type: 'image/jpeg', file_name: 'fake.jpg' };
        await expect(client.downloadAttachment(fakeAttachment)).rejects.toThrow('404');
    });
});

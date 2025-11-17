/**
 * Attachment Repository Implementation
 *
 * Provides attachment operations using ServiceNowHttpClient.
 */

import { ServiceNowHttpClient } from "../client/http-client";
import type { AttachmentRepository, AttachmentMetadata } from "./attachment-repository.interface";

/**
 * ServiceNow Attachment Repository Implementation
 */
export class ServiceNowAttachmentRepository implements AttachmentRepository {
  constructor(private readonly httpClient: ServiceNowHttpClient) {}

  /**
   * Find attachments for a specific record
   */
  async findByRecord(
    tableName: string,
    recordSysId: string,
    limit: number = 10
  ): Promise<AttachmentMetadata[]> {
    interface AttachmentResponse {
      result: Array<{
        sys_id: string;
        file_name: string;
        content_type: string;
        size_bytes: string;
        table_name: string;
        table_sys_id: string;
        sys_created_on: string;
        sys_created_by: string;
      }>;
    }

    const params = new URLSearchParams({
      sysparm_query: `table_name=${tableName}^table_sys_id=${recordSysId}`,
      sysparm_limit: limit.toString(),
      sysparm_fields: "sys_id,file_name,content_type,size_bytes,table_name,table_sys_id,sys_created_on,sys_created_by",
    });

    const response = await this.httpClient.get<AttachmentResponse>(
      `/api/now/attachment?${params.toString()}`
    );

    // HttpClient.get() returns ServiceNowTableResponse<T> which has a result property
    const results = (response as any).result || [];
    return results.map((attachment: any) => ({
      sys_id: attachment.sys_id,
      file_name: attachment.file_name,
      content_type: attachment.content_type,
      size_bytes: parseInt(attachment.size_bytes, 10),
      table_name: attachment.table_name,
      table_sys_id: attachment.table_sys_id,
      sys_created_on: attachment.sys_created_on,
      sys_created_by: attachment.sys_created_by,
    }));
  }

  /**
   * Download attachment binary content
   *
   * Note: Uses direct HTTP request as we need binary response, not JSON
   */
  async downloadById(attachmentSysId: string): Promise<Buffer> {
    // We need to make a raw HTTP request for binary data
    // The httpClient.request() method expects JSON, so we use the instance URL
    // and make our own fetch call with proper auth
    const instanceUrl = this.httpClient.getInstanceUrl();

    // Get auth from config (http client handles this internally)
    // For now, delegate back to the http client's request infrastructure
    // by making a call that returns the raw response
    const url = `/api/now/attachment/${attachmentSysId}/file`;

    // Use a workaround: make the request and handle the binary data
    const fullUrl = `${instanceUrl}${url}`;

    try {
      // The HTTP client's internal request method handles auth
      // We'll need to access it differently or keep minimal ServiceNowClient for downloads
      // TODO: Refactor HttpClient to expose a getRaw() or download() method

      // For now, throw an error indicating this needs HttpClient enhancement
      throw new Error(
        "AttachmentRepository.downloadById() requires HttpClient.getRaw() method. " +
        "This will be implemented in HttpClient refactoring."
      );
    } catch (error) {
      throw new Error(
        `Failed to download attachment ${attachmentSysId}: ${error instanceof Error ? error.message : String(error)}`
      );
    }
  }
}

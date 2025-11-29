/**
 * Attachment Repository Interface
 *
 * Provides operations for working with ServiceNow attachments across all tables.
 */

/**
 * Attachment metadata from ServiceNow
 */
export interface AttachmentMetadata {
  sys_id: string;
  file_name: string;
  size_bytes: number;
  content_type: string;
  table_name: string;
  table_sys_id: string;
  sys_created_on: string;
  sys_created_by: string;
}

/**
 * Repository interface for Attachment operations
 */
export interface AttachmentRepository {
  /**
   * Find attachments for a specific record
   *
   * @param tableName - ServiceNow table name (e.g., "incident", "sn_customerservice_case")
   * @param recordSysId - Record sys_id to fetch attachments for
   * @param limit - Maximum number of attachments to return (default: 10)
   * @returns Array of attachment metadata
   */
  findByRecord(
    tableName: string,
    recordSysId: string,
    limit?: number
  ): Promise<AttachmentMetadata[]>;

  /**
   * Download attachment binary content
   *
   * @param attachmentSysId - Attachment sys_id
   * @returns Buffer containing file content
   */
  downloadById(attachmentSysId: string): Promise<Buffer>;
}

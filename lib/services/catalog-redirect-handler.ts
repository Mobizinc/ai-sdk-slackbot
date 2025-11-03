/**
 * Catalog Redirect Handler
 * Handles automated redirection of misrouted HR requests to proper catalog items
 * Generates professional closure messages and updates ServiceNow
 */

import type { ServiceNowCatalogItem } from '../tools/servicenow';
import type { HRRequestType, HRDetectionResult } from './hr-request-detector';
import { serviceNowClient } from '../tools/servicenow';
import { closeIncidentsForCase } from './incident-sync-service';
import { getHRRequestDetector } from './hr-request-detector';
import { getClientSettingsRepository } from '../db/repositories/client-settings-repository';
import type { ClientSettings, NewCatalogRedirectLog } from '../db/schema';
import { config as appConfig } from '../config';
import { createSystemContext } from '../infrastructure/servicenow-context';

export interface RedirectConfig {
  enabled: boolean;
  confidenceThreshold: number; // 0-1, default 0.5
  closeState: string; // e.g., "Closed", "Resolved"
  closeCode?: string; // e.g., "Incorrectly Submitted"
  contactInfo?: string; // Support contact information
  autoCloseEnabled: boolean; // Whether to actually close the case
  notifySlack?: boolean; // Whether to send Slack notification
}

export interface RedirectResult {
  redirected: boolean;
  caseClosed: boolean;
  workNoteAdded: boolean;
  catalogItems: ServiceNowCatalogItem[];
  messageGenerated: string;
  error?: string;
}

interface MessageTemplateData {
  requestType: HRRequestType;
  caseNumber: string;
  catalogItems: ServiceNowCatalogItem[];
  contactInfo: string;
  confidence: number;
}

/**
 * Professional message templates for different HR request types
 */
const MESSAGE_TEMPLATES: Record<HRRequestType, (data: MessageTemplateData) => string> = {
  onboarding: (data) => `
Hello,

Thank you for contacting IT Support regarding a new employee onboarding request.

To ensure your request is processed efficiently, please submit this through our dedicated HR Request catalog which triggers automated provisioning:

📋 **Employee Onboarding Request**
${data.catalogItems.map(item => `   • ${item.name}\n     ${item.url}`).join('\n\n')}

**Why use the catalog?**
✅ **Automated Account Creation** - Active Directory account created automatically
✅ **License Provisioning** - M365 licenses assigned based on role
✅ **Email Setup** - Exchange mailbox configured with proper permissions
✅ **Access Provisioning** - System access granted based on department/role
✅ **Manager Notifications** - Automatic alerts to manager when complete
✅ **Complete Audit Trail** - Full documentation for compliance

**What information will be needed?**
• Employee name and contact details
• Start date and department
• Job title and manager
• Required system access and equipment
• License requirements (M365, Adobe, etc.)

This case (${data.caseNumber}) has been closed. Please resubmit using the catalog link above to trigger our automated onboarding workflow.

If you need assistance completing the form or have questions, please contact ${data.contactInfo}.

Thank you for your cooperation in helping us maintain an efficient onboarding process!

---
*This is an automated redirect. Confidence: ${Math.round(data.confidence * 100)}%*
`,

  termination: (data) => `
Hello,

Thank you for contacting IT Support regarding an employee termination/separation request.

For security and compliance, termination requests must be submitted through our formal HR Request catalog which triggers automated offboarding:

📋 **Employee Termination Request**
${data.catalogItems.map(item => `   • ${item.name}\n     ${item.url}`).join('\n\n')}

**Why this is critical:**
🔒 **Automated Account Disable** - Active Directory account disabled immediately
🔒 **License Revocation** - M365 and software licenses automatically reclaimed
📧 **Mailbox Conversion** - Email converted to shared mailbox automatically
👤 **Manager Access** - Manager granted access to shared mailbox for 30 days
🔐 **Access Revocation** - All system access revoked across all platforms
📋 **Compliance Audit Trail** - Complete documentation for SOC2/ISO requirements

**What information will be needed?**
• Employee name and contact details
• Last working day
• Manager name (for mailbox access)
• Equipment to be returned
• Any special data retention requirements

This case (${data.caseNumber}) has been closed. Please resubmit using the catalog link above to trigger our automated offboarding workflow.

For urgent terminations (security incidents), please contact ${data.contactInfo} immediately.

Thank you for maintaining our security and compliance standards!

---
*This is an automated redirect. Confidence: ${Math.round(data.confidence * 100)}%*
`,

  offboarding: (data) => `
Hello,

Thank you for contacting IT Support regarding user offboarding/deactivation.

To ensure proper access revocation and compliance, please submit this through our dedicated HR Request catalog which triggers automated offboarding:

📋 **Employee Offboarding Request**
${data.catalogItems.map(item => `   • ${item.name}\n     ${item.url}`).join('\n\n')}

**Why use the catalog?**
🔒 **Automated Account Disable** - Active Directory account disabled immediately
🔒 **License Revocation** - M365 and software licenses automatically reclaimed
📧 **Mailbox Conversion** - Email converted to shared mailbox for data retention
👤 **Manager Access** - Manager granted access to shared mailbox
🔐 **Access Revocation** - Systematic access removal across all systems
📋 **Compliance Audit Trail** - Complete documentation for security requirements

This case (${data.caseNumber}) has been closed. Please resubmit using the catalog link above to trigger our automated offboarding workflow.

If you need assistance or have urgent security concerns, please contact ${data.contactInfo}.

---
*This is an automated redirect. Confidence: ${Math.round(data.confidence * 100)}%*
`,

  new_account: (data) => `
Hello,

Thank you for contacting IT Support regarding a new user account request.

To ensure your request is processed efficiently, please submit this through our dedicated catalog which triggers automated provisioning:

📋 **New User Account Request**
${data.catalogItems.map(item => `   • ${item.name}\n     ${item.url}`).join('\n\n')}

**Why use the catalog?**
✅ **Automated Account Creation** - Active Directory account created automatically
✅ **License Provisioning** - M365 licenses assigned based on role
✅ **Email Setup** - Exchange mailbox configured with proper permissions
✅ **Access Provisioning** - System access granted based on department/role
✅ **Manager Approval Workflow** - Ensures proper authorization
✅ **Complete Audit Trail** - Full documentation for compliance

**What information will be needed?**
• User's full name and contact information
• Department and job title
• Manager approval
• Required system access (email, network, applications)
• Equipment needs
• Start date

This case (${data.caseNumber}) has been closed. Please resubmit using the catalog link above to trigger our automated provisioning workflow.

If you need assistance, please contact ${data.contactInfo}.

---
*This is an automated redirect. Confidence: ${Math.round(data.confidence * 100)}%*
`,

  account_modification: (data) => `
Hello,

Thank you for contacting IT Support regarding user account modifications.

To ensure proper authorization and documentation, please submit this through our dedicated catalog:

📋 **Account Modification Request**
${data.catalogItems.map(item => `   • ${item.name}\n     ${item.url}`).join('\n\n')}

**Why use the catalog?**
✅ Ensures proper management approval
✅ Clear documentation of changes
✅ Proper audit trail for compliance
✅ Faster processing with complete information

This case (${data.caseNumber}) has been closed. Please resubmit using the catalog link above.

If you need assistance, please contact ${data.contactInfo}.

---
*This is an automated redirect. Confidence: ${Math.round(data.confidence * 100)}%*
`,

  transfer: (data) => `
Hello,

Thank you for contacting IT Support regarding an employee transfer/role change.

To ensure proper coordination across departments and systems, please submit this through our dedicated catalog:

📋 **Employee Transfer Request**
${data.catalogItems.map(item => `   • ${item.name}\n     ${item.url}`).join('\n\n')}

**Why use the catalog?**
✅ Coordinates access changes across all systems
✅ Ensures smooth transition between departments
✅ Captures all required transfer details
✅ Proper approvals from both managers

This case (${data.caseNumber}) has been closed. Please resubmit using the catalog link above.

If you need assistance, please contact ${data.contactInfo}.

---
*This is an automated redirect. Confidence: ${Math.round(data.confidence * 100)}%*
`,
};

export class CatalogRedirectHandler {
  private config: RedirectConfig;
  private detector = getHRRequestDetector();
  private settingsRepository = getClientSettingsRepository();

  constructor(config?: Partial<RedirectConfig>) {
    this.config = {
      enabled: config?.enabled ?? appConfig.catalogRedirectEnabled,
      confidenceThreshold: config?.confidenceThreshold ?? appConfig.catalogRedirectConfidenceThreshold,
      closeState: config?.closeState ?? 'Resolved',
      closeCode: config?.closeCode ?? 'Incorrectly Submitted - Please Use Catalog',
      contactInfo: config?.contactInfo ?? (appConfig.supportContactInfo || 'your IT Support team'),
      autoCloseEnabled: config?.autoCloseEnabled ?? appConfig.catalogRedirectAutoClose,
      notifySlack: config?.notifySlack ?? appConfig.catalogRedirectNotifySlack,
    };
  }

  /**
   * Load client-specific settings from database with fallback to global config
   */
  private async loadClientConfig(clientId?: string): Promise<{
    config: RedirectConfig;
    customMappings?: any[];
  }> {
    // If no client ID, use global config
    if (!clientId) {
      return { config: this.config };
    }

    try {
      // Try to get client-specific settings from database
      const clientSettings = await this.settingsRepository.getClientSettings(clientId);

      if (!clientSettings) {
        console.log(`[CatalogRedirect] No client settings found for ${clientId}, using global defaults`);
        return { config: this.config };
      }

      // Merge client settings with global defaults
      const config: RedirectConfig = {
        enabled: clientSettings.catalogRedirectEnabled,
        confidenceThreshold: clientSettings.catalogRedirectConfidenceThreshold,
        closeState: this.config.closeState,
        closeCode: this.config.closeCode,
        contactInfo: clientSettings.supportContactInfo || this.config.contactInfo,
        autoCloseEnabled: clientSettings.catalogRedirectAutoClose,
        notifySlack: this.config.notifySlack,
      };

      return {
        config,
        customMappings: clientSettings.customCatalogMappings,
      };
    } catch (error) {
      console.error(`[CatalogRedirect] Error loading client settings for ${clientId}:`, error);
      // Fall back to global config on error
      return { config: this.config };
    }
  }

  /**
   * Process a case and determine if it should be redirected
   */
  async processCase(input: {
    caseNumber: string;
    caseSysId: string;
    shortDescription: string;
    description?: string;
    category?: string;
    subcategory?: string;
    companyId?: string;
    submittedBy?: string; // User who submitted the case
    clientName?: string; // Client name for logging
  }): Promise<RedirectResult> {
    const result: RedirectResult = {
      redirected: false,
      caseClosed: false,
      workNoteAdded: false,
      catalogItems: [],
      messageGenerated: '',
    };

    // Load client-specific config (or global defaults)
    const { config, customMappings } = await this.loadClientConfig(input.companyId);

    if (!config.enabled) {
      console.log('[CatalogRedirect] Redirect handler is disabled');
      return result;
    }

    // Detect if this is an HR request (using client-specific custom mappings if available)
    const detection = this.detector.detectHRRequest({
      shortDescription: input.shortDescription,
      description: input.description,
      category: input.category,
      subcategory: input.subcategory,
      customMappings: customMappings, // Pass client-specific keyword mappings
    });

    console.log(
      `[CatalogRedirect] Detection for ${input.caseNumber}: ` +
      `isHR=${detection.isHRRequest}, ` +
      `type=${detection.requestType}, ` +
      `confidence=${Math.round(detection.confidence * 100)}%, ` +
      `keywords=${detection.matchedKeywords.join(', ')}`
    );

    // Check if we should auto-redirect
    if (!this.detector.shouldAutoRedirect(detection, config.confidenceThreshold)) {
      console.log(
        `[CatalogRedirect] Not redirecting ${input.caseNumber}: ` +
        `confidence ${Math.round(detection.confidence * 100)}% below threshold ` +
        `${Math.round(config.confidenceThreshold * 100)}%`
      );
      return result;
    }

    try {
      // Fetch appropriate catalog items
      const catalogItems = await this.fetchCatalogItems(
        detection.requestType!,
        detection.suggestedCatalogItems
      );

      if (catalogItems.length === 0) {
        console.warn(
          `[CatalogRedirect] No catalog items found for ${detection.requestType}`
        );
        result.error = 'No catalog items found';
        return result;
      }

      result.catalogItems = catalogItems;

      // Generate professional message
      const message = this.generateMessage({
        requestType: detection.requestType!,
        caseNumber: input.caseNumber,
        catalogItems,
        contactInfo: config.contactInfo!,
        confidence: detection.confidence,
      });

      result.messageGenerated = message;

      // Create ServiceNow context for system operation (deterministic routing)
      const snContext = createSystemContext('catalog-redirect');

      // Add work note to ServiceNow
      try {
        await serviceNowClient.addCaseWorkNote(input.caseSysId, message, true, snContext);
        result.workNoteAdded = true;
        console.log(`[CatalogRedirect] Added work note to ${input.caseNumber}`);
      } catch (error) {
        console.error(`[CatalogRedirect] Failed to add work note:`, error);
        result.error = 'Failed to add work note';
        return result;
      }

      // Close the case if auto-close is enabled
      if (config.autoCloseEnabled) {
        try {
          await serviceNowClient.updateCase(
            input.caseSysId,
            {
              state: config.closeState,
              close_code: config.closeCode,
              close_notes: `Automatically closed - HR request must be submitted via catalog. See work notes for details.`,
            },
            snContext,
          );
          result.caseClosed = true;
          console.log(
            `[CatalogRedirect] Closed case ${input.caseNumber} with state: ${config.closeState}`
          );

          await closeIncidentsForCase(
            input.caseSysId,
            `Case ${input.caseNumber} closed after catalog redirect.`,
            snContext,
          );
        } catch (error) {
          console.error(`[CatalogRedirect] Failed to close case:`, error);
          result.error = error instanceof Error ? error.message : 'Failed to close case';
          return result;
        }
      }

      result.redirected = true;

      // Log redirect to database for metrics/reporting
      try {
        const logEntry: NewCatalogRedirectLog = {
          caseNumber: input.caseNumber,
          caseSysId: input.caseSysId,
          clientId: input.companyId,
          clientName: input.clientName,
          requestType: detection.requestType!,
          confidence: detection.confidence,
          confidenceThreshold: config.confidenceThreshold,
          catalogItemsProvided: catalogItems.length,
          catalogItemNames: catalogItems.map(item => item.name),
          caseClosed: result.caseClosed,
          closeState: result.caseClosed ? config.closeState : undefined,
          matchedKeywords: detection.matchedKeywords,
          submittedBy: input.submittedBy,
          shortDescription: input.shortDescription,
          category: input.category,
          subcategory: input.subcategory,
        };

        await this.settingsRepository.logRedirect(logEntry);
      } catch (error) {
        console.error(`[CatalogRedirect] Failed to log redirect to database:`, error);
        // Don't fail the redirect if logging fails
      }

      console.log(
        `[CatalogRedirect] Successfully redirected ${input.caseNumber} ` +
        `(type: ${detection.requestType}, closed: ${result.caseClosed})`
      );

      return result;
    } catch (error) {
      console.error(`[CatalogRedirect] Error processing case ${input.caseNumber}:`, error);
      result.error = error instanceof Error ? error.message : 'Unknown error';
      return result;
    }
  }

  /**
   * Fetch catalog items from ServiceNow
   */
  private async fetchCatalogItems(
    requestType: HRRequestType,
    suggestedNames: string[]
  ): Promise<ServiceNowCatalogItem[]> {
    const items: ServiceNowCatalogItem[] = [];

    // Create ServiceNow context for system operation (deterministic routing)
    const snContext = createSystemContext('catalog-redirect');

    // Try to fetch each suggested catalog item by name
    for (const name of suggestedNames) {
      try {
        const item = await serviceNowClient.getCatalogItemByName(name, snContext);
        if (item && item.active) {
          items.push(item);
        }
      } catch (error) {
        console.warn(`[CatalogRedirect] Failed to fetch catalog item "${name}":`, error);
      }
    }

    // If no items found by name, try keyword search
    if (items.length === 0) {
      try {
        const keywordItems = await serviceNowClient.getCatalogItems(
          {
            keywords: [requestType.replace('_', ' '), 'HR', 'employee'],
            active: true,
            limit: 3,
          },
          snContext,
        );
        items.push(...keywordItems);
      } catch (error) {
        console.error(`[CatalogRedirect] Failed to search catalog items:`, error);
      }
    }

    return items;
  }

  /**
   * Generate professional closure message
   */
  private generateMessage(data: MessageTemplateData): string {
    const template = MESSAGE_TEMPLATES[data.requestType];
    if (!template) {
      return this.generateGenericMessage(data);
    }
    return template(data);
  }

  /**
   * Generate generic message if no specific template exists
   */
  private generateGenericMessage(data: MessageTemplateData): string {
    return `
Hello,

Thank you for contacting IT Support regarding an HR-related request.

To ensure your request is processed efficiently with all required information, please submit this through our dedicated HR Request catalog:

${data.catalogItems.map(item => `📋 **${item.name}**\n   ${item.url}`).join('\n\n')}

**Why use the catalog?**
✅ Faster processing with proper routing
✅ Ensures all required information is captured
✅ Better tracking and audit trail
✅ Compliance with organizational policies

This case (${data.caseNumber}) has been closed. Please resubmit using the catalog link above.

If you need assistance, please contact ${data.contactInfo}.

Thank you for your cooperation!

---
*This is an automated redirect. Confidence: ${Math.round(data.confidence * 100)}%*
`;
  }

  /**
   * Get redirect statistics
   */
  getStats(): {
    enabled: boolean;
    confidenceThreshold: number;
    autoCloseEnabled: boolean;
  } {
    return {
      enabled: this.config.enabled,
      confidenceThreshold: this.config.confidenceThreshold,
      autoCloseEnabled: this.config.autoCloseEnabled,
    };
  }

  /**
   * Test redirect logic without actually closing case
   */
  async testRedirect(input: {
    shortDescription: string;
    description?: string;
    category?: string;
    subcategory?: string;
  }): Promise<{
    wouldRedirect: boolean;
    detection: HRDetectionResult;
    message?: string;
  }> {
    const detection = this.detector.detectHRRequest(input);
    const wouldRedirect = this.detector.shouldAutoRedirect(
      detection,
      this.config.confidenceThreshold
    );

    const shouldRedirect = !!wouldRedirect;

    let message: string | undefined;
    if (shouldRedirect && detection.requestType) {
      const mockCatalogItems: ServiceNowCatalogItem[] = detection.suggestedCatalogItems.map(
        (name, idx) => ({
          sys_id: `test-${idx}`,
          name,
          short_description: `Test catalog item for ${name}`,
          active: true,
          url: `https://example.service-now.com/sp?id=sc_cat_item&sys_id=test-${idx}`,
        })
      );

      message = this.generateMessage({
        requestType: detection.requestType,
        caseNumber: 'TEST0001',
        catalogItems: mockCatalogItems,
        contactInfo: this.config.contactInfo!,
        confidence: detection.confidence,
      });
    }

    return {
      wouldRedirect: shouldRedirect,
      detection,
      message,
    };
  }
}

// Singleton instance
let catalogRedirectHandler: CatalogRedirectHandler | null = null;

export function getCatalogRedirectHandler(): CatalogRedirectHandler {
  if (!catalogRedirectHandler) {
    catalogRedirectHandler = new CatalogRedirectHandler();
  }
  return catalogRedirectHandler;
}

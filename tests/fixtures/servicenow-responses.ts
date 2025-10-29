/**
 * ServiceNow Test Fixtures
 *
 * Canned responses from ServiceNow tools for use in tests.
 * These represent realistic payloads with pre-formatted summaries.
 */

/**
 * Sample case response with formatted caseSummary
 */
export const sampleCaseResponse = {
  case_id: "a1b2c3d4e5f678901234567890abcdef",
  number: "SCS0012345",
  caseSummary: `Summary

Email server down affecting 50 users in Finance department.

Current State

Status: Open
Priority: High (1-Critical)
Assigned: John Smith (IT Support)
SLA: 2 hours remaining

Latest Activity

• Oct 28, 14:23 – jsmith: Restarted Exchange service
• Oct 28, 14:45 – jsmith: Monitoring email flow
• Oct 28, 15:00 – System: SLA warning - 2 hours remaining

Context

This is a known issue affecting Exchange Online connectivity.
Similar cases: SCS0012300, SCS0012301
Customer: Contoso Corp (CSP: Mobiz)

References

<https://mobiz.service-now.com/nav_to.do?uri=sn_customerservice_case.do?sys_id=a1b2c3d4e5f678901234567890abcdef|SCS0012345>`,
  state: "Open",
  priority: "1",
  short_description: "Email server down for Finance department",
  description: "Users in Finance reporting they cannot send or receive emails since 2pm.",
  contact: {
    name: "Jane Doe",
    email: "jane.doe@contoso.com",
  },
  assigned_to: {
    name: "John Smith",
    email: "john.smith@mobizinc.com",
  },
  sys_created_on: "2025-10-28 14:00:00",
  sys_updated_on: "2025-10-28 15:00:00",
};

/**
 * Sample incident response with formatted incidentSummary
 */
export const sampleIncidentResponse = {
  incident_id: "b2c3d4e5f678901234567890abcdef01",
  number: "INC0045678",
  incidentSummary: `Summary

SharePoint site not accessible - 403 Forbidden error.

Current State

Status: In Progress
Priority: Moderate (3)
Assigned: Sarah Johnson (SharePoint Admin)
SLA: On track (4 hours remaining)

Latest Activity

• Oct 28, 13:15 – sjohnson: Checked site permissions
• Oct 28, 13:30 – sjohnson: Verified user access levels
• Oct 28, 13:45 – sjohnson: Found misconfigured security group

Context

Issue started after weekend maintenance window.
Affects Marketing team's SharePoint site.

References

<https://mobiz.service-now.com/nav_to.do?uri=incident.do?sys_id=b2c3d4e5f678901234567890abcdef01|INC0045678>`,
  state: "In Progress",
  priority: "3",
  short_description: "SharePoint site access denied",
  description: "Marketing team unable to access SharePoint site, receiving 403 error.",
  caller: {
    name: "Mark Wilson",
    email: "mark.wilson@customer.com",
  },
  assigned_to: {
    name: "Sarah Johnson",
    email: "sarah.johnson@mobizinc.com",
  },
  sys_created_on: "2025-10-28 13:00:00",
  sys_updated_on: "2025-10-28 13:45:00",
};

/**
 * Sample journal/work notes with formatted journalSummary
 */
export const sampleJournalResponse = {
  case_id: "a1b2c3d4e5f678901234567890abcdef",
  journalSummary: `Latest Activity

• Oct 28, 15:30 – jsmith: Escalated to Microsoft Support
• Oct 28, 15:15 – jsmith: Checked Azure Service Health - no outages
• Oct 28, 15:00 – System: SLA warning - 2 hours remaining
• Oct 28, 14:45 – jsmith: Monitoring email flow after restart
• Oct 28, 14:23 – jsmith: Restarted Exchange service`,
  entries: [
    {
      sys_created_on: "2025-10-28 15:30:00",
      sys_created_by: "jsmith",
      value: "Escalated to Microsoft Support - Ticket #MS-12345",
    },
    {
      sys_created_on: "2025-10-28 15:15:00",
      sys_created_by: "jsmith",
      value: "Checked Azure Service Health dashboard - no outages reported",
    },
    {
      sys_created_on: "2025-10-28 15:00:00",
      sys_created_by: "system",
      value: "SLA warning: 2 hours remaining until breach",
    },
  ],
};

/**
 * Sample search results with formatted casesSearchSummary
 */
export const sampleSearchResults = {
  cases: [
    {
      number: "SCS0012340",
      short_description: "Email connectivity issue",
      state: "Resolved",
      priority: "1",
    },
    {
      number: "SCS0012335",
      short_description: "Exchange server timeout",
      state: "Resolved",
      priority: "2",
    },
  ],
  casesSearchSummary: `Search Results

Found 2 related cases for "email server down":

• SCS0012340 – Email connectivity issue (Resolved, Priority: Critical)
• SCS0012335 – Exchange server timeout (Resolved, Priority: High)

Pattern: Both resolved by restarting Exchange service and verifying connectivity.`,
};

/**
 * Sample catalog items with formatted formattedItems
 */
export const sampleCatalogItems = {
  items: [
    {
      sys_id: "cat001",
      name: "New Laptop Request",
      category: "Hardware",
      price: "1200",
    },
    {
      sys_id: "cat002",
      name: "Software License Request",
      category: "Software",
      price: "299",
    },
  ],
  formattedItems: `Available Catalog Items

*Hardware*
• New Laptop Request – $1,200

*Software*
• Software License Request – $299`,
};

/**
 * Sample Microsoft Learn search result with key_points
 */
export const sampleMicrosoftLearnResult = {
  title: "Azure quota limits and increases",
  url: "https://learn.microsoft.com/azure/quotas/per-vm-quota-requests",
  key_points: [
    "Azure quotas limit resource deployment per region",
    "CSP subscriptions require Partner Center for quota requests",
    "Standard quota increases take 2-3 business days",
  ],
  excerpt:
    "Azure quotas are limits on resources you can deploy. For CSP subscriptions, quota requests must be submitted through Partner Center with Admin Agent role.",
};

/**
 * Sample similar cases search with pattern_summary
 */
export const sampleSimilarCasesResult = {
  pattern_summary: "SharePoint sync failing (authentication) - high priority",
  cases: [
    {
      number: "SCS0012200",
      description: "SharePoint sync authentication failure",
      resolution: "Reset user credentials and re-authenticate",
      priority: "High",
    },
    {
      number: "SCS0012150",
      description: "OneDrive sync stopped working",
      resolution: "Cleared local cache and re-synced",
      priority: "Medium",
    },
  ],
};

/**
 * Sample CMDB configuration item
 */
export const sampleCMDBItem = {
  sys_id: "cmdb001",
  name: "EXCH-PROD-01",
  ci_class: "cmdb_ci_email_server",
  operational_status: "Operational",
  environment: "Production",
  ip_address: "10.0.1.50",
  location: "US-East-DC1",
  owner: {
    name: "IT Operations",
    email: "itops@mobizinc.com",
  },
  relationships: [
    {
      type: "Depends on",
      target: "SQL-PROD-01",
    },
    {
      type: "Hosted on",
      target: "VMW-HOST-05",
    },
  ],
};

/**
 * Complete response example with all sections
 */
export const completeFormattedResponse = {
  case_id: "a1b2c3d4e5f678901234567890abcdef",
  number: "SCS0012345",
  caseSummary: `Summary

Email server down affecting 50 users in Finance department. Users cannot send or receive emails since 2pm.

Current State

Status: Open
Priority: High (1-Critical)
Assigned: John Smith (IT Support)
SLA: 2 hours remaining

Latest Activity

• Oct 28, 15:30 – jsmith: Escalated to Microsoft Support
• Oct 28, 15:15 – jsmith: Checked Azure Service Health - no outages
• Oct 28, 15:00 – System: SLA warning - 2 hours remaining
• Oct 28, 14:45 – jsmith: Monitoring email flow after restart
• Oct 28, 14:23 – jsmith: Restarted Exchange service

Context

This is a known issue affecting Exchange Online connectivity. Similar cases (SCS0012300, SCS0012301) were resolved by restarting Exchange and verifying Azure connectivity.

Customer: Contoso Corp (CSP: Mobiz)
Environment: Production Exchange Online
Impact: 50 users unable to send/receive email

References

<https://mobiz.service-now.com/nav_to.do?uri=sn_customerservice_case.do?sys_id=a1b2c3d4e5f678901234567890abcdef|SCS0012345>
<https://learn.microsoft.com/microsoft-365/enterprise/microsoft-365-exchange-monitoring|Exchange Online Monitoring>`,
};

/**
 * Minimal case response (for testing edge cases)
 */
export const minimalCaseResponse = {
  case_id: "minimal001",
  number: "SCS0099999",
  caseSummary: `Summary

Simple test case.

Current State

Status: New

Latest Activity

• Oct 28, 16:00 – System: Case created

Context

Test case for validation.

References

<https://mobiz.service-now.com/case|SCS0099999>`,
  state: "New",
  priority: "4",
  short_description: "Test case",
};

/**
 * Empty/null response (for testing error handling)
 */
export const emptyResponse = {
  case_id: null,
  number: null,
  caseSummary: null,
};

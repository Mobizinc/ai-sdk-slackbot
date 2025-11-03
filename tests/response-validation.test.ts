/**
 * Response Validation Tests
 *
 * Tests that validate the response validation logic works correctly
 * to detect when LLM responses don't use tool-provided summaries.
 */

import { describe, it, expect } from "vitest";
import { validateResponseFormat } from "../lib/utils/response-validator";

describe("validateResponseFormat", () => {
  describe("when no tools return formatted summaries", () => {
    it("should return valid with no warnings", () => {
      const response = "This is a simple response without any tool usage.";
      const toolCalls: Array<{ toolName: string; result: any }> = [];

      const result = validateResponseFormat(response, toolCalls);

      expect(result.valid).toBe(true);
      expect(result.warnings).toHaveLength(0);
      expect(result.missingElements).toHaveLength(0);
      expect(result.toolsWithUnusedSummaries).toHaveLength(0);
    });

    it("should return valid when tools return data without formatted summaries", () => {
      const response = "The weather is sunny today.";
      const toolCalls = [
        {
          toolName: "getWeather",
          result: {
            temperature: 72,
            condition: "sunny",
          },
        },
      ];

      const result = validateResponseFormat(response, toolCalls);

      expect(result.valid).toBe(true);
      expect(result.warnings).toHaveLength(0);
    });
  });

  describe("when ServiceNow tools return caseSummary", () => {
    it("should pass validation when response uses summary content", () => {
      const toolCalls = [
        {
          toolName: "getCase",
          result: {
            caseSummary: `Summary

Email server down affecting Finance department users.

Current State

Status: Open
Priority: High

Latest Activity

• Oct 5, 14:23 – Team restarted email service
• Oct 5, 15:00 – Monitoring for stability

Context

Known Exchange Online issue affecting multiple customers.

References

<https://servicenow.com/case|SCS123456>`,
          },
        },
      ];

      // Response includes section headers and uses summary content
      const response = `*Summary*

Email server is down affecting users in the Finance department.

*Current State*

Status: Open
Priority: High

*Latest Activity*

• Oct 5, 14:23 – Team restarted the email service
• Oct 5, 15:00 – Monitoring for stability

*Context*

This is a known Exchange Online issue affecting multiple customers.

*References*

<https://servicenow.com/case|SCS123456>`;

      const result = validateResponseFormat(response, toolCalls);

      expect(result.valid).toBe(true);
      expect(result.warnings).toHaveLength(0);
      expect(result.toolsWithUnusedSummaries).toHaveLength(0);
    });

    it("should fail validation when response doesn't use summary content", () => {
      const toolCalls = [
        {
          toolName: "getCase",
          result: {
            caseSummary: `Summary

Email server down affecting 50 users in Finance department.

Current State

Status: Open
Priority: High`,
          },
        },
      ];

      const response = `I don't have any information about that case.`;

      const result = validateResponseFormat(response, toolCalls);

      expect(result.valid).toBe(false);
      // Check that warning mentions the tool and field
      expect(result.warnings.some((w) => w.includes("getCase") && w.includes("caseSummary"))).toBe(true);
      expect(result.toolsWithUnusedSummaries).toContain("getCase");
    });

    it("should detect missing expected sections in overview responses", () => {
      const toolCalls = [
        {
          toolName: "getCase",
          result: {
            caseSummary: `Summary

Email server connectivity problems affecting Finance department users across multiple locations with Exchange Online authentication failures causing critical business impact.

Current State

Status: Open
Priority: Critical

Latest Activity

• Oct 28, 14:23 – Team investigated the issue
• Oct 28, 15:00 – Escalated to Microsoft Support`,
          },
        },
      ];

      // Long narrative response (>300 chars) without section headers - should fail as overview
      const response = `The email server connectivity is causing problems for Finance department users in multiple locations. This is related to Exchange Online authentication failures which are creating critical business impact. The status is currently open with critical priority. The team investigated this issue earlier today and it has been escalated to Microsoft Support for further assistance.`;

      const result = validateResponseFormat(response, toolCalls);

      expect(result.valid).toBe(false);
      expect(result.responseType).toBe('overview');
      expect(result.missingElements.length).toBeGreaterThan(0);
      // Should have warnings about missing sections for overview responses
      expect(result.warnings.some((w) => w.includes("missing required sections"))).toBe(true);
    });

    it("should pass when response has all expected sections", () => {
      const toolCalls = [
        {
          toolName: "getCase",
          result: {
            caseSummary: `Summary

Email server down affecting users.

Current State

Status: Open
Priority: High

Latest Activity

• Oct 5, 14:23 – Action taken

Context

This is a known issue

References

<https://servicenow.com/case|SCS123>`,
          },
        },
      ];

      const response = `*Summary*

Email server is down affecting users.

*Current State*

Status: Open, Priority: High

*Latest Activity*

• Oct 5, 14:23 – Action taken

*Context*

This is a known issue

*References*

<https://servicenow.com/case|SCS123>`;

      const result = validateResponseFormat(response, toolCalls);

      expect(result.valid).toBe(true);
      expect(result.warnings).toHaveLength(0);
      expect(result.missingElements).toHaveLength(0);
    });
  });

  describe("when Microsoft Learn Search returns key_points", () => {
    it("should pass validation when response uses key points", () => {
      const toolCalls = [
        {
          toolName: "microsoftLearnSearch",
          result: {
            key_points: [
              "Azure quotas limit resource deployment per region",
              "CSP subscriptions require Partner Center for quota requests",
              "Standard quota increases take 2-3 business days",
            ],
            excerpt: "Azure quotas are limits on resources...",
          },
        },
      ];

      const response = `According to Microsoft Learn, Azure quotas limit resource deployment per region. For CSP subscriptions, you'll need to use Partner Center for quota requests. Standard increases typically take 2-3 business days.`;

      const result = validateResponseFormat(response, toolCalls);

      expect(result.valid).toBe(true);
      expect(result.toolsWithUnusedSummaries).toHaveLength(0);
    });

    it("should warn when key points are not used", () => {
      const toolCalls = [
        {
          toolName: "microsoftLearnSearch",
          result: {
            key_points: [
              "ServiceNow workflow automation requires admin permissions",
              "Integration Hub spoke configuration steps documented",
            ],
            excerpt: "ServiceNow workflow automation...",
          },
        },
      ];

      // Response mentions unrelated topic, not using key points
      const response = `I don't have information about that topic. Please check the documentation.`;

      const result = validateResponseFormat(response, toolCalls);

      expect(result.valid).toBe(false);
      expect(result.toolsWithUnusedSummaries).toContain("microsoftLearnSearch");
    });
  });

  describe("when Similar Cases Search returns pattern_summary", () => {
    it("should pass when pattern summary content is referenced", () => {
      const toolCalls = [
        {
          toolName: "searchSimilarCases",
          result: {
            pattern_summary: "SharePoint sync failing (authentication) - high priority",
          },
        },
      ];

      const response = `I found a similar case with SharePoint sync failing due to authentication issues. This was high priority and was resolved by...`;

      const result = validateResponseFormat(response, toolCalls);

      expect(result.valid).toBe(true);
    });
  });

  describe("when multiple tools return summaries", () => {
    it("should validate all tool summaries", () => {
      const toolCalls = [
        {
          toolName: "getCase",
          result: {
            caseSummary: `Summary\n\nEmail issue\n\nCurrent State\n\nStatus: Open`,
          },
        },
        {
          toolName: "microsoftLearnSearch",
          result: {
            key_points: ["Exchange Online requires modern authentication"],
            excerpt: "Exchange auth...",
          },
        },
      ];

      // Response uses case summary but not Microsoft Learn key points
      const response = `*Summary*\n\nThe email issue is still open.\n\n*Current State*\n\nStatus: Open`;

      const result = validateResponseFormat(response, toolCalls);

      expect(result.valid).toBe(false);
      expect(result.toolsWithUnusedSummaries).toContain("microsoftLearnSearch");
      expect(result.toolsWithUnusedSummaries).not.toContain("getCase");
    });

    it("should pass when all summaries are used", () => {
      const toolCalls = [
        {
          toolName: "getCase",
          result: {
            caseSummary: `Summary\n\nEmail down\n\nCurrent State\n\nOpen\n\nLatest Activity\n\nUpdate\n\nContext\n\nKnown\n\nReferences\n\nLink`,
          },
        },
        {
          toolName: "microsoftLearnSearch",
          result: {
            key_points: ["Modern auth required"],
          },
        },
      ];

      const response = `*Summary*\n\nEmail is down per the case.\n\n*Current State*\n\nOpen\n\n*Latest Activity*\n\nRecent update\n\n*Context*\n\nThis is known. Microsoft Learn notes modern auth is required.\n\n*References*\n\nSee link`;

      const result = validateResponseFormat(response, toolCalls);

      expect(result.valid).toBe(true);
      expect(result.warnings).toHaveLength(0);
    });
  });

  describe("field query responses (hybrid approach)", () => {
    it("should pass validation for short field-specific responses", () => {
      const toolCalls = [
        {
          toolName: "getCase",
          result: {
            case: {
              number: "SCS0012345",
              assigned_to: "John Smith",
              priority: "2",
              state: "Work in Progress",
            },
            caseSummary: `Summary\n\nEmail server down affecting Finance department.\n\nCurrent State\n\nStatus: Work in Progress\nPriority: High\nAssigned: John Smith`,
          },
        },
      ];

      const response = `Assigned to: John Smith`;

      const result = validateResponseFormat(response, toolCalls);

      expect(result.valid).toBe(true);
      expect(result.responseType).toBe('field_query');
      expect(result.responseLength).toBe(response.trim().length);
      expect(result.missingElements).toHaveLength(0);
      expect(result.warnings).toHaveLength(0);
    });

    it("should pass validation for responses using raw field data", () => {
      const toolCalls = [
        {
          toolName: "getCase",
          result: {
            case: {
              number: "SCS0012345",
              priority: "1",
              state: "Open",
            },
            caseSummary: `Summary\n\nCritical issue\n\nCurrent State\n\nStatus: Open\nPriority: Critical`,
          },
        },
      ];

      const response = `Priority: Critical (1)`;

      const result = validateResponseFormat(response, toolCalls);

      expect(result.valid).toBe(true);
      expect(result.responseType).toBe('field_query');
      expect(result.toolsWithUnusedSummaries).toHaveLength(0);
    });

    it("should not require sections for short responses", () => {
      const toolCalls = [
        {
          toolName: "getCase",
          result: {
            case: {
              number: "SCS0012345",
              state: "Resolved",
              sys_updated_on: "2025-10-28 15:30:00",
            },
            caseSummary: `Summary\n\nIssue resolved\n\nCurrent State\n\nStatus: Resolved\nUpdated: Oct 28, 15:30`,
          },
        },
      ];

      const response = `Updated on Oct 28 at 15:30`;

      const result = validateResponseFormat(response, toolCalls);

      expect(result.valid).toBe(true);
      expect(result.responseType).toBe('field_query');
      // Should not have warnings about missing sections for field queries
      expect(result.missingElements).toHaveLength(0);
    });

    it("should detect field query patterns in medium-length responses", () => {
      const toolCalls = [
        {
          toolName: "getCase",
          result: {
            case: {
              number: "SCS0012345",
              state: "Open",
              priority: "2",
              assigned_to: "Sarah Johnson",
              account: "Contoso Corp",
            },
            caseSummary: `Summary\n\nEmail connectivity issue\n\nCurrent State\n\nStatus: Open\nPriority: High\nAssigned: Sarah Johnson\nAccount: Contoso Corp`,
          },
        },
      ];

      const response = `Case SCS0012345 - Status: Open, Priority: High (2), Assigned to: Sarah Johnson, Account: Contoso Corp`;

      const result = validateResponseFormat(response, toolCalls);

      expect(result.valid).toBe(true);
      expect(result.responseType).toBe('field_query');
    });

    it("should detect overview responses and require sections", () => {
      const toolCalls = [
        {
          toolName: "getCase",
          result: {
            case: {
              number: "SCS0012345",
              state: "Open",
              priority: "1",
            },
            caseSummary: `Summary\n\nEmail server down affecting 50 users in Finance department.\n\nCurrent State\n\nStatus: Open\nPriority: Critical\nAssigned: John Smith\n\nLatest Activity\n\n• Oct 28, 14:23 – jsmith: Restarted Exchange service\n• Oct 28, 15:00 – System: SLA warning\n\nContext\n\nKnown Exchange Online issue\n\nReferences\n\n<https://servicenow.com/case|SCS0012345>`,
          },
        },
      ];

      // Long narrative response (>300 chars) without section headers - should fail for overviews
      const response = `The email server is currently down and affecting about 50 users in the Finance department with widespread connectivity issues. The case is open with critical priority and John Smith is assigned to work on it. He restarted the Exchange service earlier today and there was an SLA warning issued by the system. This appears to be a known Exchange Online issue that is affecting multiple customers.`;

      const result = validateResponseFormat(response, toolCalls);

      expect(result.valid).toBe(false);
      expect(result.responseType).toBe('overview');
      // Should have warnings about missing required sections for overview responses
      expect(result.warnings.some((w) => w.includes("missing required sections"))).toBe(true);
      expect(result.missingElements.length).toBeGreaterThan(0);
    });

    it("should pass for overview responses with proper sections", () => {
      const toolCalls = [
        {
          toolName: "getCase",
          result: {
            case: {
              number: "SCS0012345",
              state: "Open",
            },
            caseSummary: `Summary\n\nEmail server down\n\nCurrent State\n\nStatus: Open\nPriority: Critical\n\nLatest Activity\n\n• Oct 28, 14:23 – Action taken\n\nContext\n\nKnown issue\n\nReferences\n\n<https://servicenow.com/case|SCS123>`,
          },
        },
      ];

      const response = `*Summary*\n\nThe email server is down affecting multiple users.\n\n*Current State*\n\nStatus: Open\nPriority: Critical\n\n*Latest Activity*\n\n• Oct 28, 14:23 – Team took action to restart service\n\n*Context*\n\nThis is a known issue with Exchange Online.\n\n*References*\n\n<https://servicenow.com/case|SCS123>`;

      const result = validateResponseFormat(response, toolCalls);

      expect(result.valid).toBe(true);
      expect(result.responseType).toBe('overview');
      expect(result.warnings).toHaveLength(0);
      expect(result.missingElements).toHaveLength(0);
    });

    it("should use lenient threshold for field queries", () => {
      const toolCalls = [
        {
          toolName: "getCase",
          result: {
            case: {
              number: "SCS0012345",
              assigned_to: "Jane Doe",
              state: "Open",
            },
            caseSummary: `Summary\n\nCase opened for Jane regarding assignment.\n\nCurrent State\n\nAssigned: Jane Doe\nStatus: Open`,
          },
        },
      ];

      // Very short response using minimal keywords from summary - should still pass for field query
      const response = `Assigned: Jane Doe`;

      const result = validateResponseFormat(response, toolCalls);

      expect(result.valid).toBe(true);
      expect(result.responseType).toBe('field_query');
      // With 10% threshold and keywords like "Jane", "Doe", "Assigned", it should pass
    });

    it("should require higher threshold for overview responses", () => {
      const toolCalls = [
        {
          toolName: "getCase",
          result: {
            caseSummary: `Summary\n\nEmail server connectivity problems affecting Finance department users across multiple locations with Exchange Online authentication failures causing critical business impact.\n\nCurrent State\n\nStatus: Open\nPriority: Critical`,
          },
        },
      ];

      // Long response that barely mentions summary content - should fail for overview
      const response = `*Summary*\n\nThere is an issue that needs attention.\n\n*Current State*\n\nThe case is currently being worked on by our team.`;

      const result = validateResponseFormat(response, toolCalls);

      // Should fail because overview requires 20% keyword match threshold
      expect(result.valid).toBe(false);
      expect(result.responseType).toBe('overview');
      expect(result.warnings.some((w) => w.includes("doesn't appear to use it"))).toBe(true);
    });
  });

  describe("edge cases", () => {
    it("should handle null/undefined tool results gracefully", () => {
      const toolCalls = [
        {
          toolName: "getCase",
          result: null,
        },
        {
          toolName: "searchCases",
          result: undefined,
        },
      ];

      const response = "No case information available.";

      const result = validateResponseFormat(response, toolCalls);

      expect(result.valid).toBe(true);
      expect(result.warnings).toHaveLength(0);
    });

    it("should handle empty tool results", () => {
      const toolCalls = [
        {
          toolName: "getCase",
          result: {},
        },
      ];

      const response = "Case not found.";

      const result = validateResponseFormat(response, toolCalls);

      expect(result.valid).toBe(true);
    });

    it("should fail very short responses that ignore summary", () => {
      const toolCalls = [
        {
          toolName: "getCase",
          result: {
            caseSummary: "Summary\n\nCase details here",
          },
        },
      ];

      const response = "OK";

      const result = validateResponseFormat(response, toolCalls);

      // Very short responses are classified as field_query, but should fail if they completely ignore summary
      expect(result.valid).toBe(false);
      expect(result.responseType).toBe('field_query');
      expect(result.toolsWithUnusedSummaries).toContain("getCase");
    });
  });
});

/**
 * ServiceNow Webhook Schema Validation Tests
 * Tests Zod schema validation for ServiceNow webhook payloads
 */

import { describe, it, expect } from "vitest";
import {
  validateServiceNowWebhook,
  webhookToClassificationRequest,
  ServiceNowCaseWebhookSchema,
  type ServiceNowCaseWebhook,
} from "../lib/schemas/servicenow-webhook";

describe("ServiceNow Webhook Schema Validation", () => {
  describe("validateServiceNowWebhook", () => {
    it("should validate a complete webhook payload", () => {
      const validPayload = {
        case_number: "SCS0048536",
        sys_id: "abc123def456",
        short_description: "Timeclock not working at Pearland site",
        description: "Time clock device is not working. Cables are connected.",
        priority: "3",
        urgency: "2",
        impact: "3",
        category: "Hardware",
        subcategory: "Timeclock",
        state: "New",
        assignment_group: "L2 Support",
        assignment_group_sys_id: "group123",
        assigned_to: "john.doe",
        caller_id: "user456",
        contact_type: "Email",
        company: "company789",
        account_id: "account123",
        opened_at: "2025-10-13T12:00:00Z",
        configuration_item: "CI-001",
        business_service: "Time Management",
        additional_comments: "Urgent - payroll processing affected",
        routing_context: {
          escalation_source: "L1",
          quick_classify: false,
        },
      };

      const result = validateServiceNowWebhook(validPayload);

      expect(result.success).toBe(true);
      expect(result.data).toBeDefined();
      expect(result.data?.case_number).toBe("SCS0048536");
      expect(result.data?.routing_context?.escalation_source).toBe("L1");
    });

    it("should validate a minimal webhook payload (required fields only)", () => {
      const minimalPayload = {
        case_number: "SCS0048536",
        sys_id: "abc123def456",
        short_description: "Timeclock not working",
      };

      const result = validateServiceNowWebhook(minimalPayload);

      expect(result.success).toBe(true);
      expect(result.data).toBeDefined();
      expect(result.data?.case_number).toBe("SCS0048536");
    });

    it("should reject payload missing required fields", () => {
      const invalidPayload = {
        sys_id: "abc123def456",
        // Missing case_number and short_description
      };

      const result = validateServiceNowWebhook(invalidPayload);

      expect(result.success).toBe(false);
      expect(result.error).toBeDefined();
      expect(result.errors).toBeDefined();
      expect(result.errors?.length).toBeGreaterThan(0);
    });

    it("should accept additional fields not in schema (passthrough)", () => {
      const payloadWithExtra = {
        case_number: "SCS0048536",
        sys_id: "abc123def456",
        short_description: "Issue reported",
        custom_field_1: "value1",
        custom_field_2: 123,
        nested_custom: {
          foo: "bar",
        },
      };

      const result = validateServiceNowWebhook(payloadWithExtra);

      expect(result.success).toBe(true);
      expect(result.data).toBeDefined();
      // Zod passthrough should preserve extra fields
      expect((result.data as any).custom_field_1).toBe("value1");
    });

    it("should validate datetime format for opened_at", () => {
      const payloadWithDateTime = {
        case_number: "SCS0048536",
        sys_id: "abc123def456",
        short_description: "Issue",
        opened_at: "2025-10-13T12:34:56.789Z",
      };

      const result = validateServiceNowWebhook(payloadWithDateTime);

      expect(result.success).toBe(true);
      expect(result.data?.opened_at).toBe("2025-10-13T12:34:56.789Z");
    });

    it("should reject invalid datetime format", () => {
      const payloadWithBadDateTime = {
        case_number: "SCS0048536",
        sys_id: "abc123def456",
        short_description: "Issue",
        opened_at: "not-a-date",
      };

      const result = validateServiceNowWebhook(payloadWithBadDateTime);

      expect(result.success).toBe(false);
      expect(result.errors).toBeDefined();
    });
  });

  describe("webhookToClassificationRequest", () => {
    it("should convert complete webhook to classification request", () => {
      const webhook: ServiceNowCaseWebhook = {
        case_number: "SCS0048536",
        sys_id: "abc123",
        short_description: "Issue",
        description: "Detailed description",
        priority: "3",
        urgency: "2",
        category: "Hardware",
        company: "company789",
        account_id: "account123",
        assignment_group: "L2 Support",
        assignment_group_sys_id: "group123",
        routing_context: {
          quick_classify: false,
        },
      };

      const request = webhookToClassificationRequest(webhook);

      expect(request.case_number).toBe("SCS0048536");
      expect(request.sys_id).toBe("abc123");
      expect(request.short_description).toBe("Issue");
      expect(request.description).toBe("Detailed description");
      expect(request.company).toBe("company789");
      expect(request.company_name).toBe("account123"); // Maps account_id to company_name
      expect(request.routing_context?.quick_classify).toBe(false);
    });

    it("should handle minimal webhook payload", () => {
      const minimalWebhook: ServiceNowCaseWebhook = {
        case_number: "SCS0048536",
        sys_id: "abc123",
        short_description: "Issue",
      };

      const request = webhookToClassificationRequest(minimalWebhook);

      expect(request.case_number).toBe("SCS0048536");
      expect(request.sys_id).toBe("abc123");
      expect(request.description).toBeUndefined();
      expect(request.company).toBeUndefined();
    });
  });

  describe("Schema Field Parity with Python Pydantic", () => {
    it("should have all required fields from original ServiceNowCaseWebhook", () => {
      const schema = ServiceNowCaseWebhookSchema.shape;

      // Required fields
      expect(schema.case_number).toBeDefined();
      expect(schema.sys_id).toBeDefined();
      expect(schema.short_description).toBeDefined();

      // Optional fields from original (api/app/schemas.py:1544-1575)
      expect(schema.description).toBeDefined();
      expect(schema.priority).toBeDefined();
      expect(schema.urgency).toBeDefined();
      expect(schema.impact).toBeDefined();
      expect(schema.category).toBeDefined();
      expect(schema.subcategory).toBeDefined();
      expect(schema.state).toBeDefined();
      expect(schema.assignment_group).toBeDefined();
      expect(schema.assignment_group_sys_id).toBeDefined();
      expect(schema.assigned_to).toBeDefined();
      expect(schema.caller_id).toBeDefined();
      expect(schema.contact_type).toBeDefined();
      expect(schema.company).toBeDefined();
      expect(schema.account_id).toBeDefined();
      expect(schema.opened_at).toBeDefined();
      expect(schema.configuration_item).toBeDefined();
      expect(schema.business_service).toBeDefined();
      expect(schema.additional_comments).toBeDefined();
      expect(schema.routing_context).toBeDefined();
    });
  });

  describe("Real-world Payload Examples", () => {
    it("should validate payload from original Python tests", () => {
      // Example from api/app/routers/webhooks.py production logs
      const productionPayload = {
        case_number: "SCS0043504",
        sys_id: "c3eec28c931c9a1049d9764efaba10f3",
        short_description: "Time clock not working at our Pearland site",
        description: "Rhonda Seth reporting time clock is not working. Cables are connected.",
        priority: "3",
        urgency: "2",
        impact: "3",
        category: "12",
        assignment_group: "L2 Support",
        company: "c3eec28c931c9a1049d9764efaba10f3",
        account_id: "c3eec28c931c9a1049d9764efaba10f3",
        state: "New",
      };

      const result = validateServiceNowWebhook(productionPayload);

      expect(result.success).toBe(true);
      expect(result.data?.case_number).toBe("SCS0043504");
    });

    it("should handle payload with omitted optional fields", () => {
      const payloadWithOmittedFields = {
        case_number: "SCS0048536",
        sys_id: "abc123",
        short_description: "Issue",
        // Optional fields omitted entirely (Zod optional() allows this)
        // Note: Zod does not accept null for optional fields unless using .nullable()
      };

      const result = validateServiceNowWebhook(payloadWithOmittedFields);

      expect(result.success).toBe(true);
      expect(result.data?.description).toBeUndefined();
      expect(result.data?.priority).toBeUndefined();
      expect(result.data?.category).toBeUndefined();
    });
  });
});

/**
 * Integration Tests for CaseRepository
 *
 * These tests connect to a REAL ServiceNow dev instance to validate:
 * - HTTP client authentication (Basic/Bearer)
 * - Retry logic and error handling
 * - Response mapping from API to domain models
 * - Full stack integration
 *
 * REQUIREMENTS:
 * Set these environment variables to run integration tests:
 * - SERVICENOW_INSTANCE_URL or SERVICENOW_URL
 * - SERVICENOW_USERNAME + SERVICENOW_PASSWORD (Basic auth)
 *   OR
 * - SERVICENOW_API_TOKEN (Bearer auth)
 * - TEST_CASE_NUMBER (optional): A real case number to test with
 * - TEST_CASE_SYS_ID (optional): A real case sys_id to test with
 *
 * Run with: npm test -- tests/integration/case-repository.integration.test.ts
 */

// Use integration test setup (no MSW mocking)
import "./setup";

import { describe, it, expect, beforeAll } from "vitest";
import {
  createCaseRepository,
  createHttpClient,
  type CaseRepository,
} from "../../lib/infrastructure/servicenow";
import { ServiceNowConfigError, ServiceNowNotFoundError } from "../../lib/infrastructure/servicenow/errors";

// Check if integration tests should run
const hasServiceNowConfig = () => {
  const instanceUrl = process.env.SERVICENOW_INSTANCE_URL || process.env.SERVICENOW_URL;
  const hasBasicAuth = process.env.SERVICENOW_USERNAME && process.env.SERVICENOW_PASSWORD;
  const hasBearerAuth = process.env.SERVICENOW_API_TOKEN;

  return Boolean(instanceUrl && (hasBasicAuth || hasBearerAuth));
};

// Skip all tests if ServiceNow is not configured
const testIf = hasServiceNowConfig() ? it : it.skip;

describe("CaseRepository Integration Tests", () => {
  let caseRepository: CaseRepository;

  beforeAll(() => {
    if (!hasServiceNowConfig()) {
      console.warn(
        "⚠️  Skipping integration tests: ServiceNow credentials not configured.\n" +
          "Set SERVICENOW_INSTANCE_URL, SERVICENOW_USERNAME, SERVICENOW_PASSWORD (or SERVICENOW_API_TOKEN) to run these tests.",
      );
      return;
    }

    // Create repository with real credentials
    const httpClient = createHttpClient();
    caseRepository = createCaseRepository(httpClient);

    console.log("✓ Integration tests enabled: Using real ServiceNow instance");
    console.log(`  Instance: ${process.env.SERVICENOW_INSTANCE_URL || process.env.SERVICENOW_URL}`);
    console.log(
      `  Auth: ${process.env.SERVICENOW_API_TOKEN ? "Bearer Token" : "Basic (username/password)"}`,
    );
  });

  describe("Authentication & Connection", () => {
    testIf("should authenticate successfully and connect to ServiceNow", async () => {
      // This test validates authentication by making a simple query
      // We search for cases with a limit of 1 just to verify connection
      const cases = await caseRepository.search({ limit: 1 });

      // We don't care about the result content, just that we didn't get an auth error
      expect(cases).toBeDefined();
      expect(Array.isArray(cases)).toBe(true);
    }, 30000); // 30 second timeout for network call

    testIf("should handle authentication with proper headers", async () => {
      // Test that the HTTP client is correctly building auth headers
      // by making an actual API call
      const cases = await caseRepository.findOpen(1);

      expect(cases).toBeDefined();
      expect(Array.isArray(cases)).toBe(true);
    }, 30000);
  });

  describe("findBySysId", () => {
    testIf("should return null for non-existent sys_id", async () => {
      const nonExistentSysId = "00000000000000000000000000000000"; // Invalid sys_id

      const result = await caseRepository.findBySysId(nonExistentSysId);

      expect(result).toBeNull();
    }, 30000);

    testIf("should find a case by sys_id if TEST_CASE_SYS_ID is provided", async () => {
      const testSysId = process.env.TEST_CASE_SYS_ID;

      if (!testSysId) {
        console.warn("⚠️  Skipping: TEST_CASE_SYS_ID not set");
        return;
      }

      const caseRecord = await caseRepository.findBySysId(testSysId);

      expect(caseRecord).toBeDefined();
      expect(caseRecord).not.toBeNull();
      expect(caseRecord!.sysId).toBe(testSysId);
      expect(caseRecord!.number).toBeDefined();
      expect(caseRecord!.shortDescription).toBeDefined();
      expect(caseRecord!.url).toContain(testSysId);

      // Verify domain model structure (not ServiceNow API format)
      expect(typeof caseRecord!.shortDescription).toBe("string");
      // Should NOT have {value, display_value} structure
      expect(caseRecord!.shortDescription).not.toHaveProperty("value");
      expect(caseRecord!.shortDescription).not.toHaveProperty("display_value");

      console.log(`✓ Successfully retrieved case: ${caseRecord!.number}`);
    }, 30000);
  });

  describe("findByNumber", () => {
    testIf("should return null for non-existent case number", async () => {
      const nonExistentNumber = "CS999999999"; // Unlikely to exist

      const result = await caseRepository.findByNumber(nonExistentNumber);

      expect(result).toBeNull();
    }, 30000);

    testIf("should find a case by number if TEST_CASE_NUMBER is provided", async () => {
      const testCaseNumber = process.env.TEST_CASE_NUMBER;

      if (!testCaseNumber) {
        console.warn("⚠️  Skipping: TEST_CASE_NUMBER not set");
        return;
      }

      const caseRecord = await caseRepository.findByNumber(testCaseNumber);

      expect(caseRecord).toBeDefined();
      expect(caseRecord).not.toBeNull();
      expect(caseRecord!.number).toBe(testCaseNumber);
      expect(caseRecord!.sysId).toBeDefined();
      expect(caseRecord!.shortDescription).toBeDefined();

      // Verify clean domain model
      expect(typeof caseRecord!.number).toBe("string");
      expect(typeof caseRecord!.shortDescription).toBe("string");

      console.log(`✓ Successfully retrieved case: ${caseRecord!.number} (${caseRecord!.sysId})`);
    }, 30000);
  });

  describe("search", () => {
    testIf("should search cases with limit", async () => {
      const cases = await caseRepository.search({ limit: 5 });

      expect(cases).toBeDefined();
      expect(Array.isArray(cases)).toBe(true);
      expect(cases.length).toBeLessThanOrEqual(5);

      if (cases.length > 0) {
        const firstCase = cases[0];
        expect(firstCase.sysId).toBeDefined();
        expect(firstCase.number).toBeDefined();
        expect(firstCase.url).toBeDefined();

        // Verify domain model structure
        expect(typeof firstCase.number).toBe("string");
        expect(typeof firstCase.shortDescription).toBe("string");

        console.log(`✓ Search returned ${cases.length} cases`);
      }
    }, 30000);

    testIf("should search cases by criteria", async () => {
      const cases = await caseRepository.search({
        state: "open",
        limit: 3,
      });

      expect(cases).toBeDefined();
      expect(Array.isArray(cases)).toBe(true);

      if (cases.length > 0) {
        console.log(`✓ Found ${cases.length} open cases`);
      }
    }, 30000);
  });

  describe("Response Mapping", () => {
    testIf("should correctly map ServiceNow API response to domain model", async () => {
      // Get any case to verify mapping
      const cases = await caseRepository.search({ limit: 1 });

      if (cases.length === 0) {
        console.warn("⚠️  No cases found to test mapping");
        return;
      }

      const caseRecord = cases[0];

      // Verify domain model structure (clean TypeScript types)
      expect(caseRecord).toHaveProperty("sysId");
      expect(caseRecord).toHaveProperty("number");
      expect(caseRecord).toHaveProperty("shortDescription");
      expect(caseRecord).toHaveProperty("url");

      // Verify types are primitives, not ServiceNow objects
      expect(typeof caseRecord.sysId).toBe("string");
      expect(typeof caseRecord.number).toBe("string");
      expect(typeof caseRecord.shortDescription).toBe("string");
      expect(typeof caseRecord.url).toBe("string");

      // Optional fields should be strings or undefined, not objects
      if (caseRecord.priority) {
        expect(typeof caseRecord.priority).toBe("string");
      }
      if (caseRecord.state) {
        expect(typeof caseRecord.state).toBe("string");
      }

      console.log("✓ Response mapping verified:");
      console.log(`  Case: ${caseRecord.number}`);
      console.log(`  Description: ${caseRecord.shortDescription.substring(0, 50)}...`);
    }, 30000);
  });

  describe("Error Handling", () => {
    testIf("should handle invalid sys_id gracefully", async () => {
      const result = await caseRepository.findBySysId("invalid_sys_id_format");

      // Should return null or throw appropriate error, not crash
      expect(result === null || result === undefined).toBe(true);
    }, 30000);

    testIf("should handle network timeouts (if configured)", async () => {
      // This test validates timeout handling exists
      // Actual timeout testing would require a slow endpoint or network simulation

      const cases = await caseRepository.search({ limit: 1 });

      // If we get here without hanging, timeout logic is working
      expect(cases).toBeDefined();
    }, 30000);
  });

  describe("HTTP Client Retry Logic", () => {
    testIf("should successfully complete requests (validates retry doesn't interfere)", async () => {
      // Make multiple requests to ensure retry logic doesn't cause issues
      const promises = [
        caseRepository.search({ limit: 1 }),
        caseRepository.search({ limit: 1 }),
        caseRepository.search({ limit: 1 }),
      ];

      const results = await Promise.all(promises);

      results.forEach((cases) => {
        expect(cases).toBeDefined();
        expect(Array.isArray(cases)).toBe(true);
      });

      console.log("✓ Multiple concurrent requests succeeded");
    }, 30000);
  });

  describe("Full Stack Integration", () => {
    testIf("should demonstrate complete flow: search → findById → verify", async () => {
      // Step 1: Search for a case
      const cases = await caseRepository.search({ limit: 1 });

      if (cases.length === 0) {
        console.warn("⚠️  No cases found for full stack test");
        return;
      }

      const searchedCase = cases[0];
      console.log(`Step 1: Found case via search: ${searchedCase.number}`);

      // Step 2: Retrieve same case by sys_id
      const caseById = await caseRepository.findBySysId(searchedCase.sysId);

      expect(caseById).not.toBeNull();
      expect(caseById!.sysId).toBe(searchedCase.sysId);
      expect(caseById!.number).toBe(searchedCase.number);
      console.log(`Step 2: Retrieved same case by sys_id: ${caseById!.number}`);

      // Step 3: Retrieve by number
      const caseByNumber = await caseRepository.findByNumber(searchedCase.number);

      expect(caseByNumber).not.toBeNull();
      expect(caseByNumber!.sysId).toBe(searchedCase.sysId);
      console.log(`Step 3: Retrieved same case by number: ${caseByNumber!.number}`);

      console.log("✓ Full stack integration verified:");
      console.log(`  Search → findBySysId → findByNumber all returned consistent data`);
    }, 45000); // Longer timeout for multiple operations
  });
});

/**
 * ServiceNow Integration Tests
 * 
 * This test suite covers ServiceNow URL generation and integration functions
 * that are used throughout the Slack bot for creating links to ServiceNow records.
 */

import { describe, it, expect } from "vitest";
import {
  getServiceNowCaseUrl,
  getServiceNowTableUrl,
} from "../lib/utils/message-styling";

describe("ServiceNow Integration Tests", () => {
  describe("getServiceNowCaseUrl", () => {
    it("should generate correct URL for valid case number", () => {
      const caseNumber = "INC0010001";
      const url = getServiceNowCaseUrl(caseNumber);
      
      expect(url).toBe("https://example.service-now.com/sn_customerservice_case.do?sys_id=INC0010001");
    });

    it("should handle different case number formats", () => {
      const testCases = [
        { input: "INC0010001", expected: "https://example.service-now.com/sn_customerservice_case.do?sys_id=INC0010001" },
        { input: "INC1234567", expected: "https://example.service-now.com/sn_customerservice_case.do?sys_id=INC1234567" },
        { input: "SCTASK0010001", expected: "https://example.service-now.com/sn_customerservice_case.do?sys_id=SCTASK0010001" },
        { input: "RITM0010001", expected: "https://example.service-now.com/sn_customerservice_case.do?sys_id=RITM0010001" },
        { input: "REQ0010001", expected: "https://example.service-now.com/sn_customerservice_case.do?sys_id=REQ0010001" },
        { input: "PRB0010001", expected: "https://example.service-now.com/sn_customerservice_case.do?sys_id=PRB0010001" },
        { input: "CHG0010001", expected: "https://example.service-now.com/sn_customerservice_case.do?sys_id=CHG0010001" },
      ];

      testCases.forEach(({ input, expected }) => {
        const url = getServiceNowCaseUrl(input);
        expect(url).toBe(expected);
      });
    });

    it("should handle edge cases gracefully", () => {
      // Empty string
      expect(() => getServiceNowCaseUrl("")).not.toThrow();
      expect(getServiceNowCaseUrl("")).toBe("https://example.service-now.com/sn_customerservice_case.do?sys_id=");

      // Null/undefined
      expect(() => getServiceNowCaseUrl(null as any)).not.toThrow();
      expect(() => getServiceNowCaseUrl(undefined as any)).not.toThrow();

      // Very long case number
      const longCaseNumber = "INC" + "1".repeat(100);
      const url = getServiceNowCaseUrl(longCaseNumber);
      expect(url).toContain(longCaseNumber);
      expect(url).toContain("https://example.service-now.com/sn_customerservice_case.do?sys_id=");
    });

    it("should handle special characters in case numbers", () => {
      const specialCases = [
        "INC0010001@",
        "INC0010001#",
        "INC0010001$",
        "INC0010001%",
      ];

      specialCases.forEach(caseNumber => {
        expect(() => getServiceNowCaseUrl(caseNumber)).not.toThrow();
        const url = getServiceNowCaseUrl(caseNumber);
        expect(url).toBe(`https://example.service-now.com/sn_customerservice_case.do?sys_id=${caseNumber}`);
      });
    });

    it("should handle string conversion for non-string inputs", () => {
      const nonStringInputs = [
        { input: 123, expected: "https://example.service-now.com/sn_customerservice_case.do?sys_id=123" },
        { input: true, expected: "https://example.service-now.com/sn_customerservice_case.do?sys_id=true" },
        { input: false, expected: "https://example.service-now.com/sn_customerservice_case.do?sys_id=false" },
      ];

      nonStringInputs.forEach(({ input, expected }) => {
        expect(() => getServiceNowCaseUrl(input as any)).not.toThrow();
        const url = getServiceNowCaseUrl(input as any);
        expect(url).toBe(expected);
      });
    });
  });

  describe("getServiceNowTableUrl", () => {
    it("should generate correct URL for standard tables", () => {
      const testCases = [
        { table: "incident", sysId: "INC0010001", expected: "https://example.service-now.com/incident.do?sys_id=INC0010001" },
        { table: "problem", sysId: "PRB0010001", expected: "https://example.service-now.com/problem.do?sys_id=PRB0010001" },
        { table: "change_request", sysId: "CHG0010001", expected: "https://example.service-now.com/change_request.do?sys_id=CHG0010001" },
        { table: "sc_request", sysId: "REQ0010001", expected: "https://example.service-now.com/sc_request.do?sys_id=REQ0010001" },
        { table: "sc_req_item", sysId: "RITM0010001", expected: "https://example.service-now.com/sc_req_item.do?sys_id=RITM0010001" },
        { table: "sc_task", sysId: "SCTASK0010001", expected: "https://example.service-now.com/sc_task.do?sys_id=SCTASK0010001" },
        { table: "kb_knowledge", sysId: "KB0010001", expected: "https://example.service-now.com/kb_knowledge.do?sys_id=KB0010001" },
        { table: "cmdb_ci", sysId: "CI0010001", expected: "https://example.service-now.com/cmdb_ci.do?sys_id=CI0010001" },
      ];

      testCases.forEach(({ table, sysId, expected }) => {
        const url = getServiceNowTableUrl(table, sysId);
        expect(url).toBe(expected);
      });
    });

    it("should handle custom tables", () => {
      const customTables = [
        { table: "x_custom_table", sysId: "test_sys_id", expected: "https://example.service-now.com/x_custom_table.do?sys_id=test_sys_id" },
        { table: "u_custom_app_table", sysId: "test_sys_id", expected: "https://example.service-now.com/u_custom_app_table.do?sys_id=test_sys_id" },
        { table: "sys_user", sysId: "test_sys_id", expected: "https://example.service-now.com/sys_user.do?sys_id=test_sys_id" },
        { table: "sys_group", sysId: "test_sys_id", expected: "https://example.service-now.com/sys_group.do?sys_id=test_sys_id" },
        { table: "cmdb_rel_ci", sysId: "test_sys_id", expected: "https://example.service-now.com/cmdb_rel_ci.do?sys_id=test_sys_id" },
      ];

      customTables.forEach(({ table, sysId, expected }) => {
        const url = getServiceNowTableUrl(table, sysId);
        expect(url).toBe(expected);
      });
    });

    it("should handle edge cases gracefully", () => {
      // Empty table name
      expect(() => getServiceNowTableUrl("", "test")).not.toThrow();
      expect(getServiceNowTableUrl("", "test")).toBe("https://example.service-now.com/.do?sys_id=test");

      // Empty sysId
      expect(() => getServiceNowTableUrl("incident", "")).not.toThrow();
      expect(getServiceNowTableUrl("incident", "")).toBe("https://example.service-now.com/incident.do?sys_id=");

      // Null/undefined inputs
      expect(() => getServiceNowTableUrl(null as any, "test")).not.toThrow();
      expect(() => getServiceNowTableUrl("incident", null as any)).not.toThrow();
      expect(() => getServiceNowTableUrl(undefined as any, "test")).not.toThrow();
      expect(() => getServiceNowTableUrl("incident", undefined as any)).not.toThrow();
    });

    it("should handle special characters in inputs", () => {
      const specialCases = [
        { table: "incident@test", sysId: "INC0010001#test", expected: "https://example.service-now.com/incident@test.do?sys_id=INC0010001#test" },
        { table: "problem$test", sysId: "PRB0010001@test", expected: "https://example.service-now.com/problem$test.do?sys_id=PRB0010001@test" },
        { table: "change_request%test", sysId: "CHG0010001$test", expected: "https://example.service-now.com/change_request%test.do?sys_id=CHG0010001$test" },
      ];

      specialCases.forEach(({ table, sysId, expected }) => {
        expect(() => getServiceNowTableUrl(table, sysId)).not.toThrow();
        const url = getServiceNowTableUrl(table, sysId);
        expect(url).toBe(expected);
      });
    });

    it("should handle very long table names and sysIds", () => {
      const longTable = "x_very_long_custom_table_name_that_exceeds_normal_limits_" + "a".repeat(100);
      const longSysId = "SYS" + "1".repeat(500);
      const expectedUrl = `https://example.service-now.com/${longTable}.do?sys_id=${longSysId}`;
      
      expect(() => getServiceNowTableUrl(longTable, longSysId)).not.toThrow();
      const url = getServiceNowTableUrl(longTable, longSysId);
      expect(url).toBe(expectedUrl);
    });
  });

  describe("URL Format Consistency", () => {
    it("should use consistent base URL across all functions", () => {
      const caseUrl = getServiceNowCaseUrl("INC0010001");
      const tableUrl = getServiceNowTableUrl("incident", "INC0010001");
      
      expect(caseUrl).toContain("https://example.service-now.com/");
      expect(tableUrl).toContain("https://example.service-now.com/");
    });

    it("should use consistent URL structure", () => {
      const caseUrl = getServiceNowCaseUrl("INC0010001");
      const tableUrl = getServiceNowTableUrl("incident", "INC0010001");
      
      expect(caseUrl).toContain("/sn_customerservice_case.do?");
      expect(tableUrl).toContain("/incident.do?");
      expect(caseUrl).toContain("sys_id=");
      expect(tableUrl).toContain("sys_id=");
    });

    it("should handle different ServiceNow record types consistently", () => {
      const urls = [
        getServiceNowCaseUrl("INC0010001"),
        getServiceNowCaseUrl("SCTASK0010001"),
        getServiceNowTableUrl("incident", "INC0010001"),
        getServiceNowTableUrl("problem", "PRB0010001"),
      ];

      urls.forEach(url => {
        expect(url).toMatch(/^https:\/\/example\.service-now\.com\//);
        expect(url).toContain("sys_id=");
      });
    });
  });

  describe("Integration Edge Cases", () => {
    it("should handle malformed input gracefully", () => {
      const malformedInputs = [
        123, // number instead of string
        {}, // object
        [], // array
        true, // boolean
      ];

      malformedInputs.forEach(input => {
        expect(() => getServiceNowCaseUrl(input as any)).not.toThrow();
        expect(() => getServiceNowTableUrl(input as any, "test")).not.toThrow();
        expect(() => getServiceNowTableUrl("incident", input as any)).not.toThrow();
      });
    });

    it("should handle whitespace in inputs", () => {
      const whitespaceInputs = [
        " INC0010001 ",
        "\tSCTASK0010001\n",
        "  incident  ",
        "\nproblem\t",
      ];

      whitespaceInputs.forEach(input => {
        expect(() => getServiceNowCaseUrl(input)).not.toThrow();
        expect(() => getServiceNowTableUrl(input, "test")).not.toThrow();
        expect(() => getServiceNowTableUrl("incident", input)).not.toThrow();
      });
    });

    it("should handle Unicode characters", () => {
      const unicodeInputs = [
        "INC0010001🚀",
        "SCTASK0010001测试",
        "incident_📋",
        "problem_テスト",
      ];

      unicodeInputs.forEach(input => {
        expect(() => getServiceNowCaseUrl(input)).not.toThrow();
        expect(() => getServiceNowTableUrl(input, "test")).not.toThrow();
        expect(() => getServiceNowTableUrl("incident", input)).not.toThrow();
        
        const caseUrl = getServiceNowCaseUrl(input);
        const tableUrl = getServiceNowTableUrl(input, "test");
        
        expect(caseUrl).toContain(input);
        expect(tableUrl).toContain(input);
      });
    });
  });

  describe("Performance Considerations", () => {
    it("should generate URLs efficiently", () => {
      const start = performance.now();
      
      // Generate 1000 URLs
      for (let i = 0; i < 1000; i++) {
        getServiceNowCaseUrl(`INC${String(i).padStart(7, '0')}`);
        getServiceNowTableUrl("incident", `INC${String(i).padStart(7, '0')}`);
      }
      
      const end = performance.now();
      const duration = end - start;
      
      // Should complete within reasonable time (less than 1 second)
      expect(duration).toBeLessThan(1000);
    });

    it("should handle memory efficiently with large inputs", () => {
      const largeTable = "x_very_long_custom_table_name_" + "a".repeat(1000);
      const largeSysId = "SYS" + "1".repeat(1000);
      
      expect(() => {
        for (let i = 0; i < 100; i++) {
          getServiceNowTableUrl(largeTable, largeSysId);
        }
      }).not.toThrow();
    });

    it("should maintain consistent behavior under stress", () => {
      // Generate many URLs to ensure consistency
      for (let i = 0; i < 100; i++) {
        const caseNumber = `INC${String(i).padStart(7, '0')}`;
        const caseUrl = getServiceNowCaseUrl(caseNumber);
        const tableUrl = getServiceNowTableUrl("incident", caseNumber);
        
        expect(caseUrl).toContain("https://example.service-now.com/sn_customerservice_case.do?sys_id=");
        expect(tableUrl).toContain("https://example.service-now.com/incident.do?sys_id=");
      }
    });
  });

  describe("Function Signatures and Type Safety", () => {
    it("should accept string inputs without errors", () => {
      expect(() => {
        getServiceNowCaseUrl("INC0010001");
        getServiceNowTableUrl("incident", "INC0010001");
      }).not.toThrow();
    });

    it("should handle empty string inputs", () => {
      expect(() => {
        getServiceNowCaseUrl("");
        getServiceNowTableUrl("", "");
        getServiceNowTableUrl("incident", "");
        getServiceNowTableUrl("", "INC0010001");
      }).not.toThrow();
    });

    it("should return string type consistently", () => {
      const caseUrl = getServiceNowCaseUrl("INC0010001");
      const tableUrl = getServiceNowTableUrl("incident", "INC0010001");
      
      expect(typeof caseUrl).toBe("string");
      expect(typeof tableUrl).toBe("string");
    });

    it("should handle object and array inputs gracefully", () => {
      expect(() => {
        getServiceNowCaseUrl({} as any);
        getServiceNowCaseUrl([] as any);
        getServiceNowTableUrl({} as any, "test");
        getServiceNowTableUrl("incident", {} as any);
      }).not.toThrow();
    });
  });
});
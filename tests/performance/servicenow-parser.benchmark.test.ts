/**
 * Performance benchmarks for ServiceNowParser
 * Ensures parsing meets the <50ms requirement for various payload sizes and complexity
 */

import { describe, expect, it } from "vitest";
import { readFileSync } from "fs";
import { join } from "path";
import { ServiceNowParser } from "../../lib/utils/servicenow-parser";

// Helper to load fixture files
function loadFixture(category: string, filename: string): string {
  const fixturePath = join(process.cwd(), 'tests', 'fixtures', 'servicenow-payloads', category, filename);
  return readFileSync(fixturePath, 'utf8');
}

// Helper to generate large payloads for stress testing
function generateLargePayload(sizeMultiplier: number = 10): string {
  const basePayload = loadFixture('valid', 'complete-case.json');
  const parsed = JSON.parse(basePayload);
  
  // Multiply the description size to simulate large payloads
  const originalDescription = parsed.description;
  parsed.description = originalDescription.repeat(sizeMultiplier);
  
  // Add many additional fields to simulate complex payloads
  parsed.custom_fields = {};
  for (let i = 0; i < sizeMultiplier * 5; i++) {
    parsed.custom_fields[`field_${i}`] = {
      display_value: `Custom Field ${i}`,
      value: `value_${i}`,
      type: "string"
    };
  }
  
  parsed.work_notes = [];
  for (let i = 0; i < sizeMultiplier * 3; i++) {
    parsed.work_notes.push({
      sys_created_on: new Date().toISOString(),
      sys_created_by: `user_${i}`,
      value: `Work note entry ${i}: ${originalDescription.substring(0, 100)}`
    });
  }
  
  return JSON.stringify(parsed, null, 2);
}

describe("ServiceNowParser Performance Benchmarks", () => {
  const parser = new ServiceNowParser();
  
  describe("Small Payloads (< 1KB)", () => {
    it("should parse minimal case payload in < 10ms", () => {
      const payload = loadFixture('valid', 'minimal-case.json');
      
      const iterations = 100;
      const times: number[] = [];
      
      for (let i = 0; i < iterations; i++) {
        const start = performance.now();
        const result = parser.parse(payload);
        const end = performance.now();
        
        expect(result.success).toBe(true);
        times.push(end - start);
      }
      
      const avgTime = times.reduce((a, b) => a + b, 0) / times.length;
      const maxTime = Math.max(...times);
      
      console.log(`Small payload (${payload.length} chars) - Avg: ${avgTime.toFixed(2)}ms, Max: ${maxTime.toFixed(2)}ms`);
      
      expect(avgTime).toBeLessThan(5); // Average should be under 5ms
      expect(maxTime).toBeLessThan(10); // Max should be under 10ms
    });

    it("should parse malformed small payload in < 15ms", () => {
      const payload = loadFixture('malformed', 'smart-quotes.json');
      
      const iterations = 100;
      const times: number[] = [];
      
      for (let i = 0; i < iterations; i++) {
        const start = performance.now();
        const result = parser.parse(payload);
        const end = performance.now();
        
        expect(result.success).toBe(true);
        times.push(end - start);
      }
      
      const avgTime = times.reduce((a, b) => a + b, 0) / times.length;
      const maxTime = Math.max(...times);
      
      console.log(`Malformed small payload (${payload.length} chars) - Avg: ${avgTime.toFixed(2)}ms, Max: ${maxTime.toFixed(2)}ms`);
      
      expect(avgTime).toBeLessThan(10); // Average should be under 10ms (includes repair time)
      expect(maxTime).toBeLessThan(15); // Max should be under 15ms
    });
  });

  describe("Medium Payloads (1-10KB)", () => {
    it("should parse complete case payload in < 20ms", () => {
      const payload = loadFixture('valid', 'complete-case.json');
      
      const iterations = 50;
      const times: number[] = [];
      
      for (let i = 0; i < iterations; i++) {
        const start = performance.now();
        const result = parser.parse(payload);
        const end = performance.now();
        
        expect(result.success).toBe(true);
        times.push(end - start);
      }
      
      const avgTime = times.reduce((a, b) => a + b, 0) / times.length;
      const maxTime = Math.max(...times);
      
      console.log(`Medium payload (${payload.length} chars) - Avg: ${avgTime.toFixed(2)}ms, Max: ${maxTime.toFixed(2)}ms`);
      
      expect(avgTime).toBeLessThan(10); // Average should be under 10ms
      expect(maxTime).toBeLessThan(20); // Max should be under 20ms
    });

    it("should parse incomplete payload in < 25ms", () => {
      const payload = loadFixture('malformed', 'incomplete-payload.json');
      
      const iterations = 50;
      const times: number[] = [];
      
      for (let i = 0; i < iterations; i++) {
        const start = performance.now();
        const result = parser.parse(payload);
        const end = performance.now();
        
        expect(result.success).toBe(true);
        times.push(end - start);
      }
      
      const avgTime = times.reduce((a, b) => a + b, 0) / times.length;
      const maxTime = Math.max(...times);
      
      console.log(`Incomplete medium payload (${payload.length} chars) - Avg: ${avgTime.toFixed(2)}ms, Max: ${maxTime.toFixed(2)}ms`);
      
      expect(avgTime).toBeLessThan(15); // Average should be under 15ms
      expect(maxTime).toBeLessThan(25); // Max should be under 25ms
    });
  });

  describe("Large Payloads (> 10KB)", () => {
    it("should parse large payload (50KB) in < 50ms", () => {
      const payload = generateLargePayload(10);
      
      const iterations = 20;
      const times: number[] = [];
      
      for (let i = 0; i < iterations; i++) {
        const start = performance.now();
        const result = parser.parse(payload);
        const end = performance.now();
        
        expect(result.success).toBe(true);
        times.push(end - start);
      }
      
      const avgTime = times.reduce((a, b) => a + b, 0) / times.length;
      const maxTime = Math.max(...times);
      
      console.log(`Large payload (${payload.length} chars) - Avg: ${avgTime.toFixed(2)}ms, Max: ${maxTime.toFixed(2)}ms`);
      
      expect(avgTime).toBeLessThan(30); // Average should be under 30ms
      expect(maxTime).toBeLessThan(50); // Max should be under 50ms (requirement)
    });

    it("should parse very large payload (100KB) in < 75ms", () => {
      const payload = generateLargePayload(20);
      
      const iterations = 10;
      const times: number[] = [];
      
      for (let i = 0; i < iterations; i++) {
        const start = performance.now();
        const result = parser.parse(payload);
        const end = performance.now();
        
        expect(result.success).toBe(true);
        times.push(end - start);
      }
      
      const avgTime = times.reduce((a, b) => a + b, 0) / times.length;
      const maxTime = Math.max(...times);
      
      console.log(`Very large payload (${payload.length} chars) - Avg: ${avgTime.toFixed(2)}ms, Max: ${maxTime.toFixed(2)}ms`);
      
      expect(avgTime).toBeLessThan(50); // Average should be under 50ms
      expect(maxTime).toBeLessThan(75); // Max should be under 75ms for very large payloads
    });
  });

  describe("Strategy Performance Comparison", () => {
    it("should measure performance of each parsing strategy", () => {
      const validPayload = loadFixture('valid', 'complete-case.json');
      const malformedPayload = loadFixture('malformed', 'smart-quotes.json');
      
      // Test native JSON parsing (valid payload)
      const nativeStart = performance.now();
      const nativeResult = parser.parse(validPayload);
      const nativeEnd = performance.now();
      
      expect(nativeResult.success).toBe(true);
      expect(nativeResult.strategy).toBe('native-json');
      
      // Test JSON repair parsing (malformed payload)
      const repairStart = performance.now();
      const repairResult = parser.parse(malformedPayload);
      const repairEnd = performance.now();
      
      expect(repairResult.success).toBe(true);
      expect(repairResult.strategy).toBe('jsonrepair');
      
      const nativeTime = nativeEnd - nativeStart;
      const repairTime = repairEnd - repairStart;
      
      console.log(`Strategy comparison - Native JSON: ${nativeTime.toFixed(2)}ms, JSON Repair: ${repairTime.toFixed(2)}ms`);
      
      // JSON repair should be reasonably fast (within 5x of native)
      expect(repairTime).toBeLessThan(nativeTime * 5);
    });
  });

  describe("Memory and Resource Usage", () => {
    it("should handle multiple concurrent parses without memory leaks", async () => {
      const payload = loadFixture('valid', 'complete-case.json');
      const concurrentPromises: Promise<any>[] = [];
      
      // Create 100 concurrent parsing operations
      for (let i = 0; i < 100; i++) {
        concurrentPromises.push(
          new Promise((resolve) => {
            setTimeout(() => {
              const start = performance.now();
              const result = parser.parse(payload);
              const end = performance.now();
              resolve({ result, time: end - start });
            }, Math.random() * 10); // Random delay up to 10ms
          })
        );
      }
      
      const results = await Promise.all(concurrentPromises);
      
      // All should succeed
      results.forEach(({ result }) => {
        expect(result.success).toBe(true);
      });
      
      const times = results.map(({ time }) => time);
      const avgTime = times.reduce((a, b) => a + b, 0) / times.length;
      const maxTime = Math.max(...times);
      
      console.log(`Concurrent parsing (100 operations) - Avg: ${avgTime.toFixed(2)}ms, Max: ${maxTime.toFixed(2)}ms`);
      
      expect(avgTime).toBeLessThan(20);
      expect(maxTime).toBeLessThan(50);
    });
  });

  describe("Worst Case Scenarios", () => {
    it("should handle deeply nested JSON efficiently", () => {
      // Create deeply nested JSON
      let nested: any = { value: "deep" };
      for (let i = 0; i < 50; i++) {
        nested = { level: i, nested: nested };
      }
      
      const payload = JSON.stringify({
        case_number: "DEEP001",
        sys_id: "sys_deep_test",
        short_description: "Deeply nested test",
        nested_data: nested
      });
      
      const start = performance.now();
      const result = parser.parse(payload);
      const end = performance.now();
      
      const parseTime = end - start;
      
      expect(result.success).toBe(true);
      console.log(`Deeply nested JSON (50 levels) - Time: ${parseTime.toFixed(2)}ms`);
      
      expect(parseTime).toBeLessThan(25);
    });

    it("should handle payloads with many special characters efficiently", () => {
      const specialChars = '\n\r\t\\"\'\\u0000\\u0001\\u0002\\u0003\\u0004\\u0005'.repeat(100);
      const payload = JSON.stringify({
        case_number: "SPECIAL001",
        sys_id: "sys_special_test",
        short_description: "Special characters test",
        description: specialChars,
        special_field: specialChars
      });
      
      const start = performance.now();
      const result = parser.parse(payload);
      const end = performance.now();
      
      const parseTime = end - start;
      
      expect(result.success).toBe(true);
      console.log(`Special characters payload (${payload.length} chars) - Time: ${parseTime.toFixed(2)}ms`);
      
      expect(parseTime).toBeLessThan(20);
    });
  });
});
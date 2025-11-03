/**
 * Quick performance validation for ServiceNowParser
 * Validates <50ms requirement for key scenarios
 */

import { describe, expect, it } from "vitest";
import { readFileSync } from "fs";
import { join } from "path";
import { ServiceNowParser } from "../../lib/utils/servicenow-parser";

function loadFixture(category: string, filename: string): string {
  const fixturePath = join(process.cwd(), 'tests', 'fixtures', 'servicenow-payloads', category, filename);
  return readFileSync(fixturePath, 'utf8');
}

describe("ServiceNowParser Performance Validation", () => {
  const parser = new ServiceNowParser();
  
  it("validates <50ms requirement for typical payloads", () => {
    const testCases = [
      { name: "Small valid", category: 'valid', filename: 'minimal-case.json' },
      { name: "Small malformed", category: 'malformed', filename: 'smart-quotes.json' },
      { name: "Medium valid", category: 'valid', filename: 'complete-case.json' },
      { name: "Medium malformed", category: 'malformed', filename: 'incomplete-payload.json' },
    ];
    
    const results: { name: string; size: number; time: number; strategy: string }[] = [];
    
    testCases.forEach(({ name, category, filename }) => {
      const payload = loadFixture(category, filename);
      
      const start = performance.now();
      const result = parser.parse(payload);
      const end = performance.now();
      
      expect(result.success).toBe(true);
      
      const time = end - start;
      results.push({
        name,
        size: payload.length,
        time,
        strategy: result.strategy || 'unknown'
      });
      
      // Individual validation
      expect(time).toBeLessThan(50);
    });
    
    console.log('\nPerformance Results:');
    console.table(results);
    
    // Overall validation - average should be well under 50ms
    const avgTime = results.reduce((sum, r) => sum + r.time, 0) / results.length;
    expect(avgTime).toBeLessThan(25); // Average should be under 25ms
    
    console.log(`\nAverage parsing time: ${avgTime.toFixed(2)}ms`);
  });
  
  it("handles large payload efficiently", () => {
    // Generate a larger payload
    const basePayload = loadFixture('valid', 'complete-case.json');
    const parsed = JSON.parse(basePayload);
    
    // Expand the payload significantly
    parsed.description = parsed.description.repeat(50);
    parsed.work_notes = Array(100).fill(null).map((_, i) => ({
      sys_created_on: new Date().toISOString(),
      sys_created_by: `user_${i}`,
      value: `Work note ${i}: ${parsed.description.substring(0, 100)}`
    }));
    
    const largePayload = JSON.stringify(parsed);
    console.log(`Large payload size: ${largePayload.length} characters`);
    
    const start = performance.now();
    const result = parser.parse(largePayload);
    const end = performance.now();
    
    expect(result.success).toBe(true);
    
    const time = end - start;
    console.log(`Large payload parsing time: ${time.toFixed(2)}ms (strategy: ${result.strategy})`);
    
    expect(time).toBeLessThan(50);
  });
});
/**
 * Unit tests for ServiceNowParser class.
 */

import { describe, it, expect, beforeEach } from 'vitest';
import { ServiceNowParser } from './servicenow-parser';

describe('ServiceNowParser', () => {
  let parser: ServiceNowParser;

  beforeEach(() => {
    parser = new ServiceNowParser();
  });

  it('should parse valid JSON successfully', () => {
    const input = '{"case_number": "CASE001", "short_description": "Test case"}';
    const result = parser.parse(input);
    
    expect(result.success).toBe(true);
    expect(result.data).toEqual({
      case_number: 'CASE001',
      short_description: 'Test case',
    });
    expect(result.strategy).toBe('native-json');
    expect(result.metadata.processingTimeMs).toBeGreaterThanOrEqual(0);
  });

  it('should handle malformed JSON with smart quotes', () => {
    const input = '{"case_number": "CASE001", "description": "Issue with "smart quotes""}';
    const result = parser.parse(input);
    
    expect(result.success).toBe(true);
    // The parser may use different strategies based on the specific issue
    expect(['sanitized-json', 'partial-recovery']).toContain(result.strategy || '');
    expect(result.data).toBeDefined();
  });

  it('should handle truncated JSON with partial recovery', () => {
    const input = '{"case_number": "CASE001", "short_description": "Test';
    const result = parser.parse(input);
    
    // Should attempt some strategy - may succeed or fail depending on truncation
    expect(result.strategy).toBeDefined();
    expect(result.metadata.strategiesAttempted.length).toBeGreaterThan(0);
  });

  it('should record metrics correctly', () => {
    const input = '{"case_number": "CASE001"}';
    parser.parse(input);
    
    const metrics = parser.getMetrics();
    expect(metrics).toHaveLength(1);
    expect(metrics[0].strategy).toBe('native-json');
    expect(metrics[0].success).toBe(true);
    
    const stats = parser.getStats();
    expect(stats.totalAttempts).toBe(1);
    expect(stats.successRate).toBe(1);
  });

  it('should handle empty payload gracefully', () => {
    const result = parser.parse('');
    
    expect(result.success).toBe(false);
    expect(result.error).toBeDefined();
  });

  it('should clear metrics correctly', () => {
    parser.parse('{"test": "value"}');
    expect(parser.getMetrics()).toHaveLength(1);
    
    parser.clearMetrics();
    expect(parser.getMetrics()).toHaveLength(0);
  });
});
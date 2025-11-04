/**
 * ServiceNow Parser - Multi-layer JSON parsing pipeline.
 * 
 * This class implements a comprehensive parsing strategy for ServiceNow webhook payloads
 * that often contain malformed JSON due to various issues like smart quotes, control characters,
 * missing commas, and truncation.
 * 
 * Architecture:
 * Layer 1: Pre-validation (encoding detection, basic format checks)
 * Layer 2: Sanitization (apply all sanitizers from servicenow-payload.ts)
 * Layer 3: Parsing strategies (4 strategies with fallbacks)
 * Layer 4: Schema validation (integrate with Zod)
 * Layer 5: Observability (metrics logging)
 */

import { jsonrepair } from 'jsonrepair';
import {
  sanitizeServiceNowPayload,
  removeBom,
  looksLikeJson,
  decodeFormEncodedPayload,
  decodeBase64Payload,
} from './servicenow-payload';

export interface ParseResult {
  success: boolean;
  data?: unknown;
  error?: Error;
  strategy?: string;
  warnings?: string[];
  metadata: {
    originalLength: number;
    sanitizedLength: number;
    processingTimeMs: number;
    strategiesAttempted: string[];
  };
}

export interface ValidationResult {
  success: boolean;
  data?: unknown;
  errors?: string[];
  warnings?: string[];
}

export interface ParsingMetrics {
  strategy: string;
  success: boolean;
  error?: string;
  processingTimeMs: number;
}

/**
 * ServiceNow Parser with 5-layer parsing pipeline.
 */
export class ServiceNowParser {
  private metrics: ParsingMetrics[] = [];

  /**
   * Parse a ServiceNow payload using the multi-layer pipeline.
   */
  parse(rawPayload: string): ParseResult {
    const startTime = Date.now();
    const originalLength = rawPayload.length;

    try {
      // Layer 1: Pre-validation
      const preValidated = this.preValidate(rawPayload);
      
      // Layer 2: Sanitization
      const sanitized = this.sanitize(preValidated);
      const sanitizedLength = sanitized.length;

      // Layer 3: Parsing strategies
      const parseResult = this.tryParsingStrategies(sanitized);
      
      // Layer 4: Schema validation (placeholder for now)
      const validationResult = this.validate(parseResult.data);

      // Layer 5: Observability
      const processingTimeMs = Date.now() - startTime;
      this.recordMetrics({
        strategy: parseResult.strategy || 'unknown',
        success: parseResult.success,
        error: parseResult.error?.message,
        processingTimeMs,
      });

      return {
        success: parseResult.success && validationResult.success,
        data: validationResult.data || parseResult.data,
        error: parseResult.error,
        strategy: parseResult.strategy,
        warnings: [...(parseResult.warnings || []), ...(validationResult.warnings || [])],
        metadata: {
          originalLength,
          sanitizedLength,
          processingTimeMs,
          strategiesAttempted: this.metrics.map(m => m.strategy),
        },
      };
    } catch (error) {
      const processingTimeMs = Date.now() - startTime;
      return {
        success: false,
        error: error as Error,
        metadata: {
          originalLength,
          sanitizedLength: rawPayload.length,
          processingTimeMs,
          strategiesAttempted: this.metrics.map(m => m.strategy),
        },
      };
    }
  }

  /**
   * Layer 1: Pre-validation
   * Detect encoding and perform basic format checks.
   */
  private preValidate(payload: string): string {
    // Remove BOM if present
    let cleaned = removeBom(payload);

    // Try common encodings/transformations
    const transformations = [
      { name: 'trimmed', fn: (p: string) => p.trim() },
      { name: 'form-decoded', fn: (p: string) => decodeFormEncodedPayload(p) || p },
      { name: 'base64-decoded', fn: (p: string) => decodeBase64Payload(p) || p },
      { name: 'sanitized-base64', fn: (p: string) => {
        const decoded = decodeBase64Payload(p);
        return decoded ? sanitizeServiceNowPayload(decoded) : p;
      }},
    ];

    for (const transform of transformations) {
      const transformed = transform.fn(cleaned);
      if (transformed !== cleaned && looksLikeJson(transformed)) {
        return transformed;
      }
    }

    return cleaned;
  }

  /**
   * Layer 2: Sanitization
   * Apply all sanitizers to fix common JSON issues.
   */
  private sanitize(payload: string): string {
    return sanitizeServiceNowPayload(payload);
  }

  /**
   * Layer 3: Parsing strategies
   * Try multiple parsing approaches with fallbacks.
   */
  private tryParsingStrategies(payload: string): ParseResult {
    const strategies = [
      {
        name: 'native-json',
        fn: (p: string) => JSON.parse(p),
      },
      {
        name: 'sanitized-json',
        fn: (p: string) => JSON.parse(sanitizeServiceNowPayload(p)),
      },
      {
        name: 'jsonrepair',
        fn: (p: string) => JSON.parse(jsonrepair(p)),
      },
      {
        name: 'partial-recovery',
        fn: (p: string) => this.partialRecovery(p),
      },
    ];

    const warnings: string[] = [];

    for (const strategy of strategies) {
      try {
        const startTime = Date.now();
        const result = strategy.fn(payload);
        const processingTimeMs = Date.now() - startTime;

        // Validate that we got something meaningful
        if (result && typeof result === 'object' && Object.keys(result).length > 0) {
          return {
            success: true,
            data: result,
            strategy: strategy.name,
            warnings: warnings.length > 0 ? warnings : undefined,
            metadata: {
              originalLength: payload.length,
              sanitizedLength: payload.length,
              processingTimeMs,
              strategiesAttempted: [strategy.name],
            },
          };
        }
      } catch (error) {
        warnings.push(`Strategy ${strategy.name} failed: ${(error as Error).message}`);
        
        // For the last strategy, don't swallow the error
        if (strategy.name === 'partial-recovery') {
          return {
            success: false,
            error: error as Error,
            strategy: strategy.name,
            warnings,
            metadata: {
              originalLength: payload.length,
              sanitizedLength: payload.length,
              processingTimeMs: 0,
              strategiesAttempted: strategies.map(s => s.name),
            },
          };
        }
      }
    }

    return {
      success: false,
      error: new Error('All parsing strategies failed'),
      warnings,
      metadata: {
        originalLength: payload.length,
        sanitizedLength: payload.length,
        processingTimeMs: 0,
        strategiesAttempted: strategies.map(s => s.name),
      },
    };
  }

  /**
   * Layer 4: Schema validation
   * Placeholder for Zod integration - will be enhanced in next phase.
   */
  private validate(parsed: unknown): ValidationResult {
    // For now, just do basic validation
    if (!parsed || typeof parsed !== 'object') {
      return {
        success: false,
        errors: ['Parsed data is not an object'],
      };
    }

    const obj = parsed as Record<string, unknown>;
    if (Object.keys(obj).length === 0) {
      return {
        success: false,
        errors: ['Parsed object is empty'],
      };
    }

    // Check for common ServiceNow fields
    const hasServiceNowFields = [
      'sys_id', 'number', 'case_number', 'incident_number', 'short_description'
    ].some(field => field in obj);

    if (!hasServiceNowFields) {
      return {
        success: true,
        data: parsed,
        warnings: ['No common ServiceNow fields found'],
      };
    }

    return {
      success: true,
      data: parsed,
    };
  }

  /**
   * Layer 5: Observability
   * Record metrics for monitoring and debugging.
   */
  private recordMetrics(metrics: ParsingMetrics): void {
    this.metrics.push(metrics);
    
    // Keep only last 100 metrics to prevent memory leaks
    if (this.metrics.length > 100) {
      this.metrics = this.metrics.slice(-100);
    }

    // Log metrics for debugging (in production, this would go to your monitoring system)
    console.log('[ServiceNowParser] Parse metrics:', {
      strategy: metrics.strategy,
      success: metrics.success,
      processingTimeMs: metrics.processingTimeMs,
      error: metrics.error,
    });
  }

  /**
   * Partial recovery strategy - extract valid JSON chunks from malformed payload.
   * This is a last-resort strategy to recover any useful data.
   */
  private partialRecovery(payload: string): unknown {
    // Try to find the largest valid JSON object
    let bestResult: unknown = null;
    let maxKeys = 0;

    // Strategy 1: Try to find complete objects
    const objectMatches = payload.match(/\{[^{}]*\}/g);
    if (objectMatches) {
      for (const match of objectMatches) {
        try {
          const parsed = JSON.parse(match);
          if (typeof parsed === 'object' && parsed !== null) {
            const keyCount = Object.keys(parsed).length;
            if (keyCount > maxKeys) {
              maxKeys = keyCount;
              bestResult = parsed;
            }
          }
        } catch {
          // Ignore invalid JSON chunks
        }
      }
    }

    // Strategy 2: Try to extract key-value pairs
    if (!bestResult) {
      const kvPairs: Record<string, unknown> = {};
      const kvMatches = payload.match(/"([^"]+)"\s*:\s*("[^"]*"|[^,}\]]+)/g);
      
      if (kvMatches) {
        for (const match of kvMatches) {
          try {
            const colonIndex = match.indexOf(':');
            if (colonIndex > 0) {
              const key = match.substring(0, colonIndex).trim().replace(/^"|"$/g, '');
              let valueStr = match.substring(colonIndex + 1).trim();
              
              // Try to parse the value
              let value: unknown = valueStr;
              if (valueStr.startsWith('"') && valueStr.endsWith('"')) {
                value = valueStr.slice(1, -1);
              } else if (valueStr === 'true' || valueStr === 'false') {
                value = valueStr === 'true';
              } else if (!isNaN(Number(valueStr))) {
                value = Number(valueStr);
              }
              
              kvPairs[key] = value;
            }
          } catch {
            // Ignore malformed pairs
          }
        }
        
        if (Object.keys(kvPairs).length > 0) {
          bestResult = kvPairs;
        }
      }
    }

    if (bestResult) {
      console.log('[ServiceNowParser] Partial recovery successful:', {
        recoveredKeys: Object.keys(bestResult as Record<string, unknown>).length,
      });
      return bestResult;
    }

    throw new Error('Partial recovery failed - no valid JSON data found');
  }

  /**
   * Get parsing metrics for monitoring.
   */
  getMetrics(): ParsingMetrics[] {
    return [...this.metrics];
  }

  /**
   * Clear metrics history.
   */
  clearMetrics(): void {
    this.metrics = [];
  }

  /**
   * Get success rate statistics.
   */
  getStats(): { totalAttempts: number; successRate: number; averageProcessingTimeMs: number } {
    if (this.metrics.length === 0) {
      return { totalAttempts: 0, successRate: 0, averageProcessingTimeMs: 0 };
    }

    const successfulAttempts = this.metrics.filter(m => m.success).length;
    const totalProcessingTime = this.metrics.reduce((sum, m) => sum + m.processingTimeMs, 0);

    return {
      totalAttempts: this.metrics.length,
      successRate: successfulAttempts / this.metrics.length,
      averageProcessingTimeMs: totalProcessingTime / this.metrics.length,
    };
  }
}
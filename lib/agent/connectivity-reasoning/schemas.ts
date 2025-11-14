/**
 * Connectivity Reasoning Agent - Type Definitions
 *
 * Schemas and types for the connectivity diagnostic engine that analyzes
 * network controller data (FortiManager, VeloCloud) combined with Discovery
 * context to generate structured connectivity diagnostics.
 */

import { z } from "zod";
import type { DiscoveryContextPack } from "../discovery/context-pack";

/**
 * Confidence level for diagnostic hypotheses
 */
export const ConfidenceLevelSchema = z.enum(["low", "medium", "high"]);
export type ConfidenceLevel = z.infer<typeof ConfidenceLevelSchema>;

/**
 * Network tool results (from FortiManager and VeloCloud)
 */
export interface NetworkToolResults {
  fortimanager?: {
    success: boolean;
    device_name?: string;
    customer?: string;
    summary?: string;
    warnings?: string[];
    connection?: boolean;
    health?: any;
    interfaces?: any[];
    interfaces_down?: string[];
    from_cache?: boolean;
    error?: string;
  };
  velocloud?: {
    success: boolean;
    edges?: Array<{
      id: number;
      name: string;
      activationState: string;
      edgeState: string;
    }>;
    links?: Array<{
      displayName: string;
      state: string;
      vpnState: string;
      backupState?: string;
      lastActive?: number;
      linkQuality?: {
        jitter?: number;
        latency?: number;
        loss?: number;
      };
    }>;
    events?: any[];
    error?: string;
  };
}

/**
 * Input to the connectivity reasoning agent
 */
export interface ConnectivityReasoningInput {
  /** Discovery context pack containing CMDB, case history, business context */
  contextPack: DiscoveryContextPack;

  /** Results from network monitoring tools (optional - agent can call tools if missing) */
  networkToolResults?: NetworkToolResults;

  /** Case metadata for additional context */
  caseMetadata?: {
    caseNumber: string;
    priority?: string;
    urgency?: string;
    shortDescription?: string;
    description?: string;
  };

  /** Options for the diagnostic engine */
  options?: {
    /** Skip network tool calls even if no results provided */
    skipToolCalls?: boolean;

    /** Use stale cached data if fresh data unavailable */
    allowStaleData?: boolean;

    /** Maximum time to wait for network tool responses (ms) */
    toolTimeout?: number;
  };
}

/**
 * Diagnostic hypothesis about connectivity issues
 */
export const DiagnosticHypothesisSchema = z.object({
  /** The diagnostic hypothesis (e.g., "ISP circuit degradation") */
  hypothesis: z.string().min(1).describe("Clear, actionable diagnostic hypothesis"),

  /** Confidence level in this hypothesis */
  confidence: ConfidenceLevelSchema,

  /** Evidence supporting this hypothesis */
  evidence: z
    .array(z.string())
    .min(1)
    .describe("Specific data points supporting this hypothesis"),

  /** Suggested actions to take */
  suggestedActions: z
    .array(z.string())
    .min(1)
    .describe("Concrete next steps to investigate or resolve"),

  /** Follow-up questions to ask the user for clarification */
  followUpQuestions: z
    .array(z.string())
    .optional()
    .describe("Questions to gather more context"),

  /** References to related information */
  references: z
    .object({
      similarCases: z.array(z.string()).optional().describe("Similar case numbers"),
      kbArticles: z.array(z.string()).optional().describe("Relevant KB article IDs"),
      cmdbCIs: z.array(z.string()).optional().describe("Related CMDB CI names"),
    })
    .optional(),

  /** Category of the issue */
  category: z
    .enum([
      "firewall_health",
      "circuit_quality",
      "device_offline",
      "configuration",
      "maintenance_window",
      "topology",
      "resource_exhaustion",
      "unknown",
    ])
    .optional(),
});

export type DiagnosticHypothesis = z.infer<typeof DiagnosticHypothesisSchema>;

/**
 * Complete connectivity diagnostic output
 */
export const ConnectivityDiagnosticSchema = z.object({
  /** List of diagnostic hypotheses ranked by confidence */
  hypotheses: z
    .array(DiagnosticHypothesisSchema)
    .describe("Diagnostic hypotheses ranked by confidence (high to low)"),

  /** Summary of the diagnostic analysis */
  summary: z.string().describe("High-level summary of connectivity assessment"),

  /** Overall confidence in the diagnostics */
  overallConfidence: ConfidenceLevelSchema,

  /** Network devices analyzed */
  devicesAnalyzed: z
    .array(
      z.object({
        name: z.string(),
        type: z.string().optional(),
        status: z.enum(["healthy", "degraded", "offline", "unknown"]),
        source: z.enum(["fortimanager", "velocloud", "cmdb"]),
      })
    )
    .optional(),

  /** Data freshness information */
  dataFreshness: z
    .object({
      fortimanager: z
        .object({
          usedCache: z.boolean(),
          cacheAge: z.number().optional(),
          stale: z.boolean().default(false),
        })
        .optional(),
      velocloud: z
        .object({
          usedCache: z.boolean(),
          cacheAge: z.number().optional(),
          stale: z.boolean().default(false),
        })
        .optional(),
    })
    .optional(),

  /** Metadata about the diagnostic run */
  metadata: z.object({
    generatedAt: z.string(),
    toolsCalled: z.array(z.string()),
    heuristicsApplied: z.array(z.string()),
    contextPackVersion: z.string().optional(),
  }),
});

export type ConnectivityDiagnostic = z.infer<typeof ConnectivityDiagnosticSchema>;

/**
 * Heuristic rule result
 */
export interface HeuristicRuleResult {
  ruleName: string;
  triggered: boolean;
  confidence: ConfidenceLevel;
  hypothesis?: DiagnosticHypothesis;
  metadata?: Record<string, any>;
}

/**
 * Device status from CMDB or controller
 */
export interface DeviceStatus {
  name: string;
  type: "firewall" | "sdwan" | "router" | "switch" | "server" | "unknown";
  status: "healthy" | "degraded" | "offline" | "unknown";
  source: "fortimanager" | "velocloud" | "cmdb";
  details?: {
    ipAddresses?: string[];
    ownerGroup?: string;
    environment?: string;
    relatedDevices?: string[];
    metrics?: Record<string, any>;
  };
}

/**
 * Circuit breaker state for network tool calls
 */
export interface CircuitBreakerState {
  state: "closed" | "open" | "half-open";
  failures: number;
  lastFailure: number | null;
  lastAttempt: number | null;
  nextRetryAt: number | null;
}

/**
 * Rate limit tracker for API calls
 */
export interface RateLimitTracker {
  customer: string;
  tool: "fortimanager" | "velocloud";
  callCount: number;
  windowStart: number;
  windowDuration: number;
  limit: number;
  nearLimit: boolean;
}

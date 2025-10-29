/**
 * Escalation Channel Routing Configuration
 * Maps clients, categories, and assignment groups to Slack channels for non-BAU escalations
 */

export interface EscalationChannelRule {
  /**
   * Client name to match (from account_id field)
   * Use "*" for wildcard/default rule
   */
  client?: string;

  /**
   * Category to match (optional - can combine with client)
   * Example: "Application", "Infrastructure", "Network"
   */
  category?: string;

  /**
   * Assignment group to match (optional - can combine with client/category)
   * Example: "Service Desk", "Network Operations"
   */
  assignmentGroup?: string;

  /**
   * Target Slack channel (without #)
   * Example: "service-desk-escalations"
   */
  channel: string;

  /**
   * Optional priority (higher numbers take precedence)
   * Use to control rule matching when multiple rules could apply
   */
  priority?: number;
}

/**
 * Escalation channel routing rules
 * Rules are evaluated in order of priority (highest first)
 * First matching rule wins
 */
export const escalationChannelRules: EscalationChannelRule[] = [
  // High-priority client-specific channels
  {
    client: "Your Organization",
    channel: "your-org-escalations",
    priority: 100,
  },

  // Category-specific routing (regardless of client)
  {
    category: "Infrastructure",
    channel: "infrastructure-escalations",
    priority: 50,
  },
  {
    category: "Network",
    channel: "network-escalations",
    priority: 50,
  },
  {
    category: "Application",
    channel: "application-escalations",
    priority: 50,
  },

  // Assignment group routing
  {
    assignmentGroup: "Service Desk",
    channel: "service-desk-escalations",
    priority: 40,
  },
  {
    assignmentGroup: "Network Operations",
    channel: "network-escalations",
    priority: 40,
  },

  // Default fallback (lowest priority)
  {
    client: "*",
    channel: "C1WNG303A", // Slack channel ID for default escalations
    priority: 0,
  },
];

/**
 * Get target Slack channel for a case escalation
 *
 * @param client Client name (from account_id)
 * @param category Case category
 * @param assignmentGroup Assignment group name
 * @returns Slack channel name (without #) or default channel
 */
export function getEscalationChannel(
  client?: string,
  category?: string,
  assignmentGroup?: string
): string {
  // Sort rules by priority (highest first)
  const sortedRules = [...escalationChannelRules].sort(
    (a, b) => (b.priority || 0) - (a.priority || 0)
  );

  // Find first matching rule
  for (const rule of sortedRules) {
    let matches = true;

    // Check client match
    if (rule.client && rule.client !== "*") {
      if (!client || !client.toLowerCase().includes(rule.client.toLowerCase())) {
        matches = false;
      }
    }

    // Check category match
    if (rule.category && matches) {
      if (!category || !category.toLowerCase().includes(rule.category.toLowerCase())) {
        matches = false;
      }
    }

    // Check assignment group match
    if (rule.assignmentGroup && matches) {
      if (
        !assignmentGroup ||
        !assignmentGroup.toLowerCase().includes(rule.assignmentGroup.toLowerCase())
      ) {
        matches = false;
      }
    }

    // If rule matches, return channel
    if (matches) {
      console.log(
        `[Escalation Routing] Matched rule: client=${rule.client || "any"}, ` +
          `category=${rule.category || "any"}, group=${rule.assignmentGroup || "any"} ` +
          `→ ${rule.channel}`
      );
      return rule.channel;
    }
  }

  // Fallback to default (should never happen if "*" rule exists)
  const defaultChannel = escalationChannelRules.find((r) => r.client === "*")?.channel || "C1WNG303A";
  console.log(`[Escalation Routing] No rule matched - using default: ${defaultChannel}`);
  return defaultChannel;
}

/**
 * Validate channel configuration
 * Ensures at least one default rule exists
 */
export function validateEscalationChannelConfig(): {
  valid: boolean;
  errors: string[];
} {
  const errors: string[] = [];

  // Check for at least one rule
  if (escalationChannelRules.length === 0) {
    errors.push("No escalation channel rules configured");
  }

  // Check for default/wildcard rule
  const hasDefaultRule = escalationChannelRules.some((r) => r.client === "*");
  if (!hasDefaultRule) {
    errors.push(
      "No default escalation channel rule (client='*') - all unmatched cases will fail"
    );
  }

  // Check for duplicate priorities (warn only)
  const priorityCounts = escalationChannelRules.reduce((acc, rule) => {
    const p = rule.priority || 0;
    acc[p] = (acc[p] || 0) + 1;
    return acc;
  }, {} as Record<number, number>);

  for (const [priority, count] of Object.entries(priorityCounts)) {
    if (count > 1) {
      console.warn(
        `[Escalation Config] Multiple rules with priority ${priority} (${count} rules) - ` +
          `order is non-deterministic`
      );
    }
  }

  return {
    valid: errors.length === 0,
    errors,
  };
}

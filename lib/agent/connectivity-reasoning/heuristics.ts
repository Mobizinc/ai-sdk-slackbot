/**
 * Connectivity Reasoning Heuristics
 *
 * Lightweight diagnostic rules that analyze network controller data
 * combined with Discovery context to explain connectivity gaps.
 *
 * Heuristic categories:
 * 1. Temporal correlation (maintenance windows, off-hours issues)
 * 2. Topology awareness (parent device failures, CMDB relationships)
 * 3. Symptom matching (latency + loss = circuit issue)
 * 4. Historical patterns (similar case resolutions)
 */

import type {
  DiagnosticHypothesis,
  HeuristicRuleResult,
  ConfidenceLevel,
  NetworkToolResults,
  DeviceStatus,
} from "./schemas";
import type { DiscoveryContextPack } from "../discovery/context-pack";

/**
 * Apply all heuristic rules and return diagnostic hypotheses
 */
export function applyHeuristics(
  contextPack: DiscoveryContextPack,
  networkToolResults: NetworkToolResults,
  deviceStatuses: DeviceStatus[]
): HeuristicRuleResult[] {
  const results: HeuristicRuleResult[] = [];

  // Apply each heuristic rule
  results.push(checkTemporalCorrelation(contextPack, networkToolResults));
  results.push(checkTopologyIssues(contextPack, deviceStatuses));
  results.push(checkSymptomPatterns(networkToolResults));
  results.push(checkHistoricalPatterns(contextPack, networkToolResults));
  results.push(checkResourceExhaustion(networkToolResults));
  results.push(checkInterfaceFailures(networkToolResults));

  return results.filter((r) => r.triggered);
}

/**
 * Heuristic 1: Temporal Correlation
 * Check if issues correlate with maintenance windows or off-hours
 */
function checkTemporalCorrelation(
  contextPack: DiscoveryContextPack,
  networkToolResults: NetworkToolResults
): HeuristicRuleResult {
  const policyAlerts = contextPack.policyAlerts || [];
  const maintenanceWindow = policyAlerts.find((alert) => alert.type === "maintenance_window");
  const afterHours = policyAlerts.find((alert) => alert.type === "after_hours");

  // Check if we have a maintenance window
  if (maintenanceWindow) {
    const changeNumber = maintenanceWindow.details?.change_number as string || "Unknown";
    const changeDescription = maintenanceWindow.details?.short_description as string || "";

    return {
      ruleName: "temporal_correlation_maintenance",
      triggered: true,
      confidence: "high",
      hypothesis: {
        hypothesis: `Connectivity issue likely related to active maintenance window (${changeNumber})`,
        confidence: "high",
        evidence: [
          `Active maintenance window detected: ${changeNumber}`,
          changeDescription ? `Change description: ${changeDescription}` : "",
          maintenanceWindow.severity === "critical"
            ? "High-priority change in progress"
            : "Scheduled maintenance in progress",
        ].filter(Boolean),
        suggestedActions: [
          `Review change record ${changeNumber} for impact scope`,
          "Verify if the reported issue is an expected impact of the change",
          "Contact change implementer if issue is outside expected scope",
          "Monitor for resolution when maintenance window ends",
        ],
        category: "maintenance_window",
      },
      metadata: {
        changeNumber,
        changeDescription,
        severity: maintenanceWindow.severity,
      },
    };
  }

  // Check if issue occurred during off-hours
  if (afterHours) {
    return {
      ruleName: "temporal_correlation_after_hours",
      triggered: true,
      confidence: "medium",
      hypothesis: {
        hypothesis: "Issue detected outside normal service hours",
        confidence: "medium",
        evidence: [
          "Case opened during after-hours period",
          afterHours.message || "Activity detected outside business hours",
        ],
        suggestedActions: [
          "Verify if on-call support is required",
          "Check if issue started during business hours or just reported now",
          "Assess urgency based on service level and business impact",
        ],
        followUpQuestions: [
          "When did you first notice the connectivity issue?",
          "Is this affecting business-critical operations?",
        ],
        category: "unknown",
      },
      metadata: {
        afterHours: true,
      },
    };
  }

  return {
    ruleName: "temporal_correlation",
    triggered: false,
    confidence: "low",
  };
}

/**
 * Heuristic 2: Topology Awareness
 * Check if parent/related devices in CMDB are affected
 */
function checkTopologyIssues(
  contextPack: DiscoveryContextPack,
  deviceStatuses: DeviceStatus[]
): HeuristicRuleResult {
  const cmdbHits = contextPack.cmdbHits?.items || [];

  // Find offline or degraded devices
  const offlineDevices = deviceStatuses.filter((d) => d.status === "offline");
  const degradedDevices = deviceStatuses.filter((d) => d.status === "degraded");

  if (offlineDevices.length === 0 && degradedDevices.length === 0) {
    return {
      ruleName: "topology_issues",
      triggered: false,
      confidence: "low",
    };
  }

  // Check if we have parent/child relationships in CMDB
  const affectedDeviceNames = [...offlineDevices, ...degradedDevices].map((d) => d.name);
  const cmdbWithRelations = cmdbHits.filter(
    (ci) => ci.relatedItems && ci.relatedItems.length > 0
  );

  // Check if a parent device (firewall/gateway) is offline
  const parentFirewallOffline = offlineDevices.some(
    (d) => d.type === "firewall" || d.details?.ownerGroup?.toLowerCase().includes("network")
  );

  if (parentFirewallOffline) {
    const firewallName = offlineDevices.find((d) => d.type === "firewall")?.name;
    const relatedCIs = cmdbHits
      .filter((ci) => ci.name === firewallName)
      .flatMap((ci) => ci.relatedItems || [])
      .map((item) => item.name);

    return {
      ruleName: "topology_parent_offline",
      triggered: true,
      confidence: "high",
      hypothesis: {
        hypothesis: `Gateway/firewall ${firewallName} is offline, affecting downstream connectivity`,
        confidence: "high",
        evidence: [
          `Primary firewall ${firewallName} is not responding to FortiManager`,
          relatedCIs.length > 0
            ? `${relatedCIs.length} related devices may be affected: ${relatedCIs.slice(0, 3).join(", ")}`
            : "This firewall likely protects multiple downstream devices",
          "CMDB relationships indicate this is a network gateway",
        ].filter(Boolean),
        suggestedActions: [
          `Verify physical connectivity to ${firewallName}`,
          "Check if firewall is powered on and accessible via console",
          "Review recent change history for this device",
          "Escalate to network team if firewall remains unreachable",
        ],
        references: {
          cmdbCIs: [firewallName!, ...relatedCIs.slice(0, 5)],
        },
        category: "device_offline",
      },
      metadata: {
        offlineDevice: firewallName,
        relatedDevices: relatedCIs,
      },
    };
  }

  // General degraded device detection
  if (degradedDevices.length > 0) {
    const deviceList = degradedDevices.map((d) => d.name).join(", ");

    return {
      ruleName: "topology_degraded_devices",
      triggered: true,
      confidence: "medium",
      hypothesis: {
        hypothesis: `Network devices showing degraded performance: ${deviceList}`,
        confidence: "medium",
        evidence: [
          `${degradedDevices.length} network device(s) reporting degraded status`,
          ...degradedDevices.map((d) => `${d.name} (${d.source})`),
        ],
        suggestedActions: [
          "Review device metrics for resource utilization",
          "Check for interface errors or high error rates",
          "Verify link quality to upstream providers",
          "Consider restarting services if metrics indicate resource exhaustion",
        ],
        category: "firewall_health",
      },
      metadata: {
        degradedDevices: degradedDevices.map((d) => d.name),
      },
    };
  }

  return {
    ruleName: "topology_issues",
    triggered: false,
    confidence: "low",
  };
}

/**
 * Heuristic 3: Symptom Matching
 * Recognize common connectivity patterns from network metrics
 */
function checkSymptomPatterns(networkToolResults: NetworkToolResults): HeuristicRuleResult {
  const velocloud = networkToolResults.velocloud;

  if (!velocloud || !velocloud.success || !velocloud.links) {
    return {
      ruleName: "symptom_patterns",
      triggered: false,
      confidence: "low",
    };
  }

  // Check for circuit quality issues (high latency + packet loss)
  const degradedLinks = velocloud.links.filter((link) => {
    const quality = link.linkQuality;
    if (!quality) return false;

    const highLatency = (quality.latency || 0) > 100; // > 100ms
    const highLoss = (quality.loss || 0) > 1; // > 1% loss
    const highJitter = (quality.jitter || 0) > 30; // > 30ms jitter

    return highLatency || highLoss || highJitter;
  });

  if (degradedLinks.length > 0) {
    const symptoms: string[] = [];
    const issues: string[] = [];

    degradedLinks.forEach((link) => {
      const quality = link.linkQuality!;
      const linkIssues: string[] = [];

      if ((quality.latency || 0) > 100) {
        linkIssues.push(`high latency (${quality.latency}ms)`);
      }
      if ((quality.loss || 0) > 1) {
        linkIssues.push(`packet loss (${quality.loss}%)`);
      }
      if ((quality.jitter || 0) > 30) {
        linkIssues.push(`jitter (${quality.jitter}ms)`);
      }

      if (linkIssues.length > 0) {
        symptoms.push(`${link.displayName}: ${linkIssues.join(", ")}`);
      }
    });

    // High latency + packet loss strongly suggests circuit issue
    const hasLatencyAndLoss = degradedLinks.some((link) => {
      const q = link.linkQuality!;
      return (q.latency || 0) > 100 && (q.loss || 0) > 1;
    });

    const confidence: ConfidenceLevel = hasLatencyAndLoss ? "high" : "medium";

    return {
      ruleName: "symptom_circuit_quality",
      triggered: true,
      confidence,
      hypothesis: {
        hypothesis: hasLatencyAndLoss
          ? "ISP circuit degradation detected (high latency and packet loss)"
          : "Network link quality degradation detected",
        confidence,
        evidence: [
          `${degradedLinks.length} SD-WAN link(s) showing poor performance`,
          ...symptoms,
        ],
        suggestedActions: [
          "Run traceroute to identify where latency/loss is occurring",
          "Check ISP circuit status and recent outages",
          "Review VeloCloud edge device health",
          "Consider failing over to backup circuit if available",
          "Escalate to ISP if issue persists beyond SD-WAN edge",
        ],
        references: {
          cmdbCIs: degradedLinks.map((link) => link.displayName),
        },
        category: "circuit_quality",
      },
      metadata: {
        degradedLinks: degradedLinks.map((link) => ({
          name: link.displayName,
          latency: link.linkQuality?.latency,
          loss: link.linkQuality?.loss,
          jitter: link.linkQuality?.jitter,
        })),
      },
    };
  }

  // Check for links that are down
  const downLinks = velocloud.links.filter(
    (link) => link.state === "DISCONNECTED" || link.vpnState === "DISCONNECTED"
  );

  if (downLinks.length > 0) {
    return {
      ruleName: "symptom_link_down",
      triggered: true,
      confidence: "high",
      hypothesis: {
        hypothesis: `${downLinks.length} SD-WAN link(s) are offline`,
        confidence: "high",
        evidence: [
          ...downLinks.map((link) => `${link.displayName} is ${link.state}`),
          downLinks.some((link) => link.lastActive)
            ? "Link failure detected recently"
            : "Links have been down for extended period",
        ],
        suggestedActions: [
          "Check physical connectivity (cable, port, power)",
          "Verify ISP circuit is active",
          "Review recent configuration changes on edge device",
          "Contact ISP to verify circuit status",
        ],
        category: "device_offline",
      },
      metadata: {
        downLinks: downLinks.map((link) => link.displayName),
      },
    };
  }

  return {
    ruleName: "symptom_patterns",
    triggered: false,
    confidence: "low",
  };
}

/**
 * Heuristic 4: Historical Patterns
 * Match against similar cases and resolutions
 */
function checkHistoricalPatterns(
  contextPack: DiscoveryContextPack,
  networkToolResults: NetworkToolResults
): HeuristicRuleResult {
  const similarCases = contextPack.similarCases?.cases || [];

  if (similarCases.length === 0) {
    return {
      ruleName: "historical_patterns",
      triggered: false,
      confidence: "low",
    };
  }

  // Look for high-scoring similar cases (score > 0.7)
  const relevantCases = similarCases.filter((c) => c.score > 0.7);

  if (relevantCases.length > 0) {
    const topCase = relevantCases[0];
    const caseList = relevantCases.slice(0, 3).map((c) => c.caseNumber);

    return {
      ruleName: "historical_pattern_match",
      triggered: true,
      confidence: "medium",
      hypothesis: {
        hypothesis: `Similar connectivity issues resolved in past cases (${topCase.caseNumber})`,
        confidence: "medium",
        evidence: [
          `Found ${relevantCases.length} similar case(s) with high similarity scores`,
          `Top match: ${topCase.caseNumber} (score: ${(topCase.score * 100).toFixed(0)}%)`,
          topCase.excerpt ? `Excerpt: ${topCase.excerpt.substring(0, 200)}...` : "",
        ].filter(Boolean),
        suggestedActions: [
          `Review resolution from ${topCase.caseNumber}`,
          "Check if same resolution approach applies to current issue",
          "Look for common patterns (same devices, same time of day, etc.)",
        ],
        followUpQuestions: [
          "Have you experienced this issue before?",
          "When was the last occurrence?",
        ],
        references: {
          similarCases: caseList,
        },
        category: "unknown",
      },
      metadata: {
        similarCases: relevantCases.map((c) => ({
          caseNumber: c.caseNumber,
          score: c.score,
        })),
      },
    };
  }

  return {
    ruleName: "historical_patterns",
    triggered: false,
    confidence: "low",
  };
}

/**
 * Heuristic 5: Resource Exhaustion
 * Check for firewall/device resource issues
 */
function checkResourceExhaustion(networkToolResults: NetworkToolResults): HeuristicRuleResult {
  const fm = networkToolResults.fortimanager;

  if (!fm || !fm.success || !fm.health?.resources) {
    return {
      ruleName: "resource_exhaustion",
      triggered: false,
      confidence: "low",
    };
  }

  const resources = fm.health.resources;
  const warnings: string[] = [];
  let cpuHigh = false;
  let memoryHigh = false;
  let sessionsHigh = false;

  // Check CPU utilization
  if (resources.cpu_usage !== undefined && resources.cpu_usage > 80) {
    warnings.push(`CPU usage at ${resources.cpu_usage}%`);
    cpuHigh = true;
  }

  // Check memory utilization
  if (
    resources.memory_usage !== undefined &&
    resources.memory_total !== undefined &&
    resources.memory_total > 0
  ) {
    const memoryPct = (resources.memory_usage / resources.memory_total) * 100;
    if (memoryPct > 80) {
      warnings.push(`Memory usage at ${memoryPct.toFixed(0)}%`);
      memoryHigh = true;
    }
  }

  // Check session count (if we know the limit)
  if (resources.session_count !== undefined && resources.session_limit !== undefined) {
    const sessionPct = (resources.session_count / resources.session_limit) * 100;
    if (sessionPct > 80) {
      warnings.push(`Sessions at ${sessionPct.toFixed(0)}% of limit`);
      sessionsHigh = true;
    }
  }

  if (warnings.length > 0) {
    const confidence: ConfidenceLevel = cpuHigh || memoryHigh ? "high" : "medium";

    return {
      ruleName: "resource_exhaustion",
      triggered: true,
      confidence,
      hypothesis: {
        hypothesis: `Firewall ${fm.device_name} is experiencing resource exhaustion`,
        confidence,
        evidence: warnings,
        suggestedActions: [
          "Review active connections and traffic patterns",
          "Check for unusual traffic spikes or DDoS activity",
          "Consider restarting non-critical services to free resources",
          "Review firewall rules for inefficiencies",
          "Escalate for capacity planning if sustained high utilization",
        ],
        category: "resource_exhaustion",
      },
      metadata: {
        deviceName: fm.device_name,
        cpu: resources.cpu_usage,
        memory: resources.memory_usage,
        sessions: resources.session_count,
      },
    };
  }

  return {
    ruleName: "resource_exhaustion",
    triggered: false,
    confidence: "low",
  };
}

/**
 * Heuristic 6: Interface Failures
 * Check for interface-level issues
 */
function checkInterfaceFailures(networkToolResults: NetworkToolResults): HeuristicRuleResult {
  const fm = networkToolResults.fortimanager;

  if (!fm || !fm.success || !fm.interfaces_down || fm.interfaces_down.length === 0) {
    return {
      ruleName: "interface_failures",
      triggered: false,
      confidence: "low",
    };
  }

  const downInterfaces = fm.interfaces_down;

  return {
    ruleName: "interface_down",
    triggered: true,
    confidence: "high",
    hypothesis: {
      hypothesis: `${downInterfaces.length} interface(s) on ${fm.device_name} are offline`,
      confidence: "high",
      evidence: [
        ...downInterfaces.map((iface) => `Interface ${iface} is down`),
        "Physical link failure or configuration issue detected",
      ],
      suggestedActions: [
        "Check physical cable connections",
        "Verify port configuration on firewall and switch",
        "Review recent configuration changes",
        "Check for port errors or CRC errors",
        "Verify VLAN/trunking configuration if applicable",
      ],
      references: {
        cmdbCIs: [fm.device_name!],
      },
      category: "device_offline",
    },
    metadata: {
      deviceName: fm.device_name,
      downInterfaces,
    },
  };
}

/**
 * Rank hypotheses by confidence (high > medium > low)
 * and return only triggered rules with hypotheses
 */
export function rankHypotheses(results: HeuristicRuleResult[]): DiagnosticHypothesis[] {
  const confidenceOrder: Record<ConfidenceLevel, number> = {
    high: 3,
    medium: 2,
    low: 1,
  };

  return results
    .filter((r) => r.triggered && r.hypothesis)
    .map((r) => r.hypothesis!)
    .sort((a, b) => {
      return confidenceOrder[b.confidence] - confidenceOrder[a.confidence];
    });
}

/**
 * Compute overall confidence based on the best hypothesis
 */
export function computeOverallConfidence(hypotheses: DiagnosticHypothesis[]): ConfidenceLevel {
  if (hypotheses.length === 0) return "low";

  // Return the confidence of the highest-ranked hypothesis
  const topHypothesis = hypotheses[0];
  return topHypothesis.confidence;
}

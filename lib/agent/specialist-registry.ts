import { getAgentHealth } from "../services/agent-health-monitor";
import { serviceNowClient } from "../tools/servicenow";
import type { ChatMessage } from "../services/anthropic-chat";

const CASE_NUMBER_REGEX = /\b(?:SCS|CS|INC|RITM|REQ|CHG|PRB|SCTASK|TASK|STASK)[0-9]{4,}\b/gi;

export type SpecialistSignal = "caseNumber" | "projectInterest" | "networkDevice" | "feedback";
export type SpecialistContextRequirementId = "caseNumber" | "impactedUser";

interface RequirementConfig {
  id: SpecialistContextRequirementId;
  label: string;
  description: string;
  prompt: string;
  isSatisfied: (input: RequirementCheckInput) => boolean;
}

interface RequirementCheckInput {
  signals: Set<SpecialistSignal>;
  routingInput: SpecialistRoutingInput;
}

export interface SpecialistRequirementPrompt {
  id: SpecialistContextRequirementId;
  label: string;
  description: string;
  prompt: string;
  agents: string[];
}

export interface SpecialistAgentDefinition {
  id: string;
  name: string;
  description: string;
  keywords: string[];
  sampleUtterances?: string[];
  requiredSignals?: SpecialistSignal[];
  optionalSignals?: SpecialistSignal[];
  requiredContext?: SpecialistContextRequirementId[];
  toolNames?: string[];
  eventsEmitted?: string[];
  entryPoint?: "tool" | "workflow" | "event";
  costClass?: "low" | "medium" | "high";
  latencyClass?: "short" | "medium" | "long";
  baseWeight?: number;
  healthCheck?: () => Promise<boolean>;
  healthStatus?: 'healthy' | 'degraded' | 'down';
  averageCost?: number;
  averageLatency?: number;
  includes?: string[];
}

export interface SpecialistAgentMatch {
  agent: SpecialistAgentDefinition;
  score: number;
  matchedKeywords: string[];
  missingSignals: SpecialistSignal[];
  missingContextRequirements: SpecialistContextRequirementId[];
}

export interface SpecialistRoutingInput {
  messages: ChatMessage[];
  caseNumbers?: string[];
  contextMetadata?: Record<string, unknown> | undefined;
}

export interface ToolAllowlistResult {
  allowlist?: string[];
  matches: SpecialistAgentMatch[];
  pendingRequirements?: SpecialistRequirementPrompt[];
}

const REQUIREMENT_CONFIGS: Record<SpecialistContextRequirementId, RequirementConfig> = {
  caseNumber: {
    id: "caseNumber",
    label: "ServiceNow case number",
    description: "Required to look up classification, discovery, and run downstream orchestration safely.",
    prompt:
      "I can run the requested automation once you share the ServiceNow case number associated with this issue.",
    isSatisfied: ({ signals }) => signals.has("caseNumber"),
  },
  impactedUser: {
    id: "impactedUser",
    label: "Impacted user or account",
    description: "Needed to scope user-specific diagnostics or communications.",
    prompt:
      "Let me know which user or account is impacted so I can narrow the diagnostics appropriately.",
    isSatisfied: ({ routingInput }) => {
      const metadata = routingInput.contextMetadata ?? {};
      return Boolean(
        (metadata as { impactedUser?: string }).impactedUser ||
          (metadata as { impactedUsers?: unknown[] }).impactedUsers,
      );
    },
  },
};

const SPECIALIST_AGENTS: SpecialistAgentDefinition[] = [
  {
    id: "servicenow_orchestration",
    name: "ServiceNow Orchestration Agent",
    description:
      "Runs the full ServiceNow orchestration pipeline (Discovery → Classification → Enrichment → Side Effects → Escalation) for cases and incidents.",
    keywords: ["triage", "classify", "servicenow", "orchestrate", "workflow", "incident", "case"],
    sampleUtterances: ["triage SCS0001234", "classify this incident", "run the orchestration for Altus"],
    requiredContext: ["caseNumber"],
    toolNames: [
      "orchestrateServiceNowCase",
      "serviceNow",
      "searchCases",
      "runClassificationAgent",
      "getCase",
      "getIncident",
      "getCaseJournal",
    ],
    includes: ["classification_runner"],
    eventsEmitted: ["case.triage.completed"],
    entryPoint: "tool",
    costClass: "high",
    latencyClass: "long",
    baseWeight: 6,
    healthCheck: async () => serviceNowClient.isConfigured(),
  },
  {
    id: "knowledge_base_agent",
    name: "Knowledge Base Agent",
    description: "Drafts and updates KB articles once a case is resolved or documentation is requested.",
    keywords: ["kb", "knowledge base", "article", "write-up", "documentation", "faq"],
    sampleUtterances: ["draft a KB article", "document this fix", "create a knowledge base entry"],
    toolNames: ["generateKBArticle", "caseAggregation"],
    entryPoint: "tool",
    costClass: "medium",
    latencyClass: "medium",
    baseWeight: 4,
  },
  {
    id: "case_history_agent",
    name: "Case History & Analytics Agent",
    description: "Searches ServiceNow for historical cases, aggregates trends, and surfaces analytics.",
    keywords: ["search cases", "case history", "recent cases", "analytics", "metrics", "trend"],
    toolNames: ["searchCases", "caseAggregation"],
    entryPoint: "tool",
    costClass: "medium",
    latencyClass: "medium",
    baseWeight: 3,
  },
  {
    id: "cmdb_agent",
    name: "CMDB Agent",
    description: "Finds or updates configuration items, relationships, and context for troubleshooting.",
    keywords: ["cmdb", "configuration item", "ci", "asset", "inventory", "infrastructure"],
    toolNames: ["searchConfigurationItems", "getCIRelationships", "createConfigurationItem", "proposeContextUpdate"],
    entryPoint: "tool",
    costClass: "medium",
    latencyClass: "medium",
    baseWeight: 3,
  },
  {
    id: "connectivity_reasoning_agent",
    name: "Connectivity Reasoning Agent",
    description:
      "Analyzes network connectivity issues by combining CMDB data, Discovery context, FortiManager firewall metrics, and VeloCloud SD-WAN link quality. " +
      "Runs lightweight heuristics (temporal correlation, topology awareness, symptom matching, historical patterns) to generate structured diagnostic hypotheses. " +
      "Returns confidence-ranked diagnostics with evidence, suggested actions, and follow-up questions.",
    keywords: [
      "connectivity",
      "network diagnostics",
      "packet loss",
      "high latency",
      "firewall",
      "fortinet",
      "fortimanager",
      "vpn",
      "velocloud",
      "sd-wan",
      "link down",
      "circuit",
      "device offline",
    ],
    sampleUtterances: [
      "diagnose connectivity for SCS0001234",
      "why is the network slow?",
      "firewall seems offline",
      "check SD-WAN link quality",
    ],
    requiredContext: ["caseNumber"],
    toolNames: ["diagnoseConnectivity", "getFirewallStatus", "queryVelocloud"],
    entryPoint: "tool",
    costClass: "medium",
    latencyClass: "medium",
    baseWeight: 5,
  },
  {
    id: "classification_runner",
    name: "Discovery & Classification Agent",
    description: "Runs the standalone classification runner when only analytic output is needed (no side effects).",
    keywords: ["classification", "discovery pack", "context pack", "analysis"],
    requiredContext: ["caseNumber"],
    toolNames: ["runClassificationAgent", "searchSimilarCases"],
    entryPoint: "tool",
    baseWeight: 2,
  },
  {
    id: "documentation_research_agent",
    name: "Documentation Research Agent",
    description: "Searches Microsoft Learn or the web for official documentation and how-tos.",
    keywords: ["docs", "documentation", "learn", "tutorial", "guide"],
    toolNames: ["microsoftLearnSearch", "searchWeb"],
    entryPoint: "tool",
    baseWeight: 2,
  },
  {
    id: "feedback_collector",
    name: "Feedback & Feature Collector",
    description: "Captures product feedback, feature requests, and bug reports for later review.",
    keywords: ["feedback", "feature request", "bug", "issue report"],
    requiredSignals: ["feedback"],
    toolNames: ["collectFeatureFeedback"],
    entryPoint: "tool",
    baseWeight: 2,
  },
  {
    id: "project_interview_agent",
    name: "Project Interview Agent",
    description: "Handles project interest workflows and DM-based interviews (non-tool workflow).",
    keywords: ["project interview", "i'm interested", "mentor", "project onboarding"],
    eventsEmitted: ["project_interview.completed"],
    entryPoint: "workflow",
    baseWeight: 1,
  },
];

const MAX_SPECIALIST_SHORTLIST = 4;

export function listSpecialistAgents(): SpecialistAgentDefinition[] {
  return [...SPECIALIST_AGENTS];
}

export function matchSpecialistAgents(input: SpecialistRoutingInput): SpecialistAgentMatch[] {
  const corpus = buildNormalizedCorpus(input.messages);
  const detectedCaseNumbers = detectCaseNumbers(corpus);
  const combinedCaseNumbers = new Set<string>([
    ...detectedCaseNumbers,
    ...((input.caseNumbers ?? []).map((cn) => cn.toUpperCase())),
  ]);

  const signals = new Set<SpecialistSignal>();
  if (combinedCaseNumbers.size > 0) {
    signals.add("caseNumber");
  }
  if (isTruthy(input.contextMetadata?.projectInterest)) {
    signals.add("projectInterest");
  }
  if (corpus.includes("firewall") || corpus.includes("vpn") || corpus.includes("velocloud")) {
    signals.add("networkDevice");
  }
  if (corpus.includes("feedback") || corpus.includes("feature request") || corpus.includes("bug")) {
    signals.add("feedback");
  }

  const matches: SpecialistAgentMatch[] = SPECIALIST_AGENTS.map((agent) => {
    let score = agent.baseWeight ?? 0;
    const matchedKeywords: string[] = [];

    for (const keyword of agent.keywords) {
      const normalized = keyword.toLowerCase();
      if (corpus.includes(normalized)) {
        matchedKeywords.push(keyword);
        score += 4;
      }
    }

    if (agent.sampleUtterances) {
      for (const utterance of agent.sampleUtterances) {
        if (corpus.includes(utterance.toLowerCase())) {
          matchedKeywords.push(utterance);
          score += 2;
        }
      }
    }

    const health = getAgentHealth(agent.id);
    if (health) {
        if (health.status === 'down') {
            score = 0; // Don't use agents that are down
        } else if (health.status === 'degraded') {
            score *= 0.5; // Halve the score for degraded agents
        }
    }

    const missingSignals: SpecialistSignal[] = [];
    if (agent.requiredSignals) {
      for (const signal of agent.requiredSignals) {
        if (!signals.has(signal)) {
          missingSignals.push(signal);
          score -= 2;
        } else {
          score += 1;
        }
      }
    }

    const missingContextRequirements: SpecialistContextRequirementId[] = [];
    if (agent.requiredContext) {
      for (const requirementId of agent.requiredContext) {
        const requirement = REQUIREMENT_CONFIGS[requirementId];
        if (!requirement) continue;
        const satisfied = requirement.isSatisfied({ signals, routingInput: input });
        if (!satisfied) {
          missingContextRequirements.push(requirementId);
          score -= 1;
        } else {
          score += 0.5;
        }
      }
    }

    const hasRequiredSignalSatisfied = Boolean(
      agent.requiredSignals?.some((signal) => signals.has(signal))
    );

    if (matchedKeywords.length === 0 && !hasRequiredSignalSatisfied) {
      return null;
    }

    return {
      agent,
      score,
      matchedKeywords,
      missingSignals,
      missingContextRequirements,
    };
  })
    .filter((match): match is SpecialistAgentMatch => match !== null && match !== undefined && match.score > 0)
    .sort((a, b) => b.score - a.score)
    .slice(0, MAX_SPECIALIST_SHORTLIST);

  return matches;
}

export function buildToolAllowList(input: SpecialistRoutingInput): ToolAllowlistResult {
  const matches = matchSpecialistAgents(input);
  const pendingMap = new Map<
    SpecialistContextRequirementId,
    { config: RequirementConfig; agents: Set<string> }
  >();

  const viable = matches.filter((match) => {
    const requirementsMissing = match.missingContextRequirements.length > 0;
    if (requirementsMissing && match.missingSignals.length === 0) {
      match.missingContextRequirements.forEach((reqId) => {
        const config = REQUIREMENT_CONFIGS[reqId];
        if (!config) return;
        const bucket = pendingMap.get(reqId) ?? { config, agents: new Set<string>() };
        bucket.agents.add(match.agent.name);
        pendingMap.set(reqId, bucket);
      });
    }

    return (
      match.missingSignals.length === 0 &&
      match.missingContextRequirements.length === 0 &&
      match.agent.toolNames &&
      match.agent.toolNames.length > 0
    );
  });

  if (viable.length === 0) {
    return { matches, pendingRequirements: buildPendingRequirements(pendingMap) };
  }

  const shortlist = new Set<string>();
  viable.slice(0, MAX_SPECIALIST_SHORTLIST).forEach((match) => {
    match.agent.toolNames?.forEach((tool) => shortlist.add(tool));
  });

  if (shortlist.size === 0) {
    return { matches, pendingRequirements: buildPendingRequirements(pendingMap) };
  }

  return {
    matches,
    allowlist: Array.from(shortlist),
    pendingRequirements: buildPendingRequirements(pendingMap),
  };
}

function buildPendingRequirements(
  pendingMap: Map<SpecialistContextRequirementId, { config: RequirementConfig; agents: Set<string> }>,
): SpecialistRequirementPrompt[] | undefined {
  if (pendingMap.size === 0) {
    return undefined;
  }
  return Array.from(pendingMap.values()).map(({ config, agents }) => ({
    id: config.id,
    label: config.label,
    description: config.description,
    prompt: `${config.prompt} (Needed for: ${Array.from(agents).join(", ")})`,
    agents: Array.from(agents),
  }));
}

function buildNormalizedCorpus(messages: ChatMessage[]): string {
  if (!messages || messages.length === 0) {
    return "";
  }

  return messages
    .filter((msg) => msg.role !== "system")
    .map((msg) => normalizeText(extractText(msg)))
    .join("\n");
}

function extractText(message: ChatMessage): string {
  if (typeof message.content === "string") {
    return message.content;
  }
  if (Array.isArray(message.content)) {
    return message.content
      .map((block: any) => {
        if (typeof block === "string") return block;
        if (block && typeof block === "object" && typeof block.text === "string") {
          return block.text;
        }
        return "";
      })
      .join(" ");
  }
  if (message.content && typeof message.content === "object" && "text" in message.content) {
    return String((message.content as any).text ?? "");
  }
  return String(message.content ?? "");
}

function normalizeText(text: string): string {
  return text.toLowerCase();
}

function detectCaseNumbers(text: string): string[] {
  const matches = text.match(CASE_NUMBER_REGEX);
  if (!matches) {
    return [];
  }
  return matches.map((match) => match.toUpperCase());
}

function isTruthy(value: unknown): boolean {
  return value === true || value === "true" || value === 1;
}

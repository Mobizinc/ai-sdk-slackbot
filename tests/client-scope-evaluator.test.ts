import { describe, it, expect } from "vitest";
import { evaluateScopeAgainstPolicy } from "../lib/services/client-scope-evaluator";
import type { CaseClassification } from "../lib/services/case-classifier";

const baseClassification: CaseClassification = {
  category: "Networking",
  confidence_score: 0.92,
  reasoning: "",
  keywords: ["network"],
  quick_summary: "",
  immediate_next_steps: [],
  technical_entities: {
    ip_addresses: [],
    systems: [],
    users: [],
    software: [],
    error_codes: [],
  },
  urgency_level: "Medium",
  business_intelligence: {},
};

describe("evaluateScopeAgainstPolicy", () => {
  const policy = {
    clientName: "Altus Community Healthcare",
    effortThresholds: {
      incidentHours: 24,
      serviceRequestHours: 8,
    },
    onsiteSupport: {
      includedHoursPerMonth: 48,
      overageRateUsd: 125,
      requiresPreapproval: true,
    },
  } as const;

  it("flags incidents that exceed effort thresholds", () => {
    const classification: CaseClassification = {
      ...baseClassification,
      record_type_suggestion: {
        type: "Incident",
        is_major_incident: false,
        reasoning: "",
      },
      scope_analysis: {
        estimated_effort_hours: 36,
        reasoning: "Requires multi-day remediation",
      },
    };

    const evaluation = evaluateScopeAgainstPolicy(policy, classification);

    expect(evaluation).not.toBeNull();
    expect(evaluation?.shouldEscalate).toBe(true);
    expect(evaluation?.exceededEffortThreshold).toBe(true);
    expect(evaluation?.reasons[0]).toContain("exceeds incident cap");
  });

  it("flags onsite overages", () => {
    const classification: CaseClassification = {
      ...baseClassification,
      record_type_suggestion: {
        type: "Case",
        is_major_incident: false,
        reasoning: "",
      },
      scope_analysis: {
        estimated_effort_hours: 6,
        requires_onsite_support: true,
        onsite_hours_estimate: 64,
      },
    };

    const evaluation = evaluateScopeAgainstPolicy(policy, classification);

    expect(evaluation).not.toBeNull();
    expect(evaluation?.shouldEscalate).toBe(true);
    expect(evaluation?.exceededOnsiteThreshold).toBe(true);
  });

  it("returns null when no policy is configured", () => {
    const classification: CaseClassification = {
      ...baseClassification,
      scope_analysis: {
        estimated_effort_hours: 2,
      },
    };

    expect(evaluateScopeAgainstPolicy(null, classification)).toBeNull();
  });
});

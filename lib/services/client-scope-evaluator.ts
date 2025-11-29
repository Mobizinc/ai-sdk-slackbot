import type { ClientScopePolicySummary } from "./client-scope-policy-service";
import type { CaseClassification, ScopeAnalysis } from "./case-classifier";

export interface ScopePolicyEvaluationResult {
  clientName?: string;
  shouldEscalate: boolean;
  reasons: string[];
  exceededEffortThreshold?: boolean;
  exceededOnsiteThreshold?: boolean;
  flaggedProjectWork?: boolean;
  estimatedEffortHours?: number;
  onsiteHoursEstimate?: number;
  policyEffortThresholds?: ClientScopePolicySummary["effortThresholds"];
  policyOnsiteSupport?: ClientScopePolicySummary["onsiteSupport"];
}

function exceedsThreshold(
  hours: number | undefined,
  threshold?: number
): boolean {
  if (typeof hours !== "number" || !Number.isFinite(hours)) {
    return false;
  }
  if (typeof threshold !== "number" || !Number.isFinite(threshold)) {
    return false;
  }
  return hours > threshold;
}

function hasFlag(scope: ScopeAnalysis | undefined, flag: string): boolean {
  if (!scope?.contract_flags) {
    return false;
  }
  return scope.contract_flags.includes(flag);
}

export function evaluateScopeAgainstPolicy(
  policy: ClientScopePolicySummary | null | undefined,
  classification: CaseClassification
): ScopePolicyEvaluationResult | null {
  if (!policy) {
    return null;
  }

  const scope = classification.scope_analysis;
  const reasons: string[] = [];
  let exceededEffortThreshold = false;
  let exceededOnsiteThreshold = false;
  let flaggedProjectWork = false;

  const estimatedEffort = scope?.estimated_effort_hours;
  const onsiteHours = scope?.onsite_hours_estimate;
  const requiresOnsite = scope?.requires_onsite_support;
  const recordType = classification.record_type_suggestion?.type;

  if (scope?.needs_project_sow) {
    flaggedProjectWork = true;
    if (scope.reasoning) {
      reasons.push(scope.reasoning);
    } else {
      reasons.push("Scope analysis indicates contract requires a separate SOW");
    }
  }

  if (scope?.is_new_capability) {
    flaggedProjectWork = true;
    reasons.push("Work introduces a new capability beyond BAU support");
  }

  if (estimatedEffort && policy.effortThresholds) {
    const incidentExceeded =
      (recordType === "Incident" || recordType === "Problem") &&
      exceedsThreshold(estimatedEffort, policy.effortThresholds.incidentHours);
    const serviceRequestExceeded =
      (!recordType || recordType === "Case" || recordType === "Change") &&
      exceedsThreshold(estimatedEffort, policy.effortThresholds.serviceRequestHours);

    if (incidentExceeded) {
      exceededEffortThreshold = true;
      reasons.push(
        `Estimated ${estimatedEffort}h exceeds incident cap of ${policy.effortThresholds.incidentHours}h`
      );
    } else if (serviceRequestExceeded) {
      exceededEffortThreshold = true;
      reasons.push(
        `Estimated ${estimatedEffort}h exceeds service request cap of ${policy.effortThresholds.serviceRequestHours}h`
      );
    }
  }

  if (requiresOnsite && policy.onsiteSupport) {
    const onsiteExceeded = exceedsThreshold(
      onsiteHours,
      policy.onsiteSupport.includedHoursPerMonth
    );
    if (onsiteExceeded) {
      exceededOnsiteThreshold = true;
      reasons.push(
        `Onsite requirement (${onsiteHours ?? 0}h) exceeds monthly allocation of ${policy.onsiteSupport.includedHoursPerMonth}h`
      );
    }
  }

  if (hasFlag(scope, "disallowed_work")) {
    flaggedProjectWork = true;
    reasons.push("Matches disallowed work example from contract");
  }

  if (
    classification.business_intelligence?.project_scope_detected &&
    classification.business_intelligence.project_scope_reason
  ) {
    reasons.push(classification.business_intelligence.project_scope_reason);
  }

  const shouldEscalate =
    reasons.length > 0 || exceededEffortThreshold || exceededOnsiteThreshold || flaggedProjectWork;

  return {
    clientName: policy.clientName,
    shouldEscalate,
    reasons,
    exceededEffortThreshold,
    exceededOnsiteThreshold,
    flaggedProjectWork,
    estimatedEffortHours: estimatedEffort,
    onsiteHoursEstimate: onsiteHours,
    policyEffortThresholds: policy.effortThresholds,
    policyOnsiteSupport: policy.onsiteSupport,
  };
}

import type { DiscoveryContextPack } from "../discovery/context-pack";
import type { CaseClassifier } from "../../services/case-classifier";

export interface ClassificationAgentInput {
  caseNumber: string;
  sysId: string;
  shortDescription: string;
  description?: string;
  priority?: string;
  urgency?: string;
  assignmentGroup?: string;
  currentCategory?: string;
  companySysId?: string;
  companyName?: string;
  state?: string;
  discoveryPack: DiscoveryContextPack;
}

export type ClassificationAgentOutput = Awaited<
  ReturnType<CaseClassifier["classifyCaseEnhanced"]>
>;

export interface ClassificationAgentOptions {
  classifier?: CaseClassifier;
}

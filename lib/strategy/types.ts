import type {
  ServicePillar,
  TechnologyPartner,
  DeliveryCenter,
  TargetMarket,
} from "./config/mobizinc-strategy";
import type { ScoringCriterion } from "./config/scoring-rubric";
import type { HistoricalProject } from "./config/historical-projects";

export interface DemandRequest {
  projectName: string;
  purpose: string;
  businessValue: string;
  expectedROI: string;
  roiDetails?: string;
  timeline: string;
  resourcesNeeded: string;
  teamSize: number;
  strategicAlignment: string[];
  targetIndustry?: string;
  partnerTechnologies?: string[];
  deliveryOptimization?: boolean;
}

export interface AnalysisResult {
  issues: string[];
  questions: string[];
  score: number;
  needsClarification: boolean;
  servicePillars?: string[];
  error?: string;
}

export interface ClarificationMessage {
  role: "assistant" | "user";
  content: string;
  timestamp: Date;
}

export interface HistoricalComparison {
  projectId: string;
  projectName: string;
  similarity: "high" | "medium" | "low";
  outcome: HistoricalProject["outcome"];
  keyMetrics: string[];
  relevantLessons: string[];
  actualTimeline: number;
  actualTeamSize: number;
  actualROI: number;
}

export interface ResourceRecommendation {
  teamComposition: {
    role: string;
    count: number;
    skillLevel: "senior" | "mid" | "junior";
  }[];
  estimatedHours: number;
  estimatedDuration: number;
  recommendedDeliveryCenters: {
    location: string;
    country: string;
    roles: string[];
    costEfficiency: number;
  }[];
  utilizationImpact: "positive" | "neutral" | "negative";
}

export interface RiskAssessment {
  level: "high" | "medium" | "low";
  primaryRisks: {
    category: "technical" | "execution" | "market" | "resource" | "financial";
    description: string;
    likelihood: "high" | "medium" | "low";
    impact: "high" | "medium" | "low";
    mitigation: string;
  }[];
  similarProjectFailures?: string[];
}

export interface StrategicScoring {
  criteriaScores: {
    criterionId: string;
    criterionName: string;
    score: number;
    weight: number;
    weightedScore: number;
    reasoning: string;
  }[];
  totalScore: number;
  rating: "priority" | "approved" | "needs-work" | "rejected";
  recommendation: "proceed" | "proceed-with-conditions" | "revise" | "decline";
  confidence: "high" | "medium" | "low";
}

export interface PartnerAlignment {
  alignedPartners: TechnologyPartner["name"][];
  partnershipValue: "high" | "medium" | "low";
  certificationLeverage: string[];
}

export interface FinalSummary {
  executiveSummary: string;
  keyMetrics: string[];
  risksAndAssumptions: string[];
  completenessScore: number;
  strategicScoring?: StrategicScoring;
  historicalComparisons?: HistoricalComparison[];
  resourceRecommendation?: ResourceRecommendation;
  riskAssessment?: RiskAssessment;
  partnerAlignment?: PartnerAlignment;
  marketOpportunity?: {
    industry: string;
    priority: "high" | "medium" | "low";
    growthPotential: number;
    competitiveAdvantage: string;
  };
  reusableAssets?: string[];
  nextSteps?: string[];
  error?: string;
}

export type {
  ServicePillar,
  TechnologyPartner,
  DeliveryCenter,
  TargetMarket,
  ScoringCriterion,
  HistoricalProject,
};

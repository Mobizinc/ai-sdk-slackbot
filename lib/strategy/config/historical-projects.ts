import type { DeliveryCenter } from "./mobizinc-strategy";

export interface HistoricalProject {
  id: string;
  name: string;
  year: number;
  servicePillar: string[];
  industry: string;
  description: string;
  timeline: {
    estimated: number;
    actual: number;
  };
  team: {
    estimated: number;
    actual: number;
    composition: string[];
  };
  deliveryCenters: DeliveryCenter["location"][];
  technologies: string[];
  partners: string[];
  outcome: "success" | "partial-success" | "challenged" | "failed";
  budgetVariance: number;
  clientSatisfaction: number;
  onTime: boolean;
  roi: {
    estimated: number;
    actual: number;
  };
  keyMetrics: string[];
  lessonsLearned: string[];
  strategicImpact: "high" | "medium" | "low";
  reusableAssets: string[];
}

export const HISTORICAL_PROJECTS: HistoricalProject[] = [
  {
    id: "proj-001",
    name: "Sanofi Azure Cloud Migration",
    year: 2024,
    servicePillar: ["cloud-infrastructure", "managed-services"],
    industry: "Pharmaceuticals",
    description: "Hybrid cloud strategy implementation reducing deployment time from 6 months to hours.",
    timeline: { estimated: 6, actual: 5.5 },
    team: {
      estimated: 6,
      actual: 7,
      composition: ["3 Cloud Architects", "2 Migration Engineers", "1 Security Engineer", "1 PM"],
    },
    deliveryCenters: ["Houston, TX", "Hyderabad", "Ontario"],
    technologies: ["Azure", "Azure Landing Zone", "Azure DevOps", "Terraform"],
    partners: ["Microsoft Azure", "HashiCorp"],
    outcome: "success",
    budgetVariance: -8,
    clientSatisfaction: 95,
    onTime: true,
    roi: { estimated: 120, actual: 142 },
    keyMetrics: [
      "Deployment time reduced from 6 months to hours",
      "Infrastructure provisioning automated to 95%",
      "Cloud spend reduced by 35%",
    ],
    lessonsLearned: [
      "Early stakeholder alignment critical for pharma compliance",
      "Phased migration significantly reduced risk",
      "FinOps implementation drove unexpected cost benefits",
    ],
    strategicImpact: "high",
    reusableAssets: ["Azure Landing Zone template", "Pharma compliance playbook", "FinOps framework"],
  },
  {
    id: "proj-002",
    name: "Healthcare ServiceNow ITSM Implementation",
    year: 2024,
    servicePillar: ["servicenow", "managed-services"],
    industry: "Healthcare",
    description: "ServiceNow intake and assignment modernisation for a non-profit healthcare client.",
    timeline: { estimated: 4, actual: 4.5 },
    team: {
      estimated: 4,
      actual: 4,
      composition: ["2 ServiceNow Consultants", "1 Business Analyst", "1 PM"],
    },
    deliveryCenters: ["Florida", "Ontario"],
    technologies: ["ServiceNow", "Service Portal", "Integration Hub"],
    partners: ["ServiceNow"],
    outcome: "success",
    budgetVariance: 5,
    clientSatisfaction: 88,
    onTime: false,
    roi: { estimated: 95, actual: 105 },
    keyMetrics: [
      "Ticket resolution time improved 40%",
      "Customer satisfaction +25 points",
      "60% of intake workflows automated",
    ],
    lessonsLearned: [
      "Healthcare compliance added two weeks to delivery",
      "User training was critical for adoption",
      "Legacy integrations more complex than estimated",
    ],
    strategicImpact: "high",
    reusableAssets: ["Healthcare ITSM template", "Intake workflow modules"],
  },
  {
    id: "proj-003",
    name: "Enterprise Virtual Desktop Infrastructure",
    year: 2023,
    servicePillar: ["cloud-infrastructure"],
    industry: "Enterprise / Fortune 500",
    description: "VDI rollout for 5000+ employees enabling secure remote work.",
    timeline: { estimated: 5, actual: 6 },
    team: {
      estimated: 5,
      actual: 6,
      composition: ["2 Citrix Engineers", "1 Network Engineer", "2 Support Engineers", "1 PM"],
    },
    deliveryCenters: ["Woodland Hills, CA", "Karachi", "Sao Paulo"],
    technologies: ["Citrix ADC", "DaaS", "ZTNA", "Azure"],
    partners: ["Citrix", "Microsoft Azure"],
    outcome: "partial-success",
    budgetVariance: 15,
    clientSatisfaction: 75,
    onTime: false,
    roi: { estimated: 80, actual: 70 },
    keyMetrics: [
      "User adoption reached 85% within 3 months",
      "Support tickets initially higher than expected",
      "Remote work enablement delivered to 100% of workforce",
    ],
    lessonsLearned: [
      "Bandwidth assessment underestimated",
      "User training/change management needs more time",
      "Phased rollout by department would reduce issues",
    ],
    strategicImpact: "medium",
    reusableAssets: ["VDI deployment scripts", "ZTNA configuration templates"],
  },
];

export function findSimilarProjects(
  pillars: string[],
  industry: string,
  limit = 3,
): HistoricalProject[] {
  const matches = HISTORICAL_PROJECTS.map((project) => {
    const sharedPillars = project.servicePillar.filter((id) => pillars.includes(id));
    const pillarScore = sharedPillars.length;
    const industryScore = project.industry === industry ? 2 : 0;
    const totalScore = pillarScore * 2 + industryScore;
    return { project, score: totalScore };
  })
    .filter(({ score }) => score > 0)
    .sort((a, b) => b.score - a.score)
    .slice(0, limit)
    .map(({ project }) => project);

  return matches.length > 0 ? matches : HISTORICAL_PROJECTS.slice(0, limit);
}

export function getAverageTeamSize(pillarId: string): number {
  const matches = HISTORICAL_PROJECTS.filter((project) => project.servicePillar.includes(pillarId));
  if (matches.length === 0) {
    return 6;
  }
  const total = matches.reduce((sum, project) => sum + project.team.actual, 0);
  return Math.round((total / matches.length) * 10) / 10;
}

export function getAverageTimeline(pillarId: string): number {
  const matches = HISTORICAL_PROJECTS.filter((project) => project.servicePillar.includes(pillarId));
  if (matches.length === 0) {
    return 5;
  }
  const total = matches.reduce((sum, project) => sum + project.timeline.actual, 0);
  return Math.round((total / matches.length) * 10) / 10;
}

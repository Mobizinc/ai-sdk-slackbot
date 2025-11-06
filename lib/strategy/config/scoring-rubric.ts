export interface ScoringCriterion {
  id: string;
  name: string;
  description: string;
  weight: number;
  subcriteria: Subcriterion[];
}

export interface Subcriterion {
  id: string;
  name: string;
  maxPoints: number;
  guidelines: string[];
}

export const SCORING_CRITERIA: ScoringCriterion[] = [
  {
    id: "strategic-fit",
    name: "Strategic Fit",
    description: "Alignment with Mobizinc's service pillars, strategic priorities, and technology partnerships.",
    weight: 25,
    subcriteria: [
      {
        id: "service-alignment",
        name: "Service Pillar Alignment",
        maxPoints: 40,
        guidelines: [
          "40 pts: Directly enhances 2+ core service pillars",
          "30 pts: Directly enhances 1 core service pillar",
          "20 pts: Indirectly supports service pillars",
          "10 pts: Tangential alignment",
          "0 pts: No clear alignment",
        ],
      },
      {
        id: "partner-leverage",
        name: "Technology Partner Leverage",
        maxPoints: 30,
        guidelines: [
          "30 pts: Uses 2+ premier partners (Azure, ServiceNow, Palo Alto, HashiCorp, Citrix)",
          "20 pts: Uses 1 premier partner",
          "10 pts: Compatible with partner ecosystem",
          "0 pts: No partner technology involvement",
        ],
      },
      {
        id: "strategic-priority",
        name: "Current Strategic Priority Match",
        maxPoints: 30,
        guidelines: [
          "30 pts: Directly addresses current year strategic priority",
          "20 pts: Supports strategic priority indirectly",
          "10 pts: Aligned with long-term strategy",
          "0 pts: Not aligned with stated priorities",
        ],
      },
    ],
  },
  {
    id: "market-opportunity",
    name: "Market Opportunity",
    description: "Potential to enhance market position, create reusable assets, or expand service offerings.",
    weight: 20,
    subcriteria: [
      {
        id: "target-market-value",
        name: "Target Market Value",
        maxPoints: 40,
        guidelines: [
          "40 pts: High-priority industry (Healthcare, Pharma, Enterprise)",
          "30 pts: Medium-priority industry (Financial Services, Tech)",
          "20 pts: Growth industry opportunity",
          "10 pts: Diversification play",
          "0 pts: No clear market opportunity",
        ],
      },
      {
        id: "reusability",
        name: "Reusable Assets & IP",
        maxPoints: 35,
        guidelines: [
          "35 pts: Creates highly reusable frameworks/templates for 5+ future projects",
          "25 pts: Creates reusable components for 2-4 projects",
          "15 pts: Some reusable elements",
          "5 pts: Minimal reusability",
          "0 pts: Project-specific only",
        ],
      },
      {
        id: "competitive-advantage",
        name: "Competitive Advantage",
        maxPoints: 25,
        guidelines: [
          "25 pts: Creates unique differentiation in market",
          "18 pts: Achieves parity with competitors",
          "10 pts: Improves internal capabilities",
          "0 pts: No competitive impact",
        ],
      },
    ],
  },
  {
    id: "business-case",
    name: "Business Case Strength",
    description: "Quality of financial justification, ROI clarity, and business value proposition.",
    weight: 20,
    subcriteria: [
      {
        id: "roi-quality",
        name: "ROI Justification Quality",
        maxPoints: 45,
        guidelines: [
          "45 pts: Quantified ROI with clear assumptions and calculation methodology",
          "35 pts: Estimated ROI with reasonable justification",
          "20 pts: High-level ROI estimate",
          "10 pts: Vague value proposition",
          "0 pts: No financial justification",
        ],
      },
      {
        id: "value-clarity",
        name: "Business Value Clarity",
        maxPoints: 35,
        guidelines: [
          "35 pts: Specific, measurable outcomes defined",
          "25 pts: Clear value proposition with some metrics",
          "15 pts: General value statements",
          "5 pts: Vague or unclear value",
          "0 pts: No clear business value",
        ],
      },
      {
        id: "assumptions",
        name: "Assumptions & Dependencies",
        maxPoints: 20,
        guidelines: [
          "20 pts: All major assumptions identified and validated",
          "15 pts: Key assumptions stated",
          "10 pts: Some assumptions mentioned",
          "0 pts: Assumptions not addressed",
        ],
      },
    ],
  },
  {
    id: "resource-efficiency",
    name: "Resource Efficiency",
    description: "Appropriate resource allocation, global delivery optimisation, and cost-effectiveness.",
    weight: 20,
    subcriteria: [
      {
        id: "team-sizing",
        name: "Team Size Appropriateness",
        maxPoints: 35,
        guidelines: [
          "35 pts: Team size matches historical similar projects (+/- 10%)",
          "25 pts: Team size reasonable with justification (+/- 25%)",
          "15 pts: Team size high but explainable",
          "5 pts: Team size appears inflated",
          "0 pts: Team size unrealistic",
        ],
      },
      {
        id: "delivery-optimization",
        name: "Global Delivery Model Leverage",
        maxPoints: 35,
        guidelines: [
          "35 pts: Uses optimal mix of cost-efficient delivery centres",
          "25 pts: Mix of onshore/offshore with rationale",
          "15 pts: Mostly onshore but justified",
          "5 pts: Inefficient delivery model",
          "0 pts: No delivery strategy",
        ],
      },
      {
        id: "utilisation-impact",
        name: "Utilisation Impact",
        maxPoints: 30,
        guidelines: [
          "30 pts: Improves utilisation of underbooked skill sets",
          "20 pts: Neutral utilisation impact",
          "10 pts: Strains already constrained skills",
          "0 pts: No utilisation plan provided",
        ],
      },
    ],
  },
  {
    id: "execution-risk",
    name: "Execution Risk",
    description: "Delivery complexity, dependency risk, and historical failure patterns.",
    weight: 15,
    subcriteria: [
      {
        id: "delivery-complexity",
        name: "Delivery Complexity",
        maxPoints: 30,
        guidelines: [
          "30 pts: Well-understood pattern with proven assets",
          "20 pts: Moderate complexity with mitigation",
          "10 pts: High complexity with gaps",
          "0 pts: Unknown territory",
        ],
      },
      {
        id: "dependency-risk",
        name: "Dependency Risk",
        maxPoints: 35,
        guidelines: [
          "35 pts: Dependencies identified and controlled",
          "25 pts: Some uncontrolled dependencies",
          "10 pts: Major dependencies unaddressed",
          "0 pts: No dependency analysis",
        ],
      },
      {
        id: "historical-challenges",
        name: "Historical Challenge Alignment",
        maxPoints: 35,
        guidelines: [
          "35 pts: Avoids patterns of past challenged projects",
          "20 pts: Similar to mixed results but with mitigations",
          "10 pts: Mirrors failed projects without new mitigation",
          "0 pts: Unknown risk space",
        ],
      },
    ],
  },
];

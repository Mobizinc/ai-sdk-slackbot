/**
 * Mobizinc Strategic Configuration
 *
 * Shared strategic context for project evaluation agents.
 * Lifted from the internal demand-request PoC and adapted for reuse.
 */

export interface ServicePillar {
  id: string;
  name: string;
  description: string;
  capabilities: string[];
  typicalMargin: number; // percentage
  demandLevel: 'high' | 'medium' | 'low';
}

export interface TechnologyPartner {
  name: string;
  partnershipLevel: 'premier' | 'strategic' | 'technology';
  relevantServices: string[];
  certificationCount?: number;
}

export interface DeliveryCenter {
  location: string;
  country: string;
  region: 'north-america' | 'south-america' | 'europe' | 'asia' | 'middle-east';
  specializations: string[];
  costEfficiency: number; // 1-10 scale, 10 being most cost-effective
}

export interface TargetMarket {
  industry: string;
  priority: 'high' | 'medium' | 'low';
  keyClients: string[];
  growthPotential: number; // percentage
}

export const SERVICE_PILLARS: ServicePillar[] = [
  {
    id: 'cloud-infrastructure',
    name: 'Cloud & Infrastructure',
    description: 'Design, implement, and manage resilient cloud infrastructure.',
    capabilities: [
      'Cloud Strategy & Assessment',
      'Azure Landing Zone',
      'IaaS / PaaS Services',
      'Cloud Migrations',
      'Cloud Operations',
      'FinOps',
    ],
    typicalMargin: 35,
    demandLevel: 'high',
  },
  {
    id: 'ms-dynamics-power-apps',
    name: 'Microsoft Dynamics & Power Apps',
    description: "Modernize applications and automate workflows with Microsoft's business application suite.",
    capabilities: [
      'Dynamics 365 Modernization',
      'Power Platform Implementation',
      'Legacy App Modernization & Dataverse',
      'Application Lifecycle Management & Care',
    ],
    typicalMargin: 38,
    demandLevel: 'medium',
  },
  {
    id: 'servicenow',
    name: 'ServiceNow',
    description: 'Connect people, systems, and functions across the enterprise.',
    capabilities: [
      'Application Development',
      'Service Portal',
      'Platform Implementation & Integration',
      'Platform Care & Maintenance (L1-L3 support)',
      'Workflow Automation & UX Enhancements',
      'Knowledge Management & Employee Experience',
    ],
    typicalMargin: 38,
    demandLevel: 'medium',
  },
  {
    id: 'data-ai',
    name: 'Data & AI',
    description: 'Streamline processes, automate manual tasks, and identify optimization opportunities.',
    capabilities: [
      'AI Strategy & Governance',
      'Intelligent Automation',
      'Advanced Analytics & Visualisation',
      'Applied AI Solutions',
      'MLOps & DataOps',
    ],
    typicalMargin: 45,
    demandLevel: 'high',
  },
  {
    id: 'cybersecurity-network',
    name: 'Cybersecurity & Network',
    description: 'Safeguard critical assets with robust protocols and managed services.',
    capabilities: [
      'Network Security',
      'Remote Network and User Management',
      'Cloud Security',
      'Incident Management',
      'DevSecOps',
      'NetSecOps',
    ],
    typicalMargin: 40,
    demandLevel: 'high',
  },
  {
    id: 'managed-services',
    name: 'Managed Services',
    description: 'Provide ongoing support, monitoring, and optimisation of technology environments.',
    capabilities: [
      '24x7 Monitoring, Alerting & Proactive Response',
      'ITIL-based Service Management',
      'Security & Compliance Monitoring',
      'Automated Remediation & CloudOps',
      'FinOps, Billing, Security & Governance',
      'Business Continuity & Disaster Recovery',
    ],
    typicalMargin: 40,
    demandLevel: 'high',
  },
];

export const TECHNOLOGY_PARTNERS: TechnologyPartner[] = [
  {
    name: 'Microsoft Azure',
    partnershipLevel: 'premier',
    relevantServices: ['cloud-infrastructure', 'data-ai', 'cybersecurity-network', 'ms-dynamics-power-apps'],
    certificationCount: 25,
  },
  {
    name: 'ServiceNow',
    partnershipLevel: 'premier',
    relevantServices: ['servicenow'],
    certificationCount: 15,
  },
  {
    name: 'Palo Alto',
    partnershipLevel: 'premier',
    relevantServices: ['cybersecurity-network', 'cloud-infrastructure'],
    certificationCount: 12,
  },
  {
    name: 'HashiCorp',
    partnershipLevel: 'premier',
    relevantServices: ['cloud-infrastructure', 'cybersecurity-network'],
    certificationCount: 8,
  },
  {
    name: 'Citrix',
    partnershipLevel: 'premier',
    relevantServices: ['cloud-infrastructure'],
    certificationCount: 10,
  },
];

export const DELIVERY_CENTERS: DeliveryCenter[] = [
  {
    location: 'Houston, TX',
    country: 'USA',
    region: 'north-america',
    specializations: ['Advisory', 'Project Management', 'Client Engagement'],
    costEfficiency: 4,
  },
  {
    location: 'Woodland Hills, CA',
    country: 'USA',
    region: 'north-america',
    specializations: ['Cloud Services', 'Data & AI'],
    costEfficiency: 4,
  },
  {
    location: 'Florida',
    country: 'USA',
    region: 'north-america',
    specializations: ['Cyber Security', 'ServiceNow'],
    costEfficiency: 5,
  },
  {
    location: 'New Jersey',
    country: 'USA',
    region: 'north-america',
    specializations: ['Cloud Services', 'Digital Workspace'],
    costEfficiency: 5,
  },
  {
    location: 'Ontario',
    country: 'Canada',
    region: 'north-america',
    specializations: ['Cloud Services', 'ServiceNow', 'Automation'],
    costEfficiency: 6,
  },
  {
    location: 'Karachi',
    country: 'Pakistan',
    region: 'asia',
    specializations: ['Cloud Ops', 'ServiceNow', 'Automation'],
    costEfficiency: 9,
  },
  {
    location: 'Lahore',
    country: 'Pakistan',
    region: 'asia',
    specializations: ['Data & AI', 'DevSecOps', 'Support'],
    costEfficiency: 9,
  },
  {
    location: 'Hyderabad',
    country: 'India',
    region: 'asia',
    specializations: ['Cloud Engineering', 'Testing', 'Automation'],
    costEfficiency: 8,
  },
  {
    location: 'Kochi',
    country: 'India',
    region: 'asia',
    specializations: ['Managed Services', 'Monitoring'],
    costEfficiency: 8,
  },
  {
    location: 'Lviv',
    country: 'Ukraine',
    region: 'europe',
    specializations: ['Cybersecurity', 'Automation', 'Support'],
    costEfficiency: 7,
  },
  {
    location: 'Sao Paulo',
    country: 'Brazil',
    region: 'south-america',
    specializations: ['Cloud', 'Service Desk'],
    costEfficiency: 7,
  },
  {
    location: 'Singapore',
    country: 'Singapore',
    region: 'asia',
    specializations: ['Data & AI', 'Executive Advisory'],
    costEfficiency: 6,
  },
  {
    location: 'Manama',
    country: 'Bahrain',
    region: 'middle-east',
    specializations: ['Microsoft Cloud', 'Regional Delivery'],
    costEfficiency: 6,
  },
];

export const TARGET_MARKETS: TargetMarket[] = [
  {
    industry: 'Healthcare',
    priority: 'high',
    keyClients: ['Sanofi', 'Non-Profit Healthcare'],
    growthPotential: 18,
  },
  {
    industry: 'Pharmaceuticals',
    priority: 'high',
    keyClients: ['Sanofi', 'Pfizer'],
    growthPotential: 16,
  },
  {
    industry: 'Enterprise / Fortune 500',
    priority: 'high',
    keyClients: ['Global Manufacturing', 'Energy Enterprises'],
    growthPotential: 14,
  },
  {
    industry: 'Financial Services',
    priority: 'medium',
    keyClients: ['Regional Banks', 'FinTech'],
    growthPotential: 12,
  },
  {
    industry: 'Technology & Startups',
    priority: 'medium',
    keyClients: ['AI Startups', 'SaaS vendors'],
    growthPotential: 20,
  },
  {
    industry: 'Manufacturing',
    priority: 'low',
    keyClients: ['Industrial Automation firms'],
    growthPotential: 10,
  },
];

export const COMPANY_METRICS = {
  currentYear: 2025,
  strategicPriorities: [
    'Accelerate AI-driven automation and copilots',
    'Deepen Microsoft Cloud partnership in KSA and Middle East',
    'Grow Managed Services ARR by 40%',
    'Scale global delivery centres without sacrificing quality',
  ],
  utilizationTargets: {
    advisory: 0.72,
    delivery: 0.82,
    managedServices: 0.88,
  },
  averageMargins: {
    advisory: 32,
    delivery: 38,
    managedServices: 42,
  },
};

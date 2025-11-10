/**
 * Feature Registry
 *
 * Centralized registry of bot features beyond agent tools.
 * Includes slash commands, interactive features, event-based capabilities, etc.
 *
 * This file should be updated when new features are added to the bot.
 */

export interface FeatureCategory {
  category: string;
  description: string;
  features: Feature[];
}

export interface Feature {
  name: string;
  description: string;
  usage?: string;
  examples?: string[];
}

/**
 * Registry of all bot features organized by category
 */
export const FEATURE_REGISTRY: FeatureCategory[] = [
  {
    category: "Project Management",
    description: "Features for managing projects, onboarding team members, and tracking progress",
    features: [
      {
        name: "Project Initiation",
        description: "Start new projects with AI-guided setup including scope definition, requirements gathering, and team formation",
        usage: "Slash command: /project-initiate or use the Project Initiation button in channels",
        examples: [
          "Use /project-initiate to start a new project",
          "Bot will guide you through defining project scope, objectives, and team needs",
        ],
      },
      {
        name: "Project Interest & Interviews",
        description: "Express interest in projects and participate in automated interview sessions to match skills with project needs",
        usage: "Click 'I'm Interested' button on project posts, then participate in DM interview",
        examples: [
          "Click the interest button on a project announcement",
          "Answer interview questions about your experience and availability",
          "Bot matches your skills with project requirements",
        ],
      },
      {
        name: "Project Standups",
        description: "Automated daily standup collection and posting for active projects",
        usage: "Slash command: /project-standup (for admins to trigger collection)",
        examples: [
          "Bot sends DM requesting standup update",
          "Respond with what you worked on, what's next, and any blockers",
          "Standup gets posted to project channel",
        ],
      },
      {
        name: "Project Evaluation",
        description: "Evaluate project outcomes and lessons learned",
        usage: "Slash command: /project-evaluate",
        examples: ["Use /project-evaluate to assess completed projects"],
      },
      {
        name: "Project Announcements",
        description: "Post project announcements to channels with interactive buttons",
        usage: "Slash command: /project-post",
        examples: ["Use /project-post to announce a new project opportunity"],
      },
    ],
  },
  {
    category: "Case Management",
    description: "ServiceNow case and incident management capabilities",
    features: [
      {
        name: "Passive Case Monitoring",
        description: "Automatically detects case numbers (SCS, CS, INC, RITM, REQ, CHG, PRB, SCTASK) in conversations and offers contextual help",
        usage: "Just mention a case number in any channel - bot monitors automatically",
        examples: [
          "Mention 'SCS0048475' in a conversation",
          "Bot detects it and may offer relevant information or help",
        ],
      },
      {
        name: "Case Triage Command",
        description: "Classify and analyze cases with AI, finding similar cases and relevant KB articles",
        usage: "@mention the bot with 'triage [case_number]'",
        examples: [
          "@Assistant triage SCS0048475",
          "@Assistant classify INC0012345",
          "@Assistant analyze RITM0098765",
        ],
      },
      {
        name: "Knowledge Base Workflow",
        description: "Automatically detects resolved cases and suggests creating KB articles with approval workflow",
        usage: "Automatic - triggers when cases are marked resolved in conversations",
        examples: [
          "When a case is resolved, bot suggests creating a KB article",
          "Review and approve with emoji reactions",
        ],
      },
    ],
  },
  {
    category: "Interactive Features",
    description: "User interaction capabilities through buttons, modals, and reactions",
    features: [
      {
        name: "KB Article Approval",
        description: "Approve or reject generated KB articles using emoji reactions (✅ approve, ❌ reject)",
        usage: "React to KB proposal messages with thumbs up/down emojis",
        examples: [
          "Bot posts KB article draft",
          "React with ✅ to approve or ❌ to reject",
        ],
      },
      {
        name: "Context Update Proposals",
        description: "Bot can propose CMDB updates when it detects missing infrastructure information",
        usage: "Automatic - bot suggests updates when gaps are found, approve via reactions",
        examples: [
          "Bot detects missing server information",
          "Proposes CMDB update for review",
        ],
      },
      {
        name: "Interactive Case Search",
        description: "Search cases with advanced filters and pagination through interactive buttons",
        usage: "Ask bot to search cases with specific criteria",
        examples: [
          "Show me open P1 cases for Altus",
          "Find cases assigned to John from last week",
          "Navigate results with Next/Previous buttons",
        ],
      },
    ],
  },
  {
    category: "Infrastructure Monitoring",
    description: "Network and infrastructure monitoring capabilities",
    features: [
      {
        name: "FortiManager Monitoring",
        description: "Query FortiManager for firewall status, policies, and configurations",
        usage: "Agent tool - ask about firewall status or configurations",
        examples: [
          "What's the status of firewall-prod-01?",
          "Check FortiManager for policy changes",
        ],
      },
      {
        name: "VeloCloud Monitoring",
        description: "Query VeloCloud SD-WAN for edge status, connectivity, and performance",
        usage: "Agent tool - ask about VeloCloud edges or connectivity",
        examples: [
          "Check VeloCloud edge status for Site-A",
          "What's the VeloCloud connectivity status?",
        ],
      },
    ],
  },
  {
    category: "Conversation Features",
    description: "How the bot interacts in conversations",
    features: [
      {
        name: "Thread-Aware Responses",
        description: "Reads full conversation threads before responding to understand context",
        usage: "Automatic - @mention bot in any channel or thread",
        examples: [
          "@Assistant what should I try next?",
          "Bot reads entire thread history to provide context-aware suggestions",
        ],
      },
      {
        name: "Smart Silence",
        description: "Stays quiet when engineers are making good progress, only jumps in when it can add value",
        usage: "Automatic behavior - bot evaluates when to contribute",
        examples: [
          "Bot monitors conversations",
          "Only responds when it detects gaps or can provide helpful patterns",
        ],
      },
      {
        name: "Direct Messages",
        description: "Have private conversations with the bot in DMs without @mentioning",
        usage: "Send a DM to the bot - no @mention needed",
        examples: [
          "DM: 'How do I troubleshoot Exchange quota issues?'",
          "Bot responds with guidance and official documentation",
        ],
      },
    ],
  },
  {
    category: "Feature Feedback",
    description: "Suggest new features or report issues",
    features: [
      {
        name: "Feature Request Collection",
        description: "Submit feature requests and feedback directly through conversation",
        usage: "Tell the bot about features you'd like to see",
        examples: [
          "I wish the bot could track deployment schedules",
          "Bot collects your feedback and creates tracking issue",
        ],
      },
    ],
  },
];

/**
 * Get all features as a flat list
 */
export function getAllFeatures(): Array<Feature & { category: string }> {
  return FEATURE_REGISTRY.flatMap((category) =>
    category.features.map((feature) => ({
      ...feature,
      category: category.category,
    }))
  );
}

/**
 * Get features by category
 */
export function getFeaturesByCategory(categoryName: string): Feature[] {
  const category = FEATURE_REGISTRY.find((c) => c.category === categoryName);
  return category?.features || [];
}

/**
 * Search features by keyword
 */
export function searchFeatures(keyword: string): Array<Feature & { category: string }> {
  const lowerKeyword = keyword.toLowerCase();
  return getAllFeatures().filter(
    (feature) =>
      feature.name.toLowerCase().includes(lowerKeyword) ||
      feature.description.toLowerCase().includes(lowerKeyword) ||
      feature.category.toLowerCase().includes(lowerKeyword)
  );
}

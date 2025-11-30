/**
 * Seed Prompts Script
 * Imports existing prompts from files and code into the database
 *
 * Run with: pnpm tsx scripts/seed-prompts.ts
 */

import { readFile } from "fs/promises";
import { join } from "path";
import { getPromptRepository, type PromptType } from "../lib/db/repositories/prompt-repository";

interface PromptSeed {
  name: string;
  type: PromptType;
  content: string;
  description: string;
  variables?: string[];
}

async function loadSystemPrompt(): Promise<PromptSeed | null> {
  try {
    const content = await readFile(
      join(process.cwd(), "config", "system-prompt.txt"),
      "utf-8"
    );

    return {
      name: "system_prompt",
      type: "system",
      content,
      description: "Main system prompt for the Slack bot agent. Defines personality, capabilities, and guidelines.",
      variables: ["date"],
    };
  } catch (error) {
    console.error("Failed to load system prompt:", error);
    return null;
  }
}

function getRequirementPrompts(): PromptSeed[] {
  // These are extracted from specialist-registry.ts REQUIREMENT_CONFIGS
  return [
    {
      name: "requirement_case_number",
      type: "requirement",
      content: "I can run the requested automation once you share the ServiceNow case number associated with this issue.",
      description: "Prompt shown when a case number is required but not provided",
      variables: [],
    },
    {
      name: "requirement_impacted_user",
      type: "requirement",
      content: "Let me know which user or account is impacted so I can narrow the diagnostics appropriately.",
      description: "Prompt shown when an impacted user is required but not specified",
      variables: [],
    },
  ];
}

function getWorkflowPrompts(): PromptSeed[] {
  // Add any workflow-specific prompts here
  return [
    {
      name: "triage_introduction",
      type: "workflow",
      content: `I'll help you triage this case. Let me gather the relevant information and analyze the situation.

Based on my analysis, I'll:
1. Identify the issue type and urgency
2. Search for similar resolved cases
3. Check for any related incidents or changes
4. Recommend next steps

{{additionalContext}}`,
      description: "Introduction message for case triage workflow",
      variables: ["additionalContext"],
    },
    {
      name: "kb_generation_intro",
      type: "workflow",
      content: `I'll help you create a knowledge base article based on the resolution of this case.

Please provide:
- A brief summary of the issue
- The root cause (if identified)
- The resolution steps taken

I'll then draft an article following our KB standards.`,
      description: "Introduction message for KB article generation workflow",
      variables: [],
    },
  ];
}

function getContextTemplatePrompts(): PromptSeed[] {
  return [
    {
      name: "business_context_enhancement",
      type: "context_template",
      content: `## Company Context: {{companyName}}

{{companyDescription}}

### Key Contacts
{{keyContacts}}

### Technology Stack
{{technologyPortfolio}}

### Related CMDB Items
{{cmdbIdentifiers}}`,
      description: "Template for enhancing prompts with business context",
      variables: ["companyName", "companyDescription", "keyContacts", "technologyPortfolio", "cmdbIdentifiers"],
    },
    {
      name: "similar_cases_section",
      type: "context_template",
      content: `## Similar Cases Found

The following previously resolved cases may be relevant:

{{similarCasesList}}

Consider these resolutions when providing assistance.`,
      description: "Template for similar cases section in prompts",
      variables: ["similarCasesList"],
    },
  ];
}

async function seedPrompts() {
  console.log("Starting prompt seeding...\n");

  const repo = getPromptRepository();
  const prompts: PromptSeed[] = [];

  // Load system prompt
  console.log("Loading system prompt from file...");
  const systemPrompt = await loadSystemPrompt();
  if (systemPrompt) {
    prompts.push(systemPrompt);
    console.log("  ✓ System prompt loaded");
  } else {
    console.log("  ✗ Failed to load system prompt");
  }

  // Load requirement prompts
  console.log("\nLoading requirement prompts...");
  const requirementPrompts = getRequirementPrompts();
  prompts.push(...requirementPrompts);
  console.log(`  ✓ ${requirementPrompts.length} requirement prompts loaded`);

  // Load workflow prompts
  console.log("\nLoading workflow prompts...");
  const workflowPrompts = getWorkflowPrompts();
  prompts.push(...workflowPrompts);
  console.log(`  ✓ ${workflowPrompts.length} workflow prompts loaded`);

  // Load context template prompts
  console.log("\nLoading context template prompts...");
  const contextPrompts = getContextTemplatePrompts();
  prompts.push(...contextPrompts);
  console.log(`  ✓ ${contextPrompts.length} context template prompts loaded`);

  // Upsert all prompts
  console.log("\n" + "=".repeat(50));
  console.log("Upserting prompts to database...\n");

  const result = await repo.upsertMany(
    prompts.map((p) => ({
      name: p.name,
      type: p.type,
      content: p.content,
      description: p.description,
      variables: p.variables,
      createdBy: "seed-script",
    }))
  );

  console.log("\n" + "=".repeat(50));
  console.log("Seeding complete!");
  console.log(`  Created: ${result.created}`);
  console.log(`  Updated: ${result.updated}`);
  console.log(`  Total prompts processed: ${prompts.length}`);

  // Print summary by type
  const byType: Record<string, number> = {};
  for (const p of prompts) {
    byType[p.type] = (byType[p.type] || 0) + 1;
  }
  console.log("\nBy type:");
  for (const [type, count] of Object.entries(byType)) {
    console.log(`  ${type}: ${count}`);
  }
}

// Run if executed directly
seedPrompts()
  .then(() => {
    console.log("\nDone!");
    process.exit(0);
  })
  .catch((error) => {
    console.error("\nFailed to seed prompts:", error);
    process.exit(1);
  });

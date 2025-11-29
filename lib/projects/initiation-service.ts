import fs from "fs/promises";
import path from "path";
import { AnthropicChatService } from "../services/anthropic-chat";
import { buildProjectBlocks } from "./posting";
import type { ProjectDefinition, ProjectInitiationDraft, ProjectInitiationSource, ProjectInitiationOutput } from "./types";
import { projectInitiationOutputSchema } from "./types";
import { getDb } from "../db/client";
import { projectInitiationRequests } from "../db/schema";

const chatService = AnthropicChatService.getInstance();

const OUTPUT_SCHEMA_GUIDE = `{
  "shortPitch": "One-sentence hook (<= 90 characters)",
  "elevatorPitch": "Paragraph explaining mission and impact",
  "problemStatement": "Problem being solved",
  "solutionOverview": "How the team will solve it",
  "keyValueProps": ["List of value propositions"],
  "learningHighlights": ["Key growth areas"],
  "kickoffChecklist": ["Actionable next steps"],
  "standupGuidance": ["How to run stand-ups"],
  "interviewThemes": ["Key talking points for interviews"],
  "recommendedMetrics": ["Ways to measure success"],
  "blockKit": {
    "blocks": [
      { "type": "header", "text": { "type": "plain_text", "text": "..." } },
      { "type": "section", "text": { "type": "mrkdwn", "text": "..." } }
    ],
    "fallbackText": "Short plain-text fallback"
  },
  "notes": ["Any additional reminders"]
}`;

export interface ProjectInitiationOptions {
  project: ProjectDefinition;
  requestedBy: string;
  requestedByName?: string;
  ideaSummary?: string;
  seedContext?: string;
  model?: string;
}

interface CollectedContext {
  combined: string;
  sources: ProjectInitiationSource[];
}

export async function generateProjectInitiationDraft(options: ProjectInitiationOptions): Promise<ProjectInitiationDraft> {
  const { project, requestedBy, requestedByName, ideaSummary } = options;

  const collected = await collectProjectContext(project, ideaSummary);
  const prompt = buildInitiationPrompt(project, ideaSummary, collected.combined);
  const model = options.model ?? "claude-haiku-4-5";

  let rawResponse = "";
  let llmOutput: ProjectInitiationOutput | null = null;

  try {
    const response = await chatService.send({
      model,
      messages: [
        {
          role: "system",
          content:
            "You are an internal enablement agent that crafts launch packages for engineering initiatives. Respond with strict JSON that matches the required schema.",
        },
        {
          role: "user",
          content: prompt,
        },
      ],
      temperature: 0.3,
      maxTokens: 900,
    });

    rawResponse = (response.outputText ?? "").trim();
    llmOutput = parseInitiationOutput(rawResponse);
  } catch (error) {
    console.error("[Project Initiation] LLM generation failed", error);
  }

  const fallbackOutput = buildFallbackInitiationOutput(project, ideaSummary);
  const output = llmOutput ?? fallbackOutput;

  // Ensure we always have usable Block Kit blocks
  const fallbackBlocks = await buildProjectBlocks(project);
  const blockKitBlocks = Array.isArray(output.blockKit?.blocks) && output.blockKit!.blocks.length > 0
    ? output.blockKit!.blocks
    : fallbackBlocks;

  const draftedAt = new Date().toISOString();
  let requestId: string | undefined;

  const db = getDb();
  if (db) {
    try {
      const [inserted] = await db
        .insert(projectInitiationRequests)
        .values({
          projectId: project.id,
          requestedBy,
          requestedByName: requestedByName ?? null,
          ideaSummary: ideaSummary ?? null,
          contextSummary: collected.combined.slice(0, 2000),
          llmModel: llmOutput ? model : null,
          status: "drafted",
          output: {
            ...output,
            blockKit: { blocks: blockKitBlocks },
          },
          sources: collected.sources,
          rawResponse: rawResponse || null,
          metadata: {
            ideaSummary,
          },
        })
        .returning();

      if (inserted?.id) {
        requestId = inserted.id;
      }
    } catch (error) {
      console.error("[Project Initiation] Failed to persist initiation draft", error);
    }
  }

  return {
    requestId,
    projectId: project.id,
    requestedBy,
    requestedByName,
    ideaSummary,
    output: {
      ...output,
      blockKit: { blocks: blockKitBlocks, fallbackText: output.blockKit?.fallbackText },
    },
    sources: collected.sources,
    llmModel: llmOutput ? model : "fallback",
    rawResponse,
    createdAt: draftedAt,
  };
}

async function collectProjectContext(project: ProjectDefinition, ideaSummary?: string): Promise<CollectedContext> {
  const sources: ProjectInitiationSource[] = [];
  const sections: string[] = [];

  const essentials = [
    ["Project ID", project.id],
    ["Name", project.name],
    ["Summary", project.summary ?? "(not provided)"],
  ].map(([label, value]) => `${label}: ${value ?? "(none)"}`);
  sections.push(renderKeyValueSection("Project Configuration", essentials));

  if (project.background) {
    sections.push(`### Background\n${project.background}`);
  }

  const stackSummary = renderListSection("Tech Stack", project.techStack);
  if (stackSummary) sections.push(stackSummary);

  const requiredSummary = renderListSection("Required Skills", project.skillsRequired);
  if (requiredSummary) sections.push(requiredSummary);

  const niceSummary = renderListSection("Nice To Have Skills", project.skillsNiceToHave);
  if (niceSummary) sections.push(niceSummary);

  const learningSummary = renderListSection("Learning Opportunities", project.learningOpportunities);
  if (learningSummary) sections.push(learningSummary);

  const tasksSummary = renderListSection("Highlighted Tasks", project.openTasks);
  if (tasksSummary) sections.push(tasksSummary);

  if (ideaSummary) {
    sections.push(`### Seed Idea\n${ideaSummary}`);
  }

  const readme = await readFileIfExists("README.md");
  if (readme) {
    sources.push({ label: "README", excerpt: truncate(readme, 1200), path: "README.md" });
    sections.push(`### Repository README Highlights\n${truncate(readme, 1500)}`);
  }

  const productBrief = await readFileIfExists(path.join("docs", "PROJECT_OVERVIEW.md"));
  if (productBrief) {
    sources.push({ label: "docs/PROJECT_OVERVIEW.md", excerpt: truncate(productBrief, 800), path: "docs/PROJECT_OVERVIEW.md" });
    sections.push(`### Project Overview Doc\n${truncate(productBrief, 1200)}`);
  }

  const triageSummary = await readFileIfExists(path.join("docs", "TRIAGE_COMMAND_SUMMARY.md"));
  if (triageSummary) {
    sources.push({ label: "docs/TRIAGE_COMMAND_SUMMARY.md", excerpt: truncate(triageSummary, 800), path: "docs/TRIAGE_COMMAND_SUMMARY.md" });
    sections.push(`### Existing Command Summary\n${truncate(triageSummary, 1000)}`);
  }

  const packageJson = await readPackageJson();
  if (packageJson) {
    const description = packageJson.description as string | undefined;
    const scripts = packageJson.scripts ? Object.keys(packageJson.scripts).slice(0, 6) : [];
    const deps = packageJson.dependencies ? Object.keys(packageJson.dependencies).slice(0, 8) : [];
    const packageSectionParts: string[] = [];
    if (description) packageSectionParts.push(`Description: ${description}`);
    if (scripts.length) packageSectionParts.push(`Notable scripts: ${scripts.join(", ")}`);
    if (deps.length) packageSectionParts.push(`Top dependencies: ${deps.join(", ")}`);
    if (packageSectionParts.length) {
      const pkgSection = packageSectionParts.join("\n");
      sections.push(`### package.json Snapshot\n${pkgSection}`);
      sources.push({ label: "package.json", excerpt: pkgSection.slice(0, 800), path: "package.json" });
    }
  }

  const combined = sections.join("\n\n");
  return {
    combined,
    sources,
  };
}

function buildInitiationPrompt(project: ProjectDefinition, ideaSummary: string | undefined, context: string): string {
  return [
    "You will receive context about a confirmed internal engineering initiative.",
    "Craft a launch package that motivates contributors, clarifies outcomes, and outlines next steps.",
    "Return a JSON object with the following structure (no extra commentary):\n",
    OUTPUT_SCHEMA_GUIDE,
    "\n### Context",
    context,
    ideaSummary ? `\n### Additional Seed Idea\n${ideaSummary}` : "",
    "\n### Output Requirements",
    "- shortPitch: one sentence hook (<= 90 characters).",
    "- elevatorPitch: 3-4 sentences connecting vision to delivery.",
    "- problemStatement & solutionOverview: articulate the why and how.",
    "- keyValueProps & learningHighlights: bullet lists.",
    "- kickoffChecklist: actionable items to start the project (3-6 items).",
    "- standupGuidance: how stand-ups should be run (frequency, focus).",
    "- interviewThemes: topics to emphasise during candidate interviews.",
    "- recommendedMetrics: how to measure impact/success.",
    "- blockKit.blocks: Slack Block Kit JSON (header, sections, bullet list, actions) for announcing the project.",
    "Ensure JSON is valid, with double quotes and arrays where appropriate.",
  ].filter(Boolean).join("\n");
}

function parseInitiationOutput(rawResponse: string): ProjectInitiationOutput | null {
  if (!rawResponse) {
    return null;
  }

  const cleaned = rawResponse
    .replace(/^```json\s*/i, "")
    .replace(/```$/i, "")
    .trim();

  try {
    const parsed = JSON.parse(cleaned);
    const result = projectInitiationOutputSchema.safeParse(parsed);
    if (result.success) {
      return result.data;
    }
    console.warn("[Project Initiation] Parsed response did not match schema", result.error.format());
  } catch (error) {
    console.warn("[Project Initiation] Failed to parse JSON response", error);
  }

  return null;
}

function buildFallbackInitiationOutput(project: ProjectDefinition, ideaSummary?: string): ProjectInitiationOutput {
  const shortPitch = project.summary ? truncate(project.summary, 90) : `Jump into ${project.name}`;
  const learningHighlights = project.learningOpportunities.length > 0
    ? project.learningOpportunities
    : project.skillsRequired.slice(0, 5).map((skill) => `Hands-on experience with ${skill}`);

  return {
    shortPitch,
    elevatorPitch:
      project.background ??
      `Help build momentum on ${project.name}. We already have a leadership-approved mandate and need contributors ready to ship.`,
    problemStatement: ideaSummary ?? project.summary ?? `We need to accelerate progress on ${project.name}.`,
    solutionOverview:
      `Form a squad, align on clear milestones, and deliver improvements using ${project.techStack.join(", ") || "our standard toolchain"}.`,
    keyValueProps: [
      "Mentor-backed initiative with clear scope",
      "Opportunities to collaborate across squads",
      "Real impact on internal productivity",
    ],
    learningHighlights,
    kickoffChecklist: [
      "Confirm mentor availability and communication channel",
      "Review existing documentation and open tasks",
      "Define sprint goals and set up shared board",
    ],
    standupGuidance: [
      "Run 10-minute async stand-ups on weekdays",
      "Highlight blockers tied to issues/PRs, not generic status",
      "Celebrate quick wins to keep morale high",
    ],
    interviewThemes: [
      "Systems understanding of the existing bot architecture",
      "Ability to ship iteratively with tight feedback loops",
      "Communication style for async collaboration",
    ],
    recommendedMetrics: [
      "Time-to-first-commit for new contributors",
      "Throughput of high-impact improvements",
      "Reduction in open issues tied to the initiative",
    ],
    blockKit: undefined,
    notes: [],
  };
}

async function readFileIfExists(relativePath: string): Promise<string | undefined> {
  try {
    const filePath = path.isAbsolute(relativePath)
      ? relativePath
      : path.join(process.cwd(), relativePath);
    const content = await fs.readFile(filePath, "utf-8");
    return content;
  } catch (error) {
    return undefined;
  }
}

async function readPackageJson(): Promise<Record<string, unknown> | null> {
  const pkgPath = path.join(process.cwd(), "package.json");
  try {
    const content = await fs.readFile(pkgPath, "utf-8");
    return JSON.parse(content);
  } catch (error) {
    return null;
  }
}

function renderListSection(title: string, items: string[] | undefined): string | null {
  if (!items || items.length === 0) {
    return null;
  }
  return `### ${title}\n${items.map((item) => `- ${item}`).join("\n")}`;
}

function renderKeyValueSection(title: string, lines: string[]): string {
  return `### ${title}\n${lines.join("\n")}`;
}

function truncate(value: string, maxLength: number): string {
  if (value.length <= maxLength) {
    return value;
  }
  return `${value.slice(0, maxLength - 3)}...`;
}

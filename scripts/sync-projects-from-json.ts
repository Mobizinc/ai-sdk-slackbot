import { readFile } from "fs/promises";
import { join } from "path";
import { eq } from "drizzle-orm";
import { getDb } from "../lib/db/client";
import { projects } from "../lib/db/schema";
import { projectCatalogSchema } from "../lib/projects/types";

async function main() {
  const db = getDb();
  if (!db) {
    console.error("[Projects Sync] DATABASE_URL is not configured. Cannot sync projects.");
    process.exitCode = 1;
    return;
  }

  const filePath = join(process.cwd(), "data", "projects.json");
  const raw = await readFile(filePath, "utf-8");
  const parsed = projectCatalogSchema.parse(JSON.parse(raw));

  const now = new Date();
  let synced = 0;

  for (const project of parsed.projects) {
    await db
      .insert(projects)
      .values({
        id: project.id,
        name: project.name,
        status: project.status,
        githubUrl: project.githubUrl ?? null,
        summary: project.summary,
        background: project.background ?? null,
        techStack: project.techStack ?? [],
        skillsRequired: project.skillsRequired ?? [],
        skillsNiceToHave: project.skillsNiceToHave ?? [],
        difficultyLevel: project.difficultyLevel ?? null,
        estimatedHours: project.estimatedHours ?? null,
        learningOpportunities: project.learningOpportunities ?? [],
        openTasks: project.openTasks ?? [],
        mentorSlackUserId: project.mentor?.slackUserId ?? null,
        mentorName: project.mentor?.name ?? null,
        interviewConfig: project.interview ?? null,
        standupConfig: project.standup ?? null,
        maxCandidates: project.maxCandidates ?? null,
        postedDate: project.postedDate ? new Date(project.postedDate) : null,
        expiresDate: project.expiresDate ? new Date(project.expiresDate) : null,
        channelId: project.channelId ?? null,
        updatedAt: now,
      })
      .onConflictDoUpdate({
        target: projects.id,
        set: {
          name: project.name,
          status: project.status,
          githubUrl: project.githubUrl ?? null,
          summary: project.summary,
          background: project.background ?? null,
          techStack: project.techStack ?? [],
          skillsRequired: project.skillsRequired ?? [],
          skillsNiceToHave: project.skillsNiceToHave ?? [],
          difficultyLevel: project.difficultyLevel ?? null,
          estimatedHours: project.estimatedHours ?? null,
          learningOpportunities: project.learningOpportunities ?? [],
          openTasks: project.openTasks ?? [],
          mentorSlackUserId: project.mentor?.slackUserId ?? null,
          mentorName: project.mentor?.name ?? null,
          interviewConfig: project.interview ?? null,
          standupConfig: project.standup ?? null,
          maxCandidates: project.maxCandidates ?? null,
          postedDate: project.postedDate ? new Date(project.postedDate) : null,
          expiresDate: project.expiresDate ? new Date(project.expiresDate) : null,
          channelId: project.channelId ?? null,
          updatedAt: now,
        },
      });

    synced += 1;
  }

  console.log(`[Projects Sync] Synced ${synced} project(s) from ${filePath}`);
}

main().catch((error) => {
  console.error("[Projects Sync] Failed to sync projects", error);
  process.exitCode = 1;
});

import { getProjectCatalog } from "../../lib/projects/catalog";
import {
  getStandupConfig,
  triggerStandupIfDue,
  finalizeDueStandups,
  sendStandupReminders,
} from "../../lib/projects/standup-service";

function json(body: Record<string, unknown>, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: {
      "content-type": "application/json",
      "cache-control": "no-store",
    },
  });
}

async function runStandupCron(): Promise<Response> {
  try {
    const now = new Date();
    const catalog = await getProjectCatalog();
    const triggered: Array<{ projectId: string; standupId: string }> = [];

    for (const project of catalog) {
      const config = getStandupConfig(project);
      if (!config) {
        continue;
      }

      const result = await triggerStandupIfDue({ project, config, now });
      if (result) {
        triggered.push({ projectId: project.id, standupId: result.standup.id });
      }
    }

    const reminders = await sendStandupReminders(now);
    const finalized = await finalizeDueStandups(now);

    return json({
      status: "ok",
      triggered,
      reminders,
      finalized,
      timestamp: now.toISOString(),
    });
  } catch (error) {
    console.error("[Cron] Stand-up scheduler failed", error);
    const message = error instanceof Error ? error.message : "Failed to run stand-up cron";
    return json({ status: "error", message }, 500);
  }
}

export async function GET(): Promise<Response> {
  return runStandupCron();
}

export async function POST(): Promise<Response> {
  return runStandupCron();
}

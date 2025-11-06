import { desc } from "drizzle-orm";
import { getDb } from "../../../lib/db/client";
import { strategicEvaluations } from "../../../lib/db/schema";

export async function GET(request: Request): Promise<Response> {
  try {
    const db = getDb();
    if (!db) {
      return jsonResponse(
        {
          evaluations: [],
          message: "Database not configured; strategic evaluation history unavailable.",
        },
        200,
      );
    }

    const url = new URL(request.url);
    const limit = Math.min(Math.max(parseInt(url.searchParams.get("limit") || "20", 10), 1), 100);

    const rows = await db
      .select()
      .from(strategicEvaluations)
      .orderBy(desc(strategicEvaluations.createdAt))
      .limit(limit);

    const evaluations = rows.map((row) => {
      const summary = (row.summary ?? {}) as Record<string, any>;
      const analysis = (row.analysis ?? {}) as Record<string, any>;
      const strategicScoring = (summary.strategicScoring ?? {}) as Record<string, any>;
      return {
        id: row.id,
        projectName: row.projectName,
        createdAt: row.createdAt instanceof Date ? row.createdAt.toISOString() : row.createdAt,
        requestedBy: row.requestedBy,
        requestedByName: row.requestedByName ?? null,
        channelId: row.channelId ?? null,
        totalScore: row.totalScore ?? strategicScoring.totalScore ?? null,
        recommendation: row.recommendation ?? strategicScoring.recommendation ?? null,
        confidence: row.confidence ?? strategicScoring.confidence ?? null,
        needsClarification: row.needsClarification,
        completenessScore: summary.completenessScore ?? null,
        executiveSummary: summary.executiveSummary ?? null,
        nextSteps: Array.isArray(summary.nextSteps) ? summary.nextSteps : [],
        keyMetrics: Array.isArray(summary.keyMetrics) ? summary.keyMetrics : [],
        clarificationQuestions: Array.isArray(analysis.questions) ? analysis.questions : [],
        demandRequest: row.demandRequest ?? null,
      };
    });

    return jsonResponse({
      evaluations,
      count: evaluations.length,
    });
  } catch (error) {
    console.error("[Strategic Evaluations API] Failed to load evaluations", error);
    return jsonResponse({ error: "Internal server error" }, 500);
  }
}

export async function OPTIONS(): Promise<Response> {
  return new Response(null, {
    status: 204,
    headers: {
      "Access-Control-Allow-Origin": "*",
      "Access-Control-Allow-Methods": "GET, OPTIONS",
      "Access-Control-Allow-Headers": "Content-Type, Authorization",
    },
  });
}

function jsonResponse(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: {
      "Content-Type": "application/json",
      "Access-Control-Allow-Origin": "*",
      "Access-Control-Allow-Methods": "GET, OPTIONS",
      "Access-Control-Allow-Headers": "Content-Type, Authorization",
    },
  });
}

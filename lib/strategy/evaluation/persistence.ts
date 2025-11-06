import { getDb } from "../../db/client";
import {
  strategicEvaluations,
  type StrategicEvaluation,
} from "../../db/schema";
import type { AnalysisResult, FinalSummary, DemandRequest } from "../types";

export interface SaveStrategicEvaluationOptions {
  projectName: string;
  commandText: string;
  requestedBy: string;
  requestedByName?: string;
  channelId?: string;
  analysis: AnalysisResult;
  summary: FinalSummary;
  demandRequest: DemandRequest;
}

export async function saveStrategicEvaluation(
  options: SaveStrategicEvaluationOptions,
): Promise<StrategicEvaluation | null> {
  const db = getDb();
  if (!db) {
    console.warn("[Strategic Evaluation] Database not available; skipping persistence.");
    return null;
  }

  try {
    const [inserted] = await db
      .insert(strategicEvaluations)
      .values({
        projectName: options.projectName,
        requestedBy: options.requestedBy,
        requestedByName: options.requestedByName ?? null,
        channelId: options.channelId ?? null,
        commandText: options.commandText,
        demandRequest: options.demandRequest,
        analysis: options.analysis,
        summary: options.summary,
        needsClarification: options.analysis.needsClarification ?? false,
        totalScore: options.summary.strategicScoring?.totalScore ?? null,
        recommendation: options.summary.strategicScoring?.recommendation ?? null,
        confidence: options.summary.strategicScoring?.confidence ?? null,
      })
      .returning();

    return inserted ?? null;
  } catch (error) {
    console.error("[Strategic Evaluation] Failed to persist evaluation", error);
    return null;
  }
}

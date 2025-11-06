import type { AnalysisResult, FinalSummary, DemandRequest } from "./types";

export interface StrategicEvaluationCompletedEvent {
  evaluationId: string;
  projectName: string;
  requestedBy: string;
  requestedByName?: string;
  channelId?: string;
  score?: number;
  recommendation?: string;
  confidence?: string;
  needsClarification: boolean;
  createdAt: string;
  analysis: AnalysisResult;
  summary: FinalSummary;
  demandRequest: DemandRequest;
}

type Listener = (event: StrategicEvaluationCompletedEvent) => void | Promise<void>;

const listeners = new Set<Listener>();

export function onStrategicEvaluationCompleted(listener: Listener): () => void {
  listeners.add(listener);
  return () => listeners.delete(listener);
}

export function emitStrategicEvaluationCompleted(event: StrategicEvaluationCompletedEvent): void {
  for (const listener of listeners) {
    try {
      const result = listener(event);
      if (result && typeof (result as Promise<void>).then === "function") {
        (result as Promise<void>).catch((error) => {
          console.error("[Strategic Evaluation] Listener failed", error);
        });
      }
    } catch (error) {
      console.error("[Strategic Evaluation] Listener threw an error", error);
    }
  }
}

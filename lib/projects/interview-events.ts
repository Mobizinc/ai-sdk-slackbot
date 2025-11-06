export interface ProjectInterviewCompletedEvent {
  project: {
    id: string;
    name: string;
  };
  candidateId: string;
  mentorId?: string;
  answers: Array<{
    questionId: string;
    prompt: string;
    response: string;
  }>;
  matchSummary: {
    score: number;
    summary: string;
    recommendedTasks: string[];
    concerns?: string;
  };
  startedAt: string;
  completedAt: string;
  questions: Array<{
    id: string;
    prompt: string;
    helper?: string;
  }>;
  scoringPrompt?: string;
  questionSource: "config" | "generator" | "default";
  generatorModel?: string;
}

type Listener = (event: ProjectInterviewCompletedEvent) => void | Promise<void>;

const listeners = new Set<Listener>();

export function onProjectInterviewCompleted(listener: Listener): () => void {
  listeners.add(listener);
  return () => {
    listeners.delete(listener);
  };
}

export function emitProjectInterviewCompleted(event: ProjectInterviewCompletedEvent): void {
  for (const listener of listeners) {
    try {
      const result = listener(event);
      if (result && typeof (result as Promise<void>).then === "function") {
        (result as Promise<void>).catch((error) => {
          console.error("[Project Interview] Listener failed", error);
        });
      }
    } catch (error) {
      console.error("[Project Interview] Listener threw an error", error);
    }
  }
}

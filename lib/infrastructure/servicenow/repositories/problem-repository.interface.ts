import type { Problem, CreateProblemInput } from "../types/domain-models";

export interface ProblemRepository {
  createFromCase(caseSysId: string, input: CreateProblemInput): Promise<Problem>;
}

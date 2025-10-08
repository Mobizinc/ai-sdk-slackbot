/**
 * KB Workflow Manager
 * Orchestrates the multi-stage KB generation workflow
 * Manages state transitions: ASSESSING → GATHERING/GENERATING → PENDING_APPROVAL → APPROVED/REJECTED
 */

import type { CaseContext } from "./context-manager";
import { getContextManager } from "./context-manager";
import { getCaseQualityAnalyzer, type QualityAssessment } from "./services/case-quality-analyzer";
import { getKBGenerator, type KBArticle, type KBGenerationResult } from "./services/kb-generator";
import { serviceNowClient } from "./tools/servicenow";

export type WorkflowState =
  | "ASSESSING"
  | "GATHERING"
  | "GENERATING"
  | "PENDING_APPROVAL"
  | "APPROVED"
  | "REJECTED"
  | "AWAITING_NOTES"
  | "TIMEOUT"
  | "ERROR";

export interface KBWorkflow {
  caseNumber: string;
  threadTs: string;
  channelId: string;
  state: WorkflowState;
  qualityAssessment?: QualityAssessment;
  kbArticle?: KBArticle;
  kbGenerationResult?: KBGenerationResult;
  gatheringAttempts?: number;
  gatheringQuestions?: string[];
  approvalMessageTs?: string;
  createdAt: Date;
  lastUpdated: Date;
  error?: string;
}

export class KBWorkflowManager {
  private workflows: Map<string, KBWorkflow> = new Map();
  private contextManager = getContextManager();
  private qualityAnalyzer = getCaseQualityAnalyzer();
  private kbGenerator = getKBGenerator();

  private readonly MAX_GATHERING_ATTEMPTS = 5;
  private readonly GATHERING_TIMEOUT_HOURS = 24;

  /**
   * Start KB generation workflow for a resolved case
   */
  async startWorkflow(
    caseNumber: string,
    threadTs: string,
    channelId: string
  ): Promise<KBWorkflow> {
    const workflowKey = this.getWorkflowKey(caseNumber, threadTs);

    // Check if workflow already exists
    if (this.workflows.has(workflowKey)) {
      return this.workflows.get(workflowKey)!;
    }

    // Create new workflow
    const workflow: KBWorkflow = {
      caseNumber,
      threadTs,
      channelId,
      state: "ASSESSING",
      createdAt: new Date(),
      lastUpdated: new Date(),
    };

    this.workflows.set(workflowKey, workflow);

    console.log(`[KB Workflow] Started workflow for ${caseNumber} in state ASSESSING`);

    // Kick off quality assessment
    await this.runQualityAssessment(workflow);

    return workflow;
  }

  /**
   * Run quality assessment on case context
   */
  private async runQualityAssessment(workflow: KBWorkflow): Promise<void> {
    try {
      // Get context
      const context = await this.contextManager.getContext(
        workflow.caseNumber,
        workflow.threadTs
      );

      if (!context) {
        this.updateWorkflowState(workflow, "ERROR", { error: "Context not found" });
        return;
      }

      // Get ServiceNow case details
      const caseDetails = await serviceNowClient.getCase(workflow.caseNumber);

      // Run quality assessment
      const assessment = await this.qualityAnalyzer(context, caseDetails);

      workflow.qualityAssessment = assessment;

      console.log(
        `[KB Workflow] Quality assessment complete: ${assessment.decision} (score: ${assessment.score})`
      );

      // Transition based on decision
      if (assessment.decision === "high_quality") {
        this.updateWorkflowState(workflow, "GENERATING");
        await this.generateKBArticle(workflow, context, caseDetails);
      } else if (assessment.decision === "needs_input") {
        this.updateWorkflowState(workflow, "GATHERING");
        await this.startInteractiveGathering(workflow, assessment);
      } else {
        // insufficient
        this.updateWorkflowState(workflow, "AWAITING_NOTES");
      }
    } catch (error) {
      console.error("[KB Workflow] Error in quality assessment:", error);
      this.updateWorkflowState(workflow, "ERROR", {
        error: error instanceof Error ? error.message : String(error),
      });
    }
  }

  /**
   * Generate KB article (high quality path)
   */
  private async generateKBArticle(
    workflow: KBWorkflow,
    context: CaseContext,
    caseDetails: any
  ): Promise<void> {
    try {
      console.log(`[KB Workflow] Generating KB article for ${workflow.caseNumber}`);

      const result = await this.kbGenerator.generateArticle(context, caseDetails);

      workflow.kbGenerationResult = result;

      if (result.isDuplicate) {
        console.log(
          `[KB Workflow] Duplicate KB detected (${result.similarExistingKBs[0]?.case_number}), aborting`
        );
        this.updateWorkflowState(workflow, "REJECTED", {
          error: "Duplicate KB article found",
        });
        return;
      }

      workflow.kbArticle = result.article;

      console.log(
        `[KB Workflow] KB article generated with ${result.confidence}% confidence`
      );

      // Move to approval state
      this.updateWorkflowState(workflow, "PENDING_APPROVAL");
    } catch (error) {
      console.error("[KB Workflow] Error generating KB article:", error);
      this.updateWorkflowState(workflow, "ERROR", {
        error: error instanceof Error ? error.message : String(error),
      });
    }
  }

  /**
   * Start interactive gathering (needs input path)
   */
  private async startInteractiveGathering(
    workflow: KBWorkflow,
    assessment: QualityAssessment
  ): Promise<void> {
    workflow.gatheringAttempts = (workflow.gatheringAttempts || 0) + 1;

    if (workflow.gatheringAttempts > this.MAX_GATHERING_ATTEMPTS) {
      console.log(
        `[KB Workflow] Max gathering attempts reached for ${workflow.caseNumber}`
      );
      this.updateWorkflowState(workflow, "TIMEOUT");
      return;
    }

    // Generate questions based on missing info
    const questions = this.generateGatheringQuestions(assessment);
    workflow.gatheringQuestions = questions;

    console.log(
      `[KB Workflow] Starting gathering attempt ${workflow.gatheringAttempts} for ${workflow.caseNumber}`
    );
    console.log(`[KB Workflow] Questions: ${questions.join(", ")}`);

    // Workflow will wait for user responses, then re-assess
  }

  /**
   * Generate questions for interactive gathering
   */
  private generateGatheringQuestions(assessment: QualityAssessment): string[] {
    const questions: string[] = [];

    if (assessment.problemClarity !== "clear") {
      questions.push(
        "What was the specific error message or symptom the user experienced?"
      );
    }

    if (!assessment.stepsDocumented) {
      questions.push("What exact steps were taken to resolve the issue?");
    }

    if (!assessment.rootCauseIdentified) {
      questions.push("What was the root cause of the problem?");
    }

    // Add environment question if problem is clear but solution isn't
    if (
      assessment.problemClarity === "clear" &&
      assessment.solutionClarity !== "clear"
    ) {
      questions.push(
        "What operating system, software versions, or environment was affected?"
      );
    }

    // Add verification question
    if (assessment.solutionClarity === "clear" && !assessment.stepsDocumented) {
      questions.push("How did you verify the issue was fully resolved?");
    }

    // Limit to 5 questions max
    return questions.slice(0, 5);
  }

  /**
   * Process user response during gathering phase
   */
  async processGatheringResponse(
    caseNumber: string,
    threadTs: string,
    response: string
  ): Promise<void> {
    const workflowKey = this.getWorkflowKey(caseNumber, threadTs);
    const workflow = this.workflows.get(workflowKey);

    if (!workflow || workflow.state !== "GATHERING") {
      console.log(`[KB Workflow] No active gathering workflow for ${caseNumber}`);
      return;
    }

    console.log(`[KB Workflow] Processing gathering response for ${caseNumber}`);

    // Re-run quality assessment with updated context
    await this.runQualityAssessment(workflow);
  }

  /**
   * Handle approval/rejection reaction
   */
  async handleApprovalReaction(
    caseNumber: string,
    threadTs: string,
    approved: boolean
  ): Promise<void> {
    const workflowKey = this.getWorkflowKey(caseNumber, threadTs);
    const workflow = this.workflows.get(workflowKey);

    if (!workflow || workflow.state !== "PENDING_APPROVAL") {
      console.log(`[KB Workflow] No pending approval for ${caseNumber}`);
      return;
    }

    if (approved) {
      console.log(`[KB Workflow] KB article approved for ${caseNumber}`);
      this.updateWorkflowState(workflow, "APPROVED");
      // TODO: Publish to ServiceNow KB
    } else {
      console.log(`[KB Workflow] KB article rejected for ${caseNumber}`);
      this.updateWorkflowState(workflow, "REJECTED");
    }
  }

  /**
   * Get workflow by case number and thread
   */
  getWorkflow(caseNumber: string, threadTs: string): KBWorkflow | undefined {
    const workflowKey = this.getWorkflowKey(caseNumber, threadTs);
    return this.workflows.get(workflowKey);
  }

  /**
   * Update workflow state
   */
  private updateWorkflowState(
    workflow: KBWorkflow,
    newState: WorkflowState,
    updates?: Partial<KBWorkflow>
  ): void {
    workflow.state = newState;
    workflow.lastUpdated = new Date();

    if (updates) {
      Object.assign(workflow, updates);
    }

    console.log(
      `[KB Workflow] ${workflow.caseNumber} → ${newState} at ${workflow.lastUpdated.toISOString()}`
    );
  }

  /**
   * Cleanup expired workflows
   */
  async cleanupExpiredWorkflows(): Promise<void> {
    const now = new Date();
    let cleaned = 0;

    for (const [key, workflow] of this.workflows.entries()) {
      const hoursSinceUpdate =
        (now.getTime() - workflow.lastUpdated.getTime()) / (1000 * 60 * 60);

      if (
        workflow.state === "GATHERING" &&
        hoursSinceUpdate > this.GATHERING_TIMEOUT_HOURS
      ) {
        console.log(
          `[KB Workflow] Cleaning up expired gathering workflow: ${workflow.caseNumber}`
        );
        this.updateWorkflowState(workflow, "TIMEOUT");
        this.workflows.delete(key);
        cleaned++;
      }

      // Clean up completed workflows after 7 days
      if (
        (workflow.state === "APPROVED" || workflow.state === "REJECTED") &&
        hoursSinceUpdate > 168
      ) {
        console.log(
          `[KB Workflow] Cleaning up completed workflow: ${workflow.caseNumber}`
        );
        this.workflows.delete(key);
        cleaned++;
      }
    }

    if (cleaned > 0) {
      console.log(`[KB Workflow] Cleaned up ${cleaned} workflows`);
    }
  }

  /**
   * Get workflow statistics
   */
  getStats(): {
    total: number;
    byState: Record<WorkflowState, number>;
  } {
    const stats: { total: number; byState: Record<string, number> } = {
      total: this.workflows.size,
      byState: {},
    };

    for (const workflow of this.workflows.values()) {
      stats.byState[workflow.state] = (stats.byState[workflow.state] || 0) + 1;
    }

    return stats as { total: number; byState: Record<WorkflowState, number> };
  }

  private getWorkflowKey(caseNumber: string, threadTs: string): string {
    return `${caseNumber}:${threadTs}`;
  }
}

// Singleton instance
let workflowManager: KBWorkflowManager | null = null;

export function getKBWorkflowManager(): KBWorkflowManager {
  if (!workflowManager) {
    workflowManager = new KBWorkflowManager();
  }
  return workflowManager;
}

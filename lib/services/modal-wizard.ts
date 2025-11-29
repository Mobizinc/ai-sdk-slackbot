/**
 * Multi-Step Modal Workflow Framework
 * Enables complex workflows with multiple modal steps
 *
 * Features:
 * - Step navigation (next, back, skip)
 * - State persistence between steps
 * - Progress indicators
 * - Validation at each step
 * - Cancellation support
 * - Error recovery
 */

import { getSlackMessagingService } from "./slack-messaging";
import { workflowManager, Workflow } from "./workflow-manager";
import {
  createModalView,
  createSectionBlock,
  createContextBlock,
  type ModalView,
  type KnownBlock,
} from "../utils/message-styling";

const slackMessaging = getSlackMessagingService();
const WORKFLOW_TYPE_MODAL_WIZARD = "MODAL_WIZARD";

/**
 * Wizard step definition
 */
export interface WizardStep {
  stepId: string;
  title: string;
  blocks: KnownBlock[];
  submitText?: string;
  validate?: (values: Record<string, any>) => Promise<string | null>; // Returns error message or null
  optional?: boolean; // Can skip this step
}

/**
 * Wizard configuration
 */
export interface WizardConfig {
  wizardId: string;
  steps: WizardStep[];
  onComplete: (collectedData: Record<string, any>, userId: string) => Promise<void>;
  onCancel?: (collectedData: Record<string, any>, userId: string) => Promise<void>;
  metadata?: Record<string, any>; // Additional context (caseNumber, channelId, etc.)
}

/**
 * Wizard state stored in database
 */
interface WizardState {
  wizardId: string;
  currentStep: number;
  totalSteps: number;
  collectedData: Record<string, any>;
  userId: string;
}

/**
 * Multi-Step Modal Wizard Service
 */
export class ModalWizard {
  private activeWizards = new Map<string, WizardConfig>();

  /**
   * Start a new wizard
   */
  async startWizard(
    triggerId: string,
    userId: string,
    config: WizardConfig
  ): Promise<void> {
    if (!workflowManager) {
        throw new Error("WorkflowManager not available.");
    }
    if (config.steps.length === 0) {
      throw new Error("Wizard must have at least one step");
    }

    // Register wizard configuration
    this.activeWizards.set(config.wizardId, config);

    // Initialize wizard state
    const wizardState: WizardState = {
      wizardId: config.wizardId,
      currentStep: 0,
      totalSteps: config.steps.length,
      collectedData: {},
      userId,
    };

    // Build first step modal
    const firstStep = config.steps[0];
    const modalView = this.buildStepModal(firstStep, wizardState, config);

    // Open modal
    const result = await slackMessaging.openView({
      triggerId,
      view: modalView,
    });

    // Store wizard state with view_id
    if (result.view?.id) {
      await workflowManager.start({
        workflowType: WORKFLOW_TYPE_MODAL_WIZARD,
        workflowReferenceId: result.view.id,
        initialState: 'IN_PROGRESS',
        payload: wizardState,
        expiresInSeconds: 3600, // 1 hour
        contextKey: userId,
        correlationId: config.wizardId,
      });
    }

    console.log(`[Modal Wizard] Started ${config.wizardId} for user ${userId} (${config.steps.length} steps)`);
  }

  /**
   * Handle step submission
   */
  async handleStepSubmission(
    viewId: string,
    viewState: Record<string, any>,
    userId: string
  ): Promise<{ shouldClose: boolean; error?: string }> {
    if (!workflowManager) {
        throw new Error("WorkflowManager not available.");
    }
    // Get wizard state from database
    const workflow = await workflowManager.findActiveByReferenceId(WORKFLOW_TYPE_MODAL_WIZARD, viewId);

    if (!workflow) {
      console.error('[Modal Wizard] Wizard workflow not found for view:', viewId);
      return { shouldClose: true, error: "Wizard session expired" };
    }

    const wizardState = workflow.payload as WizardState;
    const config = this.activeWizards.get(wizardState.wizardId);

    if (!config) {
      console.error('[Modal Wizard] Wizard configuration not found:', wizardState.wizardId);
      return { shouldClose: true, error: "Wizard configuration not found" };
    }

    const currentStep = config.steps[wizardState.currentStep];

    // Validate current step if validator exists
    if (currentStep.validate) {
      const validationError = await currentStep.validate(viewState);
      if (validationError) {
        return { shouldClose: false, error: validationError };
      }
    }

    // Collect data from current step
    const stepData = this.extractStepData(viewState, currentStep.stepId);
    wizardState.collectedData[currentStep.stepId] = stepData;

    // Check if this is the last step
    if (wizardState.currentStep + 1 >= wizardState.totalSteps) {
      // Wizard complete!
      await config.onComplete(wizardState.collectedData, userId);

      // Mark workflow as completed
      await workflowManager.transition(workflow.id, workflow.version, { toState: 'COMPLETED', lastModifiedBy: userId });

      // Cleanup
      this.activeWizards.delete(wizardState.wizardId);

      console.log(`[Modal Wizard] Completed ${wizardState.wizardId} for user ${userId}`);
      return { shouldClose: true };
    }

    // Move to next step
    wizardState.currentStep++;
    const nextStep = config.steps[wizardState.currentStep];

    // Update wizard state in database
    const updatedWorkflow = await workflowManager.transition(workflow.id, workflow.version, {
        toState: 'IN_PROGRESS',
        updatePayload: {
          currentStep: wizardState.currentStep,
          collectedData: wizardState.collectedData,
        }
    });

    // Update modal to show next step
    const nextModalView = this.buildStepModal(nextStep, wizardState, config);

    await slackMessaging.updateView({
      viewId,
      view: nextModalView,
    });

    console.log(`[Modal Wizard] Advanced to step ${wizardState.currentStep + 1}/${wizardState.totalSteps} for ${wizardState.wizardId}`);

    return { shouldClose: false };
  }

  /**
   * Handle wizard cancellation
   */
  async handleCancel(
    viewId: string,
    userId: string
  ): Promise<void> {
    if (!workflowManager) {
        console.warn("[Modal Wizard] WorkflowManager not available.");
        return;
    }
    // Get wizard state
    const workflow = await workflowManager.findActiveByReferenceId(WORKFLOW_TYPE_MODAL_WIZARD, viewId);

    if (!workflow) {
      return;
    }

    const wizardState = workflow.payload as WizardState;
    const config = this.activeWizards.get(wizardState.wizardId);

    // Call onCancel handler if exists
    if (config?.onCancel) {
      await config.onCancel(wizardState.collectedData, userId);
    }

    // Mark as rejected/cancelled
    await workflowManager.transition(workflow.id, workflow.version, { toState: 'CANCELLED', lastModifiedBy: userId });

    // Cleanup
    this.activeWizards.delete(wizardState.wizardId);

    console.log(`[Modal Wizard] Cancelled ${wizardState.wizardId} at step ${wizardState.currentStep + 1}/${wizardState.totalSteps}`);
  }

  /**
   * Build modal view for a specific step
   */
  private buildStepModal(
    step: WizardStep,
    wizardState: WizardState,
    config: WizardConfig
  ): ModalView {
    const blocks: KnownBlock[] = [];

    // Progress indicator
    const progressText = `Step ${wizardState.currentStep + 1} of ${wizardState.totalSteps}`;
    blocks.push(createContextBlock(progressText));

    // Add step blocks
    blocks.push(...step.blocks);

    // Add footer with instructions if not last step
    if (wizardState.currentStep + 1 < wizardState.totalSteps) {
      blocks.push(
        createContextBlock(
          `_Click "${step.submitText || 'Next'}" to continue to the next step_`
        )
      );
    }

    return createModalView({
      title: step.title,
      blocks,
      submit: step.submitText || (wizardState.currentStep + 1 < wizardState.totalSteps ? "Next" : "Complete"),
      close: "Cancel",
      callbackId: `wizard_${config.wizardId}_step_${wizardState.currentStep}`,
      privateMetadata: JSON.stringify({
        wizardId: config.wizardId,
        stepIndex: wizardState.currentStep,
      }),
    });
  }

  /**
   * Extract data from view state for current step
   */
  private extractStepData(
    viewState: Record<string, any>,
    stepId: string
  ): Record<string, any> {
    const stepData: Record<string, any> = {};

    // Extract all values from the view state
    for (const [blockId, blockValue] of Object.entries(viewState)) {
      if (typeof blockValue === 'object' && blockValue !== null) {
        for (const [actionId, actionValue] of Object.entries(blockValue)) {
          if (typeof actionValue === 'object' && actionValue !== null) {
            const value = actionValue as any;

            // Extract different types of values
            if ('value' in value) {
              stepData[blockId] = value.value;
            } else if ('selected_option' in value) {
              stepData[blockId] = value.selected_option?.value;
            } else if ('selected_user' in value) {
              stepData[blockId] = value.selected_user;
            } else if ('selected_channel' in value) {
              stepData[blockId] = value.selected_channel;
            } else if ('selected_date' in value) {
              stepData[blockId] = value.selected_date;
            } else if ('selected_time' in value) {
              stepData[blockId] = value.selected_time;
            } else if ('selected_options' in value) {
              stepData[blockId] = value.selected_options?.map((o: any) => o.value);
            }
          }
        }
      }
    }

    return stepData;
  }

  /**
   * Get wizard state (for debugging/monitoring)
   */
  async getWizardState(viewId: string, userId: string): Promise<WizardState | null> {
    if (!workflowManager) {
        return null;
    }
    const workflow = await workflowManager.findActiveByReferenceId(WORKFLOW_TYPE_MODAL_WIZARD, viewId);
    return workflow ? workflow.payload as WizardState : null;
  }
}

// Global singleton instance
let modalWizard: ModalWizard | null = null;

/**
 * Get singleton instance of Modal Wizard
 */
export function getModalWizard(): ModalWizard {
  if (!modalWizard) {
    modalWizard = new ModalWizard();
  }

  return modalWizard;
}
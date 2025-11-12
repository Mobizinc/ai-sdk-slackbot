/**
 * ServiceNow SPM (Service Portfolio Management) Constants
 *
 * Provides constants for SPM project states, lifecycle stages, and priorities
 * Reference: ServiceNow SPM documentation
 */

/**
 * SPM Project States
 * From pm_project.state field
 */
export const SPM_PROJECT_STATES = {
  PENDING: '-5',
  OPEN: '-4',
  WORK_IN_PROGRESS: '-3',
  ON_HOLD: '-2',
  CLOSED_COMPLETE: '0',
  CLOSED_INCOMPLETE: '1',
  CLOSED_CANCELLED: '2',
} as const;

export type SPMProjectState = typeof SPM_PROJECT_STATES[keyof typeof SPM_PROJECT_STATES];

/**
 * Human-readable state labels
 */
export const SPM_PROJECT_STATE_LABELS: Record<string, string> = {
  '-5': 'Pending',
  '-4': 'Open',
  '-3': 'Work in Progress',
  '-2': 'On Hold',
  '0': 'Closed Complete',
  '1': 'Closed Incomplete',
  '2': 'Closed Cancelled',
};

/**
 * SPM Lifecycle Stages
 * From pm_project.lifecycle_stage field
 */
export const SPM_LIFECYCLE_STAGES = {
  CONCEPT: 'concept',
  PLANNING: 'planning',
  EXECUTION: 'execution',
  CLOSING: 'closing',
  CLOSED: 'closed',
} as const;

export type SPMLifecycleStage = typeof SPM_LIFECYCLE_STAGES[keyof typeof SPM_LIFECYCLE_STAGES];

/**
 * Human-readable lifecycle stage labels
 */
export const SPM_LIFECYCLE_STAGE_LABELS: Record<string, string> = {
  concept: 'Concept',
  planning: 'Planning',
  execution: 'Execution',
  closing: 'Closing',
  closed: 'Closed',
};

/**
 * SPM Priority Values
 * From pm_project.priority field
 */
export const SPM_PRIORITIES = {
  CRITICAL: '1',
  HIGH: '2',
  MODERATE: '3',
  LOW: '4',
  PLANNING: '5',
} as const;

export type SPMPriority = typeof SPM_PRIORITIES[keyof typeof SPM_PRIORITIES];

/**
 * Human-readable priority labels
 */
export const SPM_PRIORITY_LABELS: Record<string, string> = {
  '1': 'Critical',
  '2': 'High',
  '3': 'Moderate',
  '4': 'Low',
  '5': 'Planning',
};

/**
 * SPM Table Names
 */
export const SPM_TABLES = {
  PROJECT: 'pm_project',
  EPIC: 'pm_epic', // Also available as rm_epic in some instances
  STORY: 'rm_story',
  PORTFOLIO: 'pm_portfolio',
} as const;

/**
 * Helper function to check if a project is active (not closed)
 */
export function isSPMProjectActive(state: string): boolean {
  const closedStates = [
    SPM_PROJECT_STATES.CLOSED_COMPLETE,
    SPM_PROJECT_STATES.CLOSED_INCOMPLETE,
    SPM_PROJECT_STATES.CLOSED_CANCELLED,
  ] as const;
  return !closedStates.includes(state as any);
}

/**
 * Helper function to get human-readable state label
 */
export function getSPMProjectStateLabel(state: string): string {
  return SPM_PROJECT_STATE_LABELS[state] || state;
}

/**
 * Helper function to get human-readable priority label
 */
export function getSPMPriorityLabel(priority: string): string {
  return SPM_PRIORITY_LABELS[priority] || priority;
}

/**
 * Helper function to get human-readable lifecycle stage label
 */
export function getSPMLifecycleStageLabel(stage: string): string {
  return SPM_LIFECYCLE_STAGE_LABELS[stage] || stage;
}

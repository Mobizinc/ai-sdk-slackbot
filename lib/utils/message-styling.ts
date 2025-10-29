/**
 * Slack Message Styling Design System
 *
 * Centralized constants and utilities for consistent Slack Block Kit messages
 */

// ============================================================================
// EMOJI CONSTANTS
// ============================================================================

export const MessageEmojis = {
  // Status
  SUCCESS: '✅',
  ERROR: '❌',
  WARNING: '⚠️',
  INFO: 'ℹ️',
  PROCESSING: '⏳',

  // Actions
  WATCHING: '👀',
  GREETING: '👋',
  THINKING: '🤔',
  SEARCH: '🔍',
  LIGHTBULB: '💡',
  DOCUMENT: '📝',

  // Case Types
  INCIDENT: '🚨',
  REQUEST: '📋',
  QUESTION: '❓',
  PROJECT: '📊',

  // KB Workflow
  KB_DRAFT: '📄',
  KB_APPROVED: '✅',
  KB_REJECTED: '❌',

  // Escalation
  ESCALATION: '🔺',
  HIGH_PRIORITY: '🔴',
  MEDIUM_PRIORITY: '🟡',
  LOW_PRIORITY: '🟢',

  // Misc
  LINK: '🔗',
  TAG: '🏷️',
  CLOCK: '🕐',
  REFRESH: '🔄',
  PHONE: '📞',
} as const;

// ============================================================================
// COLOR CONSTANTS
// ============================================================================

export const MessageColors = {
  SUCCESS: '#2EB886',
  ERROR: '#E01E5A',
  WARNING: '#ECB22E',
  INFO: '#36C5F0',
  NEUTRAL: '#6A6E73',
  PRIMARY: '#1264A3',
} as const;

// ============================================================================
// PRIORITY HELPERS
// ============================================================================

/**
 * Get emoji for ServiceNow priority level
 */
export function getPriorityEmoji(priority: string | number): string {
  const p = typeof priority === 'string' ? parseInt(priority) : priority;

  if (p === 1) return MessageEmojis.HIGH_PRIORITY;
  if (p === 2) return MessageEmojis.MEDIUM_PRIORITY;
  return MessageEmojis.LOW_PRIORITY;
}

/**
 * Get priority label with emoji
 */
export function getPriorityLabel(priority: string | number): string {
  const p = typeof priority === 'string' ? parseInt(priority) : priority;
  const emoji = getPriorityEmoji(p);

  const labels: Record<number, string> = {
    1: 'Critical',
    2: 'High',
    3: 'Moderate',
    4: 'Low',
    5: 'Planning',
  };

  return `${emoji} P${p} - ${labels[p] || 'Unknown'}`;
}

// ============================================================================
// BLOCK KIT BUILDER HELPERS
// ============================================================================

/**
 * Create a header block
 */
export function createHeaderBlock(text: string): any {
  return {
    type: 'header',
    text: {
      type: 'plain_text',
      text,
      emoji: true,
    },
  };
}

/**
 * Create a section block with markdown text
 */
export function createSectionBlock(text: string, accessory?: any): any {
  const block: any = {
    type: 'section',
    text: {
      type: 'mrkdwn',
      text,
    },
  };

  if (accessory) {
    block.accessory = accessory;
  }

  return block;
}

/**
 * Create a section block with fields (two-column layout)
 */
export function createFieldsBlock(fields: Array<{ label: string; value: string }>): any {
  return {
    type: 'section',
    fields: fields.map(f => ({
      type: 'mrkdwn' as const,
      text: `*${f.label}:*\n${f.value}`,
    })),
  };
}

/**
 * Create a divider block
 */
export function createDivider(): any {
  return { type: 'divider' };
}

/**
 * Create a context block (small gray text at bottom)
 */
export function createContextBlock(text: string): any {
  return {
    type: 'context',
    elements: [
      {
        type: 'mrkdwn',
        text,
      },
    ],
  };
}

/**
 * Create an actions block with buttons
 */
export function createActionsBlock(buttons: Array<{
  text: string;
  actionId: string;
  value?: string;
  url?: string;
  style?: 'primary' | 'danger';
  confirm?: {
    title: string;
    text: string;
    confirm: string;
    deny: string;
  };
}>): any {
  return {
    type: 'actions',
    elements: buttons.map(btn => {
      const button: any = {
        type: 'button',
        text: {
          type: 'plain_text',
          text: btn.text,
          emoji: true,
        },
        action_id: btn.actionId,
      };

      if (btn.value) button.value = btn.value;
      if (btn.url) button.url = btn.url;
      if (btn.style) button.style = btn.style;

      if (btn.confirm) {
        button.confirm = {
          title: {
            type: 'plain_text',
            text: btn.confirm.title,
          },
          text: {
            type: 'mrkdwn',
            text: btn.confirm.text,
          },
          confirm: {
            type: 'plain_text',
            text: btn.confirm.confirm,
          },
          deny: {
            type: 'plain_text',
            text: btn.confirm.deny,
          },
          style: btn.style,
        };
      }

      return button;
    }),
  };
}

/**
 * Create an overflow menu (More Actions)
 */
export function createOverflowMenu(
  actionId: string,
  options: Array<{ text: string; value: string }>
): any {
  return {
    type: 'overflow',
    action_id: actionId,
    options: options.map(opt => ({
      text: {
        type: 'plain_text',
        text: opt.text,
        emoji: true,
      },
      value: opt.value,
    })),
  };
}

// ============================================================================
// STATUS UPDATE HELPERS
// ============================================================================

/**
 * Add a processing status indicator to blocks
 */
export function addProcessingStatus(blocks: any[], statusText: string): any[] {
  const newBlocks = [...blocks];
  const actionIndex = newBlocks.findIndex(b => b.type === 'actions');

  if (actionIndex >= 0) {
    newBlocks.splice(actionIndex, 0, createSectionBlock(`${MessageEmojis.PROCESSING} ${statusText}`));
  } else {
    newBlocks.push(createSectionBlock(`${MessageEmojis.PROCESSING} ${statusText}`));
  }

  return newBlocks;
}

/**
 * Add a completed status indicator and disable buttons
 */
export function addCompletedStatus(
  blocks: any[],
  statusText: string
): any[] {
  // Remove any processing status blocks
  const newBlocks = blocks.filter(b => {
    if (b.type === 'section' && 'text' in b && b.text && typeof b.text === 'object' && 'text' in b.text) {
      return !b.text.text.startsWith(MessageEmojis.PROCESSING);
    }
    return true;
  });

  const actionIndex = newBlocks.findIndex(b => b.type === 'actions');

  if (actionIndex >= 0) {
    // Add completed status before actions
    newBlocks.splice(actionIndex, 0, createSectionBlock(`${MessageEmojis.SUCCESS} ${statusText}`));

    // Disable all buttons
    const actionBlock: any = newBlocks[actionIndex + 1];
    if (actionBlock?.elements) {
      actionBlock.elements = actionBlock.elements.map((btn: any) => ({
        ...btn,
        style: undefined,
        confirm: undefined,
      }));
    }
  } else {
    newBlocks.push(createSectionBlock(`${MessageEmojis.SUCCESS} ${statusText}`));
  }

  return newBlocks;
}

// ============================================================================
// ERROR MESSAGE HELPERS
// ============================================================================

/**
 * Create a contextual error message with recovery options
 */
export function createErrorBlocks(
  actionLabel: string,
  errorGuidance: string,
  retryAction?: {
    actionId: string;
    value: string;
  }
): any[] {
  const blocks: any[] = [
    createSectionBlock(`${MessageEmojis.ERROR} *Failed to ${actionLabel}*`),
    createSectionBlock(errorGuidance),
  ];

  if (retryAction) {
    const buttons: Array<any> = [
      {
        text: `${MessageEmojis.REFRESH} Retry`,
        actionId: retryAction.actionId,
        value: retryAction.value,
      },
      {
        text: `${MessageEmojis.PHONE} Contact Support`,
        actionId: 'contact_support',
        url: 'slack://channel?team=T123&id=C456', // Replace with actual support channel
      },
    ];

    blocks.push(createActionsBlock(buttons));
  }

  return blocks;
}

/**
 * Get action-specific error guidance
 */
export function getErrorGuidance(actionId: string, error: any): string {
  const baseError = error instanceof Error ? error.message : 'Unknown error';

  const guidance: Record<string, string> = {
    escalation_create_project: [
      '• Check if you have project creation permissions',
      '• Verify ServiceNow connectivity',
      '• Try refreshing the page',
    ].join('\n'),
    escalation_create_epic: [
      '• Check if you have epic creation permissions',
      '• Verify the project exists',
      '• Try again in a few moments',
    ].join('\n'),
    escalation_reassign: [
      '• Verify the assignment group exists',
      '• Check if you have reassignment permissions',
      '• Try selecting a different group',
    ].join('\n'),
    kb_approve: [
      '• Check if you have KB publishing permissions',
      '• Verify ServiceNow knowledge base configuration',
      '• Try again in a few moments',
    ].join('\n'),
    kb_edit: [
      '• Check network connectivity',
      '• Verify article still exists',
      '• Try refreshing and approving again',
    ].join('\n'),
    quick_resolve_case: [
      '• Verify the case is still open',
      '• Check if you have case close permissions',
      '• Ensure all required fields are filled',
    ].join('\n'),
  };

  const specificGuidance = guidance[actionId] || `Technical details: ${baseError}`;

  return specificGuidance;
}

// ============================================================================
// LOADING STATE HELPERS
// ============================================================================

/**
 * Create a loading message block
 */
export function createLoadingBlocks(status: string): any[] {
  return [
    createSectionBlock(`${MessageEmojis.PROCESSING} ${status}`),
  ];
}

/**
 * Create progressive loading blocks with details
 */
export function createProgressiveLoadingBlocks(
  mainStatus: string,
  details?: string[]
): any[] {
  const blocks: any[] = [
    createSectionBlock(`${MessageEmojis.PROCESSING} ${mainStatus}`),
  ];

  if (details && details.length > 0) {
    blocks.push(
      createSectionBlock(details.map(d => `• ${d}`).join('\n'))
    );
  }

  return blocks;
}

// ============================================================================
// TRUNCATION HELPERS
// ============================================================================

/**
 * Truncate text to max length with ellipsis
 */
export function truncateText(text: string, maxLength: number): string {
  if (text.length <= maxLength) return text;
  return text.substring(0, maxLength) + '...';
}

/**
 * Truncate text for mobile viewing
 */
export function truncateForMobile(text: string): string {
  return truncateText(text, 150);
}

// ============================================================================
// SERVICENOW LINK HELPERS
// ============================================================================

/**
 * Get ServiceNow case URL
 */
export function getServiceNowCaseUrl(sysId: string): string {
  const instance = process.env.SERVICENOW_INSTANCE_URL || '';
  return `${instance}/sn_customerservice_case.do?sys_id=${sysId}`;
}

/**
 * Get ServiceNow table URL
 */
export function getServiceNowTableUrl(table: string, sysId: string): string {
  const instance = process.env.SERVICENOW_INSTANCE_URL || '';
  return `${instance}/${table}.do?sys_id=${sysId}`;
}

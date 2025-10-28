/**
 * Slack Message Styling Design System
 *
 * Centralized constants and utilities for consistent Slack Block Kit messages
 */

import { config } from '../config';

// ============================================================================
// BLOCK KIT TYPE DEFINITIONS
// ============================================================================

export interface PlainTextObject {
  type: 'plain_text';
  text: string;
  emoji?: boolean;
}

export interface MrkdwnTextObject {
  type: 'mrkdwn';
  text: string;
  verbatim?: boolean;
}

export type TextObject = PlainTextObject | MrkdwnTextObject;

export interface ConfirmObject {
  title: PlainTextObject;
  text: TextObject;
  confirm: PlainTextObject;
  deny: PlainTextObject;
  style?: 'primary' | 'danger';
}

export interface OptionObject {
  text: PlainTextObject;
  value: string;
  description?: PlainTextObject;
  url?: string;
}

export interface HeaderBlock {
  type: 'header';
  block_id?: string;
  text: PlainTextObject;
}

export interface SectionBlock {
  type: 'section';
  block_id?: string;
  text?: TextObject;
  fields?: TextObject[];
  accessory?: any; // Button, Image, Select, etc.
}

export interface DividerBlock {
  type: 'divider';
  block_id?: string;
}

export interface ImageBlock {
  type: 'image';
  block_id?: string;
  image_url: string;
  alt_text: string;
  title?: PlainTextObject;
}

export interface ActionsBlock {
  type: 'actions';
  block_id?: string;
  elements: Array<any>; // Button, Select, DatePicker, etc.
}

export interface ContextBlock {
  type: 'context';
  block_id?: string;
  elements: Array<TextObject | { type: 'image'; image_url: string; alt_text: string }>;
}

export interface InputBlock {
  type: 'input';
  block_id: string;
  element: any; // Input element
  label: PlainTextObject;
  hint?: PlainTextObject;
  optional?: boolean;
  dispatch_action?: boolean;
}

export interface FileBlock {
  type: 'file';
  block_id?: string;
  external_id: string;
  source: string;
}

export type KnownBlock =
  | HeaderBlock
  | SectionBlock
  | DividerBlock
  | ImageBlock
  | ActionsBlock
  | ContextBlock
  | InputBlock
  | FileBlock;

export type Block = KnownBlock;

export interface ModalView {
  type: 'modal';
  title: PlainTextObject;
  blocks: KnownBlock[];
  close?: PlainTextObject;
  submit?: PlainTextObject;
  private_metadata?: string;
  callback_id?: string;
  clear_on_close?: boolean;
  notify_on_close?: boolean;
  external_id?: string;
}

// ============================================================================
// NAMING CONVENTION GUIDE
// ============================================================================

/**
 * BLOCK KIT NAMING CONVENTIONS
 *
 * This guide defines the standardized naming patterns for action_id, block_id,
 * and callback_id values throughout the Slack Block Kit implementation.
 *
 * ## General Rules
 *
 * 1. **Format**: lowercase with underscores (snake_case)
 * 2. **Pattern**: {domain}_{element-type}_{action}_{target?}
 * 3. **Characters**: [a-z0-9_] only
 * 4. **Length**: Keep concise but descriptive (preferably < 50 chars)
 *
 * ## action_id Convention
 *
 * Used to identify interactive elements (buttons, selects, inputs, etc.)
 *
 * Pattern: {domain}_{element-type}_{action}_{target?}
 *
 * Examples:
 * - escalation_button_create_project
 * - escalation_button_acknowledge_bau
 * - escalation_button_reassign
 * - escalation_overflow_actions
 * - kb_approval_button_approve
 * - kb_approval_button_reject
 * - kb_approval_button_edit
 * - project_modal_input_name
 * - project_modal_input_description
 * - project_modal_select_priority
 * - reassign_modal_select_user
 * - reassign_modal_select_group
 * - reassign_modal_radio_assignment_type
 *
 * Components:
 * - domain: escalation, kb_approval, project, reassign, triage, etc.
 * - element-type: button, select, input, checkbox, radio, datepicker, etc.
 * - action: create, update, delete, approve, reject, assign, search, etc.
 * - target: (optional) project, user, group, etc.
 *
 * ## block_id Convention
 *
 * Used to identify blocks in layouts (especially in modals for value extraction)
 *
 * Pattern: {domain}_{block-type}_{purpose}
 *
 * Examples:
 * - escalation_actions_primary
 * - escalation_actions_secondary
 * - escalation_context_metadata
 * - escalation_section_details
 * - kb_approval_actions_main
 * - project_modal_input_name
 * - project_modal_input_description
 * - project_modal_input_priority
 * - reassign_modal_input_user
 * - reassign_modal_input_group
 * - reassign_modal_radio_assignment_type
 *
 * Components:
 * - domain: Same as action_id
 * - block-type: actions, section, context, header, input, divider
 * - purpose: Describes the block's role (primary, secondary, metadata, details)
 *
 * ## callback_id Convention
 *
 * Used for modals and interactive messages
 *
 * Pattern: {domain}_{action}_modal or {domain}_{action}_message
 *
 * Examples:
 * - escalation_create_project_modal
 * - escalation_reassign_case_modal
 * - kb_approval_edit_modal
 * - triage_classify_modal
 * - context_update_proposal_message
 *
 * Components:
 * - domain: Same as action_id
 * - action: The primary action (create_project, reassign_case, etc.)
 * - suffix: _modal or _message
 *
 * ## Domain Namespaces
 *
 * Current domains in use:
 * - escalation: Non-BAU case escalation workflows
 * - kb_approval: Knowledge base article approval workflows
 * - project: Project creation and management
 * - reassign: Case reassignment workflows
 * - triage: AI-powered case triage
 * - context_update: Context update proposals
 * - quick_action: Quick action buttons (resolve, close, etc.)
 *
 * ## Migration Guide
 *
 * Old → New Examples:
 * - "escalation_create_project" → "escalation_button_create_project"
 * - "escalation_acknowledge_bau" → "escalation_button_acknowledge_bau"
 * - "kb_approve" → "kb_approval_button_approve"
 * - "kb_reject" → "kb_approval_button_reject"
 * - "project_name" → "project_modal_input_name"
 * - "assignment_group_select" → "reassign_modal_select_group"
 *
 * ## Best Practices
 *
 * 1. **Consistency**: Always follow the pattern
 * 2. **Descriptive**: Make it clear what the element does
 * 3. **Unique**: Avoid conflicts between different workflows
 * 4. **Validation**: Use validateActionId() and validateBlockId() helpers
 * 5. **Documentation**: Document new domains when adding features
 *
 * ## Handler Routing
 *
 * action_id patterns enable easy routing in interactivity handler:
 *
 * ```typescript
 * if (action_id.startsWith('escalation_button_')) {
 *   // Handle escalation button actions
 * } else if (action_id.startsWith('kb_approval_button_')) {
 *   // Handle KB approval button actions
 * } else if (action_id.startsWith('project_modal_')) {
 *   // Handle project modal interactions
 * }
 * ```
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
  BOOK: '📚',
  BRAIN: '🧠',
  LIGHTNING: '⚡',

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
 * Get emoji for ServiceNow priority level (with accessible text label)
 * Note: Includes text label to avoid color-only indicators for accessibility
 */
export function getPriorityEmoji(priority: string | number): string {
  const p = typeof priority === 'string' ? parseInt(priority) : priority;

  // Include text labels for accessibility (not just color)
  if (p === 1) return '🔴 CRITICAL';
  if (p === 2) return '🟡 HIGH';
  if (p === 3) return '🟢 MODERATE';
  if (p === 4) return '🔵 LOW';
  if (p === 5) return '⚪ PLANNING';

  return '🟤 UNKNOWN';
}

/**
 * Get urgency indicator with accessible text label
 */
export function getUrgencyIndicator(urgency?: string | number): string {
  if (!urgency) return '🟡 MEDIUM';

  const urgencyStr = typeof urgency === 'number' ? String(urgency) : urgency;
  const urgencyLower = urgencyStr.toLowerCase();

  if (urgencyLower.includes('high') || urgencyLower === '1') {
    return '🔴 HIGH';
  }
  if (urgencyLower.includes('medium') || urgencyLower === '2') {
    return '🟡 MEDIUM';
  }
  return '🟢 LOW';
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
export function createHeaderBlock(text: string): KnownBlock {
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
export function createSectionBlock(text: string, accessory?: any): KnownBlock {
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
export function createFieldsBlock(fields: Array<{ label: string; value: string }>): KnownBlock {
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
export function createDivider(): KnownBlock {
  return { type: 'divider' };
}

/**
 * Create a context block (small gray text at bottom)
 */
export function createContextBlock(text: string): KnownBlock {
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
}>): KnownBlock {
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

/**
 * Create an image block
 */
export function createImageBlock(
  imageUrl: string,
  altText: string,
  title?: string,
  blockId?: string
): ImageBlock {
  const block: ImageBlock = {
    type: 'image',
    image_url: imageUrl,
    alt_text: altText,
  };

  if (title) {
    block.title = { type: 'plain_text', text: title, emoji: true };
  }

  if (blockId) {
    block.block_id = blockId;
  }

  return block;
}

/**
 * Create a file block
 */
export function createFileBlock(
  externalId: string,
  source: string = 'remote',
  blockId?: string
): FileBlock {
  const block: FileBlock = {
    type: 'file',
    external_id: externalId,
    source,
  };

  if (blockId) {
    block.block_id = blockId;
  }

  return block;
}

/**
 * Create a button element (for use in actions blocks)
 */
export function createButton(config: {
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
}): any {
  const button: any = {
    type: 'button',
    text: {
      type: 'plain_text',
      text: config.text,
      emoji: true,
    },
    action_id: config.actionId,
  };

  if (config.value) button.value = config.value;
  if (config.url) button.url = sanitizeUrl(config.url);
  if (config.style) button.style = config.style;

  if (config.confirm) {
    button.confirm = {
      title: { type: 'plain_text', text: config.confirm.title },
      text: { type: 'mrkdwn', text: config.confirm.text },
      confirm: { type: 'plain_text', text: config.confirm.confirm },
      deny: { type: 'plain_text', text: config.confirm.deny },
      style: config.style,
    };
  }

  return button;
}

// ============================================================================
// MODAL INPUT ELEMENT HELPERS
// ============================================================================

/**
 * Create a plain text input element
 */
export function createPlainTextInput(config: {
  actionId: string;
  placeholder?: string;
  initialValue?: string;
  multiline?: boolean;
  minLength?: number;
  maxLength?: number;
  dispatchActionConfig?: any;
}): any {
  const element: any = {
    type: 'plain_text_input',
    action_id: config.actionId,
  };

  if (config.placeholder) {
    element.placeholder = { type: 'plain_text', text: config.placeholder };
  }

  if (config.initialValue) {
    element.initial_value = config.initialValue;
  }

  if (config.multiline !== undefined) {
    element.multiline = config.multiline;
  }

  if (config.minLength !== undefined) {
    element.min_length = config.minLength;
  }

  if (config.maxLength !== undefined) {
    element.max_length = Math.min(config.maxLength, 3000); // Slack limit
  }

  if (config.dispatchActionConfig) {
    element.dispatch_action_config = config.dispatchActionConfig;
  }

  return element;
}

/**
 * Create a rich text input element
 */
export function createRichTextInput(config: {
  actionId: string;
  placeholder?: string;
  initialValue?: any;
  dispatchActionConfig?: any;
}): any {
  const element: any = {
    type: 'rich_text_input',
    action_id: config.actionId,
  };

  if (config.placeholder) {
    element.placeholder = { type: 'plain_text', text: config.placeholder };
  }

  if (config.initialValue) {
    element.initial_value = config.initialValue;
  }

  if (config.dispatchActionConfig) {
    element.dispatch_action_config = config.dispatchActionConfig;
  }

  return element;
}

/**
 * Create a static select menu
 */
export function createStaticSelect(config: {
  actionId: string;
  placeholder: string;
  options: Array<{ text: string; value: string; description?: string }>;
  initialOption?: { text: string; value: string };
  confirm?: ConfirmObject;
}): any {
  // Validate options don't exceed limit
  validateSelectOptions(config.options);

  const element: any = {
    type: 'static_select',
    action_id: config.actionId,
    placeholder: { type: 'plain_text', text: config.placeholder, emoji: true },
    options: config.options.map(opt => {
      const option: any = {
        text: { type: 'plain_text', text: opt.text, emoji: true },
        value: opt.value,
      };

      if (opt.description) {
        option.description = { type: 'plain_text', text: opt.description };
      }

      return option;
    }),
  };

  if (config.initialOption) {
    element.initial_option = {
      text: { type: 'plain_text', text: config.initialOption.text, emoji: true },
      value: config.initialOption.value,
    };
  }

  if (config.confirm) {
    element.confirm = config.confirm;
  }

  return element;
}

/**
 * Create an external data source select menu
 */
export function createExternalSelect(config: {
  actionId: string;
  placeholder: string;
  initialOption?: { text: string; value: string };
  minQueryLength?: number;
  confirm?: ConfirmObject;
}): any {
  const element: any = {
    type: 'external_select',
    action_id: config.actionId,
    placeholder: { type: 'plain_text', text: config.placeholder, emoji: true },
  };

  if (config.initialOption) {
    element.initial_option = {
      text: { type: 'plain_text', text: config.initialOption.text, emoji: true },
      value: config.initialOption.value,
    };
  }

  if (config.minQueryLength !== undefined) {
    element.min_query_length = config.minQueryLength;
  }

  if (config.confirm) {
    element.confirm = config.confirm;
  }

  return element;
}

/**
 * Create a user select menu
 */
export function createUserSelect(config: {
  actionId: string;
  placeholder: string;
  initialUser?: string;
  confirm?: ConfirmObject;
}): any {
  const element: any = {
    type: 'users_select',
    action_id: config.actionId,
    placeholder: { type: 'plain_text', text: config.placeholder, emoji: true },
  };

  if (config.initialUser) {
    element.initial_user = config.initialUser;
  }

  if (config.confirm) {
    element.confirm = config.confirm;
  }

  return element;
}

/**
 * Create a channel select menu
 */
export function createChannelSelect(config: {
  actionId: string;
  placeholder: string;
  initialChannel?: string;
  confirm?: ConfirmObject;
}): any {
  const element: any = {
    type: 'channels_select',
    action_id: config.actionId,
    placeholder: { type: 'plain_text', text: config.placeholder, emoji: true },
  };

  if (config.initialChannel) {
    element.initial_channel = config.initialChannel;
  }

  if (config.confirm) {
    element.confirm = config.confirm;
  }

  return element;
}

/**
 * Create a date picker element
 */
export function createDatePicker(config: {
  actionId: string;
  placeholder?: string;
  initialDate?: string; // YYYY-MM-DD format
  confirm?: ConfirmObject;
}): any {
  const element: any = {
    type: 'datepicker',
    action_id: config.actionId,
  };

  if (config.placeholder) {
    element.placeholder = { type: 'plain_text', text: config.placeholder, emoji: true };
  }

  if (config.initialDate) {
    // Validate YYYY-MM-DD format
    if (!/^\d{4}-\d{2}-\d{2}$/.test(config.initialDate)) {
      console.warn('[Date Picker] Invalid date format, expected YYYY-MM-DD:', config.initialDate);
    } else {
      element.initial_date = config.initialDate;
    }
  }

  if (config.confirm) {
    element.confirm = config.confirm;
  }

  return element;
}

/**
 * Create a time picker element
 */
export function createTimePicker(config: {
  actionId: string;
  placeholder?: string;
  initialTime?: string; // HH:mm format
  confirm?: ConfirmObject;
}): any {
  const element: any = {
    type: 'timepicker',
    action_id: config.actionId,
  };

  if (config.placeholder) {
    element.placeholder = { type: 'plain_text', text: config.placeholder, emoji: true };
  }

  if (config.initialTime) {
    // Validate HH:mm format
    if (!/^\d{2}:\d{2}$/.test(config.initialTime)) {
      console.warn('[Time Picker] Invalid time format, expected HH:mm:', config.initialTime);
    } else {
      element.initial_time = config.initialTime;
    }
  }

  if (config.confirm) {
    element.confirm = config.confirm;
  }

  return element;
}

/**
 * Create radio buttons element
 */
export function createRadioButtons(config: {
  actionId: string;
  options: Array<{ text: string; value: string; description?: string }>;
  initialOption?: { text: string; value: string };
  confirm?: ConfirmObject;
}): any {
  const element: any = {
    type: 'radio_buttons',
    action_id: config.actionId,
    options: config.options.map(opt => {
      const option: any = {
        text: { type: 'plain_text', text: opt.text, emoji: true },
        value: opt.value,
      };

      if (opt.description) {
        option.description = { type: 'plain_text', text: opt.description };
      }

      return option;
    }),
  };

  if (config.initialOption) {
    element.initial_option = {
      text: { type: 'plain_text', text: config.initialOption.text, emoji: true },
      value: config.initialOption.value,
    };
  }

  if (config.confirm) {
    element.confirm = config.confirm;
  }

  return element;
}

/**
 * Create checkboxes element
 */
export function createCheckboxes(config: {
  actionId: string;
  options: Array<{ text: string; value: string; description?: string }>;
  initialOptions?: Array<{ text: string; value: string }>;
  confirm?: ConfirmObject;
}): any {
  const element: any = {
    type: 'checkboxes',
    action_id: config.actionId,
    options: config.options.map(opt => {
      const option: any = {
        text: { type: 'plain_text', text: opt.text, emoji: true },
        value: opt.value,
      };

      if (opt.description) {
        option.description = { type: 'plain_text', text: opt.description };
      }

      return option;
    }),
  };

  if (config.initialOptions && config.initialOptions.length > 0) {
    element.initial_options = config.initialOptions.map(opt => ({
      text: { type: 'plain_text', text: opt.text, emoji: true },
      value: opt.value,
    }));
  }

  if (config.confirm) {
    element.confirm = config.confirm;
  }

  return element;
}

/**
 * Create an input block for modals
 */
export function createInputBlock(config: {
  blockId: string;
  label: string;
  element: any; // Any input element
  hint?: string;
  optional?: boolean;
  dispatchAction?: boolean;
}): InputBlock {
  const block: InputBlock = {
    type: 'input',
    block_id: config.blockId,
    element: config.element,
    label: { type: 'plain_text', text: config.label, emoji: true },
  };

  if (config.hint) {
    block.hint = { type: 'plain_text', text: config.hint, emoji: true };
  }

  if (config.optional !== undefined) {
    block.optional = config.optional;
  }

  if (config.dispatchAction !== undefined) {
    block.dispatch_action = config.dispatchAction;
  }

  return block;
}

/**
 * Create a modal view
 */
export function createModalView(config: {
  title: string;
  blocks: KnownBlock[];
  submit?: string;
  close?: string;
  callbackId?: string;
  privateMetadata?: string;
  clearOnClose?: boolean;
  notifyOnClose?: boolean;
  externalId?: string;
}): ModalView {
  // Validate block count
  validateBlockCount(config.blocks, 'modal');

  const view: ModalView = {
    type: 'modal',
    title: { type: 'plain_text', text: config.title, emoji: true },
    blocks: config.blocks,
  };

  if (config.submit) {
    view.submit = { type: 'plain_text', text: config.submit, emoji: true };
  }

  if (config.close) {
    view.close = { type: 'plain_text', text: config.close, emoji: true };
  }

  if (config.callbackId) {
    view.callback_id = config.callbackId;
  }

  if (config.privateMetadata) {
    view.private_metadata = config.privateMetadata;
  }

  if (config.clearOnClose !== undefined) {
    view.clear_on_close = config.clearOnClose;
  }

  if (config.notifyOnClose !== undefined) {
    view.notify_on_close = config.notifyOnClose;
  }

  if (config.externalId) {
    view.external_id = config.externalId;
  }

  return view;
}

// ============================================================================
// STATUS UPDATE HELPERS
// ============================================================================

/**
 * Add a processing status indicator to blocks
 */
export function addProcessingStatus(blocks: KnownBlock[], statusText: string): KnownBlock[] {
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
  blocks: KnownBlock[],
  statusText: string
): KnownBlock[] {
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
): KnownBlock[] {
  const blocks: KnownBlock[] = [
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
export function createLoadingBlocks(status: string): KnownBlock[] {
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
): KnownBlock[] {
  const blocks: KnownBlock[] = [
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
  if (!text || typeof text !== 'string') {
    return '';
  }

  if (text.length <= maxLength) {
    return text;
  }

  // If we need to truncate, take maxLength-3 characters and add ellipsis
  // Ensure the result never exceeds maxLength
  const ellipsis = '...';
  const truncateLength = Math.max(0, maxLength - ellipsis.length);
  return text.substring(0, truncateLength) + ellipsis;
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
  const instance = (config.servicenowInstanceUrl || config.servicenowUrl || '').replace(/\/$/, '');
  if (!instance) return '';
  return `${instance}/sn_customerservice_case.do?sys_id=${sysId}`;
}

/**
 * Get ServiceNow table URL
 */
export function getServiceNowTableUrl(table: string, sysId: string): string {
  const instance = (config.servicenowInstanceUrl || config.servicenowUrl || '').replace(/\/$/, '');
  if (!instance) return '';
  return `${instance}/${table}.do?sys_id=${sysId}`;
}

// ============================================================================
// SANITIZATION UTILITIES
// ============================================================================

/**
 * Sanitize text for mrkdwn blocks to prevent injection attacks
 * Removes dangerous HTML while preserving Slack markdown formatting
 */
export function sanitizeMrkdwn(text: string): string {
  if (!text) return '';

  // Dangerous HTML tags that should be completely removed
  const DANGEROUS_TAGS = [
    'script', 'iframe', 'object', 'embed', 'form', 'input', 
    'textarea', 'button', 'link', 'meta', 'style', 'html', 'head', 'body'
  ];

  let sanitized = text;

  // Remove dangerous HTML tags but keep their content
  DANGEROUS_TAGS.forEach(tag => {
    const regex = new RegExp('<' + tag + '[^>]*>(.*?)</' + tag + '>', 'gis');
    sanitized = sanitized.replace(regex, '$1');
  });

  // Remove ALL event handlers and dangerous attributes from any HTML tags
  // Use a more robust approach that handles nested quotes
  const dangerousAttrs = [
    'onclick', 'onload', 'onerror', 'onmouseover', 'onmouseout', 
    'onfocus', 'onblur', 'onchange', 'onsubmit', 'onreset', 'onselect', 
    'onunload', 'onkeydown', 'onkeyup', 'onkeypress', 'onmousedown', 
    'onmouseup', 'onmousemove', 'ondblclick', 'javascript:', 'vbscript:', 'data:'
  ];
  
  dangerousAttrs.forEach((attr: string) => {
    // Match: whitespace + attribute + = + quote + content + quote
    // Handle nested quotes by being more specific about HTML tag structure
    const regex = new RegExp(`\\s+${attr}\\s*=\\s*(?:"[^"]*(?:\\"[^"]*)*"|'[^']*(?:\\'[^']*)*'|[^\\s>]*)(?=\\s|>)`, 'gi');
    sanitized = sanitized.replace(regex, '');
  });

  return sanitized.trim().substring(0, 3000);
}

/**
 * Sanitize text for plain_text blocks
 * Removes dangerous HTML tags and attributes while preserving safe content
 */
export function sanitizePlainText(text: string, maxLength: number = 3000): string {
  if (!text) return '';

  // Dangerous HTML tags that should be completely removed (keep content)
  const DANGEROUS_TAGS = [
    'script', 'iframe', 'object', 'embed', 'form', 'input', 
    'textarea', 'button', 'link', 'meta', 'style', 'html', 'head', 'body'
  ];

  // Dangerous attributes that should be removed
  const DANGEROUS_ATTRIBUTES = [
    'onclick', 'onload', 'onerror', 'onmouseover', 'onmouseout', 
    'onfocus', 'onblur', 'onchange', 'onsubmit', 'onreset', 'onselect', 
    'onunload', 'onkeydown', 'onkeyup', 'onkeypress', 'onmousedown', 
    'onmouseup', 'onmousemove', 'ondblclick', 'javascript:', 'vbscript:', 'data:'
  ];

  let sanitized = text;

  // Remove dangerous HTML tags completely but keep their content
  DANGEROUS_TAGS.forEach(tag => {
    const regex = new RegExp('<' + tag + '[^>]*>(.*?)</' + tag + '>', 'gis');
    sanitized = sanitized.replace(regex, '$1');
  });

  // Remove dangerous attributes from any HTML tags
  DANGEROUS_ATTRIBUTES.forEach(attr => {
    // Remove from attribute name until next attribute or end of tag
    const regex = new RegExp('\\s' + attr + '\\s*=(?:(?:"[^"]*"|\'[^\']*\'|[^>\\s]*)[^>\\s]*)', 'gis');
    sanitized = sanitized.replace(regex, '');
  });

  // Remove control characters and zero-width characters
  return sanitized
    .replace(/[\x00-\x1F\x7F]/g, '')
    .replace(/[\u200B-\u200D\uFEFF]/g, '')
    .trim()
    .substring(0, maxLength);
}

/**
 * Sanitize URL to ensure it's safe for Slack
 */
export function sanitizeUrl(url: string): string {
  if (!url) return '';

  try {
    const parsed = new URL(url);

    // Only allow http, https, slack, and mailto protocols
    const allowedProtocols = ['http:', 'https:', 'slack:', 'mailto:'];
    if (!allowedProtocols.includes(parsed.protocol)) {
      console.warn('[Sanitize] Blocked dangerous URL protocol:', parsed.protocol);
      return '';
    }

    return url;
  } catch (error) {
    console.warn('[Sanitize] Invalid URL:', url);
    return '';
  }
}

/**
 * Safe JSON parse with fallback
 */
export function safeParseJSON<T>(json: string, fallback: T): T {
  try {
    return JSON.parse(json) as T;
  } catch (error) {
    console.error('[Sanitize] JSON parse failed:', error);
    return fallback;
  }
}

/**
 * Safe JSON parse for modal metadata with validation
 */
export function safeParseMetadata<T extends Record<string, any>>(
  metadata: string,
  requiredFields: string[]
): T | null {
  try {
    const parsed = JSON.parse(metadata);

    // Validate required fields exist
    for (const field of requiredFields) {
      if (!(field in parsed)) {
        console.error(`[Sanitize] Missing required field in metadata: ${field}`);
        return null;
      }
    }

    return parsed as T;
  } catch (error) {
    console.error('[Sanitize] Failed to parse metadata:', error);
    return null;
  }
}

// ============================================================================
// VALIDATION UTILITIES
// ============================================================================

/**
 * Validate block count doesn't exceed Slack limits
 */
export function validateBlockCount(
  blocks: KnownBlock[],
  context: 'message' | 'modal' | 'home'
): void {
  const limits = {
    message: 50,
    modal: 100,
    home: 100,
  };

  const limit = limits[context];

  if (blocks.length > limit) {
    throw new Error(
      `Block count (${blocks.length}) exceeds ${context} limit (${limit})`
    );
  }
}

/**
 * Validate fields array doesn't exceed Slack limit (10 fields)
 */
export function validateFieldsArray(fields: any[]): void {
  const MAX_FIELDS = 10;

  if (fields.length > MAX_FIELDS) {
    throw new Error(
      `Fields array length (${fields.length}) exceeds maximum (${MAX_FIELDS})`
    );
  }
}

/**
 * Validate context block elements don't exceed limit (10 elements)
 */
export function validateContextElements(elements: any[]): void {
  const MAX_ELEMENTS = 10;

  if (elements.length > MAX_ELEMENTS) {
    throw new Error(
      `Context elements (${elements.length}) exceeds maximum (${MAX_ELEMENTS})`
    );
  }
}

/**
 * Validate static select options don't exceed limit (100 options)
 */
export function validateSelectOptions(options: any[]): void {
  const MAX_OPTIONS = 100;

  if (options.length > MAX_OPTIONS) {
    throw new Error(
      `Select options (${options.length}) exceeds maximum (${MAX_OPTIONS}). Consider using external_select instead.`
    );
  }
}

/**
 * Validate text length for Block Kit text objects
 */
export function validateTextLength(
  text: string,
  type: 'plain_text' | 'mrkdwn',
  maxLength: number = 3000
): void {
  if (text.length > maxLength) {
    throw new Error(
      `Text length (${text.length}) exceeds maximum (${maxLength}) for ${type}`
    );
  }
}

/**
 * Validate action_id follows naming convention
 */
export function validateActionId(actionId: string): boolean {
  if (!actionId || typeof actionId !== 'string') {
    return false;
  }

  // Length validation
  if (actionId.length === 0 || actionId.length > 255) {
    return false;
  }

  // Format: lowercase letters, numbers, and underscores only
  const pattern = /^[a-z0-9_]+$/;
  
  if (!pattern.test(actionId)) {
    console.warn(
      `[Validation] action_id "${actionId}" doesn't follow naming convention. ` +
      `Expected: lowercase with underscores (e.g., "escalation_button_create_project")`
    );
    return false;
  }

  return true;
}

/**
 * Validate block_id follows naming convention
 */
export function validateBlockId(blockId: string): boolean {
  if (!blockId || typeof blockId !== 'string') {
    return false;
  }

  // Length validation
  if (blockId.length === 0 || blockId.length > 255) {
    return false;
  }

  // Format: lowercase letters, numbers, and underscores only
  const pattern = /^[a-z0-9_]+$/;
  
  if (!pattern.test(blockId)) {
    console.warn(
      `[Validation] block_id "${blockId}" doesn't follow naming convention. ` +
      `Expected: lowercase with underscores (e.g., "escalation_actions_primary")`
    );
    return false;
  }

  return true;
}

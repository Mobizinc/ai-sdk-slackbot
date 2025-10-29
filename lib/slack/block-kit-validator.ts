// Block types for validation
interface Block {
  type: string;
  block_id?: string;
  text?: any;
  fields?: any[];
  accessory?: any;
  elements?: any[];
  label?: any;
  image_url?: string;
  alt_text?: string;
  fallback?: string;
  title?: any;
  options?: any[];
  placeholder?: any;
}

interface KnownBlock extends Block {}

// Constants for validation
export const MAX_TEXT_LENGTH = 3000;
export const MAX_ACTION_ID_LENGTH = 255;
export const MAX_BLOCK_ID_LENGTH = 255;

// Dangerous HTML tags that should be completely removed
const DANGEROUS_TAGS = [
  'script',
  'iframe',
  'object',
  'embed',
  'form',
  'input',
  'textarea',
  'button',
  'link',
  'meta',
  'style',
  'html',
  'head',
  'body'
];

// Dangerous attributes that should be removed
const DANGEROUS_ATTRIBUTES = [
  'onclick',
  'onload',
  'onerror',
  'onmouseover',
  'onmouseout',
  'onfocus',
  'onblur',
  'onchange',
  'onsubmit',
  'onreset',
  'onselect',
  'onunload',
  'onkeydown',
  'onkeyup',
  'onkeypress',
  'onmousedown',
  'onmouseup',
  'onmousemove',
  'ondblclick',
  'javascript:',
  'vbscript:',
  'data:',
  'src'
];

/**
 * Sanitizes text content for Slack by removing dangerous HTML tags and attributes
 */
export function sanitizeSlackText(text: string): string {
  if (!text || typeof text !== 'string') {
    return '';
  }

  let sanitized = text;

  // Remove dangerous HTML tags completely but keep their content
  DANGEROUS_TAGS.forEach(tag => {
    const regex = new RegExp(`<${tag}[^>]*>(.*?)</${tag}>`, 'gis');
    sanitized = sanitized.replace(regex, '$1');
  });

  // Remove dangerous attributes from remaining HTML-like content
  DANGEROUS_ATTRIBUTES.forEach(attr => {
    const regex = new RegExp(`\\s${attr}\\s*=\\s*["'][^"']*["']`, 'gis');
    sanitized = sanitized.replace(regex, '');
  });

  // Remove any remaining HTML tags but keep content
  sanitized = sanitized.replace(/<[^>]+>/g, '');

  return sanitized.trim();
}

/**
 * Sanitizes block text objects
 */
export function sanitizeBlockText(block: { type: string; text?: string; emoji?: boolean }): { type: string; text: string; emoji?: boolean } {
  if (!block || typeof block !== 'object') {
    return { type: 'plain_text', text: '' };
  }

  const text = block.text || '';
  const sanitizedText = block.type === 'mrkdwn' 
    ? sanitizeMarkdownText(text)
    : sanitizeSlackText(text);

  return {
    type: block.type || 'plain_text',
    text: sanitizedText,
    emoji: block.emoji
  };
}

/**
 * Sanitizes markdown text while preserving Slack-specific formatting
 */
export function sanitizeMarkdownText(text: string): string {
  if (!text || typeof text !== 'string') {
    return '';
  }

  let sanitized = text;

  // Remove dangerous HTML tags but keep their content
  DANGEROUS_TAGS.forEach(tag => {
    const regex = new RegExp(`<${tag}[^>]*>(.*?)</${tag}>`, 'gis');
    sanitized = sanitized.replace(regex, '$1');
  });

  // Remove dangerous attributes from any remaining tags
  DANGEROUS_ATTRIBUTES.forEach(attr => {
    const regex = new RegExp(`\\s${attr}\\s*=\\s*["'][^"']*["']`, 'gis');
    sanitized = sanitized.replace(regex, '');
  });

  // Remove dangerous attributes from any remaining tags (backup)
  sanitized = sanitized.replace(/\s+(onclick|onload|onerror|onmouseover|onmouseout|onfocus|onblur|onchange|onsubmit|onreset|onselect|onunload|onkeydown|onkeyup|onkeypress|onmousedown|onmouseup|onmousemove|ondblclick|javascript:|vbscript:|data:)\s*=\s*["'][^"']*["']/gis, '');

  return sanitized.trim();
}

/**
 * Truncates text to maximum length with ellipsis
 */
export function truncateText(text: string, maxLength: number = MAX_TEXT_LENGTH): string {
  if (!text || typeof text !== 'string') {
    return '';
  }

  if (text.length <= maxLength) {
    return text;
  }

  // Take maxLength characters from original text, then add ellipsis
  return text.substring(0, maxLength) + '...';
}

/**
 * Validates action_id format
 */
export function validateActionId(actionId: string): boolean {
  if (!actionId || typeof actionId !== 'string') {
    return false;
  }

  // Length validation
  if (actionId.length === 0 || actionId.length > MAX_ACTION_ID_LENGTH) {
    return false;
  }

  // Format: lowercase letters, numbers, and underscores only
  const validPattern = /^[a-z0-9_]+$/;
  return validPattern.test(actionId);
}

/**
 * Validates block_id format
 */
export function validateBlockId(blockId: string): boolean {
  if (!blockId || typeof blockId !== 'string') {
    return false;
  }

  // Length validation
  if (blockId.length === 0 || blockId.length > MAX_BLOCK_ID_LENGTH) {
    return false;
  }

  // Format: lowercase letters, numbers, and underscores only
  const validPattern = /^[a-z0-9_]+$/;
  return validPattern.test(blockId);
}

/**
 * Validates the overall Block Kit structure
 */
export function validateBlockKitStructure(blocks: (Block | KnownBlock)[]): { valid: boolean; errors: string[] } {
  const errors: string[] = [];

  if (!Array.isArray(blocks)) {
    errors.push('Blocks must be an array');
    return { valid: false, errors };
  }

  if (blocks.length === 0) {
    errors.push('Blocks array cannot be empty');
    return { valid: false, errors };
  }

  blocks.forEach((block, index) => {
    try {
      const blockValidation = validateBlockElement(block);
      if (!blockValidation.valid) {
        errors.push(`Block ${index}: ${blockValidation.errors.join(', ')}`);
      }
    } catch (error) {
      errors.push(`Block ${index}: Invalid block structure`);
    }
  });

  return {
    valid: errors.length === 0,
    errors
  };
}

/**
 * Validates individual block elements
 */
export function validateBlockElement(block: any): { valid: boolean; errors: string[] } {
  const errors: string[] = [];

  if (!block || typeof block !== 'object') {
    errors.push('Block must be an object');
    return { valid: false, errors };
  }

  if (!block.type) {
    errors.push('Block must have a type');
    return { valid: false, errors };
  }

  const validBlockTypes = [
    'section',
    'divider',
    'header',
    'image',
    'actions',
    'context',
    'input',
    'file',
    'call'
  ];

  if (!validBlockTypes.includes(block.type)) {
    errors.push(`Invalid block type: ${block.type}`);
  }

  // Type-specific validation
  switch (block.type) {
    case 'section':
      if (!block.text && !block.fields && !block.accessory) {
        errors.push('Section block must have text, fields, or accessory');
      }
      break;

    case 'header':
      if (!block.text) {
        errors.push('Header block must have text');
      }
      break;

    case 'image':
      if (!block.image_url) {
        errors.push('Image block must have image_url');
      }
      break;

    case 'actions':
      if (!block.elements || !Array.isArray(block.elements) || block.elements.length === 0) {
        errors.push('Actions block must have elements array');
      } else {
        block.elements.forEach((element: any, index: number) => {
          const elementValidation = validateInteractiveElement(element);
          if (!elementValidation.valid) {
            errors.push(`Actions element ${index}: ${elementValidation.errors.join(', ')}`);
          }
        });
      }
      break;

    case 'context':
      if (!block.elements || !Array.isArray(block.elements) || block.elements.length === 0) {
        errors.push('Context block must have elements array');
      }
      break;

    case 'input':
      if (!block.label) {
        errors.push('Input block must have label');
      }
      break;
  }

  // Validate block_id if present
  if (block.block_id && !validateBlockId(block.block_id)) {
    errors.push('Invalid block_id format');
  }

  return {
    valid: errors.length === 0,
    errors
  };
}

/**
 * Validates interactive elements (buttons, selects, etc.)
 */
export function validateInteractiveElement(element: any): { valid: boolean; errors: string[] } {
  const errors: string[] = [];

  if (!element || typeof element !== 'object') {
    errors.push('Element must be an object');
    return { valid: false, errors };
  }

  if (!element.type) {
    errors.push('Element must have a type');
    return { valid: false, errors };
  }

  const validElementTypes = [
    'button',
    'static_select',
    'external_select',
    'users_select',
    'conversations_select',
    'channels_select',
    'datepicker',
    'timepicker',
    'checkboxes',
    'radio_buttons',
    'overflow',
    'plain_text_input'
  ];

  if (!validElementTypes.includes(element.type)) {
    errors.push(`Invalid element type: ${element.type}`);
  }

  // Validate action_id for elements that require it
  const requiresActionId = [
    'button',
    'static_select',
    'external_select',
    'users_select',
    'conversations_select',
    'channels_select',
    'datepicker',
    'timepicker',
    'plain_text_input'
  ];

  if (requiresActionId.includes(element.type)) {
    if (!element.action_id) {
      errors.push(`${element.type} element must have action_id`);
    } else if (!validateActionId(element.action_id)) {
      errors.push('Invalid action_id format');
    }
  }

  // Type-specific validation
  switch (element.type) {
    case 'button':
      if (!element.text) {
        errors.push('Button must have text');
      }
      break;

    case 'static_select':
    case 'external_select':
    case 'users_select':
    case 'conversations_select':
    case 'channels_select':
      if (!element.placeholder) {
        errors.push(`${element.type} must have placeholder`);
      }
      break;

    case 'checkboxes':
    case 'radio_buttons':
      if (!element.options || !Array.isArray(element.options)) {
        errors.push(`${element.type} must have options array`);
      }
      break;
  }

  return {
    valid: errors.length === 0,
    errors
  };
}
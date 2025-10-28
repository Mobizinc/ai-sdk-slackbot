// Test functions directly
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

const MAX_TEXT_LENGTH = 3000;
const MAX_ACTION_ID_LENGTH = 255;
const MAX_BLOCK_ID_LENGTH = 255;

function sanitizeSlackText(text) {
  if (!text || typeof text !== 'string') {
    return '';
  }

  let sanitized = text;

  // Remove dangerous HTML tags completely but keep their content
  DANGEROUS_TAGS.forEach(tag => {
    const regex = new RegExp('<' + tag + '[^>]*>(.*?)</' + tag + '>', 'gis');
    sanitized = sanitized.replace(regex, '$1');
  });

  // Remove dangerous attributes from remaining HTML-like content
  DANGEROUS_ATTRIBUTES.forEach(attr => {
    const regex = new RegExp('\\s' + attr + '\\s*=\\s*["\'][^"\']*["\']', 'gis');
    sanitized = sanitized.replace(regex, '');
  });

  // Remove any remaining HTML tags but keep content
  sanitized = sanitized.replace(/<[^>]+>/g, '');

  return sanitized.trim();
}

function validateActionId(actionId) {
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

function truncateText(text, maxLength = MAX_TEXT_LENGTH) {
  if (!text || typeof text !== 'string') {
    return '';
  }

  if (text.length <= maxLength) {
    return text;
  }

  // Take maxLength characters from original text, then add ellipsis
  return text.substring(0, maxLength) + '...';
}

// Test the functions
console.log('sanitizeSlackText test:');
console.log('Input: "Hello <script>alert(\'xss\')</script> world"');
console.log('Output:', sanitizeSlackText("Hello <script>alert('xss')</script> world"));
console.log('Expected: "Hello alert(\'xss\') world"');
console.log('');

console.log('validateActionId test:');
console.log('Input: "a"');
console.log('Output:', validateActionId('a'));
console.log('Expected: true');
console.log('');

console.log('truncateText test:');
console.log('Input: "Hello world", maxLength: 5');
console.log('Output:', truncateText('Hello world', 5));
console.log('Expected: "Hello..."');
console.log('');
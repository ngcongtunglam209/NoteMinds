/**
 * Prompt Injection Guard — Vietnamese + English
 * Sanitizes user input and document text before sending to AI model.
 */

// ── Injection patterns (English) ────────────────────────
const EN_PATTERNS = [
  /ignore\s+(all\s+)?(previous|above|prior|earlier|preceding)\s+(instructions?|prompts?|rules?|guidelines?|directions?)/gi,
  /disregard\s+(all\s+)?(previous|above|prior|earlier)\s+(instructions?|prompts?|rules?)/gi,
  /forget\s+(everything|all|your\s+(rules?|instructions?|guidelines?|programming|training))/gi,
  /override\s+(system|instructions?|rules?|safety|guidelines?|your\s+programming)/gi,
  /you\s+are\s+now\s+(a|an|the|no\s+longer)\s+/gi,
  /from\s+now\s+on,?\s+(you\s+are|act\s+as|behave\s+as|respond\s+as)/gi,
  /pretend\s+(you\s+are|to\s+be|you'?re|that\s+you)/gi,
  /act\s+as\s+(a|an|if|though)\s+/gi,
  /role\s*[-:]?\s*play\s+as/gi,
  /new\s+(instructions?|rules?|prompt|role)\s*[:=]/gi,
  /system\s*prompt/gi,
  /\bDAN\b\s*(mode)?/g,
  /do\s+anything\s+now/gi,
  /jailbreak/gi,
  /bypass\s+(safety|filter|restriction|guardrail|content\s+policy)/gi,
  /reveal\s+(your|the|system)\s+(prompt|instructions?|rules?|programming)/gi,
  /what\s+(are|is)\s+your\s+(system\s+)?(prompt|instructions?|rules?|programming)/gi,
  /show\s+(me\s+)?(your|the)\s+(system\s+)?(prompt|instructions?|rules?)/gi,
  /repeat\s+(the\s+)?(above|system|initial)\s+(text|prompt|instructions?)/gi,
  /output\s+(your|the|initial)\s+(system\s+)?(prompt|instructions?|message)/gi,
  /print\s+(your|the)\s+(system\s+)?(prompt|instructions?|configuration)/gi,
  /\[system\]/gi,
  /\[INST\]/gi,
  /<<\s*SYS\s*>>/gi,
  /\bEND_TURN\b/gi,
  /\bHuman:\s*/gi,
  /\bAssistant:\s*/gi,
  /you\s+must\s+(now\s+)?(obey|follow|comply|listen\s+to)\s+(me|my|these|the\s+following)/gi,
  /unlock\s+(your|developer|admin|hidden)\s+(mode|potential|capabilities)/gi,
];

// ── Injection patterns (Vietnamese) ─────────────────────
const VI_PATTERNS = [
  /bỏ\s+qua\s+(tất\s+cả\s+)?(các\s+)?(chỉ\s+dẫn|hướng\s+dẫn|quy\s+tắc|lệnh|prompt|chỉ\s+thị)\s+(trước|trên|cũ|ban\s+đầu)/gi,
  /phớt\s+lờ\s+(tất\s+cả\s+)?(các\s+)?(chỉ\s+dẫn|hướng\s+dẫn|quy\s+tắc|lệnh)/gi,
  /quên\s+(hết\s+)?(tất\s+cả|mọi\s+thứ|các\s+quy\s+tắc|những\s+gì|chỉ\s+dẫn|hướng\s+dẫn)/gi,
  /ghi\s+đè\s+(lên\s+)?(hệ\s+thống|quy\s+tắc|chỉ\s+dẫn|hướng\s+dẫn|lệnh)/gi,
  /bây\s+giờ\s+bạn\s+là/gi,
  /từ\s+(bây\s+)?giờ,?\s+(bạn\s+là|hãy\s+đóng\s+vai|hãy\s+giả\s+vờ)/gi,
  /giả\s+vờ\s+(bạn\s+là|là|làm|rằng\s+bạn)/gi,
  /đóng\s+vai\s+(là|làm|một)/gi,
  /hãy\s+làm\s+như\s+thể\s+(bạn\s+là|bạn\s+không)/gi,
  /chỉ\s+dẫn\s+mới\s*[:=]/gi,
  /quy\s+tắc\s+mới\s*[:=]/gi,
  /vai\s+trò\s+mới\s*[:=]/gi,
  /system\s*prompt/gi,
  /prompt\s+hệ\s+thống/gi,
  /hiện\s+thị\s+(lại\s+)?(prompt|chỉ\s+dẫn|hướng\s+dẫn)\s+(hệ\s+thống|ban\s+đầu|gốc)/gi,
  /cho\s+(tôi|mình)\s+(xem|biết)\s+(prompt|chỉ\s+dẫn|hướng\s+dẫn)\s+(hệ\s+thống|ban\s+đầu|gốc)/gi,
  /lặp\s+lại\s+(prompt|chỉ\s+dẫn|nội\s+dung)\s+(hệ\s+thống|ban\s+đầu|ở\s+trên)/gi,
  /in\s+ra\s+(prompt|chỉ\s+dẫn|cấu\s+hình)\s+(hệ\s+thống|ban\s+đầu)/gi,
  /bạn\s+phải\s+(nghe\s+theo|tuân\s+theo|làm\s+theo)\s+(tôi|lệnh\s+này|chỉ\s+dẫn\s+này)/gi,
  /mở\s+khóa\s+(chế\s+độ|tính\s+năng|khả\s+năng)\s+(ẩn|nhà\s+phát\s+triển|admin|quản\s+trị)/gi,
  /vượt\s+qua\s+(bộ\s+lọc|giới\s+hạn|hạn\s+chế|bảo\s+mật|an\s+toàn)/gi,
  /tắt\s+(bộ\s+lọc|chế\s+độ\s+an\s+toàn|kiểm\s+duyệt|bảo\s+mật)/gi,
  /không\s+cần\s+(tuân\s+theo|làm\s+theo)\s+(quy\s+tắc|chỉ\s+dẫn|hướng\s+dẫn)/gi,
];

const ALL_PATTERNS = [...EN_PATTERNS, ...VI_PATTERNS];

/**
 * Sanitize text by replacing injection patterns with [filtered].
 * Works for both Vietnamese and English.
 */
export function sanitizeForPrompt(text) {
  if (!text || typeof text !== 'string') return '';
  let clean = text;
  for (const pattern of ALL_PATTERNS) {
    // Reset lastIndex for global regex
    pattern.lastIndex = 0;
    clean = clean.replace(pattern, '[filtered]');
  }
  return clean;
}

/**
 * Sanitize user chat message with length limit.
 */
export function sanitizeUserMessage(message, maxLength = 2000) {
  if (!message || typeof message !== 'string') return '';
  const trimmed = message.trim().slice(0, maxLength);
  return sanitizeForPrompt(trimmed);
}

/**
 * Sanitize document text that will be embedded in prompts.
 * Lighter filtering — only catches explicit injection attempts,
 * preserves legitimate content.
 */
export function sanitizeDocumentText(text) {
  if (!text || typeof text !== 'string') return '';
  return sanitizeForPrompt(text);
}

/**
 * Sanitize file name used in prompts.
 */
export function sanitizeFileName(name) {
  if (!name || typeof name !== 'string') return 'Untitled';
  // Strip anything that looks like prompt injection in filename
  const clean = sanitizeForPrompt(name.slice(0, 255));
  return clean || 'Untitled';
}

/**
 * Sanitize chat history messages before sending to AI.
 */
export function sanitizeChatHistory(history) {
  if (!Array.isArray(history)) return [];
  return history
    .filter(msg => msg && typeof msg.role === 'string' && typeof msg.content === 'string')
    .filter(msg => ['user', 'assistant'].includes(msg.role))
    .map(msg => ({
      role: msg.role,
      content: msg.role === 'user' ? sanitizeForPrompt(msg.content.slice(0, 3000)) : msg.content
    }));
}

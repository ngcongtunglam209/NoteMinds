/**
 * Robust JSON extraction and parsing from AI responses.
 * Handles common AI output quirks like unquoted keys, trailing commas,
 * extra properties, markdown code blocks, etc.
 */

/**
 * Extract and parse JSON from AI response text
 */
export function parseAIJson(text) {
  let jsonStr = extractJsonBlock(text);
  
  // Try parsing as-is first
  try {
    return JSON.parse(jsonStr);
  } catch (e) {
    // Fall through to repair
  }

  // Attempt to repair common AI JSON issues
  const repaired = repairJson(jsonStr);
  try {
    return JSON.parse(repaired);
  } catch (e) {
    // Last resort: aggressive cleanup
    const aggressive = aggressiveRepair(repaired);
    return JSON.parse(aggressive);
  }
}

/**
 * Extract JSON string from AI response (may have markdown, explanations, etc.)
 */
function extractJsonBlock(text) {
  // Try markdown code block first
  const codeBlockMatch = text.match(/```(?:json)?\s*([\s\S]*?)```/);
  if (codeBlockMatch) {
    return codeBlockMatch[1].trim();
  }

  // Try raw JSON object
  const jsonMatch = text.match(/\{[\s\S]*\}/);
  if (jsonMatch) {
    return jsonMatch[0];
  }

  return text.trim();
}

/**
 * Fix common JSON issues from AI output
 */
function repairJson(str) {
  let result = str;

  // 1. Fix unquoted property keys:  canBeSkipped: true  →  "canBeSkipped": true
  result = result.replace(/([{,]\s*)([a-zA-Z_$][\w$]*)\s*:/g, '$1"$2":');

  // 2. Remove trailing commas before } or ]
  result = result.replace(/,\s*([}\]])/g, '$1');

  // 3. Fix single-quoted strings to double quotes (but not inside strings)
  // Only do this if there are no double-quoted strings nearby
  result = result.replace(/:\s*'([^']*)'/g, ': "$1"');

  // 4. Remove JavaScript-style comments
  result = result.replace(/\/\/[^\n]*/g, '');
  result = result.replace(/\/\*[\s\S]*?\*\//g, '');

  // 5. Fix unquoted string values (e.g., tag: Định_nghĩa)
  // This is tricky - only attempt for known patterns

  // 6. Remove BOM and zero-width characters
  result = result.replace(/[\u200B-\u200D\uFEFF]/g, '');

  return result;
}

/**
 * Aggressive repair: remove problematic lines entirely
 */
function aggressiveRepair(str) {
  const lines = str.split('\n');
  const cleanedLines = [];

  for (const line of lines) {
    const trimmed = line.trim();
    
    // Skip lines that are clearly not valid JSON content
    if (trimmed.startsWith('//')) continue;
    
    // Try to detect lines with unquoted keys that still fail
    // and remove the entire property if it's not a standard flashcard/mindmap field
    const knownKeys = ['id', 'question', 'answer', 'tag', 'title', 'cards', 'label', 'children', 'nodes'];
    const keyMatch = trimmed.match(/^"?(\w+)"?\s*:/);
    if (keyMatch) {
      const key = keyMatch[1];
      if (!knownKeys.includes(key)) {
        // Unknown key from AI hallucination - skip this line
        // But remove trailing comma from previous line
        if (cleanedLines.length > 0) {
          const prev = cleanedLines[cleanedLines.length - 1];
          cleanedLines[cleanedLines.length - 1] = prev.replace(/,\s*$/, '');
        }
        continue;
      }
    }

    cleanedLines.push(line);
  }

  let result = cleanedLines.join('\n');
  // Final trailing comma cleanup
  result = result.replace(/,\s*([}\]])/g, '$1');
  return result;
}

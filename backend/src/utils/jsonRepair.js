/**
 * JSON Repair Utility
 *
 * Handles various JSON truncation and malformation scenarios from AI responses.
 * Designed to salvage as much data as possible from partial/truncated JSON.
 */

/**
 * Attempts to repair truncated or malformed JSON
 *
 * @param {string} text - Raw text that may contain truncated JSON
 * @param {Object} options - Repair options
 * @param {boolean} options.verbose - Enable detailed logging
 * @returns {Object} - { success: boolean, data: Object|null, itemsRecovered: number, error: string|null }
 */
function repairJson(text, options = {}) {
  const { verbose = false } = options;

  if (!text || typeof text !== 'string') {
    return { success: false, data: null, itemsRecovered: 0, error: 'No text provided' };
  }

  const log = verbose ? console.log.bind(console, '[JSON Repair]') : () => {};

  // Step 1: Clean up the text
  let cleaned = text.trim();

  // Remove markdown code fences
  const fencedMatch = cleaned.match(/```(?:json)?\s*([\s\S]*?)```/i);
  if (fencedMatch) {
    cleaned = fencedMatch[1].trim();
    log('Removed markdown fences');
  }

  // Step 2: Try direct parse first
  try {
    const parsed = JSON.parse(cleaned);
    const itemCount = countItems(parsed);
    log(`Direct parse succeeded with ${itemCount} items`);
    return { success: true, data: parsed, itemsRecovered: itemCount, error: null };
  } catch (directError) {
    log(`Direct parse failed: ${directError.message}`);
  }

  // Step 3: Try repair strategies in order of aggressiveness
  const strategies = [
    { name: 'extractBetweenBraces', fn: extractBetweenBraces },
    { name: 'repairTruncatedArray', fn: repairTruncatedArray },
    { name: 'extractLastCompleteItem', fn: extractLastCompleteItem },
    { name: 'aggressiveRepair', fn: aggressiveRepair },
    { name: 'extractItemsManually', fn: extractItemsManually }
  ];

  for (const strategy of strategies) {
    try {
      log(`Trying strategy: ${strategy.name}`);
      const result = strategy.fn(cleaned, log);
      if (result) {
        const parsed = JSON.parse(result);
        const itemCount = countItems(parsed);
        log(`Strategy ${strategy.name} succeeded with ${itemCount} items`);
        return {
          success: true,
          data: parsed,
          itemsRecovered: itemCount,
          error: null,
          strategy: strategy.name
        };
      }
    } catch (e) {
      log(`Strategy ${strategy.name} failed: ${e.message}`);
    }
  }

  return { success: false, data: null, itemsRecovered: 0, error: 'All repair strategies failed' };
}

/**
 * Count items in parsed JSON (looks for line_items or items arrays)
 */
function countItems(parsed) {
  if (!parsed) return 0;
  if (Array.isArray(parsed)) return parsed.length;
  if (parsed.line_items) return parsed.line_items.length;
  if (parsed.items) return parsed.items.length;
  return 0;
}

/**
 * Strategy 1: Extract JSON between first { and last }
 */
function extractBetweenBraces(text, log) {
  const firstBrace = text.indexOf('{');
  const lastBrace = text.lastIndexOf('}');

  if (firstBrace === -1 || lastBrace === -1 || lastBrace <= firstBrace) {
    return null;
  }

  const extracted = text.slice(firstBrace, lastBrace + 1);
  log(`Extracted ${extracted.length} chars between braces`);
  return extracted;
}

/**
 * Strategy 2: Repair truncated array by closing brackets properly
 */
function repairTruncatedArray(text, log) {
  // Find line_items or items array
  const itemsMatch = text.match(/"(?:line_items|items)"\s*:\s*\[/);
  if (!itemsMatch) {
    return null;
  }

  const arrayStart = text.indexOf('[', itemsMatch.index);
  if (arrayStart === -1) return null;

  // Find the last complete object (ends with })
  // We need to find a } that's followed by either , or ] or end of truncation
  let lastCompleteObj = -1;
  let braceDepth = 0;
  let inString = false;
  let escapeNext = false;

  for (let i = arrayStart + 1; i < text.length; i++) {
    const char = text[i];

    if (escapeNext) {
      escapeNext = false;
      continue;
    }

    if (char === '\\') {
      escapeNext = true;
      continue;
    }

    if (char === '"' && !escapeNext) {
      inString = !inString;
      continue;
    }

    if (inString) continue;

    if (char === '{') {
      braceDepth++;
    } else if (char === '}') {
      braceDepth--;
      if (braceDepth === 0) {
        // Found a complete object at top level of array
        lastCompleteObj = i;
      }
    }
  }

  if (lastCompleteObj === -1) {
    return null;
  }

  // Truncate at last complete object
  let repaired = text.slice(0, lastCompleteObj + 1);

  // Remove trailing commas
  repaired = repaired.replace(/,\s*$/g, '');

  // Count unclosed brackets
  const openBrackets = (repaired.match(/\[/g) || []).length;
  const closeBrackets = (repaired.match(/\]/g) || []).length;
  const openBraces = (repaired.match(/\{/g) || []).length;
  const closeBraces = (repaired.match(/\}/g) || []).length;

  // Close arrays first, then objects
  for (let i = 0; i < openBrackets - closeBrackets; i++) {
    repaired += '\n]';
  }
  for (let i = 0; i < openBraces - closeBraces; i++) {
    repaired += '\n}';
  }

  log(`Repaired truncated array, closed ${openBrackets - closeBrackets} arrays, ${openBraces - closeBraces} objects`);
  return repaired;
}

/**
 * Strategy 3: Find and extract the last complete item
 */
function extractLastCompleteItem(text, log) {
  // Find array content
  const arrayMatch = text.match(/"(?:line_items|items)"\s*:\s*\[/);
  if (!arrayMatch) return null;

  const arrayStart = text.indexOf('[', arrayMatch.index);

  // Find all complete objects in the array using regex
  // Match objects that start with { and end with } followed by , or whitespace
  const objectPattern = /\{[^{}]*(?:\{[^{}]*\}[^{}]*)*\}/g;
  const afterArray = text.slice(arrayStart + 1);
  const objects = afterArray.match(objectPattern);

  if (!objects || objects.length === 0) {
    return null;
  }

  log(`Found ${objects.length} complete objects in array`);

  // Rebuild the JSON with just the complete objects
  const beforeArray = text.slice(0, arrayStart + 1);
  const rebuilt = beforeArray + objects.join(',\n') + '\n]}';

  return rebuilt;
}

/**
 * Strategy 4: Aggressive repair - remove problematic content and rebuild
 */
function aggressiveRepair(text, log) {
  // Extract just the items array content
  const itemsMatch = text.match(/"(?:line_items|items)"\s*:\s*\[/);
  if (!itemsMatch) return null;

  const arrayStart = text.indexOf('[', itemsMatch.index);
  const header = text.slice(0, arrayStart);
  const arrayContent = text.slice(arrayStart);

  // Find last } that could be end of an object
  let lastGoodPos = -1;
  let depth = 0;
  let inStr = false;
  let escape = false;

  for (let i = 0; i < arrayContent.length; i++) {
    const c = arrayContent[i];
    if (escape) { escape = false; continue; }
    if (c === '\\') { escape = true; continue; }
    if (c === '"') { inStr = !inStr; continue; }
    if (inStr) continue;

    if (c === '{' || c === '[') depth++;
    if (c === '}' || c === ']') {
      depth--;
      if (c === '}' && depth === 0) {
        // Top-level object in array
        lastGoodPos = i;
      }
    }
  }

  if (lastGoodPos === -1) return null;

  let fixed = header + arrayContent.slice(0, lastGoodPos + 1);

  // Clean up and close
  fixed = fixed.replace(/,\s*$/g, '');

  // Ensure proper closing
  const opens = (fixed.match(/[\[{]/g) || []).length;
  const closes = (fixed.match(/[\]}]/g) || []).length;

  // Add missing closers (arrays first)
  const arrayOpens = (fixed.match(/\[/g) || []).length;
  const arrayCloses = (fixed.match(/\]/g) || []).length;
  for (let i = 0; i < arrayOpens - arrayCloses; i++) {
    fixed += ']';
  }

  const objOpens = (fixed.match(/\{/g) || []).length;
  const objCloses = (fixed.match(/\}/g) || []).length;
  for (let i = 0; i < objOpens - objCloses; i++) {
    fixed += '}';
  }

  log('Applied aggressive repair');
  return fixed;
}

/**
 * Strategy 5: Manually extract items using regex patterns
 */
function extractItemsManually(text, log) {
  const items = [];

  // Pattern to match individual item objects
  // Looking for objects with line_number or description fields
  const itemPattern = /\{\s*"(?:line_number|description|item_no)"[^{}]*(?:\{[^{}]*\}[^{}]*)*\}/g;

  let match;
  while ((match = itemPattern.exec(text)) !== null) {
    try {
      const item = JSON.parse(match[0]);
      items.push(item);
    } catch (e) {
      // Skip malformed items
    }
  }

  if (items.length === 0) {
    return null;
  }

  log(`Manually extracted ${items.length} items`);

  // Build a minimal valid structure
  return JSON.stringify({
    rfq_metadata: {},
    line_items: items,
    _repaired: {
      method: 'manual_extraction',
      itemsRecovered: items.length
    }
  });
}

/**
 * Extract items from a partial/truncated JSON response
 * Returns an array of successfully parsed items
 *
 * @param {string} text - Raw response text
 * @returns {Array} - Array of item objects that were successfully parsed
 */
function extractPartialItems(text) {
  if (!text) return [];

  const items = [];

  // Try to find the items array
  const arrayMatch = text.match(/"(?:line_items|items)"\s*:\s*\[/);
  if (!arrayMatch) return [];

  const startIdx = text.indexOf('[', arrayMatch.index);
  if (startIdx === -1) return [];

  // Extract content after the array start
  const content = text.slice(startIdx + 1);

  // Parse objects one by one
  let pos = 0;
  let depth = 0;
  let objStart = -1;
  let inString = false;
  let escape = false;

  while (pos < content.length) {
    const char = content[pos];

    if (escape) {
      escape = false;
      pos++;
      continue;
    }

    if (char === '\\') {
      escape = true;
      pos++;
      continue;
    }

    if (char === '"') {
      inString = !inString;
      pos++;
      continue;
    }

    if (inString) {
      pos++;
      continue;
    }

    if (char === '{') {
      if (depth === 0) {
        objStart = pos;
      }
      depth++;
    } else if (char === '}') {
      depth--;
      if (depth === 0 && objStart !== -1) {
        // Found complete object
        const objStr = content.slice(objStart, pos + 1);
        try {
          const item = JSON.parse(objStr);
          items.push(item);
        } catch (e) {
          // Skip malformed
        }
        objStart = -1;
      }
    }

    pos++;
  }

  return items;
}

/**
 * Wrap partial items in a valid JSON structure
 *
 * @param {Array} items - Array of item objects
 * @param {Object} metadata - Optional metadata to include
 * @returns {Object} - Valid JSON structure
 */
function wrapItemsInStructure(items, metadata = {}) {
  return {
    rfq_metadata: metadata,
    line_items: items,
    _repaired: {
      partial: true,
      itemsRecovered: items.length,
      timestamp: new Date().toISOString()
    }
  };
}

module.exports = {
  repairJson,
  extractPartialItems,
  wrapItemsInStructure,
  countItems
};

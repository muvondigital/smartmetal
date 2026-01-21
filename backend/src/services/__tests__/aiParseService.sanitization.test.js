/**
 * Unit tests for JSON sanitization in aiParseService
 * Tests the LAYER 2 defense against invalid AI response formatting
 */

const { extractJsonFromText } = require('../aiParseService');

// Mock the sanitizeJsonText function for testing (it's not exported, but extractJsonFromText uses it)
// We'll test through extractJsonFromText since it's the public API

describe('JSON Sanitization (LAYER 2 Defense)', () => {
  describe('Comment Removal', () => {
    test('removes single-line comments (//) from JSON', () => {
      const jsonWithComments = `{
        "rfq_metadata": { "client_name": "Test Client" },
        "line_items": [
          { "line_number": 1, "description": "Item 1", "quantity": 10 }
          // Additional rows omitted for brevity
        ]
      }`;

      const result = extractJsonFromText(jsonWithComments);

      expect(result).not.toBeNull();
      expect(result.rfq_metadata.client_name).toBe('Test Client');
      expect(result.line_items).toHaveLength(1);
      expect(result.line_items[0].line_number).toBe(1);
    });

    test('removes multi-line comments (/* */) from JSON', () => {
      const jsonWithBlockComments = `{
        "rfq_metadata": { "client_name": "Test Client" },
        /* This is a comment block
           spanning multiple lines */
        "line_items": [
          { "line_number": 1, "description": "Item 1", "quantity": 10 }
        ]
      }`;

      const result = extractJsonFromText(jsonWithBlockComments);

      expect(result).not.toBeNull();
      expect(result.rfq_metadata.client_name).toBe('Test Client');
      expect(result.line_items).toHaveLength(1);
    });

    test('preserves URLs with // (http://, https://) in strings', () => {
      const jsonWithUrls = `{
        "rfq_metadata": {
          "client_name": "Test Client",
          "remarks": "See https://example.com/rfq for details"
        },
        "line_items": []
      }`;

      const result = extractJsonFromText(jsonWithUrls);

      expect(result).not.toBeNull();
      expect(result.rfq_metadata.remarks).toContain('https://example.com/rfq');
    });
  });

  describe('Trailing Comma Removal', () => {
    test('removes trailing commas before closing braces', () => {
      const jsonWithTrailingComma = `{
        "rfq_metadata": {
          "client_name": "Test Client",
        },
        "line_items": []
      }`;

      const result = extractJsonFromText(jsonWithTrailingComma);

      expect(result).not.toBeNull();
      expect(result.rfq_metadata.client_name).toBe('Test Client');
    });

    test('removes trailing commas before closing brackets', () => {
      const jsonWithTrailingComma = `{
        "rfq_metadata": {},
        "line_items": [
          { "line_number": 1, "description": "Item 1" },
        ]
      }`;

      const result = extractJsonFromText(jsonWithTrailingComma);

      expect(result).not.toBeNull();
      expect(result.line_items).toHaveLength(1);
    });
  });

  describe('Combined Issues', () => {
    test('handles JSON with comments AND trailing commas', () => {
      const messyJson = `{
        "rfq_metadata": {
          "client_name": "Test Client", // Client name from header
        },
        "line_items": [
          { "line_number": 1, "description": "Item 1", "quantity": 10 },
          { "line_number": 2, "description": "Item 2", "quantity": 20 },
          // Additional rows omitted for brevity
        ]
      }`;

      const result = extractJsonFromText(messyJson);

      expect(result).not.toBeNull();
      expect(result.rfq_metadata.client_name).toBe('Test Client');
      expect(result.line_items).toHaveLength(2);
      expect(result.line_items[0].quantity).toBe(10);
      expect(result.line_items[1].quantity).toBe(20);
    });

    test('handles the exact failure case from terminal logs', () => {
      // This is the actual problematic pattern from the logs
      const problemJson = `{
        "rfq_metadata": { "client_name": "SmartMetal" },
        "line_items": [
          { "line_number": 1, "description": "Pipe 1", "quantity": 100 }
          // Additional rows omitted for brevity
        ]
      }`;

      const result = extractJsonFromText(problemJson);

      expect(result).not.toBeNull();
      expect(result.rfq_metadata.client_name).toBe('SmartMetal');
      expect(result.line_items).toHaveLength(1);
    });
  });

  describe('Markdown Code Block Extraction + Sanitization', () => {
    test('extracts and sanitizes JSON from markdown code blocks', () => {
      const markdownWithComments = '```json\n' +
        `{
          "rfq_metadata": { "client_name": "Test" },
          "line_items": [
            { "line_number": 1, "description": "Item 1" }
            // Additional rows omitted for brevity
          ]
        }` +
        '\n```';

      const result = extractJsonFromText(markdownWithComments);

      expect(result).not.toBeNull();
      expect(result.rfq_metadata.client_name).toBe('Test');
      expect(result.line_items).toHaveLength(1);
    });

    test('extracts and sanitizes JSON from unclosed markdown blocks', () => {
      const unclosedBlock = '```json\n' +
        `{
          "rfq_metadata": { "client_name": "Test" },
          // This is a comment
          "line_items": []
        }`;

      const result = extractJsonFromText(unclosedBlock);

      expect(result).not.toBeNull();
      expect(result.rfq_metadata.client_name).toBe('Test');
    });
  });

  describe('Valid JSON (no sanitization needed)', () => {
    test('parses valid JSON without modification', () => {
      const validJson = `{
        "rfq_metadata": { "client_name": "Test Client" },
        "line_items": [
          { "line_number": 1, "description": "Item 1", "quantity": 10 }
        ]
      }`;

      const result = extractJsonFromText(validJson);

      expect(result).not.toBeNull();
      expect(result.rfq_metadata.client_name).toBe('Test Client');
      expect(result.line_items).toHaveLength(1);
    });
  });

  describe('Edge Cases', () => {
    test('returns null for completely invalid input', () => {
      const invalidInput = 'This is not JSON at all';
      const result = extractJsonFromText(invalidInput);
      expect(result).toBeNull();
    });

    test('returns null for empty string', () => {
      const result = extractJsonFromText('');
      expect(result).toBeNull();
    });

    test('returns null for null input', () => {
      const result = extractJsonFromText(null);
      expect(result).toBeNull();
    });
  });
});

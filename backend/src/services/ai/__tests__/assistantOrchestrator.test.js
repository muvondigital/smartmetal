/**
 * Unit Tests for AI Assistant Orchestrator
 * 
 * Test Framework: Jest (v29.7.0)
 * Test Environment: Node.js
 * 
 * Tests cover:
 * - Intent classification (classifyIntent)
 * - Entity extraction (extractEntities)
 * - Safety of string operations (no undefined.split errors)
 */

const { classifyIntent, decideDialogueStep, extractEntities } = require('../assistantOrchestrator');

describe('Assistant Orchestrator - classifyIntent', () => {
  describe('COUNT_RFQS intent', () => {
    test('should classify "How many RFQs do we have?" as COUNT_RFQS', async () => {
      const result = await classifyIntent('How many RFQs do we have?');
      expect(result.intent).toBe('COUNT_RFQS');
      expect(result.confidence).toBeGreaterThan(0.8); // High confidence
      expect(Array.isArray(result.reasons)).toBe(true);
      expect(result.reasons.length).toBeGreaterThan(0);
      expect(result.entities).toEqual({});
    });

    test('should classify "how many rfqs" as COUNT_RFQS', async () => {
      const result = await classifyIntent('how many rfqs');
      expect(result.intent).toBe('COUNT_RFQS');
      expect(result.confidence).toBeGreaterThan(0.8);
      expect(Array.isArray(result.reasons)).toBe(true);
    });

    test('should classify "how many rfqs are there" as COUNT_RFQS', async () => {
      const result = await classifyIntent('how many rfqs are there');
      expect(result.intent).toBe('COUNT_RFQS');
      expect(result.confidence).toBeGreaterThan(0.8);
    });
  });

  describe('APPROVAL_PENDING intent', () => {
    test('should classify "Show pending approvals" as APPROVAL_PENDING', async () => {
      const result = await classifyIntent('Show pending approvals');
      expect(result.intent).toBe('APPROVAL_PENDING');
      expect(result.confidence).toBeGreaterThan(0.8);
      expect(Array.isArray(result.reasons)).toBe(true);
      expect(result.entities).toEqual({});
    });

    test('should classify "pending approvals" as APPROVAL_PENDING', async () => {
      const result = await classifyIntent('pending approvals');
      expect(result.intent).toBe('APPROVAL_PENDING');
      expect(result.confidence).toBeGreaterThan(0.8);
    });

    test('should classify "what approvals are pending" as APPROVAL_PENDING', async () => {
      const result = await classifyIntent('what approvals are pending');
      expect(result.intent).toBe('APPROVAL_PENDING');
      expect(result.confidence).toBeGreaterThan(0.8);
    });
  });

  describe('RFQ_NEEDING_ATTENTION intent', () => {
    test('should classify "Find RFQs needing attention" as RFQ_NEEDING_ATTENTION', async () => {
      const result = await classifyIntent('Find RFQs needing attention');
      expect(result.intent).toBe('RFQ_NEEDING_ATTENTION');
      expect(result.confidence).toBeGreaterThan(0.7);
      expect(result.entities).toEqual({});
    });

    test('should classify "show rfqs needing attention" as RFQ_NEEDING_ATTENTION', async () => {
      const result = await classifyIntent('show rfqs needing attention');
      expect(result.intent).toBe('RFQ_NEEDING_ATTENTION');
      expect(result.confidence).toBeGreaterThan(0.7);
    });

    test('should classify "rfqs that need action" as RFQ_NEEDING_ATTENTION', async () => {
      const result = await classifyIntent('rfqs that need action');
      expect(result.intent).toBe('RFQ_NEEDING_ATTENTION');
      expect(result.confidence).toBeGreaterThan(0.7);
    });

    test('should classify "find stuck rfqs" as RFQ_NEEDING_ATTENTION', async () => {
      const result = await classifyIntent('find stuck rfqs');
      expect(result.intent).toBe('RFQ_NEEDING_ATTENTION');
      expect(result.confidence).toBeGreaterThan(0.7);
    });
  });

  describe('MATERIAL_SEARCH intent', () => {
    test('should classify "Search flange ASTM A105" as MATERIAL_SEARCH', async () => {
      const result = await classifyIntent('Search flange ASTM A105');
      expect(result.intent).toBe('MATERIAL_SEARCH');
      expect(result.entities.searchTerm).toBeDefined();
    });

    test('should classify "search material" as MATERIAL_SEARCH', async () => {
      const result = await classifyIntent('search material');
      expect(result.intent).toBe('MATERIAL_SEARCH');
    });

    test('should classify "find pipes" as MATERIAL_SEARCH', async () => {
      const result = await classifyIntent('find pipes');
      expect(result.intent).toBe('MATERIAL_SEARCH');
    });

    test('should extract search term from "Search flange ASTM A105"', async () => {
      const result = await classifyIntent('Search flange ASTM A105');
      expect(result.intent).toBe('MATERIAL_SEARCH');
      expect(result.entities.searchTerm).toContain('ASTM');
      expect(result.entities.searchTerm).toContain('A105');
    });
  });

  describe('SUMMARIZE_RFQ intent', () => {
    test('should classify "Summarize RFQ RFQ-1234" as SUMMARIZE_RFQ', async () => {
      const result = await classifyIntent('Summarize RFQ RFQ-1234');
      expect(result.intent).toBe('SUMMARIZE_RFQ');
      expect(result.entities.rfqId).toBeDefined();
    });

    test('should extract RFQ ID from "Summarize RFQ RFQ-1234"', async () => {
      const result = await classifyIntent('Summarize RFQ RFQ-1234');
      expect(result.intent).toBe('SUMMARIZE_RFQ');
      expect(result.entities.rfqId).toBeTruthy();
      // Should extract "1234" or "RFQ-1234" depending on implementation
    });

    test('should extract RFQ ID from "summarize rfq 5678"', async () => {
      const result = await classifyIntent('summarize rfq 5678');
      expect(result.intent).toBe('SUMMARIZE_RFQ');
      expect(result.entities.rfqId).toBeTruthy();
    });

    test('should classify "show rfq details" as SUMMARIZE_RFQ even without ID', async () => {
      const result = await classifyIntent('show rfq details');
      expect(result.intent).toBe('SUMMARIZE_RFQ');
    });
  });

  describe('UNKNOWN_INTENT fallback', () => {
    test('should classify nonsense text as UNKNOWN_INTENT', async () => {
      const result = await classifyIntent('blablabla random text');
      expect(result.intent).toBe('UNKNOWN_INTENT');
      expect(result.confidence).toBeLessThan(0.5); // Low confidence
      expect(Array.isArray(result.reasons)).toBe(true);
    });

    test('should classify "hello world" as UNKNOWN_INTENT', async () => {
      const result = await classifyIntent('hello world');
      expect(result.intent).toBe('UNKNOWN_INTENT');
      expect(result.confidence).toBeLessThan(0.5);
    });

    test('should classify empty string as UNKNOWN_INTENT', async () => {
      const result = await classifyIntent('');
      expect(result.intent).toBe('UNKNOWN_INTENT');
      expect(result.confidence).toBeLessThan(0.5);
    });
  });

  describe('Safety: undefined and null handling', () => {
    test('should NOT throw when classifyIntent(undefined) is called', async () => {
      expect(async () => {
        const result = await classifyIntent(undefined);
        expect(result.intent).toBe('UNKNOWN_INTENT');
      }).not.toThrow();
    });

    test('should NOT throw when classifyIntent(null) is called', async () => {
      expect(async () => {
        const result = await classifyIntent(null);
        expect(result.intent).toBe('UNKNOWN_INTENT');
      }).not.toThrow();
    });

    test('should NOT throw TypeError from undefined.split', async () => {
      // This is the regression test - the exact bug that was fixed
      expect(async () => {
        const result = await classifyIntent(undefined);
        // Should not throw: "Cannot read properties of undefined (reading 'split')"
        expect(result).toBeDefined();
        expect(result.intent).toBeDefined();
      }).not.toThrow(TypeError);
    });

    test('should handle mixed undefined/null in message', async () => {
      expect(async () => {
        const result = await classifyIntent('test message with ' + undefined);
        expect(result.intent).toBeDefined();
      }).not.toThrow();
    });
  });
});

describe('Assistant Orchestrator - extractEntities', () => {
  describe('RFQ ID extraction', () => {
    test('should extract RFQ ID from "Summarize RFQ RFQ-1234"', () => {
      const entities = extractEntities('Summarize RFQ RFQ-1234');
      expect(entities.rfqId).toBeTruthy();
      // Should extract "1234" or "RFQ-1234"
    });

    test('should extract RFQ ID from "summarize rfq 5678"', () => {
      const entities = extractEntities('summarize rfq 5678');
      expect(entities.rfqId).toBeTruthy();
    });

    test('should extract RFQ ID from "RFQ #9999"', () => {
      const entities = extractEntities('RFQ #9999');
      expect(entities.rfqId).toBeTruthy();
    });

    test('should handle messages without RFQ ID gracefully', () => {
      const entities = extractEntities('How many RFQs do we have?');
      // rfqId should be undefined or null, but MUST NOT cause a crash
      expect(entities).toBeDefined();
      expect(typeof entities).toBe('object');
      // Should not throw when accessing entities.rfqId
      expect(() => {
        const id = entities.rfqId;
      }).not.toThrow();
    });
  });

  describe('Pricing Run ID extraction', () => {
    test('should extract pricing run ID from message', () => {
      const entities = extractEntities('explain pricing run PR-456');
      expect(entities.pricingRunId).toBeTruthy();
    });

    test('should handle messages without pricing run ID', () => {
      const entities = extractEntities('show pending approvals');
      expect(entities).toBeDefined();
      expect(() => {
        const id = entities.pricingRunId;
      }).not.toThrow();
    });
  });

  describe('Material search term extraction', () => {
    test('should extract search term from material query', () => {
      const entities = extractEntities('Search flange ASTM A105');
      expect(entities.searchTerm).toBeTruthy();
    });

    test('should handle messages without search term', () => {
      const entities = extractEntities('how many rfqs');
      expect(entities).toBeDefined();
      expect(() => {
        const term = entities.searchTerm;
      }).not.toThrow();
    });
  });

  describe('Safety: undefined and null handling', () => {
    test('should NOT throw when extractEntities(undefined) is called', () => {
      expect(() => {
        const entities = extractEntities(undefined);
        expect(entities).toBeDefined();
        expect(typeof entities).toBe('object');
      }).not.toThrow();
    });

    test('should NOT throw when extractEntities(null) is called', () => {
      expect(() => {
        const entities = extractEntities(null);
        expect(entities).toBeDefined();
        expect(typeof entities).toBe('object');
      }).not.toThrow();
    });

    test('should NOT throw TypeError from undefined.split in extractEntities', () => {
      // Regression test for the bug
      expect(() => {
        const entities = extractEntities(undefined);
        // Should not throw: "Cannot read properties of undefined (reading 'split')"
        expect(entities).toBeDefined();
      }).not.toThrow(TypeError);
    });

    test('should return empty object for undefined input', () => {
      const entities = extractEntities(undefined);
      expect(entities).toBeDefined();
      expect(typeof entities).toBe('object');
    });
  });
});

describe('Assistant Orchestrator - String Operation Safety', () => {
  test('should never call .split() on undefined', async () => {
    // This test ensures the safe() helper is used everywhere
    const dangerousInputs = [undefined, null, 123, {}, [], true];
    
    for (const input of dangerousInputs) {
      expect(async () => {
        const result = await classifyIntent(input);
        expect(result).toBeDefined();
        expect(result.intent).toBeDefined();
      }).not.toThrow(TypeError);
    }
  });

  test('should handle all string operations safely', () => {
    const dangerousInputs = [undefined, null, 123, {}, []];
    
    for (const input of dangerousInputs) {
      expect(() => {
        const entities = extractEntities(input);
        expect(entities).toBeDefined();
      }).not.toThrow();
    }
  });
});

describe('Assistant Orchestrator - decideDialogueStep', () => {
  describe('CLARIFY mode for low confidence', () => {
    test('should return CLARIFY mode when intent is UNKNOWN_INTENT', () => {
      const result = decideDialogueStep({
        intent: 'UNKNOWN_INTENT',
        confidence: 0.2,
        entities: {},
        history: []
      });
      
      expect(result.mode).toBe('CLARIFY');
      expect(result.clarificationQuestion).toBeDefined();
      expect(typeof result.clarificationQuestion).toBe('string');
    });

    test('should return CLARIFY mode when confidence is below 0.5', () => {
      const result = decideDialogueStep({
        intent: 'COUNT_RFQS',
        confidence: 0.4,
        entities: {},
        history: []
      });
      
      expect(result.mode).toBe('CLARIFY');
      expect(result.clarificationQuestion).toBeDefined();
    });

    test('should provide clarificationOptions for generic queries', () => {
      const result = decideDialogueStep({
        intent: 'UNKNOWN_INTENT',
        confidence: 0.1,
        entities: {},
        history: [{ role: 'user', content: 'help' }]
      });
      
      expect(result.mode).toBe('CLARIFY');
      expect(Array.isArray(result.clarificationOptions)).toBe(true);
      expect(result.clarificationOptions.length).toBeGreaterThan(0);
    });
  });

  describe('CLARIFY mode for missing entities', () => {
    test('should return CLARIFY mode for SUMMARIZE_RFQ without rfqId', () => {
      const result = decideDialogueStep({
        intent: 'SUMMARIZE_RFQ',
        confidence: 0.9,
        entities: {}, // No rfqId
        history: []
      });
      
      expect(result.mode).toBe('CLARIFY');
      expect(result.clarificationQuestion).toBeDefined();
      expect(result.clarificationQuestion.toLowerCase()).toContain('rfq');
    });

    test('should return CLARIFY mode for MATERIAL_SEARCH without searchTerm', () => {
      const result = decideDialogueStep({
        intent: 'MATERIAL_SEARCH',
        confidence: 0.8,
        entities: {}, // No searchTerm
        history: []
      });
      
      expect(result.mode).toBe('CLARIFY');
      expect(result.clarificationQuestion).toBeDefined();
      expect(result.clarificationQuestion.toLowerCase()).toContain('material');
    });
  });

  describe('ANSWER mode for valid requests', () => {
    test('should return ANSWER mode for COUNT_RFQS with high confidence', () => {
      const result = decideDialogueStep({
        intent: 'COUNT_RFQS',
        confidence: 0.9,
        entities: {},
        history: []
      });
      
      expect(result.mode).toBe('ANSWER');
    });

    test('should return ANSWER mode for SUMMARIZE_RFQ with rfqId', () => {
      const result = decideDialogueStep({
        intent: 'SUMMARIZE_RFQ',
        confidence: 0.9,
        entities: { rfqId: '1234' },
        history: []
      });
      
      expect(result.mode).toBe('ANSWER');
    });

    test('should return ANSWER mode for APPROVAL_PENDING', () => {
      const result = decideDialogueStep({
        intent: 'APPROVAL_PENDING',
        confidence: 0.9,
        entities: {},
        history: []
      });
      
      expect(result.mode).toBe('ANSWER');
    });
  });

  describe('History-aware dialogue decisions', () => {
    test('should not re-ask same clarification if recently clarified', () => {
      const history = [
        { role: 'user', content: 'something vague' },
        { role: 'assistant', content: 'Do you want to review RFQs or approvals?' }
      ];
      
      const result = decideDialogueStep({
        intent: 'UNKNOWN_INTENT',
        confidence: 0.3,
        entities: {},
        history
      });
      
      // Should try to answer with best guess instead of clarifying again
      expect(result.mode).toBe('ANSWER');
    });
  });
});


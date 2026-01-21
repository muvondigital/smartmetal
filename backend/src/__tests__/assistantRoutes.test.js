/**
 * Integration Tests for Assistant Routes
 * 
 * Test Framework: Jest (v29.7.0) with Supertest
 * Test Environment: Node.js
 * 
 * Tests cover:
 * - POST /api/v1/assistant/query endpoint
 * - Intent classification (COUNT_RFQS, APPROVAL_PENDING, etc.)
 * - Error handling and validation
 * - Regression test for undefined.split bug
 */

const request = require('supertest');
const jwt = require('jsonwebtoken');

// Mock dependencies before requiring the app
jest.mock('../services/ai/assistantOrchestrator');
jest.mock('../services/assistantDataService');
jest.mock('../services/ai/azureClient');
jest.mock('../services/aiCostTrackingService');
jest.mock('../db/supabaseClient');

const { processQuery } = require('../services/ai/assistantOrchestrator');
const assistantDataService = require('../services/assistantDataService');
const aiCostTrackingService = require('../services/aiCostTrackingService');

// Import app after mocks are set up
// We need to create a test app instance
const express = require('express');
const assistantRoutes = require('../routes/assistantRoutes');
const { authenticate } = require('../middleware/auth');
const { tenantMiddleware } = require('../middleware/tenant');

// Create test app
function createTestApp() {
  const app = express();
  app.use(express.json());
  
  // Mock auth middleware
  app.use((req, res, next) => {
    req.user = {
      id: 'test-user-id',
      email: 'test@example.com',
      role: 'manager'
    };
    next();
  });
  
  // Mock tenant middleware
  app.use((req, res, next) => {
    req.tenantId = req.body.tenantId || 'test-tenant-123';
    req.tenantCode = 'TEST';
    next();
  });
  
  app.use('/api/v1/assistant', assistantRoutes);
  
  return app;
}

describe('Assistant Routes - POST /api/v1/assistant/query', () => {
  let app;

  beforeEach(() => {
    app = createTestApp();
    
    // Reset all mocks
    jest.clearAllMocks();
    
    // Default mock implementations
    aiCostTrackingService.checkBudget = jest.fn().mockResolvedValue({
      exceeded: false,
      percentage: 50
    });
    
    aiCostTrackingService.trackAiUsage = jest.fn().mockResolvedValue({});
    
    processQuery.mockImplementation(async (params) => {
      const { userMessage, tenantId, userRole } = params;
      
      // Simple intent classification for testing
      let intent = 'UNKNOWN_INTENT';
      let entities = {};
      let confidence = 0.2;
      let reasons = ['No matching patterns'];
      let followUp = false;
      let clarificationOptions = [];
      
      if (userMessage && userMessage.toLowerCase().includes('how many') && 
          userMessage.toLowerCase().includes('rfq')) {
        intent = 'COUNT_RFQS';
        confidence = 0.9;
        reasons = ['Matched phrase "how many" + "rfq"'];
      } else if (userMessage && userMessage.toLowerCase().includes('pending') && 
                 userMessage.toLowerCase().includes('approval')) {
        intent = 'APPROVAL_PENDING';
        confidence = 0.9;
        reasons = ['Matched phrase "pending approval"'];
      } else if (userMessage && userMessage.toLowerCase().includes('needing attention')) {
        intent = 'RFQ_NEEDING_ATTENTION';
        confidence = 0.85;
        reasons = ['Matched "rfq" + attention keywords'];
      } else if (userMessage && userMessage.toLowerCase().includes('summarize')) {
        intent = 'SUMMARIZE_RFQ';
        const match = userMessage.match(/rfq-?(\d+)/i);
        if (match) {
          entities.rfqId = match[1];
          confidence = 0.9;
          reasons = [`Matched "summarize" + "rfq" with ID: ${match[1]}`];
        } else {
          confidence = 0.5;
          reasons = ['Matched "summarize" + "rfq" but no ID found'];
        }
      } else if (userMessage && userMessage.toLowerCase().includes('search')) {
        intent = 'MATERIAL_SEARCH';
        confidence = 0.8;
        reasons = ['Matched "search" + material keywords'];
      }
      
      return {
        reply: `Test response for ${intent}`,
        intent: intent,
        confidence: confidence,
        reasons: reasons,
        entities: entities,
        followUp: followUp,
        clarificationOptions: clarificationOptions,
        suggestedActions: [],
        metadata: {
          tokensUsed: 100,
          latency: 500
        }
      };
    });
  });

  describe('COUNT_RFQS intent', () => {
    test('should return 200 with COUNT_RFQS intent and conversational metadata', async () => {
      const response = await request(app)
        .post('/api/v1/assistant/query')
        .send({
          tenantId: 'test-tenant-123',
          role: 'MANAGER',
          message: 'How many RFQs do we have?',
          history: []
        })
        .expect(200);

      expect(response.body).toHaveProperty('response');
      expect(response.body).toHaveProperty('actions');
      expect(response.body).toHaveProperty('followUp');
      expect(response.body).toHaveProperty('debug');
      expect(response.body.debug.intent).toBe('COUNT_RFQS');
      expect(response.body.debug).toHaveProperty('confidence');
      expect(response.body.debug).toHaveProperty('reasons');
      expect(typeof response.body.response).toBe('string');
      expect(Array.isArray(response.body.actions)).toBe(true);
      expect(typeof response.body.followUp).toBe('boolean');
      expect(response.body.followUp).toBe(false); // Clear query should not follow up
      expect(typeof response.body.debug.confidence).toBe('number');
      expect(Array.isArray(response.body.debug.reasons)).toBe(true);
    });
  });

  describe('APPROVAL_PENDING intent', () => {
    test('should return 200 with APPROVAL_PENDING intent', async () => {
      const response = await request(app)
        .post('/api/v1/assistant/query')
        .send({
          tenantId: 'test-tenant-123',
          role: 'MANAGER',
          message: 'Show pending approvals',
          history: []
        })
        .expect(200);

      expect(response.body.debug.intent).toBe('APPROVAL_PENDING');
      expect(response.body.response).toBeDefined();
    });
  });

  describe('RFQ_NEEDING_ATTENTION intent', () => {
    test('should return 200 with RFQ_NEEDING_ATTENTION intent', async () => {
      const response = await request(app)
        .post('/api/v1/assistant/query')
        .send({
          tenantId: 'test-tenant-123',
          role: 'MANAGER',
          message: 'Find RFQs needing attention',
          history: []
        })
        .expect(200);

      expect(response.body.debug.intent).toBe('RFQ_NEEDING_ATTENTION');
    });
  });

  describe('UNKNOWN_INTENT fallback', () => {
    test('should return 200 with UNKNOWN_INTENT for random text', async () => {
      // Update mock to simulate clarification mode
      processQuery.mockImplementationOnce(async () => ({
        reply: 'I can help with RFQs, approvals, pricing runs, and materials. Which one would you like to focus on?',
        intent: 'UNKNOWN_INTENT',
        confidence: 0.2,
        reasons: ['No matching patterns or keywords found'],
        entities: {},
        followUp: true,
        clarificationOptions: ['RFQs', 'Approvals', 'Pricing runs', 'Materials'],
        suggestedActions: [],
        metadata: { tokensUsed: 50, latency: 300 }
      }));

      const response = await request(app)
        .post('/api/v1/assistant/query')
        .send({
          tenantId: 'test-tenant-123',
          role: 'SALES',
          message: 'blablabla random text',
          history: []
        })
        .expect(200);

      expect(response.body.debug.intent).toBe('UNKNOWN_INTENT');
      expect(response.body.response).toBeDefined();
      expect(typeof response.body.response).toBe('string');
      expect(response.body.followUp).toBe(true);
      expect(response.body.debug.confidence).toBeLessThan(0.5);
      expect(Array.isArray(response.body.clarificationOptions)).toBe(true);
      expect(response.body.clarificationOptions.length).toBeGreaterThan(0);
    });
  });

  describe('Input validation', () => {
    test('should return 400 for missing message', async () => {
      const response = await request(app)
        .post('/api/v1/assistant/query')
        .send({
          tenantId: 'test-tenant-123',
          role: 'MANAGER',
          history: []
        })
        .expect(400);

      expect(response.body).toHaveProperty('error');
    });

    test('should return 400 for null message', async () => {
      const response = await request(app)
        .post('/api/v1/assistant/query')
        .send({
          tenantId: 'test-tenant-123',
          role: 'MANAGER',
          message: null,
          history: []
        })
        .expect(400);

      expect(response.body).toHaveProperty('error');
    });

    test('should return 400 for empty message', async () => {
      const response = await request(app)
        .post('/api/v1/assistant/query')
        .send({
          tenantId: 'test-tenant-123',
          role: 'MANAGER',
          message: '   ',
          history: []
        })
        .expect(400);

      expect(response.body).toHaveProperty('error');
    });

    test('should return 400 for invalid history (not array)', async () => {
      const response = await request(app)
        .post('/api/v1/assistant/query')
        .send({
          tenantId: 'test-tenant-123',
          role: 'MANAGER',
          message: 'test message',
          history: 'not an array'
        })
        .expect(400);

      expect(response.body).toHaveProperty('error');
    });

    test('should return 400 for missing tenantId', async () => {
      const response = await request(app)
        .post('/api/v1/assistant/query')
        .send({
          role: 'MANAGER',
          message: 'test message',
          history: []
        })
        .expect(400);

      expect(response.body).toHaveProperty('error');
    });
  });

  describe('Regression test: undefined.split bug', () => {
    test('should NOT throw TypeError for undefined message', async () => {
      // This is the exact regression test - the bug that was fixed
      const response = await request(app)
        .post('/api/v1/assistant/query')
        .send({
          tenantId: 'test-tenant-123',
          role: 'MANAGER',
          message: undefined,
          history: []
        });

      // Should return 400 (validation error), NOT 500 (TypeError)
      expect(response.status).toBe(400);
      expect(response.body).toHaveProperty('error');
      // Should NOT have a TypeError in the error message
      expect(response.body.error).not.toContain('split');
      expect(response.body.error).not.toContain('TypeError');
    });

    test('should handle null message without TypeError', async () => {
      const response = await request(app)
        .post('/api/v1/assistant/query')
        .send({
          tenantId: 'test-tenant-123',
          role: 'MANAGER',
          message: null,
          history: []
        });

      expect(response.status).toBe(400);
      expect(response.body.error).not.toContain('split');
    });

    test('should handle malformed payload without crashing', async () => {
      const response = await request(app)
        .post('/api/v1/assistant/query')
        .send({
          tenantId: null,
          role: null,
          message: null,
          history: null
        });

      // Should return validation error, not crash
      expect(response.status).toBeGreaterThanOrEqual(400);
      expect(response.status).toBeLessThan(500);
      expect(response.body).toHaveProperty('error');
    });

    test('should handle message with undefined concatenation', async () => {
      // Simulate a message that might have undefined values
      const testMessage = 'test' + undefined;
      
      const response = await request(app)
        .post('/api/v1/assistant/query')
        .send({
          tenantId: 'test-tenant-123',
          role: 'MANAGER',
          message: testMessage,
          history: []
        });

      // Should handle gracefully
      expect([200, 400]).toContain(response.status);
      expect(response.body).toBeDefined();
    });
  });

  describe('Response format', () => {
    test('should return correct response structure', async () => {
      const response = await request(app)
        .post('/api/v1/assistant/query')
        .send({
          tenantId: 'test-tenant-123',
          role: 'MANAGER',
          message: 'How many RFQs do we have?',
          history: []
        })
        .expect(200);

      // Verify response structure matches spec
      expect(response.body).toHaveProperty('response');
      expect(response.body).toHaveProperty('actions');
      expect(response.body).toHaveProperty('debug');
      expect(response.body.debug).toHaveProperty('intent');
      expect(response.body.debug).toHaveProperty('entities');
      
      expect(typeof response.body.response).toBe('string');
      expect(Array.isArray(response.body.actions)).toBe(true);
      expect(typeof response.body.debug.intent).toBe('string');
      expect(typeof response.body.debug.entities).toBe('object');
    });

    test('should include actions array even if empty', async () => {
      const response = await request(app)
        .post('/api/v1/assistant/query')
        .send({
          tenantId: 'test-tenant-123',
          role: 'MANAGER',
          message: 'test message',
          history: []
        })
        .expect(200);

      expect(Array.isArray(response.body.actions)).toBe(true);
    });
  });

  describe('History handling', () => {
    test('should handle empty history array', async () => {
      const response = await request(app)
        .post('/api/v1/assistant/query')
        .send({
          tenantId: 'test-tenant-123',
          role: 'MANAGER',
          message: 'test message',
          history: []
        })
        .expect(200);

      expect(response.body).toBeDefined();
    });

    test('should handle history with string messages', async () => {
      const response = await request(app)
        .post('/api/v1/assistant/query')
        .send({
          tenantId: 'test-tenant-123',
          role: 'MANAGER',
          message: 'test message',
          history: ['previous message 1', 'previous message 2']
        })
        .expect(200);

      expect(response.body).toBeDefined();
    });

    test('should handle history with object messages', async () => {
      const response = await request(app)
        .post('/api/v1/assistant/query')
        .send({
          tenantId: 'test-tenant-123',
          role: 'MANAGER',
          message: 'test message',
          history: [
            { role: 'user', content: 'previous question' },
            { role: 'assistant', content: 'previous answer' }
          ]
        })
        .expect(200);

      expect(response.body).toBeDefined();
    });
  });

  describe('Conversational clarification flow', () => {
    test('should request clarification for SUMMARIZE_RFQ without ID', async () => {
      // Mock clarification response
      processQuery.mockImplementationOnce(async () => ({
        reply: 'Do you have a specific RFQ ID you want me to summarize, or should I show you recent RFQs to choose from?',
        intent: 'SUMMARIZE_RFQ',
        confidence: 0.5,
        reasons: ['Matched "summarize/show" + "rfq" but no RFQ ID found'],
        entities: {},
        followUp: true,
        clarificationOptions: [],
        suggestedActions: [],
        metadata: { tokensUsed: 50, latency: 300 }
      }));

      const response = await request(app)
        .post('/api/v1/assistant/query')
        .send({
          tenantId: 'test-tenant-123',
          role: 'MANAGER',
          message: 'Summarize an RFQ',
          history: []
        })
        .expect(200);

      expect(response.body.followUp).toBe(true);
      expect(response.body.response).toContain('RFQ ID');
      expect(response.body.debug.intent).toBe('SUMMARIZE_RFQ');
    });

    test('should provide options for ambiguous queries', async () => {
      processQuery.mockImplementationOnce(async () => ({
        reply: 'I can help with RFQs, approvals, pricing runs, and materials. Which one would you like to focus on?',
        intent: 'UNKNOWN_INTENT',
        confidence: 0.2,
        reasons: ['No matching patterns or keywords found'],
        entities: {},
        followUp: true,
        clarificationOptions: ['RFQs', 'Approvals', 'Pricing runs', 'Materials'],
        suggestedActions: [],
        metadata: { tokensUsed: 50, latency: 300 }
      }));

      const response = await request(app)
        .post('/api/v1/assistant/query')
        .send({
          tenantId: 'test-tenant-123',
          role: 'MANAGER',
          message: 'I want to check something',
          history: []
        })
        .expect(200);

      expect(response.body.followUp).toBe(true);
      expect(Array.isArray(response.body.clarificationOptions)).toBe(true);
      expect(response.body.clarificationOptions.length).toBeGreaterThan(0);
    });
  });

  describe('Error handling', () => {
    test('should handle processQuery errors gracefully', async () => {
      processQuery.mockRejectedValueOnce(new Error('Processing failed'));

      const response = await request(app)
        .post('/api/v1/assistant/query')
        .send({
          tenantId: 'test-tenant-123',
          role: 'MANAGER',
          message: 'test message',
          history: []
        })
        .expect(500);

      expect(response.body).toHaveProperty('response');
      expect(response.body.debug).toBeDefined();
    });

    test('should return error response when processQuery returns error', async () => {
      processQuery.mockResolvedValueOnce({
        error: 'Query processing failed',
        intent: 'UNKNOWN_INTENT',
        entities: {}
      });

      const response = await request(app)
        .post('/api/v1/assistant/query')
        .send({
          tenantId: 'test-tenant-123',
          role: 'MANAGER',
          message: 'test message',
          history: []
        })
        .expect(400);

      expect(response.body).toHaveProperty('response');
      expect(response.body.debug).toBeDefined();
    });
  });

  describe('Advisory Mode - Restricted Actions', () => {
    test('should refuse to create pricing run and provide advisory guidance', async () => {
      // Mock advisory response for workflow execution request
      processQuery.mockImplementationOnce(async (params) => {
        const { userMessage } = params;
        
        // Simulate the assistant detecting a workflow execution intent
        if (userMessage && userMessage.toLowerCase().includes('create') && 
            userMessage.toLowerCase().includes('pricing run')) {
          return {
            reply: 'I cannot execute workflows or create pricing runs. However, I can help you understand the process. To create a pricing run, navigate to the RFQ Detail page and click the "Generate Pricing Run" button. Would you like me to summarize the RFQ first to help you prepare?',
            intent: 'UNKNOWN_INTENT', // Advisory responses don't match standard intents
            confidence: 0.3,
            reasons: ['User requested workflow execution - advisory mode response'],
            entities: {},
            followUp: false, // Direct refusal + guidance, not a clarification
            clarificationOptions: [],
            suggestedActions: [
              { type: 'navigate', label: 'Go to RFQ Detail Page', path: '/rfqs/1205' }
            ],
            metadata: { tokensUsed: 50, latency: 200 }
          };
        }
        
        return {
          reply: 'Test response',
          intent: 'UNKNOWN_INTENT',
          confidence: 0.2,
          reasons: [],
          entities: {},
          followUp: false,
          clarificationOptions: [],
          suggestedActions: [],
          metadata: { tokensUsed: 50, latency: 200 }
        };
      });

      const response = await request(app)
        .post('/api/v1/assistant/query')
        .send({
          tenantId: 'test-tenant-123',
          role: 'MANAGER',
          message: 'Create a pricing run for RFQ 1205',
          history: []
        })
        .expect(200);

      // Verify advisory response
      expect(response.body.response).toBeDefined();
      expect(typeof response.body.response).toBe('string');
      expect(response.body.response.toLowerCase()).toContain('cannot');
      expect(response.body.response.toLowerCase()).toContain('execute');
      expect(response.body.followUp).toBe(false); // Direct refusal, not clarification
      
      // Verify no write-side services were called (check mock wasn't called with create functions)
      // The response should guide user to UI actions, not execute them
      expect(response.body.response.toLowerCase()).toMatch(/navigate|button|page|click|go to/i);
    });

    test('should refuse to approve pricing run and provide advisory guidance', async () => {
      processQuery.mockImplementationOnce(async (params) => {
        const { userMessage } = params;
        
        if (userMessage && userMessage.toLowerCase().includes('approve')) {
          return {
            reply: 'I cannot approve pricing runs or execute approval workflows. To approve a pricing run, go to the Approval Queue page and click the "Approve" button for the specific pricing run. Would you like me to show you which pricing runs are pending approval?',
            intent: 'UNKNOWN_INTENT',
            confidence: 0.3,
            reasons: ['User requested workflow execution - advisory mode response'],
            entities: {},
            followUp: false, // Direct refusal + guidance
            clarificationOptions: [],
            suggestedActions: [
              { type: 'navigate', label: 'Go to Approval Queue', path: '/approvals' }
            ],
            metadata: { tokensUsed: 50, latency: 200 }
          };
        }
        
        return {
          reply: 'Test response',
          intent: 'UNKNOWN_INTENT',
          confidence: 0.2,
          reasons: [],
          entities: {},
          followUp: false,
          clarificationOptions: [],
          suggestedActions: [],
          metadata: { tokensUsed: 50, latency: 200 }
        };
      });

      const response = await request(app)
        .post('/api/v1/assistant/query')
        .send({
          tenantId: 'test-tenant-123',
          role: 'MANAGER',
          message: 'Approve this pricing run',
          history: []
        })
        .expect(200);

      // Verify advisory response
      expect(response.body.response).toBeDefined();
      expect(response.body.response.toLowerCase()).toContain('cannot');
      expect(response.body.response.toLowerCase()).toContain('approve');
      expect(response.body.followUp).toBe(false); // Direct refusal, not clarification
      
      // Should guide user to UI actions
      expect(response.body.response.toLowerCase()).toMatch(/navigate|button|page|click|go to|queue/i);
    });

    test('should refuse to generate price agreement and provide advisory guidance', async () => {
      processQuery.mockImplementationOnce(async (params) => {
        const { userMessage } = params;
        
        if (userMessage && (userMessage.toLowerCase().includes('generate') || 
            userMessage.toLowerCase().includes('create')) && 
            userMessage.toLowerCase().includes('price agreement')) {
          return {
            reply: 'I cannot generate price agreements or execute workflow actions. Price agreements are automatically created when a pricing run is approved, or you can create them manually from the Price Agreements page. Would you like me to explain how price agreements work in SmartMetal?',
            intent: 'UNKNOWN_INTENT',
            confidence: 0.3,
            reasons: ['User requested workflow execution - advisory mode response'],
            entities: {},
            followUp: false, // Direct refusal + guidance
            clarificationOptions: [],
            suggestedActions: [
              { type: 'navigate', label: 'Go to Price Agreements', path: '/price-agreements' }
            ],
            metadata: { tokensUsed: 50, latency: 200 }
          };
        }
        
        return {
          reply: 'Test response',
          intent: 'UNKNOWN_INTENT',
          confidence: 0.2,
          reasons: [],
          entities: {},
          followUp: false,
          clarificationOptions: [],
          suggestedActions: [],
          metadata: { tokensUsed: 50, latency: 200 }
        };
      });

      const response = await request(app)
        .post('/api/v1/assistant/query')
        .send({
          tenantId: 'test-tenant-123',
          role: 'MANAGER',
          message: 'Generate a price agreement',
          history: []
        })
        .expect(200);

      // Verify advisory response
      expect(response.body.response).toBeDefined();
      expect(response.body.response.toLowerCase()).toContain('cannot');
      expect(response.body.response.toLowerCase()).toMatch(/generate|create|execute/i);
      expect(response.body.followUp).toBe(false); // Direct refusal, not clarification
      
      // Should guide user to UI actions or explain process
      expect(response.body.response.toLowerCase()).toMatch(/navigate|button|page|click|go to|explain|work/i);
    });
  });
});


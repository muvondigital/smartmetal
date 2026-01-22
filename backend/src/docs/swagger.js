/**
 * Swagger/OpenAPI Documentation Setup
 *
 * MUVOS Platform – SmartMetal CPQ runs on Muvon Unified Commercial Operating System
 * Provides API documentation via Swagger UI
 * Developed by Muvon Digital (Muvon Energy)
 */

const swaggerJsdoc = require('swagger-jsdoc');
const { config } = require('../config/env');
const BRANDING = require('../config/branding');

const options = {
  definition: {
    openapi: '3.0.0',
    info: {
      title: BRANDING.API_TITLE,
      version: '1.0.0',
      description: BRANDING.API_DESCRIPTION,
      contact: {
        name: 'Muvon Digital',
        email: 'support@muvondigital.com',
      },
      license: {
        name: 'Proprietary',
        url: 'https://muvondigital.com',
      },
    },
    servers: [
      {
        url: `http://localhost:${config.server.port}/api`,
        description: 'Development server',
      },
      {
        url: 'https://api.smartmetal.com/api',
        description: 'Production server',
      },
    ],
    components: {
      securitySchemes: {
        bearerAuth: {
          type: 'http',
          scheme: 'bearer',
          bearerFormat: 'JWT',
        },
      },
      schemas: {
        Error: {
          type: 'object',
          properties: {
            error: {
              type: 'object',
              properties: {
                code: {
                  type: 'string',
                  description: 'Error code (e.g., VALIDATION_ERROR, NOT_FOUND)',
                  example: 'VALIDATION_ERROR',
                },
                message: {
                  type: 'string',
                  description: 'Human-readable error message',
                  example: 'Invalid request payload',
                },
                details: {
                  type: 'object',
                  description: 'Additional error details (only in development)',
                },
              },
              required: ['code', 'message'],
            },
          },
        },
        RFQ: {
          type: 'object',
          properties: {
            id: { type: 'string', format: 'uuid' },
            customer_name: { type: 'string' },
            status: { type: 'string', enum: ['draft', 'extracting', 'reviewing', 'pricing', 'quoted', 'won', 'lost', 'extraction_failed'] },
            created_at: { type: 'string', format: 'date-time' },
            updated_at: { type: 'string', format: 'date-time' },
          },
        },
        PricingRun: {
          type: 'object',
          properties: {
            id: { type: 'string', format: 'uuid' },
            rfq_id: { type: 'string', format: 'uuid' },
            total_price: { type: 'number' },
            approval_status: { type: 'string', enum: ['pending', 'approved', 'rejected'] },
            created_at: { type: 'string', format: 'date-time' },
          },
        },
      },
      responses: {
        NotFound: {
          description: 'Resource not found',
          content: {
            'application/json': {
              schema: {
                $ref: '#/components/schemas/Error',
              },
              example: {
                error: {
                  code: 'NOT_FOUND',
                  message: 'Resource not found',
                },
              },
            },
          },
        },
        ValidationError: {
          description: 'Validation error',
          content: {
            'application/json': {
              schema: {
                $ref: '#/components/schemas/Error',
              },
              example: {
                error: {
                  code: 'VALIDATION_ERROR',
                  message: 'Invalid request payload',
                },
              },
            },
          },
        },
        InternalError: {
          description: 'Internal server error',
          content: {
            'application/json': {
              schema: {
                $ref: '#/components/schemas/Error',
              },
              example: {
                error: {
                  code: 'INTERNAL_ERROR',
                  message: 'Internal server error',
                },
              },
            },
          },
        },
      },
    },
    tags: [
      { name: 'RFQs', description: 'RFQ management endpoints' },
      { name: 'Pricing', description: 'Pricing run endpoints' },
      { name: 'Approvals', description: 'Approval workflow endpoints' },
      { name: 'Materials', description: 'Material catalog endpoints' },
      { name: 'AI', description: 'AI-powered services (extraction, enrichment)' },
      { name: 'Price Agreements', description: 'Customer price agreement management' },
      { name: 'LME', description: 'LME price tracking endpoints' },
      { name: 'Regulatory', description: 'Regulatory compliance endpoints' },
      { name: 'Health', description: 'Health check and system status' },
    ],
  },
  apis: [
    './src/routes/*.js', // Path to the API files
  ],
};

const swaggerSpec = swaggerJsdoc(options);

module.exports = swaggerSpec;

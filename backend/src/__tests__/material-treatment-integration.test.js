/**
 * Integration Test: Material Treatment Doctrine v1 in Commercial Request (RFQ) Flow
 *
 * Tests the full integration of Material Treatment Doctrine into RFQ item creation:
 * - CANONICAL items (standard catalog items)
 * - PARAMETERIZED items (catalog items with parameters like length, cut size)
 * - PROJECT_SPECIFIC items (custom fabrications, assemblies)
 *
 * This test verifies that:
 * 1. Doctrine logic is correctly applied during RFQ item creation
 * 2. treatment_type and item_parameters are persisted to database
 * 3. Both addRfqItem() and addRfqItemsBatch() apply doctrine correctly
 */

const { connectDb } = require('../db/supabaseClient');
const rfqService = require('../services/rfqService');
const { TREATMENT_TYPES } = require('../services/materialTreatmentDoctrine');

// Note: This test requires migration 069 to be run first
// Run: node backend/src/db/runMigration.js 069

describe('Material Treatment Doctrine v1 - Integration Test', () => {
  let db;
  let tenantId;
  let rfqId;

  beforeAll(async () => {
    db = await connectDb();

    // Create test tenant
    const tenantResult = await db.query(
      `INSERT INTO tenants (name, tenant_code, country, currency)
       VALUES ('Test Tenant - Doctrine', 'DOCTRINE-TEST', 'US', 'USD')
       RETURNING id`
    );
    tenantId = tenantResult.rows[0].id;

    // Create test client
    const clientResult = await db.query(
      `INSERT INTO clients (name, contact_email, tenant_id)
       VALUES ('Test Client', 'test@example.com', $1)
       RETURNING id`,
      [tenantId]
    );
    const clientId = clientResult.rows[0].id;

    // Create test project
    const projectResult = await db.query(
      `INSERT INTO projects (name, client_id, tenant_id)
       VALUES ('Test Project', $1, $2)
       RETURNING id`,
      [clientId, tenantId]
    );
    const projectId = projectResult.rows[0].id;

    // Create test RFQ
    const rfqResult = await db.query(
      `INSERT INTO rfqs (project_id, rfq_name, notes, status, tenant_id, rfq_code, created_at)
       VALUES ($1, 'Test RFQ - Doctrine', 'Testing Material Treatment Doctrine v1', 'draft', $2, 'DOCTRINE-TEST-001', NOW())
       RETURNING id`,
      [projectId, tenantId]
    );
    rfqId = rfqResult.rows[0].id;
  });

  afterAll(async () => {
    // Cleanup test data
    if (tenantId) {
      await db.query('DELETE FROM tenants WHERE id = $1', [tenantId]);
    }
  });

  describe('addRfqItem() - Single item creation', () => {
    it('should classify standard pipe as CANONICAL', async () => {
      const item = await rfqService.addRfqItem(
        rfqId,
        {
          description: 'PIPE API5L-X52 24" SCH40',
          quantity: 10,
          unit: 'PCS',
        },
        tenantId
      );

      expect(item).toBeDefined();
      expect(item.material_treatment_type).toBe(TREATMENT_TYPES.CANONICAL);
      expect(item.item_parameters).toBeNull(); // No parameters extracted
      expect(item.description).toBe('PIPE API5L-X52 24" SCH40');
    });

    it('should classify pipe with CUT TO as PARAMETERIZED and extract parameters', async () => {
      const item = await rfqService.addRfqItem(
        rfqId,
        {
          description: 'PIPE API5L-X52 24" SCH40 CUT TO 3.7M',
          quantity: 15,
          unit: 'PCS',
        },
        tenantId
      );

      expect(item).toBeDefined();
      expect(item.material_treatment_type).toBe(TREATMENT_TYPES.PARAMETERIZED);
      expect(item.item_parameters).toBeDefined();

      const params = JSON.parse(item.item_parameters);
      expect(params.cut_to_m).toBe(3.7);
    });

    it('should classify REDUCER with CUSTOM FAB as PROJECT_SPECIFIC', async () => {
      const item = await rfqService.addRfqItem(
        rfqId,
        {
          description: 'REDUCER 24" -> 18" CUSTOM FAB',
          quantity: 5,
          unit: 'PCS',
        },
        tenantId
      );

      expect(item).toBeDefined();
      expect(item.material_treatment_type).toBe(TREATMENT_TYPES.PROJECT_SPECIFIC);
      expect(item.item_parameters).toBeDefined();

      const params = JSON.parse(item.item_parameters);
      expect(params.transition).toEqual({ from_mm: 24, to_mm: 18 });
    });

    it('should classify plain REDUCER as PARAMETERIZED (not PROJECT_SPECIFIC)', async () => {
      const item = await rfqService.addRfqItem(
        rfqId,
        {
          description: 'REDUCER 24 -> 18',
          quantity: 3,
          unit: 'PCS',
        },
        tenantId
      );

      expect(item).toBeDefined();
      expect(item.material_treatment_type).toBe(TREATMENT_TYPES.PARAMETERIZED);
      expect(item.item_parameters).toBeDefined();

      const params = JSON.parse(item.item_parameters);
      expect(params.transition).toEqual({ from_mm: 24, to_mm: 18 });
    });

    it('should classify plate with cut size as PARAMETERIZED', async () => {
      const item = await rfqService.addRfqItem(
        rfqId,
        {
          description: 'PLATE 2.4 x 6.0',
          quantity: 20,
          unit: 'PCS',
        },
        tenantId
      );

      expect(item).toBeDefined();
      expect(item.material_treatment_type).toBe(TREATMENT_TYPES.PARAMETERIZED);
      expect(item.item_parameters).toBeDefined();

      const params = JSON.parse(item.item_parameters);
      expect(params.plate_cut_size_m).toEqual({ width_m: 2.4, length_m: 6.0 });
    });

    it('should accept explicit material_treatment_type and item_parameters from payload', async () => {
      const customParams = { custom_field: 'test_value' };

      const item = await rfqService.addRfqItem(
        rfqId,
        {
          description: 'CUSTOM ITEM',
          quantity: 1,
          unit: 'PCS',
          material_treatment_type: TREATMENT_TYPES.PROJECT_SPECIFIC,
          item_parameters: customParams,
        },
        tenantId
      );

      expect(item).toBeDefined();
      expect(item.material_treatment_type).toBe(TREATMENT_TYPES.PROJECT_SPECIFIC);
      expect(item.item_parameters).toBeDefined();

      const params = JSON.parse(item.item_parameters);
      expect(params.custom_field).toBe('test_value');
    });
  });

  describe('addRfqItemsBatch() - Batch item creation', () => {
    it('should apply doctrine to all items in batch', async () => {
      const items = await rfqService.addRfqItemsBatch(
        rfqId,
        [
          {
            description: 'PIPE API5L-X52 24" SCH40',
            quantity: 10,
            unit: 'PCS',
          },
          {
            description: 'PIPE API5L-X52 24" SCH40 CUT TO 3.7M',
            quantity: 15,
            unit: 'PCS',
          },
          {
            description: 'REDUCER 24" -> 18" CUSTOM FAB',
            quantity: 5,
            unit: 'PCS',
          },
        ],
        tenantId
      );

      expect(items).toHaveLength(3);

      // Item 1: CANONICAL
      expect(items[0].description).toBe('PIPE API5L-X52 24" SCH40');
      expect(items[0].material_treatment_type).toBe(TREATMENT_TYPES.CANONICAL);
      expect(items[0].item_parameters).toBeNull();

      // Item 2: PARAMETERIZED
      expect(items[1].description).toBe('PIPE API5L-X52 24" SCH40 CUT TO 3.7M');
      expect(items[1].material_treatment_type).toBe(TREATMENT_TYPES.PARAMETERIZED);
      const params1 = JSON.parse(items[1].item_parameters);
      expect(params1.cut_to_m).toBe(3.7);

      // Item 3: PROJECT_SPECIFIC
      expect(items[2].description).toBe('REDUCER 24" -> 18" CUSTOM FAB');
      expect(items[2].material_treatment_type).toBe(TREATMENT_TYPES.PROJECT_SPECIFIC);
      const params2 = JSON.parse(items[2].item_parameters);
      expect(params2.transition).toEqual({ from_mm: 24, to_mm: 18 });
    });
  });

  describe('Database persistence verification', () => {
    it('should persist doctrine fields to rfq_items table', async () => {
      // Create item via service
      const item = await rfqService.addRfqItem(
        rfqId,
        {
          description: 'PIPE CUT TO 5.5M',
          quantity: 8,
          unit: 'PCS',
        },
        tenantId
      );

      // Query database directly to verify persistence
      const result = await db.query(
        `SELECT material_treatment_type, item_parameters FROM rfq_items WHERE id = $1`,
        [item.id]
      );

      expect(result.rows).toHaveLength(1);
      const dbRow = result.rows[0];

      expect(dbRow.material_treatment_type).toBe(TREATMENT_TYPES.PARAMETERIZED);
      expect(dbRow.item_parameters).toBeDefined();
      expect(dbRow.item_parameters.cut_to_m).toBe(5.5);
    });
  });

  describe('Backward compatibility', () => {
    it('should handle items created without doctrine (defaults to CANONICAL)', async () => {
      // Simulate legacy item creation (direct SQL insert without doctrine fields)
      const legacyResult = await db.query(
        `INSERT INTO rfq_items (rfq_id, description, quantity, unit, tenant_id)
         VALUES ($1, 'LEGACY ITEM', 1, 'PCS', $2)
         RETURNING *`,
        [rfqId, tenantId]
      );

      const legacyItem = legacyResult.rows[0];

      // Verify default values
      expect(legacyItem.material_treatment_type).toBe(TREATMENT_TYPES.CANONICAL); // Default from migration
      expect(legacyItem.item_parameters).toBeNull(); // Nullable field
    });
  });
});

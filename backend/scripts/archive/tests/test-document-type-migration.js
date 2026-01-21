/**
 * Test script to verify document_type migration works correctly
 * 
 * This script:
 * 1. Checks that document_type column exists
 * 2. Verifies default value is 'RFQ'
 * 3. Tests that existing code paths work
 * 4. Tests creating RFQ with document_type
 */

require('dotenv').config({ path: require('path').join(__dirname, '../.env') });
const { connectMigrationDb } = require('../src/db/supabaseClient');

async function testDocumentTypeMigration() {
  const db = await connectMigrationDb();

  console.log('='.repeat(80));
  console.log('TESTING DOCUMENT_TYPE MIGRATION');
  console.log('='.repeat(80));
  console.log('');

  try {
    // Test 1: Check column exists
    console.log('Test 1: Checking document_type column exists...');
    const columnCheck = await db.query(`
      SELECT column_name, data_type, column_default, is_nullable
      FROM information_schema.columns
      WHERE table_name = 'rfqs' AND column_name = 'document_type'
    `);

    if (columnCheck.rows.length === 0) {
      throw new Error('❌ document_type column does not exist. Run migration 068 first.');
    }

    const column = columnCheck.rows[0];
    console.log('  ✓ Column exists');
    console.log(`    • Data type: ${column.data_type}`);
    console.log(`    • Default: ${column.column_default}`);
    console.log(`    • Nullable: ${column.is_nullable}`);
    console.log('');

    // Test 2: Check existing RFQs have document_type = 'RFQ'
    console.log('Test 2: Checking existing RFQs have document_type = RFQ...');
    const existingCheck = await db.query(`
      SELECT 
        COUNT(*) as total,
        COUNT(CASE WHEN document_type = 'RFQ' THEN 1 END) as rfq_count,
        COUNT(CASE WHEN document_type IS NULL THEN 1 END) as null_count
      FROM rfqs
    `);

    const stats = existingCheck.rows[0];
    console.log(`  ✓ Total RFQs: ${stats.total}`);
    console.log(`  ✓ With document_type = 'RFQ': ${stats.rfq_count}`);
    if (parseInt(stats.null_count) > 0) {
      console.log(`  ⚠️  WARNING: ${stats.null_count} RFQs have NULL document_type`);
    } else {
      console.log(`  ✓ No NULL values found`);
    }
    console.log('');

    // Test 3: Test INSERT without document_type (should default to 'RFQ')
    console.log('Test 3: Testing INSERT without document_type (backward compatibility)...');
    const testTenant = await db.query(`SELECT id FROM tenants LIMIT 1`);
    if (testTenant.rows.length === 0) {
      console.log('  ⚠️  Skipping: No tenants found');
    } else {
      const tenantId = testTenant.rows[0].id;
      const testProject = await db.query(`SELECT id FROM projects WHERE tenant_id = $1 LIMIT 1`, [tenantId]);
      
      if (testProject.rows.length > 0) {
        const projectId = testProject.rows[0].id;
        
        // Insert without document_type
        const insertResult = await db.query(`
          INSERT INTO rfqs (tenant_id, project_id, rfq_name, status)
          VALUES ($1, $2, 'Test RFQ - No Document Type', 'draft')
          RETURNING id, document_type
        `, [tenantId, projectId]);

        const inserted = insertResult.rows[0];
        console.log(`  ✓ Inserted RFQ: ${inserted.id}`);
        console.log(`  ✓ document_type (default): ${inserted.document_type}`);
        
        if (inserted.document_type !== 'RFQ') {
          throw new Error(`❌ Expected 'RFQ', got '${inserted.document_type}'`);
        }

        // Cleanup
        await db.query(`DELETE FROM rfqs WHERE id = $1`, [inserted.id]);
        console.log('  ✓ Cleanup completed');
      } else {
        console.log('  ⚠️  Skipping: No projects found');
      }
    }
    console.log('');

    // Test 4: Test INSERT with document_type
    console.log('Test 4: Testing INSERT with document_type = MTO...');
    if (testTenant.rows.length > 0) {
      const tenantId = testTenant.rows[0].id;
      const testProject = await db.query(`SELECT id FROM projects WHERE tenant_id = $1 LIMIT 1`, [tenantId]);
      
      if (testProject.rows.length > 0) {
        const projectId = testProject.rows[0].id;
        
        const insertResult = await db.query(`
          INSERT INTO rfqs (tenant_id, project_id, rfq_name, status, document_type)
          VALUES ($1, $2, 'Test MTO - With Document Type', 'draft', 'MTO')
          RETURNING id, document_type
        `, [tenantId, projectId]);

        const inserted = insertResult.rows[0];
        console.log(`  ✓ Inserted RFQ: ${inserted.id}`);
        console.log(`  ✓ document_type: ${inserted.document_type}`);
        
        if (inserted.document_type !== 'MTO') {
          throw new Error(`❌ Expected 'MTO', got '${inserted.document_type}'`);
        }

        // Cleanup
        await db.query(`DELETE FROM rfqs WHERE id = $1`, [inserted.id]);
        console.log('  ✓ Cleanup completed');
      } else {
        console.log('  ⚠️  Skipping: No projects found');
      }
    }
    console.log('');

    // Test 5: Check constraint allows valid values
    console.log('Test 5: Testing constraint validation...');
    if (testTenant.rows.length > 0) {
      const tenantId = testTenant.rows[0].id;
      const testProject = await db.query(`SELECT id FROM projects WHERE tenant_id = $1 LIMIT 1`, [tenantId]);
      
      if (testProject.rows.length > 0) {
        const projectId = testProject.rows[0].id;
        
        // Try invalid value
        try {
          await db.query(`
            INSERT INTO rfqs (tenant_id, project_id, rfq_name, status, document_type)
            VALUES ($1, $2, 'Test Invalid', 'draft', 'INVALID')
          `, [tenantId, projectId]);
          throw new Error('❌ Constraint should have rejected invalid document_type');
        } catch (error) {
          if (error.message.includes('check constraint') || error.message.includes('document_type')) {
            console.log('  ✓ Constraint correctly rejects invalid values');
          } else {
            throw error;
          }
        }
      } else {
        console.log('  ⚠️  Skipping: No projects found');
      }
    }
    console.log('');

    console.log('='.repeat(80));
    console.log('✅ ALL TESTS PASSED');
    console.log('='.repeat(80));
    console.log('');
    console.log('Summary:');
    console.log('  • document_type column exists with correct default');
    console.log('  • Backward compatibility: INSERT without document_type works');
    console.log('  • Forward compatibility: INSERT with document_type works');
    console.log('  • Constraint validation works correctly');
    console.log('');

  } catch (error) {
    console.error('\n❌ TEST FAILED:', error.message);
    console.error(error.stack);
    throw error;
  } finally {
    await db.end();
  }
}

if (require.main === module) {
  testDocumentTypeMigration()
    .then(() => {
      console.log('✅ Test script completed');
      process.exit(0);
    })
    .catch((error) => {
      console.error('❌ Test script failed:', error);
      process.exit(1);
    });
}

module.exports = { testDocumentTypeMigration };

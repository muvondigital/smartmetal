/**
 * Test Material Treatment Doctrine v1 - Create Test RFQ Items
 * 
 * Creates a test RFQ with various item types to validate doctrine classification:
 * - CANONICAL: Standard catalog items
 * - PARAMETERIZED: Items with length/cut size parameters
 * - PROJECT_SPECIFIC: Custom fabrications
 * 
 * This script uses the rfqService which automatically applies doctrine classification.
 */

require('dotenv').config();
const { connectDb } = require('../src/db/supabaseClient');
const rfqService = require('../src/services/rfqService');

async function createTestRfq() {
  console.log('='.repeat(70));
  console.log('MATERIAL TREATMENT DOCTRINE V1 - TEST RFQ CREATION');
  console.log('='.repeat(70));
  console.log('');

  const db = await connectDb();

  try {
    // Get first tenant
    const tenantResult = await db.query(`
      SELECT id, code FROM tenants 
      WHERE code IS NOT NULL 
      ORDER BY created_at ASC 
      LIMIT 1
    `);

    if (tenantResult.rows.length === 0) {
      console.error('❌ No tenants found. Please seed tenants first.');
      process.exit(1);
    }

    const tenant = tenantResult.rows[0];
    const tenantId = tenant.id;
    console.log(`✓ Using tenant: ${tenant.code} (${tenantId})`);
    console.log('');

    // Create a test RFQ using rfqService (handles RLS properly)
    console.log('📝 Creating test RFQ...');
    const rfq = await rfqService.createRfqFromPayload({
      customer_name: 'Test Customer',
      title: 'Test RFQ - Material Treatment Doctrine Validation',
      description: 'Test RFQ for validating Material Treatment Doctrine v1 classification',
      project_type: 'standard',
    }, tenantId, {
      originalFilename: 'test-doctrine-validation.pdf',
    });

    const rfqId = rfq.id;
    console.log(`✓ Created RFQ: ${rfqId} (${rfq.rfq_code || rfq.rfq_name})`);
    console.log('');

    // Test items covering all doctrine types
    const testItems = [
      // CANONICAL items (standard catalog items)
      {
        description: 'ASTM A106 Gr.B Pipe, NPS 6, SCH 40',
        quantity: 100,
        unit: 'M',
        line_number: 1,
        expected_type: 'CANONICAL'
      },
      {
        description: 'ASTM A105 Flange, NPS 6, Class 150, RF',
        quantity: 20,
        unit: 'EA',
        line_number: 2,
        expected_type: 'CANONICAL'
      },
      {
        description: 'ASTM A234 WPB Elbow, 90 deg, NPS 6, SCH 40',
        quantity: 15,
        unit: 'EA',
        line_number: 3,
        expected_type: 'CANONICAL'
      },
      {
        description: 'REDUCER 24" x 18" ASTM A234 WPB',
        quantity: 4,
        unit: 'EA',
        line_number: 4,
        expected_type: 'CANONICAL'
      },

      // PARAMETERIZED items (with length/cut size)
      {
        description: 'ASTM A106 Gr.B Pipe, NPS 6, SCH 40, CUT TO 3.7M',
        quantity: 50,
        unit: 'M',
        line_number: 5,
        expected_type: 'PARAMETERIZED'
      },
      {
        description: 'ASTM A106 Gr.B Pipe, NPS 4, SCH 40, LENGTH 6.0M',
        quantity: 30,
        unit: 'M',
        line_number: 6,
        expected_type: 'PARAMETERIZED'
      },
      {
        description: 'PLATE ASTM A36, 2.4 x 6.0 meters, THK 25mm',
        quantity: 10,
        unit: 'EA',
        line_number: 7,
        expected_type: 'PARAMETERIZED'
      },
      {
        description: 'REDUCER 24" -> 18" ASTM A234 WPB',
        quantity: 2,
        unit: 'EA',
        line_number: 8,
        expected_type: 'PARAMETERIZED'
      },
      {
        description: 'PIPE API5L-X52 24" SCH40 LONG LENGTH 12.0M',
        quantity: 20,
        unit: 'M',
        line_number: 9,
        expected_type: 'PARAMETERIZED'
      },

      // PROJECT_SPECIFIC items (fabrications)
      {
        description: 'REDUCER 24" -> 18" CUSTOM FABRICATION ASTM A234 WPB',
        quantity: 1,
        unit: 'EA',
        line_number: 10,
        expected_type: 'PROJECT_SPECIFIC'
      },
      {
        description: 'SPOOL ASSEMBLY NPS 6, SCH 40, FABRICATED',
        quantity: 5,
        unit: 'EA',
        line_number: 11,
        expected_type: 'PROJECT_SPECIFIC'
      },
      {
        description: 'TRANSITION CONE 1828.8 -> 1371.6 x 38mm FABRICATION',
        quantity: 2,
        unit: 'EA',
        line_number: 12,
        expected_type: 'PROJECT_SPECIFIC'
      },
      {
        description: 'SKID MOUNTED ASSEMBLY WITH WELDED FITTINGS',
        quantity: 1,
        unit: 'EA',
        line_number: 13,
        expected_type: 'PROJECT_SPECIFIC'
      },
      {
        description: 'CUSTOM WELDED ELBOW 90 DEG NPS 8 SCH 40',
        quantity: 3,
        unit: 'EA',
        line_number: 14,
        expected_type: 'PROJECT_SPECIFIC'
      },
    ];

    console.log('📦 Creating test items...');
    console.log('');

    const createdItems = [];
    for (const item of testItems) {
      try {
        const created = await rfqService.addRfqItem(rfqId, {
          description: item.description,
          quantity: item.quantity,
          unit: item.unit,
          line_number: item.line_number,
        }, tenantId);

        createdItems.push({
          ...item,
          id: created.id,
          actual_type: created.material_treatment_type,
          parameters: created.item_parameters,
        });

        const match = created.material_treatment_type === item.expected_type ? '✓' : '✗';
        console.log(`  ${match} [${item.line_number}] ${item.expected_type} → ${created.material_treatment_type}`);
        if (created.item_parameters) {
          console.log(`      Parameters: ${JSON.stringify(created.item_parameters)}`);
        }
      } catch (error) {
        console.error(`  ✗ Error creating item ${item.line_number}: ${error.message}`);
      }
    }

    console.log('');
    console.log(`✓ Created ${createdItems.length} test items`);
    console.log('');

    // Verify classification accuracy
    const correct = createdItems.filter(item => item.actual_type === item.expected_type).length;
    const accuracy = ((correct / createdItems.length) * 100).toFixed(1);
    console.log(`📊 Classification Accuracy: ${correct}/${createdItems.length} (${accuracy}%)`);
    console.log('');

    // Show misclassifications
    const misclassified = createdItems.filter(item => item.actual_type !== item.expected_type);
    if (misclassified.length > 0) {
      console.log('⚠️  Misclassifications:');
      misclassified.forEach(item => {
        console.log(`  Line ${item.line_number}: Expected ${item.expected_type}, got ${item.actual_type}`);
        console.log(`    Description: ${item.description}`);
      });
      console.log('');
    }

    console.log('='.repeat(70));
    console.log('✅ Test RFQ created successfully');
    console.log(`   RFQ ID: ${rfqId}`);
    console.log(`   Items: ${createdItems.length}`);
    console.log('='.repeat(70));
    console.log('');
    console.log('Next step: Run validation script to see distribution analysis');
    console.log('  node scripts/validateMaterialTreatmentDoctrine.js');
    console.log('');

  } catch (error) {
    console.error('❌ Error:', error.message);
    if (error.stack) {
      console.error(error.stack);
    }
    process.exit(1);
  } finally {
    await db.end();
  }
}

// Run if called directly
if (require.main === module) {
  createTestRfq().catch(error => {
    console.error('Fatal error:', error);
    process.exit(1);
  });
}

module.exports = { createTestRfq };









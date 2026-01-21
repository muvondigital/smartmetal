#!/usr/bin/env node

/**
 * Check recent RFQ parsing attempts and diagnose issues
 */

require('dotenv').config();
const { getDb } = require('../src/db/supabaseClient');

async function checkRfqParsing() {
  const db = await getDb();

  console.log('='.repeat(60));
  console.log('RFQ Parsing Diagnostics');
  console.log('='.repeat(60));
  console.log('');

  try {
    // Check most recent RFQs
    console.log('1. Recent RFQs:');
    console.log('-'.repeat(60));

    const rfqResult = await db.query(`
      SELECT id, title, description, status, created_at, project_type
      FROM rfqs
      ORDER BY created_at DESC
      LIMIT 5
    `);

    const rfqs = rfqResult.rows;

    if (rfqs.length === 0) {
      console.log('No RFQs found.');
    } else {
      rfqs.forEach((rfq, idx) => {
        console.log(`\n${idx + 1}. ${rfq.title || 'No title'}`);
        console.log(`   ID: ${rfq.id}`);
        console.log(`   Status: ${rfq.status}`);
        console.log(`   Type: ${rfq.project_type || 'N/A'}`);
        console.log(`   Created: ${new Date(rfq.created_at).toLocaleString()}`);
      });
    }

    // Check the most recent RFQ in detail
    if (rfqs.length > 0) {
      const latestRfq = rfqs[0];
      console.log('\n\n2. Latest RFQ Line Items:');
      console.log('-'.repeat(60));

      const itemsResult = await db.query(`
        SELECT *
        FROM rfq_items
        WHERE rfq_id = $1
        ORDER BY line_number ASC
      `, [latestRfq.id]);

      const lineItems = itemsResult.rows;

      if (lineItems.length === 0) {
        console.log(`⚠️  WARNING: RFQ "${latestRfq.title}" has NO line items!`);
        console.log('This indicates the AI parsing may have failed or produced empty results.');
      } else {
        console.log(`Found ${lineItems.length} line items:`);
        lineItems.forEach((item, idx) => {
          console.log(`\n  ${idx + 1}. Line ${item.line_number}: ${item.description || 'No description'}`);
          console.log(`     Size: ${item.size_display || 'N/A'}`);
          console.log(`     Quantity: ${item.quantity || 'N/A'} ${item.unit || ''}`);
          console.log(`     Material Code: ${item.material_code || 'N/A'}`);
        });
      }

      // Check for document extractions
      console.log('\n\n3. Document Extractions:');
      console.log('-'.repeat(60));

      const extractResult = await db.query(`
        SELECT *
        FROM document_extractions
        ORDER BY created_at DESC
        LIMIT 3
      `);

      const extractions = extractResult.rows;

      if (extractions.length === 0) {
        console.log('No document extractions found.');
      } else {
        extractions.forEach((ext, idx) => {
          console.log(`\n${idx + 1}. Extraction ID: ${ext.id}`);
          console.log(`   Document Type: ${ext.document_type || 'Unknown'}`);
          console.log(`   RFQ ID: ${ext.rfq_id || 'Not linked'}`);
          console.log(`   Status: ${ext.extraction_status || 'Unknown'}`);
          console.log(`   Pages: ${ext.pages_detected || 0}`);
          console.log(`   Tables: ${ext.tables_detected || 0}`);
          console.log(`   Items Extracted: ${ext.items_extracted || 0}`);
          console.log(`   Created: ${new Date(ext.created_at).toLocaleString()}`);

          if (ext.error_message) {
            console.log(`   ❌ Error: ${ext.error_message}`);
          }

          if (ext.metadata) {
            const meta = typeof ext.metadata === 'string' ? JSON.parse(ext.metadata) : ext.metadata;
            if (meta.warnings && meta.warnings.length > 0) {
              console.log(`   ⚠️  Warnings: ${meta.warnings.join(', ')}`);
            }
          }
        });
      }

      // Check MTO extractions
      console.log('\n\n4. MTO Extractions:');
      console.log('-'.repeat(60));

      const mtoResult = await db.query(`
        SELECT *
        FROM mto_extractions
        ORDER BY created_at DESC
        LIMIT 3
      `);

      const mtos = mtoResult.rows;

      if (mtos.length === 0) {
        console.log('No MTO extractions found.');
      } else {
        mtos.forEach((mto, idx) => {
          console.log(`\n${idx + 1}. MTO Extraction ID: ${mto.id}`);
          console.log(`   RFQ ID: ${mto.rfq_id || 'Not linked'}`);
          console.log(`   Status: ${mto.status || 'Unknown'}`);
          console.log(`   Items Extracted: ${mto.items_extracted || 0}`);
          console.log(`   Created: ${new Date(mto.created_at).toLocaleString()}`);

          if (mto.error_message) {
            console.log(`   ❌ Error: ${mto.error_message}`);
          }
        });
      }
    }

    console.log('\n' + '='.repeat(60));
    console.log('Diagnosis Complete');
    console.log('='.repeat(60));

  } catch (error) {
    console.error('Fatal error during diagnostics:', error);
    throw error;
  }
}

checkRfqParsing()
  .then(() => {
    console.log('\nDiagnostics completed successfully.');
    process.exit(0);
  })
  .catch((error) => {
    console.error('\nDiagnostics failed:', error);
    process.exit(1);
  });

/**
 * Test script for Phase 0.5 MTO Extraction
 * Tests the enhanced MTO extraction API endpoint
 * 
 * Usage:
 *   node scripts/test_phase_0_5_extraction.js [path-to-pdf-file]
 */

const fs = require('fs');
const path = require('path');

const API_BASE = process.env.API_BASE || 'http://localhost:4000/api';
const SAMPLE_PDF = path.join(__dirname, '../sample.pdf');

async function testMtoExtraction(pdfPath = null) {
  console.log('');
  console.log('='.repeat(70));
  console.log('PHASE 0.5 MTO EXTRACTION TEST');
  console.log('Testing Enhanced MTO Extraction API Endpoint');
  console.log('='.repeat(70));
  console.log('');

  // Check if backend is running
  try {
    const fetch = (await import('node-fetch')).default;
    const healthCheck = await fetch(`${API_BASE.replace('/api', '')}/health`);
    if (!healthCheck.ok) throw new Error('Health check failed');
    console.log('✅ Backend server is running');
  } catch (error) {
    console.log('❌ Backend server is NOT running');
    console.log('   Please start the backend: cd backend && npm run dev');
    process.exit(1);
  }

  // Determine PDF file to use
  const testPdfPath = pdfPath || SAMPLE_PDF;
  
  if (!fs.existsSync(testPdfPath)) {
    console.log(`❌ PDF file not found: ${testPdfPath}`);
    console.log('');
    console.log('Usage:');
    console.log(`  node scripts/test_phase_0_5_extraction.js [path-to-pdf]`);
    console.log('');
    console.log('Or place a PDF file at: backend/sample.pdf');
    process.exit(1);
  }

  console.log(`📄 Using PDF file: ${testPdfPath}`);
  console.log('');

  // Test MTO extraction
  console.log('Testing MTO Extraction API...');
  console.log('-'.repeat(70));

  try {
    const fetch = (await import('node-fetch')).default;
    const FormData = (await import('form-data')).default;

    const formData = new FormData();
    const fileStream = fs.createReadStream(testPdfPath);
    formData.append('file', fileStream, path.basename(testPdfPath));
    formData.append('userId', 'test-user-phase-0.5');
    formData.append('enrichItems', 'true');
    formData.append('matchMaterials', 'true');

    console.log('📤 Uploading document and extracting MTO structure...');
    console.log(`   Endpoint: POST ${API_BASE}/ai/extract-rfq`);
    console.log('');

    const startTime = Date.now();
    const response = await fetch(`${API_BASE}/ai/extract-rfq`, {
      method: 'POST',
      body: formData,
    });

    const duration = Date.now() - startTime;
    const result = await response.json();

    if (!response.ok) {
      console.log(`❌ API request failed with status ${response.status}`);
      console.log('');
      console.log('   Full Error Response:');
      console.log(JSON.stringify(result, null, 2));
      console.log('');
      if (result.details) {
        console.log('   Error Details:', result.details);
      }
      if (result.internalError) {
        console.log('   Internal Error:', result.internalError);
      }
      process.exit(1);
    }

    console.log(`✅ Extraction completed in ${(duration / 1000).toFixed(2)}s`);
    console.log('');

    // Display results
    console.log('='.repeat(70));
    console.log('EXTRACTION RESULTS');
    console.log('='.repeat(70));
    console.log('');

    // Basic extraction info
    console.log('📋 Extraction Info:');
    console.log(`   Extraction ID: ${result.extraction_id || 'N/A'}`);
    console.log(`   Document Type: ${result.document_type || 'N/A'}`);
    console.log(`   Confidence: ${result.confidence ? (result.confidence * 100).toFixed(1) + '%' : 'N/A'}`);
    console.log('');

    // Check if MTO extraction was detected
    if (result.document_type === 'MTO' || result.mto_extraction_id) {
      console.log('✅ MTO Document Detected!');
      console.log(`   MTO Extraction ID: ${result.mto_extraction_id || 'N/A'}`);
      console.log('');

      // Display MTO structure summary
      if (result.mto_structure) {
        const mto = result.mto_structure;
        
        console.log('📊 MTO Structure:');
        
        if (mto.metadata) {
          console.log(`   Project: ${mto.metadata.project_name || 'N/A'}`);
          console.log(`   Total Weight: ${mto.metadata.total_weight_mt || 'N/A'} MT`);
          
          if (mto.metadata.portions && mto.metadata.portions.length > 0) {
            console.log(`   Portions: ${mto.metadata.portions.length}`);
            mto.metadata.portions.forEach((portion, idx) => {
              console.log(`     ${idx + 1}. Portion ${portion.portion}: ${portion.description || 'N/A'} (${portion.weight_mt || 'N/A'} MT)`);
            });
          }
        }
        
        if (mto.sections && mto.sections.length > 0) {
          console.log(`   Sections: ${mto.sections.length}`);
          mto.sections.forEach((section, idx) => {
            console.log(`     ${idx + 1}. ${section.section_id} - ${section.section_name || 'N/A'}`);
            if (section.total_weight_mt) {
              console.log(`        Weight: ${section.total_weight_mt} MT`);
            }
            if (section.subsections && section.subsections.length > 0) {
              console.log(`        Subsections: ${section.subsections.length}`);
            }
          });
        }
        
        console.log('');

        // Weight verification
        if (result.weight_verification) {
          const wv = result.weight_verification;
          console.log('⚖️  Weight Verification:');
          console.log(`   Valid: ${wv.isValid ? '✅ Yes' : '❌ No'}`);
          console.log(`   Verified Items: ${wv.verifiedCount || 0} / ${wv.totalItems || 0}`);
          if (wv.issues && wv.issues.length > 0) {
            console.log(`   Issues: ${wv.issues.length}`);
            wv.issues.slice(0, 3).forEach(issue => {
              console.log(`     - ${issue}`);
            });
          }
          if (wv.warnings && wv.warnings.length > 0) {
            console.log(`   Warnings: ${wv.warnings.length}`);
            wv.warnings.slice(0, 3).forEach(warning => {
              console.log(`     - ${warning}`);
            });
          }
          console.log('');
        }

        // Pricing readiness
        if (result.pricing_readiness || mto.pricing_readiness) {
          const pr = result.pricing_readiness || mto.pricing_readiness;
          console.log('💰 Pricing Readiness:');
          console.log(`   Ready for Pricing: ${pr.ready_for_pricing || 0}`);
          console.log(`   Needs Review: ${pr.needs_review || 0}`);
          console.log(`   Zero Quantity: ${pr.zero_quantity || 0}`);
          console.log(`   Unmatched Materials: ${pr.unmatched_materials || 0}`);
          console.log(`   Total Items: ${pr.total_items || 0}`);
          console.log('');
        }
      }
    } else {
      console.log('ℹ️  Simple RFQ Document (not MTO)');
      console.log('   The document was processed as a regular RFQ');
      console.log('');
    }

    // Items summary
    if (result.extracted_data && result.extracted_data.items) {
      const items = result.extracted_data.items;
      console.log('📦 Extracted Items:');
      console.log(`   Total Items: ${items.length}`);
      if (items.length > 0) {
        console.log('');
        console.log('   First 3 items:');
        items.slice(0, 3).forEach((item, idx) => {
          console.log(`     ${idx + 1}. ${item.description || 'N/A'}`);
          console.log(`        Quantity: ${item.quantity || 'N/A'} ${item.unit || ''}`);
        });
      }
      console.log('');
    }

    // Material matches summary
    if (result.material_matches) {
      console.log('🔗 Material Matches:');
      const matchedCount = result.material_matches.filter(m => m.matched_material).length;
      console.log(`   Matched: ${matchedCount} / ${result.material_matches.length}`);
      console.log('');
    }

    // Validation summary
    if (result.validation) {
      const val = result.validation;
      console.log('✅ Validation:');
      console.log(`   Valid: ${val.isValid ? '✅ Yes' : '❌ No'}`);
      if (val.issues && val.issues.length > 0) {
        console.log(`   Issues: ${val.issues.length}`);
      }
      if (val.warnings && val.warnings.length > 0) {
        console.log(`   Warnings: ${val.warnings.length}`);
      }
      console.log('');
    }

    // Database verification
    console.log('='.repeat(70));
    console.log('DATABASE VERIFICATION');
    console.log('='.repeat(70));
    console.log('');

    if (result.mto_extraction_id) {
      try {
        const { connectDb } = require('../src/db/supabaseClient');
        const db = await connectDb();
        
        // Check if MTO extraction record exists
        const mtoCheck = await db.query(
          'SELECT id, document_extraction_id, confidence_score, created_at FROM mto_extractions WHERE id = $1',
          [result.mto_extraction_id]
        );

        if (mtoCheck.rows.length > 0) {
          const mtoRecord = mtoCheck.rows[0];
          console.log('✅ MTO extraction record found in database:');
          console.log(`   ID: ${mtoRecord.id}`);
          console.log(`   Document Extraction ID: ${mtoRecord.document_extraction_id}`);
          console.log(`   Confidence: ${mtoRecord.confidence_score ? (mtoRecord.confidence_score * 100).toFixed(1) + '%' : 'N/A'}`);
          console.log(`   Created At: ${mtoRecord.created_at}`);
        } else {
          console.log('❌ MTO extraction record NOT found in database');
        }

        // Check document extraction record
        if (result.extraction_id) {
          const docCheck = await db.query(
            'SELECT id, file_name, document_type, created_at FROM document_extractions WHERE id = $1',
            [result.extraction_id]
          );

          if (docCheck.rows.length > 0) {
            const docRecord = docCheck.rows[0];
            console.log('');
            console.log('✅ Document extraction record found:');
            console.log(`   ID: ${docRecord.id}`);
            console.log(`   File Name: ${docRecord.file_name || 'N/A'}`);
            console.log(`   Created At: ${docRecord.created_at}`);
          }
        }
      } catch (dbError) {
        console.log('⚠️  Could not verify database records:');
        console.log(`   ${dbError.message}`);
      }
    } else {
      console.log('ℹ️  No MTO extraction ID in response (document may be simple RFQ)');
    }

    console.log('');
    console.log('='.repeat(70));
    console.log('✅ PHASE 0.5 TEST COMPLETED');
    console.log('='.repeat(70));
    console.log('');

    // Summary
    if (result.document_type === 'MTO' && result.mto_extraction_id) {
      console.log('🎉 SUCCESS: MTO document was detected and hierarchical structure extracted!');
      console.log('');
      console.log('Phase 0.5 Enhanced MTO Extraction is working correctly.');
    } else {
      console.log('ℹ️  Document was processed as a simple RFQ.');
      console.log('   To test MTO extraction, use a complex MTO document (e.g., WHP-DHN Topside).');
    }

  } catch (error) {
    console.log('');
    console.log('='.repeat(70));
    console.log('❌ TEST FAILED');
    console.log('='.repeat(70));
    console.log('');
    console.error('Error:', error.message);
    if (error.stack) {
      console.error('\nStack trace:');
      console.error(error.stack);
    }
    process.exit(1);
  }
}

// Run test
const pdfPath = process.argv[2];
testMtoExtraction(pdfPath).catch(error => {
  console.error('Fatal error:', error);
  process.exit(1);
});


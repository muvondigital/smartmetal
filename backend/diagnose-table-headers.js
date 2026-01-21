/**
 * Diagnostic Script: Analyze Table Header Structure from PetroVietnam Document
 *
 * This script extracts and displays the raw table structure from the PDF
 * to help diagnose why column mapping is failing.
 */

// Set dummy env vars to bypass config validation
process.env.DATABASE_URL = 'postgresql://dummy:dummy@localhost:5432/dummy';
process.env.GCP_PROJECT_ID = process.env.GCP_PROJECT_ID || 'dummy-project';
process.env.GCP_LOCATION = process.env.GCP_LOCATION || 'us';
process.env.GCP_PROCESSOR_ID = process.env.GCP_PROCESSOR_ID || 'dummy-processor';

const { analyzeDocument } = require('./src/services/gcp/documentAiService');
const path = require('path');
const fs = require('fs');

async function diagnoseTableHeaders() {
  console.log('========================================');
  console.log('TABLE HEADER DIAGNOSTIC TOOL');
  console.log('========================================\n');

  const pdfPath = path.join(__dirname, '../test_data/RealSamples/WHP-DHN-S-X-2001_0 (PetroVietnam).pdf');

  if (!fs.existsSync(pdfPath)) {
    console.error('❌ PDF not found:', pdfPath);
    return;
  }

  console.log('📄 Processing:', pdfPath);
  console.log('');

  try {
    // Extract document with OCR
    const result = await analyzeDocument(pdfPath);

    console.log(`\n✅ Document analyzed successfully`);
    console.log(`   Total tables detected: ${result.tables?.length || 0}`);
    console.log(`   Total pages: ${result.pageCount}`);
    console.log('');

    if (!result.tables || result.tables.length === 0) {
      console.log('❌ No tables found in document');
      return;
    }

    // Analyze each table
    console.log('========================================');
    console.log('TABLE STRUCTURE ANALYSIS');
    console.log('========================================\n');

    for (let i = 0; i < Math.min(result.tables.length, 10); i++) {
      const table = result.tables[i];
      console.log(`\n📊 TABLE ${i + 1}/${result.tables.length}`);
      console.log(`   Rows: ${table.rowCount}, Columns: ${table.columnCount}`);

      if (table.rows && table.rows.length > 0) {
        // Show first 3 rows (typically header + 2 data rows)
        const previewRows = table.rows.slice(0, 3);

        console.log('\n   FIRST 3 ROWS:');
        previewRows.forEach((row, rowIdx) => {
          console.log(`\n   Row ${rowIdx}:`);
          row.forEach((cell, cellIdx) => {
            // Truncate long cells
            const cellPreview = (cell || '').substring(0, 60);
            const truncated = cell && cell.length > 60 ? '...' : '';
            console.log(`     [${cellIdx}] "${cellPreview}${truncated}"`);
          });
        });

        // Header analysis
        if (table.rows.length > 0) {
          const potentialHeader = table.rows[0];
          console.log('\n   HEADER ANALYSIS (Row 0):');
          console.log(`     Total cells: ${potentialHeader.length}`);

          const headerKeywords = {
            item: /^(item|no|#|number|line|line\s*no)/i,
            description: /^(desc|description|detail|material|spec)/i,
            quantity: /^(qty|quantity|quant|pcs)/i,
            unit: /^(unit|uom)/i,
            size: /^(size|dimension|dia|od|id)/i,
            notes: /^(note|remark|comment)/i,
          };

          let keywordMatches = {};
          potentialHeader.forEach((cell, idx) => {
            const cellTrimmed = (cell || '').trim().toLowerCase();
            Object.keys(headerKeywords).forEach(keyword => {
              if (headerKeywords[keyword].test(cellTrimmed)) {
                if (!keywordMatches[keyword]) keywordMatches[keyword] = [];
                keywordMatches[keyword].push({ index: idx, text: cell });
              }
            });
          });

          if (Object.keys(keywordMatches).length > 0) {
            console.log('     ✅ Header keywords detected:');
            Object.keys(keywordMatches).forEach(keyword => {
              keywordMatches[keyword].forEach(match => {
                console.log(`        ${keyword.toUpperCase()}: [${match.index}] "${match.text}"`);
              });
            });
          } else {
            console.log('     ❌ No standard header keywords detected');
          }
        }
      }

      // Stop after first table with potential line items
      if (i === 0) {
        console.log('\n   (Showing only first table for detailed analysis)');
      }
    }

    console.log('\n========================================');
    console.log('RECOMMENDED ACTIONS');
    console.log('========================================\n');

    console.log('Based on the table structure above:');
    console.log('1. If headers are split across multiple cells:');
    console.log('   → Need to implement header reconstruction');
    console.log('2. If headers contain OCR errors:');
    console.log('   → Need to implement fuzzy matching');
    console.log('3. If headers are on row 1+ instead of row 0:');
    console.log('   → Header detection logic is working (checks rows 0-3)');
    console.log('4. If tables are VDRL/document lists instead of line items:');
    console.log('   → Need to check pages 10+ for actual MTO tables');

  } catch (error) {
    console.error('\n❌ Error during analysis:', error.message);
    console.error(error.stack);
  }
}

// Run the diagnostic
diagnoseTableHeaders().catch(console.error);

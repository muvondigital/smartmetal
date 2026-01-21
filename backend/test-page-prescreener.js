/**
 * Test Script: Page Pre-Screening Intelligence
 *
 * Tests the intelligent page detection system on PetroVietnam document
 * to verify it can automatically find pages 26-32 without manual input.
 */

const { PagePreScreener } = require('./src/services/extraction/pagePreScreener');
const path = require('path');
const fs = require('fs');

async function testPagePreScreening() {
  console.log('========================================');
  console.log('PAGE PRE-SCREENING TEST');
  console.log('========================================\n');

  const pdfPath = path.join(__dirname, '../test_data/RealSamples/WHP-DHN-S-X-2001_0 (PetroVietnam).pdf');

  if (!fs.existsSync(pdfPath)) {
    console.error('❌ PDF not found:', pdfPath);
    console.error('   Please ensure the file exists in test_data/RealSamples/');
    return;
  }

  console.log('📄 Testing on: WHP-DHN-S-X-2001_0 (PetroVietnam).pdf');
  console.log('   Expected result: Pages 26-32 should be auto-detected');
  console.log('');

  try {
    const preScreener = new PagePreScreener();

    // Run pre-screening
    const result = await preScreener.identifyLineItemPages(pdfPath);

    console.log('\n========================================');
    console.log('RESULTS');
    console.log('========================================\n');

    console.log(`⏱️  Processing time: ${result.timing}ms`);
    console.log(`📊 Total pages: ${result.totalPages}`);
    console.log(`✅ Selected pages: ${result.selectedPages}`);
    console.log(`💾 Compression ratio: ${result.compressionRatio.toFixed(1)}% reduction`);
    console.log('');

    console.log('📄 Selected page numbers:');
    console.log(`   ${result.pages.join(', ')}`);
    console.log('');

    // Show top 10 highest-scoring pages
    console.log('📊 Top 10 highest-scoring pages:');
    const topPages = result.scores
      .sort((a, b) => b.score - a.score)
      .slice(0, 10);

    topPages.forEach((page, idx) => {
      const emoji = page.score >= 50 ? '✅' : '⚠️';
      console.log(`   ${emoji} Page ${page.pageNumber}: score=${page.score.toFixed(1)}`);
      if (page.reasons.length > 0) {
        console.log(`      Reasons: ${page.reasons.slice(0, 3).join(', ')}`);
      }
    });

    console.log('');

    // Validation: Check if pages 26-32 were detected
    console.log('========================================');
    console.log('VALIDATION');
    console.log('========================================\n');

    const expectedPages = [26, 27, 28, 29, 30, 31, 32];
    const detectedExpectedPages = expectedPages.filter(p => result.pages.includes(p));

    if (detectedExpectedPages.length === expectedPages.length) {
      console.log('✅ SUCCESS: All expected pages (26-32) were auto-detected!');
      console.log(`   Coverage: ${detectedExpectedPages.length}/${expectedPages.length}`);
    } else if (detectedExpectedPages.length >= expectedPages.length * 0.7) {
      console.log('⚠️  PARTIAL: Most expected pages were detected');
      console.log(`   Coverage: ${detectedExpectedPages.length}/${expectedPages.length}`);
      console.log(`   Detected: ${detectedExpectedPages.join(', ')}`);
      const missed = expectedPages.filter(p => !result.pages.includes(p));
      console.log(`   Missed: ${missed.join(', ')}`);
    } else {
      console.log('❌ FAILURE: Expected pages not detected');
      console.log(`   Coverage: ${detectedExpectedPages.length}/${expectedPages.length}`);
      console.log(`   Expected: ${expectedPages.join(', ')}`);
      console.log(`   Detected: ${detectedExpectedPages.join(', ')}`);
    }

    console.log('');

    // Show scores for expected pages
    console.log('📊 Scores for expected pages (26-32):');
    expectedPages.forEach(pageNum => {
      const pageScore = result.scores.find(s => s.pageNumber === pageNum);
      if (pageScore) {
        const detected = result.pages.includes(pageNum) ? '✅' : '❌';
        console.log(`   ${detected} Page ${pageNum}: score=${pageScore.score.toFixed(1)}`);
        if (pageScore.reasons.length > 0) {
          console.log(`      ${pageScore.reasons.join(', ')}`);
        }
      }
    });

    console.log('\n========================================');
    console.log('RECOMMENDATIONS');
    console.log('========================================\n');

    if (detectedExpectedPages.length === expectedPages.length) {
      console.log('✅ System is ready for production!');
      console.log('   Next steps:');
      console.log('   1. Integrate with Document AI pipeline');
      console.log('   2. Test on more documents (First Gen, Shell, etc.)');
      console.log('   3. Enable by default in extraction API');
    } else {
      console.log('⚠️  Tuning needed:');
      console.log('   1. Review scoring weights in SCORING_CONFIG');
      console.log('   2. Add more keywords specific to MTO documents');
      console.log('   3. Adjust MIN_PAGE_SCORE threshold');
    }

  } catch (error) {
    console.error('\n❌ Error during pre-screening:', error.message);
    console.error(error.stack);
  }
}

// Run the test
testPagePreScreening().catch(console.error);

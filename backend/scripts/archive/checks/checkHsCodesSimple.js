require('dotenv').config();
const regulatoryService = require('../src/services/regulatoryService');

async function check() {
  try {
    const count = await regulatoryService.getHsCodeCount('dummy-tenant-id');
    console.log(`\n=== HS CODES COUNT ===`);
    console.log(`Total HS Codes in database: ${count}\n`);
    
    if (count > 0) {
      const samples = await regulatoryService.searchHsCodes({ 
        tenantId: 'dummy', 
        query: null, 
        limit: 20 
      });
      console.log(`Sample HS Codes (first ${samples.length}):`);
      samples.forEach((hs, idx) => {
        console.log(`  ${idx + 1}. ${hs.hs_code} - ${hs.description.substring(0, 60)}...`);
      });
    } else {
      console.log('No HS codes found. Run: node scripts/seedDemoRegulatoryData.js');
    }
  } catch (err) {
    console.error('Error:', err.message);
    console.error(err.stack);
  }
  process.exit(0);
}

check();

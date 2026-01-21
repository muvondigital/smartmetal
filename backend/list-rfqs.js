const { Client } = require('pg');
require('dotenv').config();

(async () => {
  const client = new Client({ connectionString: process.env.DATABASE_URL });
  await client.connect();

  const rfqs = await client.query(`
    SELECT id, rfq_code, created_at
    FROM rfqs
    ORDER BY created_at DESC
    LIMIT 5
  `);

  console.log('Recent RFQs:');
  rfqs.rows.forEach(r => {
    console.log(`${r.rfq_code} - ${r.id} - ${r.created_at}`);
  });

  await client.end();
})();

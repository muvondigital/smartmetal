require('dotenv').config();
const { connectDb } = require('../src/db/supabaseClient');

(async () => {
  const db = await connectDb();

  const result = await db.query(
    'SELECT id, nps_display, schedule, nps_inch, outside_diameter_in FROM pipes WHERE id = $1',
    ['eda5db31-d16e-4ad0-8e8b-45eb81aa547f']
  );

  console.log('Problematic pipe:');
  console.log(result.rows[0]);

  const dupeQuery = 'SELECT id, nps_display, schedule FROM pipes WHERE is_active = true AND nps_display IS NOT DISTINCT FROM $1 AND schedule = $2';
  const dupes = await db.query(dupeQuery, [result.rows[0].nps_display, result.rows[0].schedule]);

  console.log(`\nOther active pipes with same nps_display + schedule: ${dupes.rows.length}`);
  dupes.rows.forEach(r => console.log(`  - ${r.id} (${r.nps_display || 'NULL'} / ${r.schedule})`));

  await db.end();
})().catch(console.error);

require('dotenv').config();
const { connectDb } = require('../src/db/supabaseClient');

(async () => {
  const db = await connectDb();

  const result = await db.query(
    "SELECT id, material_code, pipe_id, pipe_grade_id FROM materials WHERE material_code LIKE 'PIPE-2-40-%'"
  );

  console.log('Materials with material_code LIKE PIPE-2-40-%:');
  result.rows.forEach(m => console.log(`  - ${m.material_code} (pipe: ${m.pipe_id}, grade: ${m.pipe_grade_id})`));

  // Check for exact duplicates
  const dupeQuery = `
    SELECT material_code, COUNT(*) as count
    FROM materials
    WHERE material_code LIKE 'PIPE-2-40-%'
    GROUP BY material_code
    HAVING COUNT(*) > 1
  `;

  const dupes = await db.query(dupeQuery);
  console.log('\nDuplicate material_codes:');
  dupes.rows.forEach(d => console.log(`  - ${d.material_code}: ${d.count} copies`));

  await db.end();
})().catch(console.error);

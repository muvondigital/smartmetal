require('dotenv').config();
const { getMigrationPool } = require('../src/db/supabaseClient');

async function checkMaterials() {
  const pool = getMigrationPool();

  const result = await pool.query(`
    SELECT id, material_code, grade, category, tenant_id, sku
    FROM materials
    ORDER BY tenant_id, material_code
  `);

  const materials = result.rows;

  // NSC Sinergi: 6e783cd4-167d-407e-acd3-2635c1ea02ca
  // NSC Sinergi Sdn Bhd: b449bdd1-a9d2-4a20-afa2-979316c9ef0e
  // MetaSteel: 8e7bd2d0-9b6f-40d4-af25-920574e5e45f
  // MVD Dev: c2b7adb7-4478-4e23-89e9-039c0e63c767

  const nscSinergi = materials.filter(m => m.tenant_id === '6e783cd4-167d-407e-acd3-2635c1ea02ca');
  const nscSinergiBhd = materials.filter(m => m.tenant_id === 'b449bdd1-a9d2-4a20-afa2-979316c9ef0e');
  const metasteel = materials.filter(m => m.tenant_id === '8e7bd2d0-9b6f-40d4-af25-920574e5e45f');
  const mvdDev = materials.filter(m => m.tenant_id === 'c2b7adb7-4478-4e23-89e9-039c0e63c767');

  console.log('NSC Sinergi Materials (' + nscSinergi.length + '):');
  nscSinergi.forEach(m => console.log('  -', m.material_code, '|', m.grade, '|', m.category, '|', m.sku, '|', m.id));

  console.log('\nNSC Sinergi Sdn Bhd Materials (' + nscSinergiBhd.length + '):');
  nscSinergiBhd.forEach(m => console.log('  -', m.material_code, '|', m.grade, '|', m.category, '|', m.sku, '|', m.id));

  console.log('\nMetaSteel Trading Sdn Bhd Materials (' + metasteel.length + '):');
  metasteel.forEach(m => console.log('  -', m.material_code, '|', m.grade, '|', m.category, '|', m.sku, '|', m.id));

  console.log('\nMVD Dev Materials (' + mvdDev.length + '):');
  mvdDev.forEach(m => console.log('  -', m.material_code, '|', m.grade, '|', m.category, '|', m.sku, '|', m.id));

  // Check for duplicates within each tenant
  const nscSinergiDuplicates = findDuplicates(nscSinergi);
  const nscSinergiBhdDuplicates = findDuplicates(nscSinergiBhd);
  const metasteelDuplicates = findDuplicates(metasteel);
  const mvdDevDuplicates = findDuplicates(mvdDev);

  if (nscSinergiDuplicates.length > 0) {
    console.log('\n⚠️ NSC SINERGI DUPLICATES FOUND:');
    nscSinergiDuplicates.forEach(d => console.log('  -', d.key, '- IDs:', d.ids.join(', ')));
  }

  if (nscSinergiBhdDuplicates.length > 0) {
    console.log('\n⚠️ NSC SINERGI SDN BHD DUPLICATES FOUND:');
    nscSinergiBhdDuplicates.forEach(d => console.log('  -', d.key, '- IDs:', d.ids.join(', ')));
  }

  if (metasteelDuplicates.length > 0) {
    console.log('\n⚠️ METASTEEL DUPLICATES FOUND:');
    metasteelDuplicates.forEach(d => console.log('  -', d.key, '- IDs:', d.ids.join(', ')));
  }

  if (mvdDevDuplicates.length > 0) {
    console.log('\n⚠️ MVD DEV DUPLICATES FOUND:');
    mvdDevDuplicates.forEach(d => console.log('  -', d.key, '- IDs:', d.ids.join(', ')));
  }

  await pool.end();
}

function findDuplicates(materials) {
  const map = {};
  const duplicates = [];

  materials.forEach(m => {
    const key = `${m.material_code}|${m.grade}|${m.category}`;
    if (!map[key]) {
      map[key] = [];
    }
    map[key].push(m.id);
  });

  Object.keys(map).forEach(key => {
    if (map[key].length > 1) {
      duplicates.push({ key, ids: map[key] });
    }
  });

  return duplicates;
}

checkMaterials().then(() => process.exit(0)).catch(err => {
  console.error(err);
  process.exit(1);
});

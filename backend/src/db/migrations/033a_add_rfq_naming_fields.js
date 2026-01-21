const { generateRfqCode, buildRfqTitle } = require('../../utils/rfqNaming');

async function up(db) {
  if (!db) {
    throw new Error('Migration 033_add_rfq_naming_fields requires db parameter. Use runAllMigrations.js to run migrations.');
  }
  const client = db;

  await client.query(`
    ALTER TABLE rfqs
      ADD COLUMN IF NOT EXISTS rfq_code TEXT,
      ADD COLUMN IF NOT EXISTS original_filename TEXT
  `);

  await client.query(`
    CREATE UNIQUE INDEX IF NOT EXISTS idx_rfqs_tenant_rfq_code_unique
      ON rfqs(tenant_id, rfq_code)
      WHERE rfq_code IS NOT NULL
  `);

  await client.query(`
    CREATE INDEX IF NOT EXISTS idx_rfqs_rfq_code_lookup
      ON rfqs(rfq_code)
      WHERE rfq_code IS NOT NULL
  `);

  try {
    const tenantsResult = await client.query(`SELECT id, code FROM tenants`);
    const tenantCodeMap = new Map(
      tenantsResult.rows.map((row) => [row.id, row.code || 'GEN'])
    );

    const rfqsToBackfill = await client.query(`
      SELECT
        r.id,
        r.tenant_id,
        r.created_at,
        r.title,
        r.original_filename,
        p.name AS project_name,
        c.name AS client_name
      FROM rfqs r
      JOIN projects p ON r.project_id = p.id
      JOIN clients c ON p.client_id = c.id
      WHERE r.rfq_code IS NULL
      ORDER BY r.created_at ASC
    `);

    for (const rfq of rfqsToBackfill.rows) {
      const tenantCode = tenantCodeMap.get(rfq.tenant_id) || 'GEN';
      const rfqCode = await generateRfqCode(
        {
          tenantId: rfq.tenant_id,
          tenantCode,
          createdAt: rfq.created_at,
        },
        client
      );

      const title =
        rfq.title && rfq.title.trim() !== ''
          ? rfq.title
          : buildRfqTitle({
              customerName: rfq.client_name,
              projectName: rfq.project_name,
              originalFilename: rfq.original_filename,
              rfqCode,
            });

      await client.query(
        `
          UPDATE rfqs
          SET rfq_code = $1,
              title = COALESCE(NULLIF($2, ''), title)
          WHERE id = $3
        `,
        [rfqCode, title, rfq.id]
      );
    }
  } catch (error) {
    console.warn('[Migration 033] Backfill skipped or partial:', error.message);
  }
}

async function down(db) {
  if (!db) {
    throw new Error('Migration 033_add_rfq_naming_fields requires db parameter. Use runAllMigrations.js to run migrations.');
  }
  const client = db;

  await client.query(`DROP INDEX IF EXISTS idx_rfqs_rfq_code_lookup`);
  await client.query(`DROP INDEX IF EXISTS idx_rfqs_tenant_rfq_code_unique`);

  await client.query(`
    ALTER TABLE rfqs
      DROP COLUMN IF EXISTS original_filename,
      DROP COLUMN IF EXISTS rfq_code
  `);
}

module.exports = { up, down };

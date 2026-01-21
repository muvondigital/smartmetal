const { connectDb } = require('./supabaseClient');

/**
 * Seeds test data for Pricer V2 features:
 * - Users for approval workflow
 * - Sample price agreements
 *
 * Idempotent - checks for existing data before inserting
 */
async function seedPricerV2() {
  const db = await connectDb();

  console.log('Starting Pricer V2 seed data process...');

  try {
    // ============================================================================
    // SEED USERS
    // ============================================================================

    console.log('Seeding users...');

    // Check if users already exist
    const existingUsers = await db.query('SELECT COUNT(*) FROM users');
    const userCount = parseInt(existingUsers.rows[0].count);

    if (userCount > 0) {
      console.log(`⚠️  Found ${userCount} existing users. Skipping user seeding.`);
    } else {
      await db.query(`
        INSERT INTO users (name, email, role, can_approve) VALUES
        ('John Sales', 'john.sales@nscpricer.com', 'sales_rep', false),
        ('Jane Sales', 'jane.sales@nscpricer.com', 'sales_rep', false),
        ('Sarah Manager', 'sarah.manager@nscpricer.com', 'manager', true),
        ('Mike Director', 'mike.director@nscpricer.com', 'manager', true),
        ('Admin User', 'admin@nscpricer.com', 'admin', true);
      `);
      console.log('✅ Seeded 5 users');
    }

    // ============================================================================
    // SEED PRICE AGREEMENTS
    // ============================================================================

    console.log('Seeding price agreements...');

    // Get a sample client to create agreements for
    const clientResult = await db.query('SELECT id, name FROM clients LIMIT 1');

    if (clientResult.rows.length === 0) {
      console.log('⚠️  No clients found. Skipping price agreement seeding.');
      console.log('   Create clients first, then run this seed script again.');
    } else {
      const sampleClient = clientResult.rows[0];
      console.log(`Using client: ${sampleClient.name}`);

      // Check if agreements already exist for this client
      const existingAgreements = await db.query(
        'SELECT COUNT(*) FROM price_agreements WHERE client_id = $1',
        [sampleClient.id]
      );
      const agreementCount = parseInt(existingAgreements.rows[0].count);

      if (agreementCount > 0) {
        console.log(`⚠️  Found ${agreementCount} existing agreements for this client. Skipping agreement seeding.`);
      } else {
        // Get some sample materials
        const materialsResult = await db.query(`
          SELECT id, material_code, category
          FROM materials
          WHERE category IN ('FLANGES', 'PIPES', 'FITTINGS')
          LIMIT 3
        `);

        if (materialsResult.rows.length === 0) {
          console.log('⚠️  No materials found. Creating category-level agreements only.');

          // Create category-level agreements
          await db.query(`
            INSERT INTO price_agreements
              (client_id, category, base_price, currency, valid_from, valid_until, payment_terms, delivery_terms, notes, created_by, status)
            VALUES
              ($1, 'FLANGES', 95.00, 'USD', '2025-01-01', '2025-12-31', 'Net 30', 'FOB Origin', 'Annual agreement for flanges - 2025', 'Admin User', 'active'),
              ($1, 'PIPES', 120.00, 'USD', '2025-01-01', '2025-12-31', 'Net 30', 'FOB Origin', 'Annual agreement for pipes - 2025', 'Admin User', 'active'),
              ($1, 'FITTINGS', 85.00, 'USD', '2025-01-01', '2025-12-31', 'Net 45', 'FOB Destination', 'Annual agreement for fittings - 2025', 'Admin User', 'active')
          `, [sampleClient.id]);

          console.log('✅ Seeded 3 category-level price agreements');
        } else {
          // Create material-specific agreements with volume tiers
          const materials = materialsResult.rows;

          for (const material of materials) {
            const volumeTiers = [
              { min_qty: 0, max_qty: 100, price: 100.00 },
              { min_qty: 101, max_qty: 500, price: 95.00 },
              { min_qty: 501, max_qty: null, price: 90.00 }
            ];

            await db.query(`
              INSERT INTO price_agreements
                (client_id, material_id, base_price, currency, volume_tiers, valid_from, valid_until, payment_terms, delivery_terms, notes, created_by, status)
              VALUES
                ($1, $2, $3, 'USD', $4, '2025-01-01', '2025-12-31', 'Net 30', 'FOB Origin', $5, 'Admin User', 'active')
            `, [
              sampleClient.id,
              material.id,
              100.00,
              JSON.stringify(volumeTiers),
              `Volume-tiered agreement for ${material.material_code} - 2025`
            ]);
          }

          console.log(`✅ Seeded ${materials.length} material-specific price agreements with volume tiers`);

          // Add one expired agreement for testing
          await db.query(`
            INSERT INTO price_agreements
              (client_id, category, base_price, currency, valid_from, valid_until, payment_terms, delivery_terms, notes, created_by, status)
            VALUES
              ($1, 'VALVES', 150.00, 'USD', '2024-01-01', '2024-12-31', 'Net 30', 'FOB Origin', 'Expired agreement - 2024', 'Admin User', 'expired')
          `, [sampleClient.id]);

          console.log('✅ Seeded 1 expired agreement for testing');

          // Add one future agreement
          await db.query(`
            INSERT INTO price_agreements
              (client_id, category, base_price, currency, valid_from, valid_until, payment_terms, delivery_terms, notes, created_by, status)
            VALUES
              ($1, 'GASKETS', 25.00, 'USD', '2026-01-01', '2026-12-31', 'Net 30', 'FOB Origin', 'Future agreement - 2026', 'Admin User', 'active')
          `, [sampleClient.id]);

          console.log('✅ Seeded 1 future agreement for testing');
        }
      }
    }

    // ============================================================================
    // SUMMARY
    // ============================================================================

    console.log('');
    console.log('='.repeat(60));
    console.log('Pricer V2 Seed Data Summary');
    console.log('='.repeat(60));

    const userStats = await db.query('SELECT COUNT(*) as count FROM users');
    const agreementStats = await db.query('SELECT COUNT(*) as count FROM price_agreements');
    const activeAgreementStats = await db.query(
      "SELECT COUNT(*) as count FROM price_agreements WHERE status = 'active'"
    );

    console.log(`Total Users: ${userStats.rows[0].count}`);
    console.log(`Total Price Agreements: ${agreementStats.rows[0].count}`);
    console.log(`Active Price Agreements: ${activeAgreementStats.rows[0].count}`);

    // Show sample users
    const users = await db.query('SELECT name, email, role, can_approve FROM users ORDER BY can_approve DESC, name');
    console.log('');
    console.log('Users:');
    users.rows.forEach(user => {
      const approver = user.can_approve ? '✓' : ' ';
      console.log(`  [${approver}] ${user.name} (${user.email}) - ${user.role}`);
    });

    // Show sample agreements
    const agreements = await db.query(`
      SELECT
        pa.id,
        c.name as client_name,
        COALESCE(m.material_code, pa.category) as item,
        pa.base_price,
        pa.currency,
        pa.valid_from,
        pa.valid_until,
        pa.status,
        CASE WHEN pa.volume_tiers IS NOT NULL THEN 'Yes' ELSE 'No' END as has_tiers
      FROM price_agreements pa
      JOIN clients c ON pa.client_id = c.id
      LEFT JOIN materials m ON pa.material_id = m.id
      ORDER BY pa.status DESC, pa.valid_from DESC
      LIMIT 10
    `);

    if (agreements.rows.length > 0) {
      console.log('');
      console.log('Sample Price Agreements:');
      agreements.rows.forEach(agr => {
        console.log(`  ${agr.status === 'active' ? '✓' : 'x'} ${agr.client_name} | ${agr.item} | $${agr.base_price} | ${agr.valid_from} to ${agr.valid_until} | Tiers: ${agr.has_tiers}`);
      });
    }

    console.log('');
    console.log('✅ Pricer V2 seed data completed successfully!');
    console.log('');

  } catch (error) {
    console.error('❌ Error seeding Pricer V2 data:', error);
    throw error;
  }
}

module.exports = {
  seedPricerV2,
};

const { connectDb } = require('../supabaseClient');

/**
 * Seeds sample materials data for all active tenants.
 * Uses INSERT ... ON CONFLICT to avoid duplicate inserts.
 * Materials are tenant-scoped, so we seed for each active tenant.
 */
async function seedMaterials() {
  const db = await connectDb();

  // Get all active tenants
  let activeTenants;
  try {
    const tenantsResult = await db.query(
      `SELECT id, code, name FROM tenants WHERE is_active = true`
    );
    activeTenants = tenantsResult.rows;
  } catch (error) {
    // If tenants table doesn't exist or query fails, skip seeding
    console.log('⚠️  Cannot query tenants table, skipping materials seeding:', error.message);
    return;
  }

  if (activeTenants.length === 0) {
    console.log('⚠️  No active tenants found, skipping materials seeding');
    return;
  }

  const sampleMaterials = [
    {
      material_code: 'CS-PIPE-6-SCH40-A106B',
      category: 'PIPE',
      spec_standard: 'ASTM A106',
      grade: 'Gr.B',
      material_type: 'Carbon Steel',
      origin_type: 'NON_CHINA',
      size_description: '6" SCH40',
      base_cost: 100,
      currency: 'USD',
      notes: null,
    },
    {
      material_code: 'CS-ELBOW-6-SCH40-A234WPB',
      category: 'FITTING',
      spec_standard: 'ASTM A234',
      grade: 'WPB',
      material_type: 'Carbon Steel',
      origin_type: 'NON_CHINA',
      size_description: '6" SCH40 LR 90°',
      base_cost: 45,
      currency: 'USD',
      notes: null,
    },
    {
      material_code: 'CS-FLANGE-6-150RF-A105',
      category: 'FLANGE',
      spec_standard: 'ANSI B16.5',
      grade: 'A105',
      material_type: 'Carbon Steel',
      origin_type: 'NON_CHINA',
      size_description: '6" 150# RF WN',
      base_cost: 60,
      currency: 'USD',
      notes: null,
    },
    {
      material_code: 'CS-PLATE-A516GR70-10MM',
      category: 'PLATE',
      spec_standard: 'ASTM A516',
      grade: 'Gr.70',
      material_type: 'Carbon Steel',
      origin_type: 'NON_CHINA',
      size_description: '10mm',
      base_cost: 80,
      currency: 'USD',
      notes: null,
    },
    {
      material_code: 'BOLT-A325-M20X60',
      category: 'BOLT_NUT',
      spec_standard: 'ASTM A325',
      grade: null,
      material_type: 'Alloy Steel',
      origin_type: 'NON_CHINA',
      size_description: 'M20 x 60',
      base_cost: 5,
      currency: 'USD',
      notes: null,
    },
  ];

  try {
    let totalSeeded = 0;
    
    // Seed materials for each active tenant
    for (const tenant of activeTenants) {
      let tenantSeeded = 0;
      
      for (const material of sampleMaterials) {
        try {
          const result = await db.query(
            `INSERT INTO materials (
              tenant_id, material_code, category, spec_standard, grade, material_type,
              origin_type, size_description, base_cost, currency, notes
            )
            VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11)
            ON CONFLICT (tenant_id, material_code) DO NOTHING
            RETURNING id`,
            [
              tenant.id,  // tenant_id (required, NOT NULL)
              material.material_code,
              material.category,
              material.spec_standard,
              material.grade,
              material.material_type,
              material.origin_type,
              material.size_description,
              material.base_cost,
              material.currency,
              material.notes,
            ]
          );
          
          // If row was inserted (not skipped due to conflict), increment counter
          if (result.rows.length > 0) {
            tenantSeeded++;
          }
        } catch (error) {
          // Log error but continue with other materials
          console.error(`  ⚠️  Error seeding material ${material.material_code} for tenant ${tenant.code}:`, error.message);
        }
      }
      
      if (tenantSeeded > 0) {
        console.log(`  ✓ Seeded ${tenantSeeded} materials for tenant: ${tenant.code} (${tenant.name})`);
        totalSeeded += tenantSeeded;
      }
    }
    
    if (totalSeeded > 0) {
      console.log(`✓ Materials seeded successfully (${totalSeeded} total materials across ${activeTenants.length} tenant(s))`);
    } else {
      console.log('✓ Materials already exist for all tenants (no new materials seeded)');
    }
  } catch (error) {
    console.error('Error seeding materials:', error);
    // Don't throw - allow server to continue running
    // This is a non-critical initialization step
  }
}

module.exports = {
  seedMaterials,
};


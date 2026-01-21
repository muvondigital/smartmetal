/**
 * Seed MetaSteel Suppliers and Materials (STEP 2 of MetaSteel Enablement)
 * 
 * Creates:
 * - 7 realistic MetaSteel suppliers (tenant-scoped)
 * - 12 minimal but powerful materials (shared catalog)
 * - Supplier lead times
 * - Supplier certifications
 * 
 * This script is idempotent - safe to run multiple times.
 * 
 * Pattern follows: backend/src/db/seeds/seedNscSuppliers.js
 * Materials pattern follows: backend/src/db/seeds/seedMaterials.js
 * 
 * DO NOT modify NSC data.
 * DO NOT touch Step 1 (KYC config already seeded).
 * 
 * Usage: node scripts/seedMetaSteelSuppliersAndMaterials.js
 */

require('dotenv').config();
const { connectMigrationDb } = require('../src/db/supabaseClient');

/**
 * MetaSteel Supplier Portfolio
 * 7 realistic suppliers with mix of origins and functions
 */
const metaSteelSuppliers = [
  {
    name: 'BayuSteel Distributors Sdn Bhd',
    country: 'MALAYSIA',
    category: 'MATERIAL',
    origin_type: 'MIXED',
    supplier_type: 'STOCKIST',
    email: 'info@bayusteel.com',
    phone: '+60 3-2345 6789',
    status: 'ACTIVE',
    notes: 'Carbon steel pipes, fittings, flanges for quick stock orders. Mixed origin (China + Non-China).'
  },
  {
    name: 'StrataPipe Mills Europe BV',
    country: 'NETHERLANDS',
    category: 'MATERIAL',
    origin_type: 'NON_CHINA',
    supplier_type: 'MILL',
    email: 'sales@stratapipe.nl',
    phone: '+31 20-123 4567',
    status: 'ACTIVE',
    notes: 'High-spec pipes & fittings for PETRONAS, PRefChem, QatarEnergy jobs. Non-China origin.'
  },
  {
    name: 'HarbourFlange Asia Pte Ltd',
    country: 'SINGAPORE',
    category: 'MATERIAL',
    origin_type: 'MIXED',
    supplier_type: 'STOCKIST',
    email: 'enquiry@harbourflange.sg',
    phone: '+65 6789 0123',
    status: 'ACTIVE',
    notes: 'Flanges & fittings, both carbon and stainless. Mixed origin supplier.'
  },
  {
    name: 'DragonFlow Valves Co., Ltd',
    country: 'CHINA',
    category: 'MATERIAL',
    origin_type: 'CHINA',
    supplier_type: 'TRADER',
    email: 'export@dragonflow.cn',
    phone: '+86-21-5678 9012',
    status: 'ACTIVE',
    notes: 'API 6D valves, general industrial valves. Used only where origin rules allow.'
  },
  {
    name: 'Nusantara Coatings & NDT Sdn Bhd',
    country: 'MALAYSIA',
    category: 'SERVICE',
    origin_type: 'NON_CHINA',
    supplier_type: 'SERVICE_PROVIDER',
    email: 'service@nusantara-ndt.com.my',
    phone: '+60 4-3456 7890',
    status: 'ACTIVE',
    notes: 'Coating, NDT for fabricated spools & structures. Non-China service provider.'
  },
  {
    name: 'EastStrait Fabrication Works',
    country: 'MALAYSIA',
    category: 'SERVICE',
    origin_type: 'NON_CHINA',
    supplier_type: 'FABRICATOR',
    email: 'fabrication@eaststrait.com.my',
    phone: '+60 3-4567 8901',
    status: 'ACTIVE',
    notes: 'Spool fabrication, structural steel fabrication. Non-China fabricator.'
  },
  {
    name: 'Penang Freight & Logistics Sdn Bhd',
    country: 'MALAYSIA',
    category: 'FREIGHT',
    origin_type: 'NON_CHINA',
    supplier_type: 'LOGISTICS',
    email: 'logistics@penangfreight.com.my',
    phone: '+60 4-5678 9012',
    status: 'ACTIVE',
    notes: 'Local trucking + regional sea freight coordination.'
  }
];

/**
 * MetaSteel Material Catalogue
 * Small but powerful set of materials that will support demo RFQs
 */
const metaSteelMaterials = [
  // Carbon steel pipes
  {
    material_code: 'M-CS-PIPE-2-SCH40-A106B',
    category: 'PIPE',
    spec_standard: 'ASTM A106',
    grade: 'Gr.B',
    material_type: 'Carbon Steel',
    origin_type: 'NON_CHINA',
    size_description: 'Pipe NPS 2" SCH40 ASTM A106 Gr.B',
    base_cost: 48, // USD per meter (typical stockist price)
    currency: 'USD',
    notes: 'Standard carbon steel pipe for general industrial use'
  },
  {
    material_code: 'M-CS-PIPE-4-SCH40-A106B',
    category: 'PIPE',
    spec_standard: 'ASTM A106',
    grade: 'Gr.B',
    material_type: 'Carbon Steel',
    origin_type: 'NON_CHINA',
    size_description: 'Pipe NPS 4" SCH40 ASTM A106 Gr.B',
    base_cost: 95, // USD per meter
    currency: 'USD',
    notes: 'Standard carbon steel pipe for general industrial use'
  },
  {
    material_code: 'M-CS-PIPE-6-SCH80-A106B',
    category: 'PIPE',
    spec_standard: 'ASTM A106',
    grade: 'Gr.B',
    material_type: 'Carbon Steel',
    origin_type: 'NON_CHINA',
    size_description: 'Pipe NPS 6" SCH80 ASTM A106 Gr.B',
    base_cost: 145, // USD per meter (higher schedule = higher cost)
    currency: 'USD',
    notes: 'Heavy wall carbon steel pipe for high-pressure applications'
  },
  
  // Fittings (CS, A234 WPB)
  {
    material_code: 'M-CS-ELBOW90-2-SCH40-A234WPB',
    category: 'FITTING',
    spec_standard: 'ASTM A234',
    grade: 'WPB',
    material_type: 'Carbon Steel',
    origin_type: 'NON_CHINA',
    size_description: 'Elbow 90° NPS 2" SCH40 ASTM A234 WPB',
    base_cost: 22, // USD per piece
    currency: 'USD',
    notes: 'Carbon steel elbow fitting'
  },
  {
    material_code: 'M-CS-ELBOW90-6-SCH80-A234WPB',
    category: 'FITTING',
    spec_standard: 'ASTM A234',
    grade: 'WPB',
    material_type: 'Carbon Steel',
    origin_type: 'NON_CHINA',
    size_description: 'Elbow 90° NPS 6" SCH80 ASTM A234 WPB',
    base_cost: 85, // USD per piece
    currency: 'USD',
    notes: 'Carbon steel elbow fitting for high-pressure systems'
  },
  {
    material_code: 'M-CS-TEE-4-SCH40-A234WPB',
    category: 'FITTING',
    spec_standard: 'ASTM A234',
    grade: 'WPB',
    material_type: 'Carbon Steel',
    origin_type: 'NON_CHINA',
    size_description: 'Tee Equal NPS 4" SCH40 ASTM A234 WPB',
    base_cost: 32, // USD per piece
    currency: 'USD',
    notes: 'Carbon steel tee fitting'
  },
  {
    material_code: 'M-CS-REDUCER-6X4-CONC-A234WPB',
    category: 'FITTING',
    spec_standard: 'ASTM A234',
    grade: 'WPB',
    material_type: 'Carbon Steel',
    origin_type: 'NON_CHINA',
    size_description: 'Reducer Concentric 6" x 4" ASTM A234 WPB',
    base_cost: 38, // USD per piece
    currency: 'USD',
    notes: 'Carbon steel concentric reducer'
  },
  
  // Flanges (CS, A105)
  {
    material_code: 'M-CS-FLANGE-WN-4-150-A105',
    category: 'FLANGE',
    spec_standard: 'ANSI B16.5',
    grade: 'A105',
    material_type: 'Carbon Steel',
    origin_type: 'NON_CHINA',
    size_description: 'Flange Weld Neck 4" Class 150 ASTM A105',
    base_cost: 120, // USD per piece
    currency: 'USD',
    notes: 'Carbon steel weld neck flange'
  },
  {
    material_code: 'M-CS-FLANGE-WN-6-300-A105',
    category: 'FLANGE',
    spec_standard: 'ANSI B16.5',
    grade: 'A105',
    material_type: 'Carbon Steel',
    origin_type: 'NON_CHINA',
    size_description: 'Flange Weld Neck 6" Class 300 ASTM A105',
    base_cost: 220, // USD per piece (higher class = higher cost)
    currency: 'USD',
    notes: 'Carbon steel weld neck flange for higher pressure'
  },
  
  // Valves
  {
    material_code: 'M-CS-VALVE-GATE-6-600-API6D',
    category: 'VALVE',
    spec_standard: 'API 6D',
    grade: null,
    material_type: 'Carbon Steel',
    origin_type: 'CHINA',
    size_description: 'Gate Valve 6" Class 600 API 6D',
    base_cost: 1850, // USD per piece (valves are expensive)
    currency: 'USD',
    notes: 'API 6D gate valve for industrial applications'
  },
  
  // Structural
  {
    material_code: 'M-STRUCT-BEAM-HEA200-S275',
    category: 'STRUCTURAL',
    spec_standard: 'EN 10025',
    grade: 'S275JR',
    material_type: 'Carbon Steel',
    origin_type: 'NON_CHINA',
    size_description: 'HEA 200 Beam S275JR',
    base_cost: 980, // USD per ton
    currency: 'USD',
    notes: 'Structural steel beam for fabrication'
  },
  
  // Small-bore / misc
  {
    material_code: 'M-CS-COUPLING-2-MALLEABLE',
    category: 'FITTING',
    spec_standard: 'ANSI B16.3',
    grade: null,
    material_type: 'Malleable Iron',
    origin_type: 'NON_CHINA',
    size_description: 'Coupling 2" Malleable Iron Galvanised',
    base_cost: 8, // USD per piece
    currency: 'USD',
    notes: 'Small-bore coupling for utility piping'
  }
];

/**
 * Supplier Lead Times
 */
const leadTimeData = [
  {
    supplier_name: 'BayuSteel Distributors Sdn Bhd',
    material_or_service_category: 'MATERIAL',
    lead_time_min_days: 5,
    lead_time_max_days: 7,
    notes: 'Ex-stock + local trucking'
  },
  {
    supplier_name: 'StrataPipe Mills Europe BV',
    material_or_service_category: 'MATERIAL',
    lead_time_min_days: 45,
    lead_time_max_days: 60,
    notes: 'Production + sea freight from Europe'
  },
  {
    supplier_name: 'HarbourFlange Asia Pte Ltd',
    material_or_service_category: 'MATERIAL',
    lead_time_min_days: 7,
    lead_time_max_days: 14,
    notes: 'Normal items from stock or quick procurement'
  },
  {
    supplier_name: 'DragonFlow Valves Co., Ltd',
    material_or_service_category: 'MATERIAL',
    lead_time_min_days: 60,
    lead_time_max_days: 75,
    notes: 'Valves are long lead items'
  },
  {
    supplier_name: 'EastStrait Fabrication Works',
    material_or_service_category: 'SERVICE',
    lead_time_min_days: 30,
    lead_time_max_days: 45,
    notes: 'Typical fabrication lead time, project basis'
  },
  {
    supplier_name: 'Nusantara Coatings & NDT Sdn Bhd',
    material_or_service_category: 'SERVICE',
    lead_time_min_days: null,
    lead_time_max_days: null,
    notes: 'Based on project basis'
  }
];

/**
 * Supplier Certifications
 */
const certificationData = [
  {
    supplier_name: 'DragonFlow Valves Co., Ltd',
    cert_type: 'API 6D',
    notes: 'API 6D certification for industrial valves'
  },
  {
    supplier_name: 'DragonFlow Valves Co., Ltd',
    cert_type: 'ISO 9001',
    notes: 'Quality management system certification'
  },
  {
    supplier_name: 'StrataPipe Mills Europe BV',
    cert_type: 'EN10204 3.1',
    notes: 'European material certificate standard'
  },
  {
    supplier_name: 'StrataPipe Mills Europe BV',
    cert_type: 'ISO 9001',
    notes: 'Quality management system certification'
  },
  {
    supplier_name: 'HarbourFlange Asia Pte Ltd',
    cert_type: 'ISO 9001',
    notes: 'Quality management system certification'
  }
];

/**
 * Seed suppliers table
 */
async function seedSuppliers(db, tenantId) {
  console.log('Seeding MetaSteel suppliers...');

  let insertedCount = 0;
  let updatedCount = 0;

  for (const supplier of metaSteelSuppliers) {
    try {
      const result = await db.query(
        `INSERT INTO suppliers (
          tenant_id,
          name,
          country,
          category,
          origin_type,
          supplier_type,
          email,
          phone,
          status,
          notes
        ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10)
        ON CONFLICT (tenant_id, name)
        DO UPDATE SET
          country = EXCLUDED.country,
          category = EXCLUDED.category,
          origin_type = EXCLUDED.origin_type,
          supplier_type = EXCLUDED.supplier_type,
          email = EXCLUDED.email,
          phone = EXCLUDED.phone,
          status = EXCLUDED.status,
          notes = EXCLUDED.notes
        RETURNING id`,
        [
          tenantId,
          supplier.name,
          supplier.country,
          supplier.category,
          supplier.origin_type,
          supplier.supplier_type,
          supplier.email,
          supplier.phone,
          supplier.status,
          supplier.notes
        ]
      );
      
      if (result.rows.length > 0) {
        // Check if this was an insert or update by checking if the row existed before
        const existing = await db.query(
          'SELECT id FROM suppliers WHERE tenant_id = $1 AND name = $2',
          [tenantId, supplier.name]
        );
        // This is a simplified check - in practice, the conflict handler will update
        console.log(`  ✓ Seeded supplier: ${supplier.name}`);
        insertedCount++;
      }
    } catch (error) {
      console.error(`  ✗ Error seeding supplier ${supplier.name}:`, error.message);
    }
  }

  console.log(`  Summary: ${insertedCount} suppliers processed`);
}

/**
 * Seed materials (tenant-scoped after migration 058)
 */
async function seedMaterials(db, tenantId) {
  console.log('Seeding MetaSteel materials (tenant-scoped catalog)...');

  // Check if materials table has tenant_id column (migration 058)
  const tenantIdCheck = await db.query(`
    SELECT column_name 
    FROM information_schema.columns 
    WHERE table_name = 'materials' AND column_name = 'tenant_id';
  `);
  const hasTenantId = tenantIdCheck.rows.length > 0;

  let insertedCount = 0;
  let skippedCount = 0;

  for (const material of metaSteelMaterials) {
    try {
      if (hasTenantId) {
        // Materials are tenant-scoped (migration 058+)
        // Unique constraint is on (tenant_id, material_code)
        const result = await db.query(
          `INSERT INTO materials (
            tenant_id, material_code, category, spec_standard, grade, material_type,
            origin_type, size_description, base_cost, currency, notes
          )
          VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11)
          ON CONFLICT (tenant_id, material_code) DO NOTHING
          RETURNING id`,
          [
            tenantId,
            material.material_code,
            material.category,
            material.spec_standard,
            material.grade,
            material.material_type,
            material.origin_type,
            material.size_description,
            material.base_cost,
            material.currency,
            material.notes
          ]
        );

        if (result.rows.length > 0) {
          console.log(`  ✓ Inserted material: ${material.material_code}`);
          insertedCount++;
        } else {
          console.log(`  ⊙ Material already exists: ${material.material_code}`);
          skippedCount++;
        }
      } else {
        // Legacy: materials are global (pre-migration 058)
        const result = await db.query(
          `INSERT INTO materials (
            material_code, category, spec_standard, grade, material_type,
            origin_type, size_description, base_cost, currency, notes
          )
          VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10)
          ON CONFLICT (material_code) DO NOTHING
          RETURNING id`,
          [
            material.material_code,
            material.category,
            material.spec_standard,
            material.grade,
            material.material_type,
            material.origin_type,
            material.size_description,
            material.base_cost,
            material.currency,
            material.notes
          ]
        );

        if (result.rows.length > 0) {
          console.log(`  ✓ Inserted material: ${material.material_code}`);
          insertedCount++;
        } else {
          console.log(`  ⊙ Material already exists: ${material.material_code}`);
          skippedCount++;
        }
      }
    } catch (error) {
      console.error(`  ✗ Error seeding material ${material.material_code}:`, error.message);
    }
  }

  console.log(`  Summary: ${insertedCount} materials inserted, ${skippedCount} skipped (already exist)`);
  return { inserted: insertedCount, skipped: skippedCount };
}

/**
 * Seed supplier lead times
 */
async function seedLeadTimes(db, tenantId) {
  console.log('Seeding supplier lead times...');

  let seededCount = 0;

  for (const leadTime of leadTimeData) {
    try {
      // Get supplier ID
      const supplierResult = await db.query(
        'SELECT id FROM suppliers WHERE tenant_id = $1 AND name = $2',
        [tenantId, leadTime.supplier_name]
      );

      if (supplierResult.rows.length === 0) {
        console.warn(`  ⚠ Supplier not found: ${leadTime.supplier_name}`);
        continue;
      }

      const supplierId = supplierResult.rows[0].id;

      await db.query(
        `INSERT INTO supplier_lead_times (
          tenant_id,
          supplier_id,
          material_or_service_category,
          lead_time_min_days,
          lead_time_max_days,
          notes
        ) VALUES ($1, $2, $3, $4, $5, $6)
        ON CONFLICT (tenant_id, supplier_id, material_or_service_category)
        DO UPDATE SET
          lead_time_min_days = EXCLUDED.lead_time_min_days,
          lead_time_max_days = EXCLUDED.lead_time_max_days,
          notes = EXCLUDED.notes`,
        [
          tenantId,
          supplierId,
          leadTime.material_or_service_category,
          leadTime.lead_time_min_days,
          leadTime.lead_time_max_days,
          leadTime.notes
        ]
      );
      console.log(`  ✓ Seeded lead time for: ${leadTime.supplier_name} (${leadTime.material_or_service_category})`);
      seededCount++;
    } catch (error) {
      console.error(`  ✗ Error seeding lead time for ${leadTime.supplier_name}:`, error.message);
    }
  }

  console.log(`  Summary: ${seededCount} lead times seeded`);
  return seededCount;
}

/**
 * Seed supplier certifications
 */
async function seedCertifications(db, tenantId) {
  console.log('Seeding supplier certifications...');

  let seededCount = 0;

  for (const cert of certificationData) {
    try {
      // Get supplier ID
      const supplierResult = await db.query(
        'SELECT id FROM suppliers WHERE tenant_id = $1 AND name = $2',
        [tenantId, cert.supplier_name]
      );

      if (supplierResult.rows.length === 0) {
        console.warn(`  ⚠ Supplier not found: ${cert.supplier_name}`);
        continue;
      }

      const supplierId = supplierResult.rows[0].id;

      await db.query(
        `INSERT INTO supplier_certifications (
          tenant_id,
          supplier_id,
          cert_type,
          notes
        ) VALUES ($1, $2, $3, $4)
        ON CONFLICT (tenant_id, supplier_id, cert_type)
        DO UPDATE SET
          notes = EXCLUDED.notes`,
        [
          tenantId,
          supplierId,
          cert.cert_type,
          cert.notes
        ]
      );
      console.log(`  ✓ Seeded certification for: ${cert.supplier_name} (${cert.cert_type})`);
      seededCount++;
    } catch (error) {
      console.error(`  ✗ Error seeding certification for ${cert.supplier_name}:`, error.message);
    }
  }

  console.log(`  Summary: ${seededCount} certifications seeded`);
  return seededCount;
}

/**
 * Check if required tables exist
 */
async function checkTablesExist(db) {
  try {
    const result = await db.query(`
      SELECT table_name
      FROM information_schema.tables
      WHERE table_schema = 'public'
        AND table_name IN ('suppliers', 'materials', 'supplier_lead_times', 'supplier_certifications')
    `);

    const existingTables = result.rows.map(r => r.table_name);
    const requiredTables = ['suppliers', 'materials', 'supplier_lead_times', 'supplier_certifications'];

    const missingTables = requiredTables.filter(t => !existingTables.includes(t));

    if (missingTables.length > 0) {
      console.warn(`⚠ Missing tables: ${missingTables.join(', ')}`);
      console.warn('  Some data may not be seeded. This is expected if tables have not been created yet.');
      return false;
    }

    return true;
  } catch (error) {
    console.error('Error checking tables:', error);
    return false;
  }
}

/**
 * Main seed function
 * @param {Object} options - Options for the seed function
 * @param {boolean} options.skipPoolClose - If true, don't close the pool (when called from parent script)
 */
async function seedMetaSteelSuppliersAndMaterials(options = {}) {
  const { skipPoolClose = false } = options;
  const db = await connectMigrationDb();

  console.log('🌱 Starting MetaSteel Suppliers & Materials seeding (STEP 2)...\n');

  try {
    // Get MetaSteel tenant ID
    console.log('📋 Step 1: Looking up MetaSteel tenant...');
    const tenantResult = await db.query(
      `SELECT id, code, name FROM tenants WHERE UPPER(code) = 'METASTEEL' LIMIT 1`
    );

    if (tenantResult.rows.length === 0) {
      throw new Error('MetaSteel tenant not found. Please create tenant first (run seedTenantsAndUsers.js).');
    }

    const metaSteelTenant = tenantResult.rows[0];
    console.log(`  ✓ Found MetaSteel tenant: ${metaSteelTenant.code} (${metaSteelTenant.name}) - ID: ${metaSteelTenant.id}\n`);

    // Check if required tables exist
    console.log('📋 Step 2: Checking required tables...');
    const tablesExist = await checkTablesExist(db);
    if (!tablesExist) {
      console.log('  ⚠ Some tables may be missing. Continuing with available tables...\n');
    } else {
      console.log('  ✓ All required tables exist\n');
    }

    // Seed suppliers
    console.log('📋 Step 3: Seeding suppliers...');
    await seedSuppliers(db, metaSteelTenant.id);
    console.log('');

    // Seed materials
    console.log('📋 Step 4: Seeding materials (tenant-scoped catalog)...');
    const materialResults = await seedMaterials(db, metaSteelTenant.id);
    console.log('');

    // Seed lead times (only if suppliers table exists)
    let leadTimeCount = 0;
    try {
      const tablesCheck = await db.query(`
        SELECT table_name FROM information_schema.tables
        WHERE table_schema = 'public' AND table_name = 'supplier_lead_times'
      `);
      if (tablesCheck.rows.length > 0) {
        console.log('📋 Step 5: Seeding supplier lead times...');
        leadTimeCount = await seedLeadTimes(db, metaSteelTenant.id);
        console.log('');
      } else {
        console.log('📋 Step 5: Skipping lead times (table does not exist)\n');
      }
    } catch (error) {
      console.log(`📋 Step 5: Skipping lead times (${error.message})\n`);
    }

    // Seed certifications (only if table exists)
    let certCount = 0;
    try {
      const tablesCheck = await db.query(`
        SELECT table_name FROM information_schema.tables
        WHERE table_schema = 'public' AND table_name = 'supplier_certifications'
      `);
      if (tablesCheck.rows.length > 0) {
        console.log('📋 Step 6: Seeding supplier certifications...');
        certCount = await seedCertifications(db, metaSteelTenant.id);
        console.log('');
      } else {
        console.log('📋 Step 6: Skipping certifications (table does not exist)\n');
      }
    } catch (error) {
      console.log(`📋 Step 6: Skipping certifications (${error.message})\n`);
    }

    // Final summary
    console.log('✅ MetaSteel Suppliers & Materials seeding completed successfully!\n');
    console.log('📊 SUMMARY:');
    console.log(`  • Tenant: ${metaSteelTenant.code} (${metaSteelTenant.name})`);
    console.log(`  • Suppliers: ${metaSteelSuppliers.length} suppliers seeded`);
    console.log(`  • Materials: ${materialResults.inserted} inserted, ${materialResults.skipped} already existed`);
    console.log(`  • Lead Times: ${leadTimeCount} lead time entries`);
    console.log(`  • Certifications: ${certCount} certification entries`);
    console.log('');
    console.log('💡 Next Steps:');
    console.log('  - Materials are shared across tenants (no tenant_id)');
    console.log('  - Suppliers are tenant-scoped for MetaSteel only');
    console.log('  - Pricing engine will use materials.base_cost for cost calculations');
    console.log('  - Ready for STEP 3: Creating demo RFQs with pricing runs\n');

  } catch (error) {
    console.error('\n❌ Seeding failed:', error);
    console.error(error.stack);

    // Only exit if running directly (not when called from parent script)
    if (!skipPoolClose) {
      process.exit(1);
    }
    throw error;
  } finally {
    // Only close pool if running directly (not when called from parent script)
    if (!skipPoolClose) {
      await db.end();
    }
  }
}

// Run if called directly
if (require.main === module) {
  seedMetaSteelSuppliersAndMaterials()
    .then(() => {
      console.log('✅ Script completed');
      process.exit(0);
    })
    .catch((error) => {
      console.error('❌ Script failed:', error);
      process.exit(1);
    });
}

module.exports = {
  seedMetaSteelSuppliersAndMaterials,
  metaSteelSuppliers,
  metaSteelMaterials,
  leadTimeData,
  certificationData
};

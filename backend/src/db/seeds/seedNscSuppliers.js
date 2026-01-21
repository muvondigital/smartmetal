const { connectDb } = require('../supabaseClient');

/**
 * Seed NSC Suppliers (v0.1)
 *
 * Based on "NSC Supplier Information (Filled).docx"
 *
 * Seeds suppliers, lead times, certifications, and performance data.
 * Does NOT include material prices or service rates (Excel to come later).
 *
 * Last Updated: December 2025
 */

/**
 * Supplier master data from section 2.1/2.2 of the form
 */
const nscSuppliers = [
  // Material Supply - China Origin
  {
    name: 'Ez Steel Industrial Co., Ltd',
    country: 'CHINA',
    category: 'MATERIAL',
    origin_type: 'CHINA',
    supplier_type: 'TRADER',
    email: 'contact@ezsteel.com',
    phone: '+86-xxx-xxxx',
    status: 'ACTIVE',
    notes: 'Piping Material (Carbon Steel & Stainless Steel)'
  },
  {
    name: 'Eastern Steel Manufacturing Co., Ltd',
    country: 'CHINA',
    category: 'MATERIAL',
    origin_type: 'CHINA',
    supplier_type: 'TRADER',
    email: 'contact@easternsteel.com',
    phone: '+86-xxx-xxxx',
    status: 'ACTIVE',
    notes: 'Piping Material (Stainless Steel)'
  },

  // Material Supply - Non-China Origin (Malaysia)
  {
    name: 'Masteel International (M) Sdn Bhd',
    country: 'MALAYSIA',
    category: 'MATERIAL',
    origin_type: 'NON_CHINA',
    supplier_type: 'STOCKIST',
    email: 'contact@masteel.com.my',
    phone: '+60-xxx-xxxx',
    status: 'ACTIVE',
    notes: 'Piping Material - Malaysian origin'
  },

  // Mixed Origin Supplier
  {
    name: 'GlobalSteel Trading Pte Ltd',
    country: 'SINGAPORE',
    category: 'MATERIAL',
    origin_type: 'MIXED',
    supplier_type: 'TRADER',
    email: 'contact@globalsteel.sg',
    phone: '+65-xxx-xxxx',
    status: 'ACTIVE',
    notes: 'Mixed origin - China and Non-China sources'
  },

  // Fabrication Services
  {
    name: 'NSC Fabrication Services',
    country: 'MALAYSIA',
    category: 'SERVICE',
    origin_type: 'NON_CHINA',
    supplier_type: 'FABRICATOR',
    email: 'fab@nscsinergi.com.my',
    phone: '+60-xxx-xxxx',
    status: 'ACTIVE',
    notes: 'Fabrication Services - In-house'
  },

  // Freight/Logistics
  {
    name: 'NSC Logistics Partner',
    country: 'MALAYSIA',
    category: 'FREIGHT',
    origin_type: 'NON_CHINA',
    supplier_type: 'TRADER',
    email: 'logistics@nscsinergi.com.my',
    phone: '+60-xxx-xxxx',
    status: 'ACTIVE',
    notes: 'Freight and logistics services'
  }
];

/**
 * Lead time data from section 5.1
 */
const leadTimeData = [
  {
    supplier_name: 'Ez Steel Industrial Co., Ltd',
    material_or_service_category: 'MATERIAL',
    lead_time_min_days: 6,
    lead_time_max_days: 8,
    notes: 'Ex-stock'
  },
  {
    supplier_name: 'Ez Steel Industrial Co., Ltd',
    material_or_service_category: 'MATERIAL_MILL',
    lead_time_min_days: 30,
    lead_time_max_days: 40,
    notes: 'Ex-Mill'
  },
  {
    supplier_name: 'Eastern Steel Manufacturing Co., Ltd',
    material_or_service_category: 'MATERIAL',
    lead_time_min_days: 6,
    lead_time_max_days: 8,
    notes: 'Ex-stock'
  },
  {
    supplier_name: 'Eastern Steel Manufacturing Co., Ltd',
    material_or_service_category: 'MATERIAL_MILL',
    lead_time_min_days: 30,
    lead_time_max_days: 45,
    notes: 'Ex-Mill'
  },
  {
    supplier_name: 'Masteel International (M) Sdn Bhd',
    material_or_service_category: 'MATERIAL',
    lead_time_min_days: null,
    lead_time_max_days: null,
    notes: 'Based on project basis'
  },
  {
    supplier_name: 'NSC Fabrication Services',
    material_or_service_category: 'SERVICE',
    lead_time_min_days: null,
    lead_time_max_days: null,
    notes: 'Based on project basis'
  }
];

/**
 * Certification data from section 6.1
 */
const certificationData = [
  {
    supplier_name: 'Ez Steel Industrial Co., Ltd',
    cert_type: 'ISO 9001',
    notes: 'Will provide by email; expiry TBA'
  },
  {
    supplier_name: 'Eastern Steel Manufacturing Co., Ltd',
    cert_type: 'ISO 9001',
    notes: 'Will provide by email; expiry TBA'
  }
];

/**
 * Performance data from section 7.1
 */
const performanceData = [
  {
    supplier_name: 'Ez Steel Industrial Co., Ltd',
    on_time_delivery_pct: 100,
    rating: 10,
    notes: 'Good - From NSC Supplier Info form 2025-12-03'
  },
  {
    supplier_name: 'Eastern Steel Manufacturing Co., Ltd',
    on_time_delivery_pct: 100,
    rating: 10,
    notes: 'Good - From NSC Supplier Info form 2025-12-03'
  },
  {
    supplier_name: 'Masteel International (M) Sdn Bhd',
    on_time_delivery_pct: 100,
    rating: 8,
    notes: 'Good - From NSC Supplier Info form 2025-12-03'
  },
  {
    supplier_name: 'GlobalSteel Trading Pte Ltd',
    on_time_delivery_pct: 100,
    rating: 9,
    notes: 'Good - From NSC Supplier Info form 2025-12-03'
  },
  {
    supplier_name: 'NSC Fabrication Services',
    on_time_delivery_pct: 100,
    rating: 10,
    notes: 'Good - From NSC Supplier Info form 2025-12-03'
  },
  {
    supplier_name: 'NSC Logistics Partner',
    on_time_delivery_pct: 100,
    rating: 9,
    notes: 'Good - From NSC Supplier Info form 2025-12-03'
  }
];

/**
 * Seed suppliers table
 */
async function seedSuppliers(db, tenantId) {
  console.log('Seeding NSC suppliers...');

  for (const supplier of nscSuppliers) {
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
      console.log(`  ✓ Seeded supplier: ${supplier.name}`);
    } catch (error) {
      console.error(`  ✗ Error seeding supplier ${supplier.name}:`, error.message);
    }
  }
}

/**
 * Seed supplier lead times
 */
async function seedLeadTimes(db, tenantId) {
  console.log('Seeding supplier lead times...');

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
    } catch (error) {
      console.error(`  ✗ Error seeding lead time for ${leadTime.supplier_name}:`, error.message);
    }
  }
}

/**
 * Seed supplier certifications
 */
async function seedCertifications(db, tenantId) {
  console.log('Seeding supplier certifications...');

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
    } catch (error) {
      console.error(`  ✗ Error seeding certification for ${cert.supplier_name}:`, error.message);
    }
  }
}

/**
 * Seed supplier performance data
 */
async function seedPerformance(db, tenantId) {
  console.log('Seeding supplier performance data...');

  for (const perf of performanceData) {
    try {
      // Get supplier ID
      const supplierResult = await db.query(
        'SELECT id FROM suppliers WHERE tenant_id = $1 AND name = $2',
        [tenantId, perf.supplier_name]
      );

      if (supplierResult.rows.length === 0) {
        console.warn(`  ⚠ Supplier not found: ${perf.supplier_name}`);
        continue;
      }

      const supplierId = supplierResult.rows[0].id;

      await db.query(
        `INSERT INTO supplier_performance (
          tenant_id,
          supplier_id,
          on_time_delivery_pct,
          rating,
          notes
        ) VALUES ($1, $2, $3, $4, $5)
        ON CONFLICT (tenant_id, supplier_id)
        DO UPDATE SET
          on_time_delivery_pct = EXCLUDED.on_time_delivery_pct,
          rating = EXCLUDED.rating,
          notes = EXCLUDED.notes`,
        [
          tenantId,
          supplierId,
          perf.on_time_delivery_pct,
          perf.rating,
          perf.notes
        ]
      );
      console.log(`  ✓ Seeded performance for: ${perf.supplier_name}`);
    } catch (error) {
      console.error(`  ✗ Error seeding performance for ${perf.supplier_name}:`, error.message);
    }
  }
}

/**
 * Main seed function
 */
async function seedNscSuppliers() {
  const db = await connectDb();

  try {
    // Get NSC tenant ID (default tenant)
    const tenantResult = await db.query(
      `SELECT id FROM tenants WHERE slug = 'nsc' OR name ILIKE '%NSC%' LIMIT 1`
    );

    if (tenantResult.rows.length === 0) {
      console.error('NSC tenant not found. Please create tenant first.');
      return;
    }

    const tenantId = tenantResult.rows[0].id;
    console.log(`Using tenant ID: ${tenantId}`);

    // Check if required tables exist
    const tablesExist = await checkTablesExist(db);
    if (!tablesExist) {
      console.error('Required supplier tables do not exist. Seeding skipped.');
      console.log('Note: This is expected if supplier tables have not been created yet.');
      console.log('Supplier data can be seeded later when tables are available.');
      return;
    }

    // Seed all data
    await seedSuppliers(db, tenantId);
    await seedLeadTimes(db, tenantId);
    await seedCertifications(db, tenantId);
    await seedPerformance(db, tenantId);

    console.log('✓ NSC supplier seeding completed successfully');
  } catch (error) {
    console.error('Error seeding NSC suppliers:', error);
    throw error;
  }
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
        AND table_name IN ('suppliers', 'supplier_lead_times', 'supplier_certifications', 'supplier_performance')
    `);

    const existingTables = result.rows.map(r => r.table_name);
    const requiredTables = ['suppliers', 'supplier_lead_times', 'supplier_certifications', 'supplier_performance'];

    const missingTables = requiredTables.filter(t => !existingTables.includes(t));

    if (missingTables.length > 0) {
      console.warn(`Missing tables: ${missingTables.join(', ')}`);
      return false;
    }

    return true;
  } catch (error) {
    console.error('Error checking tables:', error);
    return false;
  }
}

// Run if called directly
if (require.main === module) {
  seedNscSuppliers()
    .then(() => process.exit(0))
    .catch(err => {
      console.error(err);
      process.exit(1);
    });
}

module.exports = {
  seedNscSuppliers,
  nscSuppliers,
  leadTimeData,
  certificationData,
  performanceData
};

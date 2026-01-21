/**
 * Seed NSC Logistics Configuration with HS Codes
 * 
 * Populates NSC's logistics_config in tenant_settings with HS codes
 * from the existing regulatory_hs_codes table (Kastam Malaysia data).
 * 
 * This script:
 * 1. Queries regulatory_hs_codes table to get HS codes by category
 * 2. Maps them to logistics_config.hsCodeMappings structure
 * 3. Updates NSC's tenant_settings with the logistics_config
 * 
 * Other logistics fields (seaFreightRoutes, inlandTruckingZones, dutyRules, dutyExemptions)
 * remain empty/placeholder for NSC to provide later.
 * 
 * Usage: node scripts/seedNscLogisticsConfig.js
 */

require('dotenv').config({ path: require('path').join(__dirname, '../.env') });
const { connectMigrationDb } = require('../src/db/supabaseClient');

/**
 * Query HS codes from regulatory_hs_codes table by category
 */
async function getHsCodesByCategory(db) {
  const query = `
    SELECT 
      hs_code,
      category,
      sub_category,
      description,
      import_duty
    FROM regulatory_hs_codes
    WHERE is_active = true
    ORDER BY category, hs_code
  `;
  
  const result = await db.query(query);
  return result.rows;
}

/**
 * Build HS code mappings from database results
 * Uses standard Kastam Malaysia HS codes with intelligent matching
 */
function buildHsCodeMappings(hsCodes) {
  const mappings = {
    pipes: {},
    fittings: {},
    flanges: null,
    valves: null,
    structural: null
  };

  // Helper to extract base HS code (remove last digits if needed)
  function getBaseHsCode(hsCode) {
    if (!hsCode) return null;
    // Take first 8 digits (e.g., 7304.19.00 -> 7304.19)
    const parts = hsCode.split('.');
    if (parts.length >= 2) {
      return `${parts[0]}.${parts[1]}`;
    }
    return hsCode;
  }

  // Standard HS codes from Kastam Malaysia (fallback if not in DB)
  const standardCodes = {
    pipes: {
      carbon_steel: '7304.19',      // Seamless carbon steel pipes
      stainless_steel: '7304.41',   // Seamless stainless steel pipes
      alloy: '7304.51'              // Seamless alloy steel pipes
    },
    fittings: {
      elbows: '7307.91',           // Carbon steel butt-weld elbows
      tees: '7307.92',              // Carbon steel butt-weld tees
      reducers: '7307.93'           // Carbon steel butt-weld reducers
    },
    flanges: '7307.11',             // Flanges (cast iron/steel)
    valves: '8481.20',              // Valves for oleohydraulic/pneumatic
    structural: '7308.90'            // Structures and parts of structures
  };

  // Process each HS code with priority matching
  for (const code of hsCodes) {
    const baseCode = getBaseHsCode(code.hs_code);
    const category = code.category?.toUpperCase();
    const subCategory = code.sub_category?.toUpperCase() || '';
    const desc = code.description.toLowerCase();

    switch (category) {
      case 'PIPE':
        // Prioritize seamless carbon steel pipes (7304.19)
        if (code.hs_code.startsWith('7304.19') || 
            (desc.includes('seamless') && desc.includes('carbon') && !desc.includes('stainless'))) {
          if (!mappings.pipes.carbon_steel || mappings.pipes.carbon_steel !== '7304.19') {
            mappings.pipes.carbon_steel = '7304.19';
          }
        }
        // Prioritize seamless stainless steel pipes (7304.41)
        else if (code.hs_code.startsWith('7304.41') || 
                 (desc.includes('seamless') && desc.includes('stainless'))) {
          if (!mappings.pipes.stainless_steel || mappings.pipes.stainless_steel !== '7304.41') {
            mappings.pipes.stainless_steel = '7304.41';
          }
        }
        // Stainless steel pipes (welded or other)
        else if (desc.includes('stainless') && !mappings.pipes.stainless_steel) {
          mappings.pipes.stainless_steel = baseCode;
        }
        // High-pressure pipes (often carbon steel)
        else if (desc.includes('high-pressure') || desc.includes('high pressure')) {
          if (!mappings.pipes.carbon_steel) {
            mappings.pipes.carbon_steel = baseCode;
          }
        }
        // Carbon steel (if not already set)
        else if ((desc.includes('carbon') || desc.includes('iron')) && !desc.includes('stainless') && !desc.includes('cast')) {
          if (!mappings.pipes.carbon_steel) {
            mappings.pipes.carbon_steel = baseCode;
          }
        }
        break;

      case 'FITTING':
        // Skip flanges (handled separately)
        if (desc.includes('flange')) {
          break;
        }
        // Steel fittings (7307.xx series)
        if (code.hs_code.startsWith('7307.')) {
          if (!mappings.fittings.elbows) {
            mappings.fittings.elbows = '7307.91';
          }
          if (!mappings.fittings.tees) {
            mappings.fittings.tees = '7307.92';
          }
          if (!mappings.fittings.reducers) {
            mappings.fittings.reducers = '7307.93';
          }
        }
        // Elbows
        else if (desc.includes('elbow') && !mappings.fittings.elbows) {
          mappings.fittings.elbows = baseCode;
        }
        // Tees
        else if (desc.includes('tee') && !mappings.fittings.tees) {
          mappings.fittings.tees = baseCode;
        }
        // Reducers
        else if (desc.includes('reducer') && !mappings.fittings.reducers) {
          mappings.fittings.reducers = baseCode;
        }
        break;

      case 'FLANGE':
        // Prioritize 7307.21 (cast iron/steel flanges)
        if (code.hs_code.startsWith('7307.21')) {
          mappings.flanges = '7307.21';
        }
        // Or 7307.91 (stainless steel flanges)
        else if (code.hs_code.startsWith('7307.91') && !mappings.flanges) {
          mappings.flanges = '7307.91';
        }
        // Or use first available
        else if (!mappings.flanges) {
          mappings.flanges = baseCode;
        }
        break;

      case 'VALVE':
        // Prioritize 8481.20 (oleohydraulic/pneumatic valves)
        if (code.hs_code.startsWith('8481.20')) {
          mappings.valves = '8481.20';
        }
        // Or use first available
        else if (!mappings.valves) {
          mappings.valves = baseCode;
        }
        break;

      case 'STEEL':
      case 'PLATE':
        // Structural items
        if (code.hs_code.startsWith('7308.90') && !mappings.structural) {
          mappings.structural = '7308.90';
        } else if (!mappings.structural) {
          mappings.structural = baseCode;
        }
        break;
    }
  }

  // Apply standard codes as fallback if not found in database
  if (!mappings.pipes.carbon_steel) mappings.pipes.carbon_steel = standardCodes.pipes.carbon_steel;
  if (!mappings.pipes.stainless_steel) mappings.pipes.stainless_steel = standardCodes.pipes.stainless_steel;
  if (!mappings.pipes.alloy) mappings.pipes.alloy = standardCodes.pipes.alloy;
  if (!mappings.fittings.elbows) mappings.fittings.elbows = standardCodes.fittings.elbows;
  if (!mappings.fittings.tees) mappings.fittings.tees = standardCodes.fittings.tees;
  if (!mappings.fittings.reducers) mappings.fittings.reducers = standardCodes.fittings.reducers;
  if (!mappings.flanges) mappings.flanges = standardCodes.flanges;
  if (!mappings.valves) mappings.valves = standardCodes.valves;
  if (!mappings.structural) mappings.structural = standardCodes.structural;

  return mappings;
}

/**
 * Upsert tenant setting
 */
async function upsertTenantSetting(db, tenantId, key, value) {
  await db.query(`
    INSERT INTO tenant_settings (tenant_id, key, value)
    VALUES ($1, $2, $3::jsonb)
    ON CONFLICT (tenant_id, key) DO UPDATE
    SET value = EXCLUDED.value,
        updated_at = NOW();
  `, [tenantId, key, JSON.stringify(value)]);
}

/**
 * Main function
 */
async function seedNscLogisticsConfig() {
  const db = await connectMigrationDb();

  console.log('='.repeat(80));
  console.log('NSC LOGISTICS CONFIGURATION SEEDER');
  console.log('='.repeat(80));
  console.log('');

  try {
    // 1. Get NSC tenant ID
    console.log('📋 Step 1: Looking up NSC tenant...');
    const tenantResult = await db.query(
      `SELECT id, code, name FROM tenants WHERE code = 'nsc' LIMIT 1`
    );

    if (tenantResult.rows.length === 0) {
      throw new Error('NSC tenant not found. Please run seedTenantsAndUsers.js first.');
    }

    const nscTenant = tenantResult.rows[0];
    console.log(`  ✓ Found NSC tenant: ${nscTenant.code} (${nscTenant.name}) - ID: ${nscTenant.id}\n`);

    // 2. Query HS codes from database
    console.log('📋 Step 2: Querying HS codes from regulatory_hs_codes table...');
    const hsCodes = await getHsCodesByCategory(db);
    console.log(`  ✓ Found ${hsCodes.length} HS codes in database\n`);

    if (hsCodes.length === 0) {
      console.warn('  ⚠️  Warning: No HS codes found in regulatory_hs_codes table.');
      console.warn('  ⚠️  Using default HS codes from Kastam Malaysia standards.\n');
    }

    // 3. Build HS code mappings
    console.log('📋 Step 3: Building HS code mappings...');
    const hsCodeMappings = buildHsCodeMappings(hsCodes);
    console.log('  ✓ HS code mappings built:');
    console.log(`    • Pipes - Carbon Steel: ${hsCodeMappings.pipes.carbon_steel}`);
    console.log(`    • Pipes - Stainless Steel: ${hsCodeMappings.pipes.stainless_steel}`);
    console.log(`    • Pipes - Alloy: ${hsCodeMappings.pipes.alloy}`);
    console.log(`    • Fittings - Elbows: ${hsCodeMappings.fittings.elbows}`);
    console.log(`    • Fittings - Tees: ${hsCodeMappings.fittings.tees}`);
    console.log(`    • Fittings - Reducers: ${hsCodeMappings.fittings.reducers}`);
    console.log(`    • Flanges: ${hsCodeMappings.flanges}`);
    console.log(`    • Valves: ${hsCodeMappings.valves}`);
    console.log(`    • Structural: ${hsCodeMappings.structural}\n`);

    // 4. Build logistics config
    console.log('📋 Step 4: Building logistics configuration...');
    const logisticsConfig = {
      // HS Code mappings (populated from database)
      hsCodeMappings: hsCodeMappings,
      
      // Sea freight routes (empty - requires NSC input)
      seaFreightRoutes: {},
      
      // Inland trucking zones (empty - requires NSC input)
      inlandTruckingZones: {},
      
      // Duty rules (empty - requires NSC input)
      dutyRules: {},
      
      // Duty exemptions (empty - requires NSC input)
      dutyExemptions: [],
      
      // Metadata
      _metadata: {
        hsCodesSource: 'regulatory_hs_codes (Kastam Malaysia)',
        hsCodesPopulatedAt: new Date().toISOString(),
        note: 'HS codes populated from existing database. Other fields require NSC input.'
      }
    };

    console.log('  ✓ Logistics configuration built\n');

    // 5. Save to tenant_settings
    console.log('📋 Step 5: Saving logistics configuration to tenant_settings...');
    await upsertTenantSetting(db, nscTenant.id, 'logistics_config', logisticsConfig);
    console.log('  ✓ Logistics configuration saved\n');

    console.log('='.repeat(80));
    console.log('✅ NSC LOGISTICS CONFIGURATION SEEDING COMPLETED');
    console.log('='.repeat(80));
    console.log('');
    console.log('📊 Summary:');
    console.log(`  • Tenant: ${nscTenant.code} (${nscTenant.name})`);
    console.log(`  • HS Codes: ${hsCodes.length} codes queried from database`);
    console.log(`  • HS Code Mappings: Configured for all categories`);
    console.log(`  • Sea Freight Routes: Empty (requires NSC input)`);
    console.log(`  • Inland Trucking Zones: Empty (requires NSC input)`);
    console.log(`  • Duty Rules: Empty (requires NSC input)`);
    console.log(`  • Duty Exemptions: Empty (requires NSC input)`);
    console.log('');
    console.log('💡 Next Steps:');
    console.log('  • NSC needs to provide: sea freight routes, trucking zones, duty rules, duty exemptions');
    console.log('  • HS codes can be updated if NSC has different codes for specific materials');
    console.log('');

  } catch (error) {
    console.error('\n❌ Seeding failed:', error);
    console.error(error.stack);
    throw error;
  } finally {
    await db.end();
  }
}

// Run if called directly
if (require.main === module) {
  seedNscLogisticsConfig()
    .then(() => {
      console.log('✅ Script completed');
      process.exit(0);
    })
    .catch((error) => {
      console.error('❌ Script failed:', error);
      process.exit(1);
    });
}

module.exports = { seedNscLogisticsConfig };

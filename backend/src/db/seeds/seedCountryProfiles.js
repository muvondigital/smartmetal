/**
 * Seed Country Profiles
 *
 * Part of Phase 10: Country-Specific Regulatory Profiles
 *
 * Seeds initial country profiles for:
 * - Malaysia (MY) - Primary system
 * - Key trading partners (ASEAN, RCEP countries)
 *
 * Each country profile includes:
 * - HS code system identifier
 * - Default trade agreements
 * - Country-specific duty calculation rules
 */

const { connectDb } = require('../supabaseClient');
const { log } = require('../../utils/logger');

/**
 * Initial country profiles data
 */
const COUNTRY_PROFILES = [
  {
    country_code: 'MY',
    country_name: 'Malaysia',
    hs_code_system: 'MY_HS_2025',
    default_trade_agreements: ['ASEAN', 'RCEP', 'CPTPP'],
    duty_calculation_rules: {
      use_preferential_rates: true,
      apply_regulatory_overrides: true,
      version: '2025.01',
    },
    notes: 'Primary Malaysian HS code system with ASEAN and RCEP preferential trade agreements',
    is_active: true,
  },
  {
    country_code: 'TH',
    country_name: 'Thailand',
    hs_code_system: 'TH_HS_2025',
    default_trade_agreements: ['ASEAN', 'RCEP'],
    duty_calculation_rules: {
      use_preferential_rates: true,
      apply_regulatory_overrides: true,
    },
    notes: 'Thailand HS code system (ASEAN member)',
    is_active: true,
  },
  {
    country_code: 'SG',
    country_name: 'Singapore',
    hs_code_system: 'SG_HS_2025',
    default_trade_agreements: ['ASEAN', 'RCEP', 'CPTPP'],
    duty_calculation_rules: {
      use_preferential_rates: true,
      apply_regulatory_overrides: true,
    },
    notes: 'Singapore HS code system (ASEAN member, free port)',
    is_active: true,
  },
  {
    country_code: 'ID',
    country_name: 'Indonesia',
    hs_code_system: 'ID_HS_2025',
    default_trade_agreements: ['ASEAN', 'RCEP'],
    duty_calculation_rules: {
      use_preferential_rates: true,
      apply_regulatory_overrides: true,
    },
    notes: 'Indonesia HS code system (ASEAN member)',
    is_active: true,
  },
  {
    country_code: 'VN',
    country_name: 'Vietnam',
    hs_code_system: 'VN_HS_2025',
    default_trade_agreements: ['ASEAN', 'RCEP', 'CPTPP'],
    duty_calculation_rules: {
      use_preferential_rates: true,
      apply_regulatory_overrides: true,
    },
    notes: 'Vietnam HS code system (ASEAN member)',
    is_active: true,
  },
  {
    country_code: 'PH',
    country_name: 'Philippines',
    hs_code_system: 'PH_HS_2025',
    default_trade_agreements: ['ASEAN', 'RCEP'],
    duty_calculation_rules: {
      use_preferential_rates: true,
      apply_regulatory_overrides: true,
    },
    notes: 'Philippines HS code system (ASEAN member)',
    is_active: true,
  },
  {
    country_code: 'CN',
    country_name: 'China',
    hs_code_system: 'CN_HS_2025',
    default_trade_agreements: ['RCEP', 'ACFTA'],
    duty_calculation_rules: {
      use_preferential_rates: true,
      apply_regulatory_overrides: true,
      special_notes: 'May have additional surcharges on certain categories',
    },
    notes: 'China HS code system (RCEP member)',
    is_active: true,
  },
  {
    country_code: 'JP',
    country_name: 'Japan',
    hs_code_system: 'JP_HS_2025',
    default_trade_agreements: ['RCEP', 'CPTPP'],
    duty_calculation_rules: {
      use_preferential_rates: true,
      apply_regulatory_overrides: true,
    },
    notes: 'Japan HS code system (RCEP member)',
    is_active: true,
  },
  {
    country_code: 'KR',
    country_name: 'South Korea',
    hs_code_system: 'KR_HS_2025',
    default_trade_agreements: ['RCEP', 'AKFTA'],
    duty_calculation_rules: {
      use_preferential_rates: true,
      apply_regulatory_overrides: true,
    },
    notes: 'South Korea HS code system (RCEP member)',
    is_active: true,
  },
  {
    country_code: 'US',
    country_name: 'United States',
    hs_code_system: 'US_HTS_2025',
    default_trade_agreements: ['MFN'],
    duty_calculation_rules: {
      use_preferential_rates: false,
      apply_regulatory_overrides: true,
      special_notes: 'Uses HTS (Harmonized Tariff Schedule) system',
    },
    notes: 'United States HTS system (Most Favored Nation rates)',
    is_active: true,
  },
  {
    country_code: 'AU',
    country_name: 'Australia',
    hs_code_system: 'AU_HS_2025',
    default_trade_agreements: ['RCEP', 'AANZFTA'],
    duty_calculation_rules: {
      use_preferential_rates: true,
      apply_regulatory_overrides: true,
    },
    notes: 'Australia HS code system (RCEP member)',
    is_active: true,
  },
  {
    country_code: 'NZ',
    country_name: 'New Zealand',
    hs_code_system: 'NZ_HS_2025',
    default_trade_agreements: ['RCEP', 'AANZFTA'],
    duty_calculation_rules: {
      use_preferential_rates: true,
      apply_regulatory_overrides: true,
    },
    notes: 'New Zealand HS code system (RCEP member)',
    is_active: true,
  },
];

/**
 * Seed country profiles into the database
 */
async function seedCountryProfiles() {
  const db = await connectDb();

  log.logInfo('Seeding country profiles...');

  try {
    await db.query('BEGIN');

    let insertedCount = 0;
    let updatedCount = 0;
    let skippedCount = 0;

    for (const profile of COUNTRY_PROFILES) {
      try {
        // Check if country profile already exists
        const existingResult = await db.query(
          `SELECT id FROM regulatory_country_profiles WHERE country_code = $1`,
          [profile.country_code]
        );

        if (existingResult.rows.length > 0) {
          // Update existing profile
          await db.query(
            `UPDATE regulatory_country_profiles
             SET 
               country_name = $1,
               hs_code_system = $2,
               default_trade_agreements = $3,
               duty_calculation_rules = $4,
               notes = $5,
               is_active = $6,
               updated_at = NOW()
             WHERE country_code = $7`,
            [
              profile.country_name,
              profile.hs_code_system,
              JSON.stringify(profile.default_trade_agreements),
              JSON.stringify(profile.duty_calculation_rules),
              profile.notes,
              profile.is_active,
              profile.country_code,
            ]
          );
          updatedCount++;
          log.logInfo(`Updated country profile: ${profile.country_code} - ${profile.country_name}`);
        } else {
          // Insert new profile
          await db.query(
            `INSERT INTO regulatory_country_profiles (
              country_code,
              country_name,
              hs_code_system,
              default_trade_agreements,
              duty_calculation_rules,
              notes,
              is_active
            )
            VALUES ($1, $2, $3, $4, $5, $6, $7)`,
            [
              profile.country_code,
              profile.country_name,
              profile.hs_code_system,
              JSON.stringify(profile.default_trade_agreements),
              JSON.stringify(profile.duty_calculation_rules),
              profile.notes,
              profile.is_active,
            ]
          );
          insertedCount++;
          log.logInfo(`Inserted country profile: ${profile.country_code} - ${profile.country_name}`);
        }
      } catch (error) {
        log.logError(`Error seeding country profile ${profile.country_code}:`, {
          error: error.message,
          profile,
        });
        skippedCount++;
      }
    }

    await db.query('COMMIT');

    const summary = {
      inserted: insertedCount,
      updated: updatedCount,
      skipped: skippedCount,
      total: COUNTRY_PROFILES.length,
    };

    log.logInfo('✅ Country profiles seeded successfully', summary);
    return summary;
  } catch (error) {
    await db.query('ROLLBACK');
    log.logError('Failed to seed country profiles:', { error: error.message });
    throw error;
  }
}

/**
 * CLI execution
 */
if (require.main === module) {
  seedCountryProfiles()
    .then((result) => {
      console.log('\n✅ Country profiles seeding completed:');
      console.log(`   - Inserted: ${result.inserted}`);
      console.log(`   - Updated: ${result.updated}`);
      console.log(`   - Skipped: ${result.skipped}`);
      console.log(`   - Total: ${result.total}`);
      process.exit(0);
    })
    .catch((error) => {
      console.error('\n❌ Country profiles seeding failed:', error.message);
      process.exit(1);
    });
}

module.exports = { seedCountryProfiles, COUNTRY_PROFILES };


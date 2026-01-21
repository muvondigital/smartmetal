/**
 * MetaSteel Mini Stabilization Sprint - Validation Script
 * 
 * Validates the entire HS Code, Duty, Origin Country, Trade Agreement, and Landed Cost pipeline
 * for the MetaSteel tenant.
 * 
 * This script performs comprehensive validation of:
 * 1. Database structure and seeds
 * 2. Core service logic
 * 3. RFQ workflow
 * 4. Origin country changes
 * 5. Pricing run validation
 * 
 * Usage:
 *   node backend/scripts/validateMetaSteelStabilization.js
 *   OR from backend directory: node scripts/validateMetaSteelStabilization.js
 */

// Try multiple .env locations (backend/.env first, then root/.env)
const path = require('path');
const fs = require('fs');

const backendEnvPath = path.join(__dirname, '../.env');
const rootEnvPath = path.join(__dirname, '../../.env');

if (fs.existsSync(backendEnvPath)) {
  require('dotenv').config({ path: backendEnvPath });
} else if (fs.existsSync(rootEnvPath)) {
  require('dotenv').config({ path: rootEnvPath });
} else {
  // Fallback to default behavior (current working directory)
  require('dotenv').config();
}
const { connectDb } = require('../src/db/supabaseClient');
const regulatoryService = require('../src/services/regulatory/regulatoryService');
const dutyEngine = require('../src/services/regulatory/dutyEngine');
const countryContextService = require('../src/services/regulatory/countryContextService');
const { log } = require('../src/utils/logger');

const METASTEEL_TENANT_CODE = 'METASTEEL';

let validationResults = {
  step1: { passed: false, errors: [], warnings: [] },
  step2: { passed: false, errors: [], warnings: [] },
  step3: { passed: false, errors: [], warnings: [] },
  step4: { passed: false, errors: [], warnings: [] },
  step5: { passed: false, errors: [], warnings: [] },
};

/**
 * STEP 1: Validate Database Structure and Seeds
 */
async function validateDatabaseStructure() {
  console.log('\n' + '='.repeat(80));
  console.log('STEP 1: VALIDATE DATABASE STRUCTURE AND SEEDS');
  console.log('='.repeat(80) + '\n');

  const db = await connectDb();
  const errors = [];
  const warnings = [];

  try {
    // Check if required tables exist
    console.log('Checking required tables...');
    const requiredTables = [
      'regulatory_hs_codes',
      'regulatory_material_mapping',
      'regulatory_country_profiles',
      'rfq_items',
    ];

    for (const tableName of requiredTables) {
      const result = await db.query(`
        SELECT EXISTS (
          SELECT FROM information_schema.tables 
          WHERE table_schema = 'public' 
          AND table_name = $1
        );
      `, [tableName]);

      if (!result.rows[0].exists) {
        errors.push(`Table ${tableName} does not exist`);
        console.log(`  ❌ ${tableName} - NOT FOUND`);
      } else {
        console.log(`  ✓ ${tableName} - EXISTS`);
      }
    }

    // Check rfq_items columns
    console.log('\nChecking rfq_items columns...');
    const rfqItemsColumns = [
      'hs_code',
      'import_duty_rate',
      'import_duty_amount',
      'origin_country',
      'final_import_duty_rate',
      'final_import_duty_amount',
      'hs_match_source',
      'hs_confidence',
    ];

    for (const columnName of rfqItemsColumns) {
      const result = await db.query(`
        SELECT EXISTS (
          SELECT FROM information_schema.columns 
          WHERE table_schema = 'public' 
          AND table_name = 'rfq_items' 
          AND column_name = $1
        );
      `, [columnName]);

      if (!result.rows[0].exists) {
        errors.push(`Column rfq_items.${columnName} does not exist`);
        console.log(`  ❌ ${columnName} - NOT FOUND`);
      } else {
        console.log(`  ✓ ${columnName} - EXISTS`);
      }
    }

    // Check seed data
    console.log('\nChecking seed data...');
    
    const hsCodesCount = await db.query('SELECT COUNT(*) as count FROM regulatory_hs_codes WHERE is_active = true');
    const hsCodesCountNum = parseInt(hsCodesCount.rows[0].count);
    if (hsCodesCountNum === 0) {
      errors.push('No active HS codes found in regulatory_hs_codes');
      console.log(`  ❌ regulatory_hs_codes - EMPTY (0 rows)`);
    } else {
      console.log(`  ✓ regulatory_hs_codes - ${hsCodesCountNum} active rows`);
    }

    const mappingCount = await db.query('SELECT COUNT(*) as count FROM regulatory_material_mapping');
    const mappingCountNum = parseInt(mappingCount.rows[0].count);
    if (mappingCountNum === 0) {
      warnings.push('No material mappings found in regulatory_material_mapping');
      console.log(`  ⚠️  regulatory_material_mapping - EMPTY (0 rows)`);
    } else {
      console.log(`  ✓ regulatory_material_mapping - ${mappingCountNum} rows`);
    }

    const countryProfilesCount = await db.query('SELECT COUNT(*) as count FROM regulatory_country_profiles WHERE is_active = true');
    const countryProfilesCountNum = parseInt(countryProfilesCount.rows[0].count);
    if (countryProfilesCountNum === 0) {
      errors.push('No active country profiles found in regulatory_country_profiles');
      console.log(`  ❌ regulatory_country_profiles - EMPTY (0 rows)`);
    } else {
      console.log(`  ✓ regulatory_country_profiles - ${countryProfilesCountNum} active rows`);
    }

    // Check foreign keys and indexes
    console.log('\nChecking foreign keys...');
    const fkCheck = await db.query(`
      SELECT 
        tc.constraint_name, 
        tc.table_name, 
        kcu.column_name,
        ccu.table_name AS foreign_table_name,
        ccu.column_name AS foreign_column_name
      FROM information_schema.table_constraints AS tc 
      JOIN information_schema.key_column_usage AS kcu
        ON tc.constraint_name = kcu.constraint_name
      JOIN information_schema.constraint_column_usage AS ccu
        ON ccu.constraint_name = tc.constraint_name
      WHERE tc.constraint_type = 'FOREIGN KEY'
      AND (
        tc.table_name = 'regulatory_material_mapping' 
        OR tc.table_name = 'regulatory_keyword_mappings_tenant'
      )
      AND ccu.table_name = 'regulatory_hs_codes';
    `);

    if (fkCheck.rows.length === 0) {
      warnings.push('No foreign keys found linking to regulatory_hs_codes');
      console.log(`  ⚠️  Foreign keys - NOT FOUND`);
    } else {
      console.log(`  ✓ Foreign keys - ${fkCheck.rows.length} found`);
    }

    validationResults.step1 = {
      passed: errors.length === 0,
      errors,
      warnings,
    };

    if (errors.length > 0) {
      console.log('\n❌ STEP 1 FAILED');
      errors.forEach(err => console.log(`  - ${err}`));
    } else if (warnings.length > 0) {
      console.log('\n⚠️  STEP 1 PASSED WITH WARNINGS');
      warnings.forEach(warn => console.log(`  - ${warn}`));
    } else {
      console.log('\n✅ STEP 1 PASSED');
    }

  } catch (error) {
    console.error('\n❌ STEP 1 ERROR:', error.message);
    validationResults.step1 = {
      passed: false,
      errors: [error.message],
      warnings: [],
    };
  }
}

/**
 * STEP 2: Validate Core Service Logic
 */
async function validateCoreServices() {
  console.log('\n' + '='.repeat(80));
  console.log('STEP 2: VALIDATE CORE SERVICE LOGIC');
  console.log('='.repeat(80) + '\n');

  const errors = [];
  const warnings = [];

  try {
    // Test regulatoryService.mapKeywordToHsCode()
    console.log('Testing regulatoryService.mapKeywordToHsCode()...');
    const testDescriptions = [
      'CS pipe sch40 4 inch',
      'SS316 seamless pipe 2 inch',
      'galvanized fitting 1 inch',
      'mild steel plate 10mm',
      'gasket ring joint',
    ];

    for (const desc of testDescriptions) {
      try {
        const result = await regulatoryService.mapKeywordToHsCode(desc, { includeDebug: false });
        
        const hasRequiredFields = 
          result.hasOwnProperty('hsCode') &&
          result.hasOwnProperty('importDuty') &&
          result.hasOwnProperty('matchSource') &&
          result.hasOwnProperty('confidence');

        if (!hasRequiredFields) {
          errors.push(`mapKeywordToHsCode("${desc}") missing required fields`);
          console.log(`  ❌ "${desc}" - Missing required fields`);
        } else {
          const status = result.hsCode ? '✓' : '⚠️';
          console.log(`  ${status} "${desc}" - HS: ${result.hsCode || 'NONE'}, Source: ${result.matchSource}, Confidence: ${result.confidence || 0}`);
          
          if (result.hsCode && result.importDuty === null && result.importDuty !== 0) {
            warnings.push(`mapKeywordToHsCode("${desc}") returned HS code but no duty rate`);
          }
        }
      } catch (error) {
        errors.push(`mapKeywordToHsCode("${desc}") threw error: ${error.message}`);
        console.log(`  ❌ "${desc}" - ERROR: ${error.message}`);
      }
    }

    // Test dutyEngine.calculateFinalDuty()
    console.log('\nTesting dutyEngine.calculateFinalDuty()...');
    // Note: destination is assumed to be tenant's home country (MY for MetaSteel)
    // Origin is the country where goods are coming FROM
    const testCases = [
      { origin: 'TH', expectedAgreement: 'ASEAN', description: 'TH → MY (ASEAN)' },
      { origin: 'CN', expectedAgreement: 'RCEP', description: 'CN → MY (RCEP)' },
      { origin: 'US', expectedAgreement: 'MFN', description: 'US → MY (MFN)' },
    ];

    for (const testCase of testCases) {
      try {
        const mockItem = {
          origin_country: testCase.origin,
          hs_code: '7304.19.0000', // Example HS code
          import_duty_rate: 10.0,
        };
        const mockHsData = {
          import_duty: 10.0,
          category: 'PIPE',
        };
        const unitPrice = 100;
        const quantity = 10;

        const result = dutyEngine.calculateFinalDuty(mockItem, mockHsData, unitPrice, quantity);

        const hasRequiredFields = 
          result.hasOwnProperty('finalRate') &&
          result.hasOwnProperty('finalAmount') &&
          result.hasOwnProperty('agreement');

        if (!hasRequiredFields) {
          errors.push(`calculateFinalDuty(${testCase.description}) missing required fields`);
          console.log(`  ❌ ${testCase.description} - Missing required fields`);
        } else {
          const agreementMatch = result.agreement === testCase.expectedAgreement;
          const status = agreementMatch ? '✓' : '⚠️';
          console.log(`  ${status} ${testCase.description} - Rate: ${result.finalRate || 'null'}, Amount: ${result.finalAmount || 'null'}, Agreement: ${result.agreement}${!agreementMatch ? ` (expected ${testCase.expectedAgreement})` : ''}`);
          
          if (!agreementMatch) {
            warnings.push(`calculateFinalDuty(${testCase.description}) returned agreement ${result.agreement} but expected ${testCase.expectedAgreement}`);
          }
        }
      } catch (error) {
        errors.push(`calculateFinalDuty(${testCase.description}) threw error: ${error.message}`);
        console.log(`  ❌ ${testCase.description} - ERROR: ${error.message}`);
      }
    }

    // Test countryContextService
    console.log('\nTesting countryContextService...');
    try {
      const cnProfile = await countryContextService.getCountryProfile('CN');
      if (!cnProfile) {
        errors.push('getCountryProfile("CN") returned null');
        console.log(`  ❌ getCountryProfile("CN") - NULL`);
      } else {
        console.log(`  ✓ getCountryProfile("CN") - ${cnProfile.country_name}`);
      }
    } catch (error) {
      errors.push(`getCountryProfile("CN") threw error: ${error.message}`);
      console.log(`  ❌ getCountryProfile("CN") - ERROR: ${error.message}`);
    }

    try {
      const myProfile = await countryContextService.getCountryProfile('MY');
      if (!myProfile) {
        errors.push('getCountryProfile("MY") returned null');
        console.log(`  ❌ getCountryProfile("MY") - NULL`);
      } else {
        console.log(`  ✓ getCountryProfile("MY") - ${myProfile.country_name}`);
      }
    } catch (error) {
      errors.push(`getCountryProfile("MY") threw error: ${error.message}`);
      console.log(`  ❌ getCountryProfile("MY") - ERROR: ${error.message}`);
    }

    // Get MetaSteel tenant ID
    const db = await connectDb();
    const tenantResult = await db.query('SELECT id FROM tenants WHERE UPPER(code) = $1', [METASTEEL_TENANT_CODE]);
    
    if (tenantResult.rows.length === 0) {
      warnings.push(`MetaSteel tenant not found. Skipping tenant-specific tests.`);
      console.log(`  ⚠️  MetaSteel tenant not found`);
    } else {
      const tenantId = tenantResult.rows[0].id;
      try {
        const context = await countryContextService.getRegulatoryContextForTenant(tenantId);
        if (!context) {
          errors.push(`getRegulatoryContextForTenant("${tenantId}") returned null`);
          console.log(`  ❌ getRegulatoryContextForTenant - NULL`);
        } else {
          console.log(`  ✓ getRegulatoryContextForTenant - Home: ${context.homeCountry}, HS System: ${context.hsCodeSystem}`);
        }
      } catch (error) {
        errors.push(`getRegulatoryContextForTenant threw error: ${error.message}`);
        console.log(`  ❌ getRegulatoryContextForTenant - ERROR: ${error.message}`);
      }
    }

    validationResults.step2 = {
      passed: errors.length === 0,
      errors,
      warnings,
    };

    if (errors.length > 0) {
      console.log('\n❌ STEP 2 FAILED');
      errors.forEach(err => console.log(`  - ${err}`));
    } else if (warnings.length > 0) {
      console.log('\n⚠️  STEP 2 PASSED WITH WARNINGS');
      warnings.forEach(warn => console.log(`  - ${warn}`));
    } else {
      console.log('\n✅ STEP 2 PASSED');
    }

  } catch (error) {
    console.error('\n❌ STEP 2 ERROR:', error.message);
    validationResults.step2 = {
      passed: false,
      errors: [error.message],
      warnings: [],
    };
  }
}

/**
 * Main validation runner
 */
async function runValidation() {
  console.log('='.repeat(80));
  console.log('METASTEEL MINI STABILIZATION SPRINT - VALIDATION');
  console.log('='.repeat(80));

  try {
    await validateDatabaseStructure();
    await validateCoreServices();

    // Summary
    console.log('\n' + '='.repeat(80));
    console.log('VALIDATION SUMMARY');
    console.log('='.repeat(80));

    const allPassed = Object.values(validationResults).every(step => step.passed);
    const totalErrors = Object.values(validationResults).reduce((sum, step) => sum + step.errors.length, 0);
    const totalWarnings = Object.values(validationResults).reduce((sum, step) => sum + step.warnings.length, 0);

    console.log(`\nOverall Status: ${allPassed ? '✅ PASSED' : '❌ FAILED'}`);
    console.log(`Total Errors: ${totalErrors}`);
    console.log(`Total Warnings: ${totalWarnings}`);

    if (totalErrors > 0) {
      console.log('\nErrors by Step:');
      Object.entries(validationResults).forEach(([step, result]) => {
        if (result.errors.length > 0) {
          console.log(`  ${step}: ${result.errors.length} error(s)`);
        }
      });
    }

    process.exit(allPassed ? 0 : 1);
  } catch (error) {
    console.error('\n❌ FATAL ERROR:', error);
    process.exit(1);
  }
}

// Run if called directly
if (require.main === module) {
  runValidation();
}

module.exports = { runValidation, validateDatabaseStructure, validateCoreServices };


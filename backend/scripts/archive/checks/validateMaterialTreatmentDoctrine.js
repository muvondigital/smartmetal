/**
 * Material Treatment Doctrine v1 - End-to-End Validation Script
 * 
 * SAFETY FIRST: This script validates the doctrine implementation without
 * risking the wrong database or environment.
 * 
 * Steps:
 * 1. Identify active database environment (read-only)
 * 2. Verify doctrine schema presence (read-only)
 * 3. Migration decision gate (only if safe)
 * 4. Doctrine execution validation
 * 5. Human-alignment assessment
 * 6. Final safety report
 */

require('dotenv').config();
const { Pool } = require('pg');
const { config } = require('../src/config/env');

// Color codes for terminal output
const colors = {
  reset: '\x1b[0m',
  bright: '\x1b[1m',
  red: '\x1b[31m',
  green: '\x1b[32m',
  yellow: '\x1b[33m',
  blue: '\x1b[34m',
  cyan: '\x1b[36m',
};

function log(message, color = 'reset') {
  console.log(`${colors[color]}${message}${colors.reset}`);
}

function logSection(title) {
  console.log('');
  log('='.repeat(70), 'bright');
  log(title, 'bright');
  log('='.repeat(70), 'bright');
  console.log('');
}

// ============================================================================
// STEP 1: Identify Active Database Environment
// ============================================================================

async function identifyEnvironment(pool) {
  logSection('STEP 1: IDENTIFYING ACTIVE DATABASE ENVIRONMENT');
  
  try {
    // Get database connection info
    const envInfo = await pool.query(`
      SELECT 
        current_database() as database_name,
        current_user as current_user,
        inet_server_addr() as host,
        inet_server_port() as port
    `);
    
    const info = envInfo.rows[0];
    
    log('📊 Database Connection Information:', 'cyan');
    console.log(`   Database Name: ${info.database_name}`);
    console.log(`   Current User: ${info.current_user}`);
    console.log(`   Host: ${info.host || 'localhost'}`);
    console.log(`   Port: ${info.port || '5432'}`);
    console.log('');
    
    // Get environment variables
    log('🔧 Environment Configuration:', 'cyan');
    console.log(`   NODE_ENV: ${process.env.NODE_ENV || 'not set'}`);
    
    // Mask DATABASE_URL password
    const dbUrl = process.env.DATABASE_URL || 
                  process.env.PG_CONNECTION_STRING || 
                  process.env.SUPABASE_DB_URL || 
                  'not set';
    const maskedUrl = dbUrl.replace(/:[^:@]+@/, ':***@');
    console.log(`   DATABASE_URL: ${maskedUrl}`);
    
    // Determine environment type
    const nodeEnv = (process.env.NODE_ENV || 'development').toLowerCase();
    const isProduction = nodeEnv === 'production';
    const isStaging = nodeEnv === 'staging';
    const isDevelopment = nodeEnv === 'development';
    
    console.log('');
    log('⚠️  ENVIRONMENT CLASSIFICATION:', 'yellow');
    if (isProduction) {
      log('   ⚠️  PRODUCTION ENVIRONMENT DETECTED', 'red');
      log('   ⚠️  MIGRATIONS WILL REQUIRE EXPLICIT APPROVAL', 'red');
    } else if (isStaging) {
      log('   ✓ STAGING ENVIRONMENT', 'yellow');
    } else {
      log('   ✓ DEVELOPMENT ENVIRONMENT', 'green');
    }
    console.log('');
    
    return {
      databaseName: info.database_name,
      currentUser: info.current_user,
      host: info.host || 'localhost',
      port: info.port || '5432',
      nodeEnv: nodeEnv,
      isProduction,
      isStaging,
      isDevelopment,
      maskedUrl,
    };
  } catch (error) {
    log(`❌ Failed to identify environment: ${error.message}`, 'red');
    throw error;
  }
}

// ============================================================================
// STEP 2: Verify Doctrine Schema Presence
// ============================================================================

async function verifyDoctrineSchema(pool) {
  logSection('STEP 2: VERIFYING DOCTRINE SCHEMA PRESENCE');
  
  try {
    // Check if columns exist using information_schema
    const columnCheck = await pool.query(`
      SELECT 
        column_name,
        data_type,
        is_nullable,
        column_default
      FROM information_schema.columns
      WHERE table_schema = 'public'
        AND table_name = 'rfq_items'
        AND column_name IN ('material_treatment_type', 'item_parameters')
      ORDER BY column_name
    `);
    
    const columns = columnCheck.rows;
    const hasTreatmentType = columns.some(c => c.column_name === 'material_treatment_type');
    const hasItemParameters = columns.some(c => c.column_name === 'item_parameters');
    
    log('📋 Schema Check Results:', 'cyan');
    console.log(`   material_treatment_type: ${hasTreatmentType ? '✓ EXISTS' : '✗ MISSING'}`);
    if (hasTreatmentType) {
      const col = columns.find(c => c.column_name === 'material_treatment_type');
      console.log(`      - Type: ${col.data_type}`);
      console.log(`      - Nullable: ${col.is_nullable}`);
      console.log(`      - Default: ${col.column_default || 'none'}`);
    }
    
    console.log(`   item_parameters: ${hasItemParameters ? '✓ EXISTS' : '✗ MISSING'}`);
    if (hasItemParameters) {
      const col = columns.find(c => c.column_name === 'item_parameters');
      console.log(`      - Type: ${col.data_type}`);
      console.log(`      - Nullable: ${col.is_nullable}`);
    }
    console.log('');
    
    // Check for indexes
    const indexCheck = await pool.query(`
      SELECT 
        indexname,
        indexdef
      FROM pg_indexes
      WHERE schemaname = 'public'
        AND tablename = 'rfq_items'
        AND (
          indexname LIKE '%treatment%' OR
          indexname LIKE '%parameters%'
        )
      ORDER BY indexname
    `);
    
    if (indexCheck.rows.length > 0) {
      log('📊 Index Check Results:', 'cyan');
      indexCheck.rows.forEach(idx => {
        console.log(`   ✓ ${idx.indexname}`);
      });
      console.log('');
    }
    
    const migrationApplied = hasTreatmentType && hasItemParameters;
    
    if (migrationApplied) {
      log('✅ Migration 069 appears to be APPLIED', 'green');
    } else {
      log('⚠️  Migration 069 appears to be NOT APPLIED', 'yellow');
    }
    console.log('');
    
    return {
      migrationApplied,
      hasTreatmentType,
      hasItemParameters,
      columns: columns,
      indexes: indexCheck.rows,
    };
  } catch (error) {
    log(`❌ Failed to verify schema: ${error.message}`, 'red');
    throw error;
  }
}

// ============================================================================
// STEP 3: Migration Decision Gate
// ============================================================================

async function migrationDecisionGate(envInfo, schemaInfo) {
  logSection('STEP 3: MIGRATION DECISION GATE');
  
  if (schemaInfo.migrationApplied) {
    log('✅ Schema already present. Skipping migration.', 'green');
    console.log('');
    return { shouldRun: false, reason: 'Schema already exists' };
  }
  
  if (envInfo.isProduction) {
    log('⚠️  PRODUCTION ENVIRONMENT DETECTED', 'red');
    log('⚠️  MIGRATION WILL NOT RUN AUTOMATICALLY', 'red');
    console.log('');
    log('Please confirm:', 'yellow');
    console.log('  1. This is the intended production database');
    console.log('  2. You have explicit approval to run Migration 069');
    console.log('  3. You have a backup of the database');
    console.log('');
    log('To proceed, you must manually run the migration with explicit approval.', 'yellow');
    console.log('');
    return { shouldRun: false, reason: 'Production environment - requires manual approval' };
  }
  
  if (envInfo.isStaging || envInfo.isDevelopment) {
    log('✓ Safe environment detected (STAGING/DEV)', 'green');
    log('✓ Migration 069 can be applied', 'green');
    console.log('');
    return { shouldRun: true, reason: 'Safe environment' };
  }
  
  log('⚠️  Unknown environment. Migration will not run.', 'yellow');
  return { shouldRun: false, reason: 'Unknown environment' };
}

// ============================================================================
// STEP 4: Doctrine Execution Validation
// ============================================================================

async function validateDoctrineExecution(pool) {
  logSection('STEP 4: DOCTRINE EXECUTION VALIDATION');
  
  try {
    // First, check if any items exist at all
    const totalCheck = await pool.query(`
      SELECT COUNT(*) as total FROM rfq_items
    `);
    const totalItems = parseInt(totalCheck.rows[0].total) || 0;
    
    log('📊 Total Items in Database:', 'cyan');
    console.log(`   ${totalItems} rfq_items found`);
    console.log('');
    
    if (totalItems === 0) {
      log('⚠️  No rfq_items found in database', 'yellow');
      console.log('   Upload a document and run AI extraction to generate items.');
      console.log('');
      return {
        distribution: [],
        samples: [],
        hasData: false,
      };
    }
    
    // A) Distribution check
    log('A) Distribution Check:', 'cyan');
    const distribution = await pool.query(`
      SELECT 
        material_treatment_type, 
        COUNT(*) AS item_count
      FROM rfq_items
      GROUP BY material_treatment_type
      ORDER BY item_count DESC
    `);
    
    if (distribution.rows.length === 0) {
      log('⚠️  No items with treatment types found', 'yellow');
      console.log('');
      return {
        distribution: [],
        samples: [],
        hasData: false,
      };
    }
    
    console.log('');
    distribution.rows.forEach(row => {
      console.log(`   ${row.material_treatment_type}: ${row.item_count} items`);
    });
    console.log('');
    
    // B) Sample inspection
    log('B) Sample Inspection (latest 30 items):', 'cyan');
    const samples = await pool.query(`
      SELECT 
        description, 
        material_treatment_type, 
        item_parameters,
        created_at
      FROM rfq_items
      ORDER BY created_at DESC
      LIMIT 30
    `);
    
    console.log('');
    samples.rows.forEach((row, idx) => {
      console.log(`   [${idx + 1}] ${row.material_treatment_type}`);
      console.log(`       Description: ${row.description.substring(0, 80)}${row.description.length > 80 ? '...' : ''}`);
      if (row.item_parameters) {
        console.log(`       Parameters: ${JSON.stringify(row.item_parameters)}`);
      }
      console.log('');
    });
    
    return {
      distribution: distribution.rows,
      samples: samples.rows,
      hasData: true,
    };
  } catch (error) {
    log(`❌ Failed to validate doctrine execution: ${error.message}`, 'red');
    throw error;
  }
}

// ============================================================================
// STEP 5: Human-Alignment Assessment
// ============================================================================

function assessAlignment(validationResults) {
  logSection('STEP 5: HUMAN-ALIGNMENT ASSESSMENT');
  
  if (!validationResults.hasData) {
    log('⚠️  No data available for assessment', 'yellow');
    console.log('   Upload a document and run AI extraction first.');
    console.log('');
    return {
      assessment: 'NO_DATA',
      notes: 'No rfq_items found. Upload a document to test doctrine execution.',
    };
  }
  
  const { distribution, samples } = validationResults;
  
  // Calculate percentages
  const total = distribution.reduce((sum, row) => sum + parseInt(row.item_count), 0);
  const percentages = {};
  distribution.forEach(row => {
    percentages[row.material_treatment_type] = (parseInt(row.item_count) / total * 100).toFixed(1);
  });
  
  log('📊 Distribution Analysis:', 'cyan');
  distribution.forEach(row => {
    const pct = percentages[row.material_treatment_type];
    console.log(`   ${row.material_treatment_type}: ${row.item_count} items (${pct}%)`);
  });
  console.log('');
  
  // Assessment questions
  log('🔍 Alignment Assessment:', 'cyan');
  console.log('');
  
  // 1. Are standard materials mostly CANONICAL?
  const canonicalCount = distribution.find(r => r.material_treatment_type === 'CANONICAL')?.item_count || 0;
  const canonicalPct = (canonicalCount / total * 100).toFixed(1);
  const mostlyCanonical = canonicalPct >= 50;
  log(`   1. Standard materials mostly CANONICAL?`, mostlyCanonical ? 'green' : 'yellow');
  console.log(`      → ${canonicalPct}% are CANONICAL ${mostlyCanonical ? '✓' : '⚠️'}`);
  console.log('');
  
  // 2. Are cut sizes / special lengths PARAMETERIZED?
  const parameterizedCount = distribution.find(r => r.material_treatment_type === 'PARAMETERIZED')?.item_count || 0;
  const parameterizedPct = (parameterizedCount / total * 100).toFixed(1);
  const hasParameterized = parameterizedCount > 0;
  log(`   2. Cut sizes / special lengths PARAMETERIZED?`, hasParameterized ? 'green' : 'yellow');
  console.log(`      → ${parameterizedPct}% are PARAMETERIZED ${hasParameterized ? '✓' : '⚠️'}`);
  console.log('');
  
  // 3. Are true fabrications PROJECT_SPECIFIC?
  const projectSpecificCount = distribution.find(r => r.material_treatment_type === 'PROJECT_SPECIFIC')?.item_count || 0;
  const projectSpecificPct = (projectSpecificCount / total * 100).toFixed(1);
  const hasProjectSpecific = projectSpecificCount > 0;
  log(`   3. True fabrications PROJECT_SPECIFIC?`, hasProjectSpecific ? 'green' : 'yellow');
  console.log(`      → ${projectSpecificPct}% are PROJECT_SPECIFIC ${hasProjectSpecific ? '✓' : '⚠️'}`);
  console.log('');
  
  // 4. Check for suspicious classifications
  const suspicious = [];
  samples.forEach(sample => {
    const desc = sample.description.toUpperCase();
    const type = sample.material_treatment_type;
    
    // Check for potential misclassifications
    if (type === 'CANONICAL' && (desc.includes('CUT TO') || desc.includes('LENGTH'))) {
      suspicious.push({
        type: 'CANONICAL with length parameter',
        description: sample.description,
        treatment: type,
      });
    }
    
    if (type === 'PARAMETERIZED' && (desc.includes('FABRICATION') || desc.includes('FABRICATED'))) {
      suspicious.push({
        type: 'PARAMETERIZED with fabrication keyword',
        description: sample.description,
        treatment: type,
      });
    }
  });
  
  log(`   4. Suspicious classifications?`, suspicious.length === 0 ? 'green' : 'yellow');
  if (suspicious.length === 0) {
    console.log(`      → No suspicious classifications found ✓`);
  } else {
    console.log(`      → Found ${suspicious.length} potentially misclassified items ⚠️`);
    suspicious.slice(0, 5).forEach(s => {
      console.log(`        - ${s.type}: "${s.description.substring(0, 60)}..."`);
    });
  }
  console.log('');
  
  // Overall verdict
  const issues = [];
  if (!mostlyCanonical && canonicalPct < 30) {
    issues.push('Very few CANONICAL items - may indicate over-classification');
  }
  if (suspicious.length > samples.length * 0.1) {
    issues.push('High rate of suspicious classifications');
  }
  
  let verdict = 'PASS';
  if (issues.length > 0) {
    verdict = 'NEEDS_TUNING';
  }
  if (!validationResults.hasData) {
    verdict = 'NO_DATA';
  }
  
  return {
    assessment: verdict,
    canonicalPercentage: parseFloat(canonicalPct),
    parameterizedPercentage: parseFloat(parameterizedPct),
    projectSpecificPercentage: parseFloat(projectSpecificPct),
    suspiciousCount: suspicious.length,
    issues: issues,
    notes: issues.length > 0 ? issues.join('; ') : 'Doctrine appears to be working correctly.',
  };
}

// ============================================================================
// STEP 6: Final Safety Report
// ============================================================================

function generateFinalReport(envInfo, schemaInfo, migrationDecision, validationResults, assessment) {
  logSection('STEP 6: FINAL SAFETY REPORT');
  
  console.log('📋 Validation Summary:');
  console.log('');
  console.log(`   Environment: ${envInfo.nodeEnv.toUpperCase()}`);
  console.log(`   Database: ${envInfo.databaseName}`);
  console.log(`   User: ${envInfo.currentUser}`);
  console.log('');
  
  console.log(`   Migration Status: ${schemaInfo.migrationApplied ? 'APPLIED' : 'NOT APPLIED'}`);
  if (!schemaInfo.migrationApplied && migrationDecision.shouldRun) {
    console.log(`   Migration Action: READY TO APPLY (safe environment)`);
  } else if (!schemaInfo.migrationApplied && !migrationDecision.shouldRun) {
    console.log(`   Migration Action: ${migrationDecision.reason}`);
  } else {
    console.log(`   Migration Action: N/A (already applied)`);
  }
  console.log('');
  
  if (validationResults.hasData) {
    console.log(`   Doctrine Execution: ACTIVE`);
    console.log(`   Items Analyzed: ${validationResults.distribution.reduce((sum, r) => sum + parseInt(r.item_count), 0)}`);
  } else {
    console.log(`   Doctrine Execution: NO DATA (upload document to test)`);
  }
  console.log('');
  
  // Verdict
  let verdictColor = 'green';
  let verdictText = 'PASS';
  
  if (assessment.assessment === 'NO_DATA') {
    verdictColor = 'yellow';
    verdictText = 'NO DATA';
  } else if (assessment.assessment === 'NEEDS_TUNING') {
    verdictColor = 'yellow';
    verdictText = 'NEEDS TUNING';
  }
  
  log(`   Verdict: ${verdictText}`, verdictColor);
  console.log('');
  
  if (assessment.notes) {
    console.log(`   Notes: ${assessment.notes}`);
    console.log('');
  }
  
  log('='.repeat(70), 'bright');
  console.log('');
}

// ============================================================================
// MAIN EXECUTION
// ============================================================================

async function main() {
  log('', 'reset');
  log('='.repeat(70), 'bright');
  log('MATERIAL TREATMENT DOCTRINE V1 - END-TO-END VALIDATION', 'bright');
  log('='.repeat(70), 'bright');
  log('', 'reset');
  
  let pool = null;
  
  try {
    // Connect to database using runtime connection (read-only for checks)
    const dbUrl = config.database.url;
    pool = new Pool({
      connectionString: dbUrl,
      max: 1,
    });
    
    // Step 1: Identify environment
    const envInfo = await identifyEnvironment(pool);
    
    // Step 2: Verify schema
    const schemaInfo = await verifyDoctrineSchema(pool);
    
    // Step 3: Migration decision gate
    const migrationDecision = await migrationDecisionGate(envInfo, schemaInfo);
    
    // If migration should run and schema doesn't exist, run it
    if (migrationDecision.shouldRun && !schemaInfo.migrationApplied) {
      logSection('APPLYING MIGRATION 069');
      
      // Use migration database URL if available, otherwise use runtime URL
      const migrationUrl = process.env.MIGRATION_DATABASE_URL || config.database.url;
      const migrationPool = new Pool({
        connectionString: migrationUrl,
        max: 1,
      });
      
      try {
        const migration = require('../src/db/migrations/069_add_material_treatment_doctrine_v1');
        await migration.up(migrationPool);
        log('✅ Migration 069 applied successfully', 'green');
        console.log('');
        
        // Re-verify schema
        const recheck = await verifyDoctrineSchema(pool);
        schemaInfo.migrationApplied = recheck.migrationApplied;
        schemaInfo.hasTreatmentType = recheck.hasTreatmentType;
        schemaInfo.hasItemParameters = recheck.hasItemParameters;
      } finally {
        await migrationPool.end();
      }
    }
    
    // Step 4: Validate doctrine execution (only if schema exists)
    let validationResults = { hasData: false };
    if (schemaInfo.migrationApplied) {
      validationResults = await validateDoctrineExecution(pool);
    } else {
      log('⚠️  Skipping doctrine execution validation - schema not present', 'yellow');
      console.log('');
    }
    
    // Step 5: Assessment
    const assessment = assessAlignment(validationResults);
    
    // Step 6: Final report
    generateFinalReport(envInfo, schemaInfo, migrationDecision, validationResults, assessment);
    
  } catch (error) {
    log(`❌ Validation failed: ${error.message}`, 'red');
    if (error.stack) {
      console.error(error.stack);
    }
    process.exit(1);
  } finally {
    if (pool) {
      await pool.end();
    }
  }
}

// Run if called directly
if (require.main === module) {
  main().catch(error => {
    console.error('Fatal error:', error);
    process.exit(1);
  });
}

module.exports = { main };









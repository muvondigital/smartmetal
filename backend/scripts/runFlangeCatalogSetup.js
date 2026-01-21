/**
 * Master Flange Catalogue Setup Script
 *
 * This script runs the complete Phase 3 flange catalogue buildout:
 * 1. Run migrations (010, 011, 012)
 * 2. Seed flange dimensions from ASME CSV
 * 3. Seed flange grades from CSV
 * 4. Generate flange materials
 * 5. Verify the results
 *
 * Usage:
 *   cd backend
 *   node scripts/runFlangeCatalogSetup.js
 */

require('dotenv').config();
const { execSync } = require('child_process');
const path = require('path');

/**
 * Runs a command and logs the result
 */
function runCommand(command, description) {
  console.log('');
  console.log('─'.repeat(70));
  console.log(`▶ ${description}`);
  console.log('─'.repeat(70));
  console.log(`Command: ${command}`);
  console.log('');

  try {
    execSync(command, {
      stdio: 'inherit',
      cwd: path.join(__dirname, '..'),
      env: { ...process.env, NODE_ENV: process.env.NODE_ENV || 'development' },
    });
    console.log('');
    console.log(`✅ ${description} completed successfully`);
    return true;
  } catch (error) {
    console.log('');
    console.log(`❌ ${description} failed`);
    return false;
  }
}

/**
 * Main setup function
 */
async function runFlangeCatalogSetup() {
  console.log('╔' + '═'.repeat(68) + '╗');
  console.log('║' + ' '.repeat(15) + 'FLANGE CATALOGUE PHASE 3 SETUP' + ' '.repeat(25) + '║');
  console.log('╚' + '═'.repeat(68) + '╝');
  console.log('');

  const steps = [
    {
      command: 'node src/db/migrations/010_create_flanges_table.js',
      description: 'Step 1: Run Migration 010 (Create Flanges Table)',
    },
    {
      command: 'node src/db/migrations/011_create_flange_grades_table.js',
      description: 'Step 2: Run Migration 011 (Create Flange Grades Table)',
    },
    {
      command: 'node src/db/migrations/012_add_flange_references_to_materials.js',
      description: 'Step 3: Run Migration 012 (Add Flange References to Materials)',
    },
    {
      command: 'node scripts/seedFlangesFromDimensionsCsv.js',
      description: 'Step 4: Seed Flange Dimensions (ASME B16.5)',
    },
    {
      command: 'node scripts/seedFlangeGradesFromCsv.js',
      description: 'Step 5: Seed Flange Grades',
    },
    {
      command: 'node scripts/seedFlangeMaterialsFromCatalog.js',
      description: 'Step 6: Generate Flange Materials',
    },
    {
      command: 'node scripts/verifyFlangeCatalog.js',
      description: 'Step 7: Verify Flange Catalogue',
    },
  ];

  let allSuccessful = true;

  for (let i = 0; i < steps.length; i++) {
    const step = steps[i];
    const success = runCommand(step.command, step.description);

    if (!success) {
      allSuccessful = false;
      console.log('');
      console.log('❌ Setup failed at step ' + (i + 1));
      console.log('Please fix the error and try again.');
      process.exit(1);
    }
  }

  if (allSuccessful) {
    console.log('');
    console.log('╔' + '═'.repeat(68) + '╗');
    console.log('║' + ' '.repeat(20) + '✅ SETUP COMPLETE' + ' '.repeat(33) + '║');
    console.log('╚' + '═'.repeat(68) + '╝');
    console.log('');
    console.log('All flange catalogue setup steps completed successfully!');
    console.log('');
  }
}

// Run if called directly
if (require.main === module) {
  runFlangeCatalogSetup()
    .then(() => {
      process.exit(0);
    })
    .catch((error) => {
      console.error('Fatal error:', error);
      process.exit(1);
    });
}

module.exports = {
  runFlangeCatalogSetup,
};


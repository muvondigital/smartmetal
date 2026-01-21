/**
 * Master Pipe Catalogue Setup Script
 *
 * This script runs the complete Phase 2 pipe catalogue buildout:
 * 1. Run migrations (007, 008, 009)
 * 2. Seed pipe dimensions from ASME CSV
 * 3. Seed pipe grades from CSV
 * 4. Generate pipe materials
 * 5. Verify the results
 *
 * Usage:
 *   cd backend
 *   node scripts/runPipeCatalogSetup.js
 */

require('dotenv').config();
const { execSync } = require('child_process');
const path = require('path');

/**
 * Runs a command and displays output
 */
function runCommand(command, description) {
  console.log('');
  console.log('='.repeat(70));
  console.log(description);
  console.log('='.repeat(70));
  console.log('');

  try {
    execSync(command, {
      stdio: 'inherit',
      cwd: path.join(__dirname, '..'),
    });
    console.log('');
    console.log(`✅ ${description} completed`);
    return true;
  } catch (error) {
    console.error('');
    console.error(`❌ ${description} failed`);
    return false;
  }
}

/**
 * Main setup function
 */
async function runPipeCatalogSetup() {
  console.log('╔' + '═'.repeat(68) + '╗');
  console.log('║' + ' '.repeat(15) + 'PIPE CATALOGUE PHASE 2 SETUP' + ' '.repeat(25) + '║');
  console.log('╚' + '═'.repeat(68) + '╝');
  console.log('');

  const steps = [
    {
      command: 'node src/db/migrations/007_add_pipes_dimensions_columns.js',
      description: 'Step 1: Run Migration 007 (Add Pipes Dimensions Columns)',
    },
    {
      command: 'node src/db/migrations/008_create_pipe_grades_table.js',
      description: 'Step 2: Run Migration 008 (Create Pipe Grades Table)',
    },
    {
      command: 'node src/db/migrations/009_add_pipe_references_to_materials.js',
      description: 'Step 3: Run Migration 009 (Add Pipe References to Materials)',
    },
    {
      command: 'node scripts/seedPipesFromDimensionsCsv.js',
      description: 'Step 4: Seed Pipe Dimensions (ASME B36.10M)',
    },
    {
      command: 'node scripts/seedPipeGradesFromCsv.js',
      description: 'Step 5: Seed Pipe Grades',
    },
    {
      command: 'node scripts/cleanupOldPipeMaterials.js',
      description: 'Step 6: Cleanup Old PIPE Materials (Legacy Format)',
    },
    {
      command: 'node scripts/seedPipeMaterialsFromCatalog.js',
      description: 'Step 7: Generate Pipe Materials',
    },
    {
      command: 'node scripts/verifyPipeCatalog.js',
      description: 'Step 8: Verify Pipe Catalogue',
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
    console.log('║' + ' '.repeat(20) + '✅ SETUP COMPLETE ✅' + ' '.repeat(20) + '║');
    console.log('╚' + '═'.repeat(68) + '╝');
    console.log('');
    console.log('Phase 2 pipe catalogue buildout is complete!');
    console.log('');
    console.log('Next steps:');
    console.log('  - Review the verification report above');
    console.log('  - Update base_cost values for pipe materials if needed');
    console.log('  - Integrate pipe materials into your pricing workflows');
    console.log('');
  }

  process.exit(0);
}

// Run if called directly
if (require.main === module) {
  runPipeCatalogSetup();
}

module.exports = {
  runPipeCatalogSetup,
};

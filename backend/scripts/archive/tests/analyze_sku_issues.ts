/**
 * SKU Issues Analysis Script
 *
 * READ-ONLY diagnostic script to analyze SKU generation issues.
 * Identifies invalid SKUs and duplicate SKUs without modifying database.
 */

// Load environment variables
require('dotenv').config({ path: require('path').join(__dirname, '../.env') });

import { connectDb } from '../src/db/supabaseClient';
import { generateAndValidateSKU, MaterialRecord, SKUAttributes } from '../src/services/sku';

interface MaterialWithSKU {
  id: string;
  material_code: string;
  description?: string;
  category: string;
  sku: string;
  attributes: SKUAttributes;
  valid: boolean;
  errors: string[];
}

interface ErrorGroup {
  errorMessage: string;
  count: number;
  examples: MaterialWithSKU[];
}

interface DuplicateGroup {
  sku: string;
  materials: MaterialWithSKU[];
}

interface CategoryDuplicates {
  categoryCode: string;
  duplicatedSKUs: DuplicateGroup[];
}

/**
 * Main analysis function
 */
async function analyzeSKUIssues() {
  const db = await connectDb();

  console.log('🔍 SKU Issues Analysis');
  console.log('═'.repeat(80));
  console.log('');
  console.log('⚠️  READ-ONLY ANALYSIS - No database modifications will be made');
  console.log('');

  try {
    // Load all materials from database
    console.log('📦 Loading all materials from database...');
    const result = await db.query(`
      SELECT
        id,
        material_code,
        category,
        spec_standard,
        grade,
        material_type,
        origin_type,
        size_description,
        notes
      FROM materials
      ORDER BY category, material_code
    `);

    const materials = result.rows;
    const totalMaterials = materials.length;
    console.log(`   Found ${totalMaterials} materials to analyze`);
    console.log('');

    // Process all materials
    console.log('🔄 Generating SKUs for analysis...');
    console.log('');

    const materialsWithSKU: MaterialWithSKU[] = [];
    let processed = 0;

    for (const material of materials) {
      processed++;

      try {
        // Generate SKU for analysis
        const skuResult = generateAndValidateSKU({
          category: material.category,
          material_type: material.material_type,
          spec_standard: material.spec_standard,
          grade: material.grade,
          size_description: material.size_description,
          origin_type: material.origin_type,
          notes: material.notes,
          material_code: material.material_code,
        });

        materialsWithSKU.push({
          id: material.id,
          material_code: material.material_code,
          category: material.category,
          sku: skuResult.sku,
          attributes: skuResult.attributes,
          valid: skuResult.valid,
          errors: skuResult.errors,
        });

        // Progress indicator
        if (processed % 100 === 0 || processed === totalMaterials) {
          process.stdout.write(`\r   Progress: ${processed}/${totalMaterials} (${Math.round(processed/totalMaterials*100)}%)`);
        }
      } catch (error: any) {
        console.error(`\n❌ Error processing ${material.material_code}:`, error.message);
      }
    }

    console.log('\n');
    console.log('✅ SKU generation complete');
    console.log('');

    // ═══════════════════════════════════════════════════════════════════════════
    // 1. INVALID SKUs ANALYSIS
    // ═══════════════════════════════════════════════════════════════════════════

    console.log('═'.repeat(80));
    console.log('❌ INVALID SKUs ANALYSIS');
    console.log('═'.repeat(80));
    console.log('');

    const invalidMaterials = materialsWithSKU.filter(m => !m.valid);

    if (invalidMaterials.length === 0) {
      console.log('✅ No invalid SKUs found!');
      console.log('');
    } else {
      // Group by primary error message
      const errorGroups = new Map<string, MaterialWithSKU[]>();

      for (const material of invalidMaterials) {
        const primaryError = material.errors[0] || 'Unknown error';

        if (!errorGroups.has(primaryError)) {
          errorGroups.set(primaryError, []);
        }
        errorGroups.get(primaryError)!.push(material);
      }

      // Sort error groups by count (most common first)
      const sortedErrorGroups = Array.from(errorGroups.entries())
        .map(([errorMessage, materials]) => ({
          errorMessage,
          count: materials.length,
          examples: materials.slice(0, 5),
        }))
        .sort((a, b) => b.count - a.count);

      console.log(`Found ${invalidMaterials.length} invalid SKUs grouped into ${sortedErrorGroups.length} error types:`);
      console.log('');

      for (const group of sortedErrorGroups) {
        console.log(`┌─ Error: "${group.errorMessage}"`);
        console.log(`│  Count: ${group.count} materials`);
        console.log(`│  Examples (showing up to 5):`);
        console.log('│');

        for (const material of group.examples) {
          console.log(`│  • ID: ${material.id.substring(0, 8)}...`);
          console.log(`│    Material Code: ${material.material_code}`);
          console.log(`│    Generated SKU: ${material.sku}`);
          console.log(`│    Attributes:`);
          console.log(`│      - Category: ${material.attributes.category}`);
          console.log(`│      - Material: ${material.attributes.material}`);
          console.log(`│      - Subcategory: ${material.attributes.subcategory}`);
          console.log(`│      - Standard: ${material.attributes.std}`);
          console.log(`│      - Size: ${material.attributes.size}`);
          console.log(`│      - Variant: ${material.attributes.variant}`);
          console.log('│');
        }

        console.log('└' + '─'.repeat(78));
        console.log('');
      }
    }

    // ═══════════════════════════════════════════════════════════════════════════
    // 2. DUPLICATE SKUs ANALYSIS
    // ═══════════════════════════════════════════════════════════════════════════

    console.log('═'.repeat(80));
    console.log('⚠️  DUPLICATE SKUs ANALYSIS');
    console.log('═'.repeat(80));
    console.log('');

    // Build SKU map
    const skuMap = new Map<string, MaterialWithSKU[]>();

    for (const material of materialsWithSKU) {
      if (!skuMap.has(material.sku)) {
        skuMap.set(material.sku, []);
      }
      skuMap.get(material.sku)!.push(material);
    }

    // Filter only duplicates
    const duplicateSKUs: DuplicateGroup[] = Array.from(skuMap.entries())
      .filter(([sku, materials]) => materials.length > 1)
      .map(([sku, materials]) => ({ sku, materials }));

    if (duplicateSKUs.length === 0) {
      console.log('✅ No duplicate SKUs found!');
      console.log('');
    } else {
      // Group duplicates by category
      const categoryDuplicatesMap = new Map<string, DuplicateGroup[]>();

      for (const duplicate of duplicateSKUs) {
        // Use the category from the first material (all should be same if properly generated)
        const category = duplicate.materials[0].attributes.category;

        if (!categoryDuplicatesMap.has(category)) {
          categoryDuplicatesMap.set(category, []);
        }
        categoryDuplicatesMap.get(category)!.push(duplicate);
      }

      const categoryDuplicates: CategoryDuplicates[] = Array.from(categoryDuplicatesMap.entries())
        .map(([categoryCode, duplicatedSKUs]) => ({
          categoryCode,
          duplicatedSKUs,
        }))
        .sort((a, b) => b.duplicatedSKUs.length - a.duplicatedSKUs.length);

      console.log(`Found ${duplicateSKUs.length} duplicated SKU strings across ${categoryDuplicates.length} categories:`);
      console.log('');

      for (const categoryDup of categoryDuplicates) {
        console.log(`┌─ Category: ${categoryDup.categoryCode}`);
        console.log(`│  Distinct duplicated SKUs: ${categoryDup.duplicatedSKUs.length}`);
        console.log(`│  Examples (showing up to 5 duplicated SKUs):`);
        console.log('│');

        const exampleDuplicates = categoryDup.duplicatedSKUs.slice(0, 5);

        for (const duplicate of exampleDuplicates) {
          console.log(`│  ▸ SKU: ${duplicate.sku}`);
          console.log(`│    Appears ${duplicate.materials.length} times:`);
          console.log('│');

          const exampleMaterials = duplicate.materials.slice(0, 5);

          for (const material of exampleMaterials) {
            console.log(`│    • ID: ${material.id.substring(0, 8)}...`);
            console.log(`│      Material Code: ${material.material_code}`);
            console.log(`│      Attributes:`);
            console.log(`│        - Category: ${material.attributes.category}`);
            console.log(`│        - Material: ${material.attributes.material}`);
            console.log(`│        - Subcategory: ${material.attributes.subcategory}`);
            console.log(`│        - Standard: ${material.attributes.std}`);
            console.log(`│        - Size: ${material.attributes.size}`);
            console.log(`│        - Variant: ${material.attributes.variant}`);
            console.log('│');
          }

          if (duplicate.materials.length > 5) {
            console.log(`│    ... and ${duplicate.materials.length - 5} more materials with this SKU`);
            console.log('│');
          }
        }

        if (categoryDup.duplicatedSKUs.length > 5) {
          console.log(`│  ... and ${categoryDup.duplicatedSKUs.length - 5} more duplicated SKUs in this category`);
          console.log('│');
        }

        console.log('└' + '─'.repeat(78));
        console.log('');
      }

      // Detailed breakdown by category
      console.log('📊 Duplicates Breakdown by Category:');
      console.log('─'.repeat(80));
      for (const categoryDup of categoryDuplicates) {
        const totalDuplicateMaterials = categoryDup.duplicatedSKUs.reduce(
          (sum, dup) => sum + dup.materials.length,
          0
        );
        console.log(`   ${categoryDup.categoryCode}: ${categoryDup.duplicatedSKUs.length} duplicated SKUs (${totalDuplicateMaterials} total materials)`);
      }
      console.log('');
    }

    // ═══════════════════════════════════════════════════════════════════════════
    // 3. SUMMARY REPORT
    // ═══════════════════════════════════════════════════════════════════════════

    console.log('═'.repeat(80));
    console.log('📊 SUMMARY REPORT');
    console.log('═'.repeat(80));
    console.log('');

    const validMaterials = materialsWithSKU.filter(m => m.valid);
    const totalDuplicateMaterials = duplicateSKUs.reduce(
      (sum, dup) => sum + dup.materials.length,
      0
    );

    console.log('Overall Statistics:');
    console.log(`   Total materials processed:        ${totalMaterials}`);
    console.log(`   Valid SKUs:                       ${validMaterials.length} (${(validMaterials.length/totalMaterials*100).toFixed(1)}%)`);
    console.log(`   Invalid SKUs:                     ${invalidMaterials.length} (${(invalidMaterials.length/totalMaterials*100).toFixed(1)}%)`);
    console.log('');

    console.log('Duplicate SKUs:');
    console.log(`   Distinct duplicated SKU strings:  ${duplicateSKUs.length}`);
    console.log(`   Total materials with duplicates:  ${totalDuplicateMaterials}`);
    console.log('');

    if (invalidMaterials.length > 0) {
      console.log('Invalid SKUs by Error Type:');
      const errorGroups = new Map<string, number>();
      for (const material of invalidMaterials) {
        const primaryError = material.errors[0] || 'Unknown error';
        errorGroups.set(primaryError, (errorGroups.get(primaryError) || 0) + 1);
      }
      const sortedErrors = Array.from(errorGroups.entries())
        .sort((a, b) => b[1] - a[1]);
      for (const [error, count] of sortedErrors) {
        console.log(`   "${error}": ${count}`);
      }
      console.log('');
    }

    if (duplicateSKUs.length > 0) {
      console.log('Duplicates by Category:');
      const categoryDuplicatesMap = new Map<string, number>();
      for (const duplicate of duplicateSKUs) {
        const category = duplicate.materials[0].attributes.category;
        categoryDuplicatesMap.set(category, (categoryDuplicatesMap.get(category) || 0) + 1);
      }
      const sortedCategories = Array.from(categoryDuplicatesMap.entries())
        .sort((a, b) => b[1] - a[1]);
      for (const [category, count] of sortedCategories) {
        console.log(`   ${category}: ${count} duplicated SKUs`);
      }
      console.log('');
    }

    console.log('═'.repeat(80));
    console.log('✅ Analysis complete!');
    console.log('');

    if (invalidMaterials.length > 0 || duplicateSKUs.length > 0) {
      console.log('⚠️  Issues detected:');
      if (invalidMaterials.length > 0) {
        console.log(`   - ${invalidMaterials.length} materials have invalid SKUs`);
      }
      if (duplicateSKUs.length > 0) {
        console.log(`   - ${duplicateSKUs.length} SKU strings are duplicated`);
      }
      console.log('');
      console.log('📝 Review the detailed analysis above to identify and resolve issues.');
    } else {
      console.log('✅ No issues detected! All SKUs are valid and unique.');
    }
    console.log('');

  } catch (error: any) {
    console.error('❌ Analysis failed:', error);
    throw error;
  }
}

// Run if called directly
if (require.main === module) {
  analyzeSKUIssues()
    .then(() => {
      console.log('Analysis script completed');
      process.exit(0);
    })
    .catch((error) => {
      console.error('Analysis script failed:', error);
      process.exit(1);
    });
}

export { analyzeSKUIssues };

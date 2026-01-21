// Load environment variables
require('dotenv').config({ path: require('path').join(__dirname, '../../../.env') });

const { connectDb } = require('../supabaseClient');

/**
 * Seeds KGSB Grating Catalog materials into the database
 *
 * Catalog includes:
 * - Metric gratings (Series 1: 30mm, Series 2: 40mm, Series 3: 60mm pitch)
 * - Imperial gratings (Series 19, 15)
 * - Stair treads (T1-T8 types)
 * - Drainage covers (Normal, U-type, Hollow pipe, Sump)
 * - FRP gratings (Pultruded KGPD + Molded KGMD)
 */
async function seedKGSBCatalog() {
  const db = await connectDb();

  console.log('Seeding KGSB Grating Catalog...');

  // METRIC GRATINGS - SERIES 1 (30mm pitch)
  const series1Gratings = [
    {
      material_code: 'KGSB-TA203/1-MPG',
      category: 'GRATING',
      spec_standard: 'ASTM A1011 / BS4592-2006',
      grade: null,
      material_type: 'Mild Steel',
      origin_type: 'NON_CHINA',
      size_description: '20x3mm Load Bar, Pitch A (100mm)',
      base_cost: 25.50,
      currency: 'USD',
      notes: JSON.stringify({
        productType: 'grating',
        gratingType: 'metric',
        series: '1',
        loadBarSize: '20x3',
        crossBarPitch: 'A',
        finish: 'G',
        material: 'mild_steel',
        maxSpan_mm: 1190,
        weight_kg_m2: 18.8
      }),
    },
    {
      material_code: 'KGSB-TA253/1-MPG',
      category: 'GRATING',
      spec_standard: 'ASTM A1011 / BS4592-2006',
      grade: null,
      material_type: 'Mild Steel',
      origin_type: 'NON_CHINA',
      size_description: '25x3mm Load Bar, Pitch A (100mm)',
      base_cost: 28.00,
      currency: 'USD',
      notes: JSON.stringify({
        productType: 'grating',
        gratingType: 'metric',
        series: '1',
        loadBarSize: '25x3',
        crossBarPitch: 'A',
        finish: 'G',
        material: 'mild_steel',
        maxSpan_mm: 1410,
        weight_kg_m2: 21.7
      }),
    },
    {
      material_code: 'KGSB-TA323/1-MPG',
      category: 'GRATING',
      spec_standard: 'ASTM A1011 / BS4592-2006',
      grade: null,
      material_type: 'Mild Steel',
      origin_type: 'NON_CHINA',
      size_description: '32x3mm Load Bar, Pitch A (100mm)',
      base_cost: 32.00,
      currency: 'USD',
      notes: JSON.stringify({
        productType: 'grating',
        gratingType: 'metric',
        series: '1',
        loadBarSize: '32x3',
        crossBarPitch: 'A',
        finish: 'G',
        material: 'mild_steel',
        maxSpan_mm: 1700,
        weight_kg_m2: 26.3
      }),
    },
    {
      material_code: 'KGSB-TA403/1-MPG',
      category: 'GRATING',
      spec_standard: 'ASTM A1011 / BS4592-2006',
      grade: null,
      material_type: 'Mild Steel',
      origin_type: 'NON_CHINA',
      size_description: '40x3mm Load Bar, Pitch A (100mm)',
      base_cost: 38.50,
      currency: 'USD',
      notes: JSON.stringify({
        productType: 'grating',
        gratingType: 'metric',
        series: '1',
        loadBarSize: '40x3',
        crossBarPitch: 'A',
        finish: 'G',
        material: 'mild_steel',
        maxSpan_mm: 2010,
        weight_kg_m2: 32.8
      }),
    },
  ];

  // METRIC GRATINGS - SERIES 2 (40mm pitch)
  const series2Gratings = [
    {
      material_code: 'KGSB-TA203/2-MPG',
      category: 'GRATING',
      spec_standard: 'ASTM A1011 / BS4592-2006',
      grade: null,
      material_type: 'Mild Steel',
      origin_type: 'NON_CHINA',
      size_description: '20x3mm Load Bar, Pitch A (100mm)',
      base_cost: 22.00,
      currency: 'USD',
      notes: JSON.stringify({
        productType: 'grating',
        gratingType: 'metric',
        series: '2',
        loadBarSize: '20x3',
        crossBarPitch: 'A',
        finish: 'G',
        material: 'mild_steel',
        maxSpan_mm: 1140,
        weight_kg_m2: 15.1
      }),
    },
    {
      material_code: 'KGSB-TA254.5/2-MPG',
      category: 'GRATING',
      spec_standard: 'ASTM A1011 / BS4592-2006',
      grade: null,
      material_type: 'Mild Steel',
      origin_type: 'NON_CHINA',
      size_description: '25x4.5mm Load Bar, Pitch A (100mm)',
      base_cost: 29.50,
      currency: 'USD',
      notes: JSON.stringify({
        productType: 'grating',
        gratingType: 'metric',
        series: '2',
        loadBarSize: '25x4.5',
        crossBarPitch: 'A',
        finish: 'G',
        material: 'mild_steel',
        maxSpan_mm: 1560,
        weight_kg_m2: 25.8
      }),
    },
    {
      material_code: 'KGSB-TA384.5/2-MPG',
      category: 'GRATING',
      spec_standard: 'ASTM A1011 / BS4592-2006',
      grade: null,
      material_type: 'Mild Steel',
      origin_type: 'NON_CHINA',
      size_description: '38x4.5mm Load Bar, Pitch A (100mm)',
      base_cost: 41.00,
      currency: 'USD',
      notes: JSON.stringify({
        productType: 'grating',
        gratingType: 'metric',
        series: '2',
        loadBarSize: '38x4.5',
        crossBarPitch: 'A',
        finish: 'G',
        material: 'mild_steel',
        maxSpan_mm: 2140,
        weight_kg_m2: 39.4
      }),
    },
  ];

  // METRIC GRATINGS - SERIES 3 (60mm pitch)
  const series3Gratings = [
    {
      material_code: 'KGSB-TB205/3-MPG',
      category: 'GRATING',
      spec_standard: 'ASTM A1011 / BS4592-2006',
      grade: null,
      material_type: 'Mild Steel',
      origin_type: 'NON_CHINA',
      size_description: '20x5mm Load Bar, Pitch B (50mm)',
      base_cost: 27.00,
      currency: 'USD',
      notes: JSON.stringify({
        productType: 'grating',
        gratingType: 'metric',
        series: '3',
        loadBarSize: '20x5',
        crossBarPitch: 'B',
        finish: 'G',
        material: 'mild_steel',
        maxSpan_mm: 1350,
        weight_kg_m2: 19.0
      }),
    },
    {
      material_code: 'KGSB-TB255/3-MPG',
      category: 'GRATING',
      spec_standard: 'ASTM A1011 / BS4592-2006',
      grade: null,
      material_type: 'Mild Steel',
      origin_type: 'NON_CHINA',
      size_description: '25x5mm Load Bar, Pitch B (50mm)',
      base_cost: 30.50,
      currency: 'USD',
      notes: JSON.stringify({
        productType: 'grating',
        gratingType: 'metric',
        series: '3',
        loadBarSize: '25x5',
        crossBarPitch: 'B',
        finish: 'G',
        material: 'mild_steel',
        maxSpan_mm: 1600,
        weight_kg_m2: 22.3
      }),
    },
    {
      material_code: 'KGSB-TB325/3-MPG',
      category: 'GRATING',
      spec_standard: 'ASTM A1011 / BS4592-2006',
      grade: null,
      material_type: 'Mild Steel',
      origin_type: 'NON_CHINA',
      size_description: '32x5mm Load Bar, Pitch B (50mm)',
      base_cost: 35.00,
      currency: 'USD',
      notes: JSON.stringify({
        productType: 'grating',
        gratingType: 'metric',
        series: '3',
        loadBarSize: '32x5',
        crossBarPitch: 'B',
        finish: 'G',
        material: 'mild_steel',
        maxSpan_mm: 1930,
        weight_kg_m2: 27.0
      }),
    },
  ];

  // IMPERIAL GRATINGS - SERIES 19 (19-W-4)
  const series19Gratings = [
    {
      material_code: 'KGSB-19-W-4-3/4x1/8',
      category: 'GRATING',
      spec_standard: 'ASTM A1011 / S275JR / SS400',
      grade: null,
      material_type: 'Mild Steel',
      origin_type: 'NON_CHINA',
      size_description: '3/4" x 1/8" Load Bar, 4" OC',
      base_cost: 35.00,
      currency: 'USD',
      notes: JSON.stringify({
        productType: 'grating',
        gratingType: 'imperial',
        series: '19',
        loadBarSize: '3/4x1/8',
        crossBarPitch: '4"',
        finish: 'G',
        material: 'mild_steel',
        maxSpan_inches: 24,
        weight_lbs_sqft: 3.9
      }),
    },
    {
      material_code: 'KGSB-19-W-4-1x1/8',
      category: 'GRATING',
      spec_standard: 'ASTM A1011 / S275JR / SS400',
      grade: null,
      material_type: 'Mild Steel',
      origin_type: 'NON_CHINA',
      size_description: '1" x 1/8" Load Bar, 4" OC',
      base_cost: 42.00,
      currency: 'USD',
      notes: JSON.stringify({
        productType: 'grating',
        gratingType: 'imperial',
        series: '19',
        loadBarSize: '1x1/8',
        crossBarPitch: '4"',
        finish: 'G',
        material: 'mild_steel',
        maxSpan_inches: 36,
        weight_lbs_sqft: 5.0
      }),
    },
  ];

  // STAIR TREADS (T1-T8)
  const stairTreads = [
    {
      material_code: 'KGSB-STAIR-T1-WELDED',
      category: 'STAIR_TREAD',
      spec_standard: 'ASTM A1011 / BS4592-2006',
      grade: null,
      material_type: 'Mild Steel',
      origin_type: 'NON_CHINA',
      size_description: 'T1 Welded, Plain Bar',
      base_cost: 45.00,
      currency: 'USD',
      notes: JSON.stringify({
        productType: 'stair_tread',
        stairTreadType: 'T1',
        connection: 'welded',
        nosing: 'none',
        finish: 'G',
        material: 'mild_steel'
      }),
    },
    {
      material_code: 'KGSB-STAIR-T3-WELDED-CHECKERED',
      category: 'STAIR_TREAD',
      spec_standard: 'ASTM A1011 / BS4592-2006',
      grade: null,
      material_type: 'Mild Steel',
      origin_type: 'NON_CHINA',
      size_description: 'T3 Welded, Checkered Plate Nosing',
      base_cost: 52.00,
      currency: 'USD',
      notes: JSON.stringify({
        productType: 'stair_tread',
        stairTreadType: 'T3',
        connection: 'welded',
        nosing: 'checkered',
        finish: 'G',
        material: 'mild_steel'
      }),
    },
    {
      material_code: 'KGSB-STAIR-T5-WELDED-ANTISLIP',
      category: 'STAIR_TREAD',
      spec_standard: 'ASTM A1011 / BS4592-2006',
      grade: null,
      material_type: 'Mild Steel',
      origin_type: 'NON_CHINA',
      size_description: 'T5 Welded, Anti-Slip Nosing',
      base_cost: 58.00,
      currency: 'USD',
      notes: JSON.stringify({
        productType: 'stair_tread',
        stairTreadType: 'T5',
        connection: 'welded',
        nosing: 'antislip',
        finish: 'G',
        material: 'mild_steel'
      }),
    },
  ];

  // DRAINAGE COVERS
  const drainageCovers = [
    {
      material_code: 'KGSB-DRAIN-NORMAL-T6',
      category: 'DRAINAGE',
      spec_standard: 'ASTM A1011',
      grade: null,
      material_type: 'Mild Steel',
      origin_type: 'NON_CHINA',
      size_description: 'Normal Type, Load Class T-6',
      base_cost: 48.00,
      currency: 'USD',
      notes: JSON.stringify({
        productType: 'drainage',
        drainageType: 'normal',
        loadClass: 'T-6',
        finish: 'G',
        material: 'mild_steel',
        maxLoad_kg: 6000
      }),
    },
    {
      material_code: 'KGSB-DRAIN-UTYPE-T14',
      category: 'DRAINAGE',
      spec_standard: 'ASTM A1011',
      grade: null,
      material_type: 'Mild Steel',
      origin_type: 'NON_CHINA',
      size_description: 'U-Type, Load Class T-14',
      base_cost: 65.00,
      currency: 'USD',
      notes: JSON.stringify({
        productType: 'drainage',
        drainageType: 'u_type',
        loadClass: 'T-14',
        finish: 'G',
        material: 'mild_steel',
        maxLoad_kg: 14000
      }),
    },
    {
      material_code: 'KGSB-DRAIN-SUMP-T20',
      category: 'DRAINAGE',
      spec_standard: 'ASTM A1011',
      grade: null,
      material_type: 'Mild Steel',
      origin_type: 'NON_CHINA',
      size_description: 'Sump Type, Load Class T-20',
      base_cost: 72.00,
      currency: 'USD',
      notes: JSON.stringify({
        productType: 'drainage',
        drainageType: 'sump',
        loadClass: 'T-20',
        finish: 'G',
        material: 'mild_steel',
        maxLoad_kg: 20000
      }),
    },
  ];

  // FRP GRATINGS - PULTRUDED
  const frpPultruded = [
    {
      material_code: 'KGSB-KGPD-25-25',
      category: 'FRP_GRATING',
      spec_standard: 'ASTM E84',
      grade: 'Type V',
      material_type: 'Vinyl Ester FRP',
      origin_type: 'NON_CHINA',
      size_description: 'Pultruded, 25mm height',
      base_cost: 95.00,
      currency: 'USD',
      notes: JSON.stringify({
        productType: 'frp_grating',
        gratingType: 'FRP',
        frpType: 'pultruded',
        height_mm: 25,
        openArea_percent: 60,
        weight_kg_m2: 8.5,
        material: 'frp'
      }),
    },
    {
      material_code: 'KGSB-KGPD-38-25',
      category: 'FRP_GRATING',
      spec_standard: 'ASTM E84',
      grade: 'Type V',
      material_type: 'Vinyl Ester FRP',
      origin_type: 'NON_CHINA',
      size_description: 'Pultruded, 38mm height',
      base_cost: 115.00,
      currency: 'USD',
      notes: JSON.stringify({
        productType: 'frp_grating',
        gratingType: 'FRP',
        frpType: 'pultruded',
        height_mm: 38,
        openArea_percent: 60,
        weight_kg_m2: 18.1,
        material: 'frp'
      }),
    },
  ];

  // FRP GRATINGS - MOLDED
  const frpMolded = [
    {
      material_code: 'KGSB-KGMD-25-38x38',
      category: 'FRP_GRATING',
      spec_standard: 'ASTM E84',
      grade: 'Type I',
      material_type: 'Isophthalic Polyester FRP',
      origin_type: 'NON_CHINA',
      size_description: 'Molded, 25mm height, 38x38mm mesh',
      base_cost: 85.00,
      currency: 'USD',
      notes: JSON.stringify({
        productType: 'frp_grating',
        gratingType: 'FRP',
        frpType: 'molded',
        height_mm: 25,
        meshSize_mm: '38x38',
        openArea_percent: 69,
        weight_kg_m2: 12.3,
        material: 'frp'
      }),
    },
    {
      material_code: 'KGSB-KGMD-38-38x38',
      category: 'FRP_GRATING',
      spec_standard: 'ASTM E84',
      grade: 'Type I',
      material_type: 'Isophthalic Polyester FRP',
      origin_type: 'NON_CHINA',
      size_description: 'Molded, 38mm height, 38x38mm mesh',
      base_cost: 105.00,
      currency: 'USD',
      notes: JSON.stringify({
        productType: 'frp_grating',
        gratingType: 'FRP',
        frpType: 'molded',
        height_mm: 38,
        meshSize_mm: '38x38',
        openArea_percent: 68,
        weight_kg_m2: 19.2,
        material: 'frp'
      }),
    },
  ];

  // STAINLESS STEEL GRATINGS
  const stainlessGratings = [
    {
      material_code: 'KGSB-TA323/1-SPG-304',
      category: 'GRATING',
      spec_standard: 'ASTM A1011',
      grade: '304',
      material_type: 'Stainless Steel',
      origin_type: 'NON_CHINA',
      size_description: '32x3mm Load Bar, Pitch A (100mm), SS304',
      base_cost: 125.00,
      currency: 'USD',
      notes: JSON.stringify({
        productType: 'grating',
        gratingType: 'metric',
        series: '1',
        loadBarSize: '32x3',
        crossBarPitch: 'A',
        finish: 'U',
        material: 'stainless_steel',
        grade: '304',
        maxSpan_mm: 1700
      }),
    },
    {
      material_code: 'KGSB-TA403/1-SPG-316L',
      category: 'GRATING',
      spec_standard: 'ASTM A1011',
      grade: '316L',
      material_type: 'Stainless Steel',
      origin_type: 'NON_CHINA',
      size_description: '40x3mm Load Bar, Pitch A (100mm), SS316L',
      base_cost: 165.00,
      currency: 'USD',
      notes: JSON.stringify({
        productType: 'grating',
        gratingType: 'metric',
        series: '1',
        loadBarSize: '40x3',
        crossBarPitch: 'A',
        finish: 'U',
        material: 'stainless_steel',
        grade: '316L',
        maxSpan_mm: 2010
      }),
    },
  ];

  // Combine all materials
  const allMaterials = [
    ...series1Gratings,
    ...series2Gratings,
    ...series3Gratings,
    ...series19Gratings,
    ...stairTreads,
    ...drainageCovers,
    ...frpPultruded,
    ...frpMolded,
    ...stainlessGratings,
  ];

  try {
    let insertedCount = 0;
    let skippedCount = 0;

    for (const material of allMaterials) {
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
          material.notes,
        ]
      );

      if (result.rows.length > 0) {
        insertedCount++;
      } else {
        skippedCount++;
      }
    }

    console.log(`✓ KGSB Catalog seeded successfully`);
    console.log(`  - Inserted: ${insertedCount} materials`);
    console.log(`  - Skipped: ${skippedCount} materials (already exist)`);
    console.log(`  - Total catalog items: ${allMaterials.length}`);
    console.log('');
    console.log('Catalog breakdown:');
    console.log(`  - Series 1 Metric Gratings: ${series1Gratings.length}`);
    console.log(`  - Series 2 Metric Gratings: ${series2Gratings.length}`);
    console.log(`  - Series 3 Metric Gratings: ${series3Gratings.length}`);
    console.log(`  - Series 19 Imperial Gratings: ${series19Gratings.length}`);
    console.log(`  - Stair Treads: ${stairTreads.length}`);
    console.log(`  - Drainage Covers: ${drainageCovers.length}`);
    console.log(`  - FRP Pultruded: ${frpPultruded.length}`);
    console.log(`  - FRP Molded: ${frpMolded.length}`);
    console.log(`  - Stainless Steel: ${stainlessGratings.length}`);
  } catch (error) {
    console.error('Error seeding KGSB catalog:', error);
    throw error;
  }
}

module.exports = {
  seedKGSBCatalog,
};

// Run if executed directly
if (require.main === module) {
  seedKGSBCatalog()
    .then(() => {
      console.log('KGSB Catalog seeding completed');
      process.exit(0);
    })
    .catch((error) => {
      console.error('KGSB Catalog seeding failed:', error);
      process.exit(1);
    });
}

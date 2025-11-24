const { connectDb } = require('./supabaseClient');

/**
 * Seeds sample materials data.
 * Uses INSERT ... ON CONFLICT to avoid duplicate inserts.
 */
async function seedMaterials() {
  const db = await connectDb();

  const sampleMaterials = [
    {
      material_code: 'CS-PIPE-6-SCH40-A106B',
      category: 'PIPE',
      spec_standard: 'ASTM A106',
      grade: 'Gr.B',
      material_type: 'Carbon Steel',
      origin_type: 'NON_CHINA',
      size_description: '6" SCH40',
      base_cost: 100,
      currency: 'USD',
      notes: null,
    },
    {
      material_code: 'CS-ELBOW-6-SCH40-A234WPB',
      category: 'FITTING',
      spec_standard: 'ASTM A234',
      grade: 'WPB',
      material_type: 'Carbon Steel',
      origin_type: 'NON_CHINA',
      size_description: '6" SCH40 LR 90°',
      base_cost: 45,
      currency: 'USD',
      notes: null,
    },
    {
      material_code: 'CS-FLANGE-6-150RF-A105',
      category: 'FLANGE',
      spec_standard: 'ANSI B16.5',
      grade: 'A105',
      material_type: 'Carbon Steel',
      origin_type: 'NON_CHINA',
      size_description: '6" 150# RF WN',
      base_cost: 60,
      currency: 'USD',
      notes: null,
    },
    {
      material_code: 'CS-PLATE-A516GR70-10MM',
      category: 'PLATE',
      spec_standard: 'ASTM A516',
      grade: 'Gr.70',
      material_type: 'Carbon Steel',
      origin_type: 'NON_CHINA',
      size_description: '10mm',
      base_cost: 80,
      currency: 'USD',
      notes: null,
    },
    {
      material_code: 'BOLT-A325-M20X60',
      category: 'BOLT_NUT',
      spec_standard: 'ASTM A325',
      grade: null,
      material_type: 'Alloy Steel',
      origin_type: 'NON_CHINA',
      size_description: 'M20 x 60',
      base_cost: 5,
      currency: 'USD',
      notes: null,
    },
  ];

  try {
    for (const material of sampleMaterials) {
      await db.query(
        `INSERT INTO materials (
          material_code, category, spec_standard, grade, material_type,
          origin_type, size_description, base_cost, currency, notes
        )
        VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10)
        ON CONFLICT (material_code) DO NOTHING`,
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
    }
    console.log('Materials seeded successfully');
  } catch (error) {
    console.error('Error seeding materials:', error);
    throw error;
  }
}

module.exports = {
  seedMaterials,
};


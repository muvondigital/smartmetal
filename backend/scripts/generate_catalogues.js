/**
 * Generator script for industrial-scale flange and fastener catalogues
 * 
 * Generates:
 *   - backend/seed/flanges_catalog.json (~150-250 entries)
 *   - backend/seed/fasteners_catalog.json (~150-250 entries)
 * 
 * Usage:
 *   cd backend
 *   node scripts/generate_catalogues.js
 */

const fs = require('fs');
const path = require('path');

// ============================================================================
// HELPER FUNCTIONS
// ============================================================================

function inchLabel(nps) {
  // 0.75 -> "0_75IN", 6 -> "6IN"
  if (nps % 1 === 0) {
    return `${nps}IN`;
  }
  return `${nps.toString().replace('.', '_')}IN`;
}

function metricLabel(d) {
  return `M${d}`;
}

function imperialLabel(d) {
  // 0.75 -> "0_75IN", 0.5 -> "0_5IN"
  if (d % 1 === 0) {
    return `${d}IN`;
  }
  return `${d.toString().replace('.', '_')}IN`;
}

function lengthLabelMm(mm) {
  return `${mm}`;
}

function lengthLabelInches(inches) {
  // e.g. 4 -> "4IN", 2.5 -> "2_5IN"
  if (inches % 1 === 0) {
    return `${inches}IN`;
  }
  return `${inches.toString().replace('.', '_')}IN`;
}

// ============================================================================
// FLANGE GENERATION
// ============================================================================

function buildFlangeMaterialCode({ flange_type, face_type, rating_class, grade, nps_inch, schedule }) {
  const face = face_type;
  const sizeLabel = inchLabel(nps_inch);
  const schedPart = schedule ? `-SCH${schedule}` : '';
  return `FLG-${flange_type}-${face}-${rating_class}-${grade}-${sizeLabel}${schedPart}`;
}

function buildFlangeDescription(entry) {
  const size = `${entry.nps_inch}"`;
  const schedPart = entry.schedule ? ` SCH${entry.schedule}` : '';
  return `${size} ${entry.rating_class}# ${entry.flange_type} ${entry.face_type} flange ${entry.standard} ${entry.grade}${schedPart}`;
}

function generateFlangesCatalog() {
  const NPS_SIZES = [0.5, 0.75, 1, 1.5, 2, 3, 4, 6, 8, 10, 12, 16, 20, 24];
  const LOW_RATINGS = [150, 300, 600];
  const HIGH_RATINGS = [900, 1500];
  const WN_SCHEDULES = ['40', '80'];

  const CS_GRADES = [
    { material_family: 'CS', standard: 'ASME B16.5', grade: 'A105N' },
    { material_family: 'LTCS', standard: 'ASME B16.5', grade: 'A350 LF2' }
  ];

  const SS_GRADES = [
    { material_family: 'SS', standard: 'ASME B16.5', grade: 'F304' },
    { material_family: 'SS', standard: 'ASME B16.5', grade: 'F316L' }
  ];

  const catalog = [];
  const materialCodes = new Set();

  // A. Weld Neck RF (WNRF, RF face) - CS grades, reduced combinations
  const wnrfCsNps = [2, 3, 4, 6, 8, 10, 12];
  for (const gradeInfo of CS_GRADES) {
    for (const nps of wnrfCsNps) {
      for (const rating of [150, 300]) {
        for (const schedule of WN_SCHEDULES) {
          const entry = {
            category: 'flange',
            flange_type: 'WNRF',
            face_type: 'RF',
            rating_class: rating,
            nps_inch: nps,
            schedule: schedule,
            material_family: gradeInfo.material_family,
            standard: gradeInfo.standard,
            grade: gradeInfo.grade
          };
          entry.material_code = buildFlangeMaterialCode(entry);
          entry.description = buildFlangeDescription(entry);

          if (!materialCodes.has(entry.material_code)) {
            materialCodes.add(entry.material_code);
            catalog.push(entry);
          }
        }
      }
    }
  }

  for (const gradeInfo of SS_GRADES) {
    const ssNpsSizes = [1, 1.5, 2, 3, 4, 6, 8, 10, 12];
    for (const nps of ssNpsSizes) {
      for (const rating of [150, 300, 600]) {
        for (const schedule of WN_SCHEDULES) {
          const entry = {
            category: 'flange',
            flange_type: 'WNRF',
            face_type: 'RF',
            rating_class: rating,
            nps_inch: nps,
            schedule: schedule,
            material_family: gradeInfo.material_family,
            standard: gradeInfo.standard,
            grade: gradeInfo.grade
          };
          entry.material_code = buildFlangeMaterialCode(entry);
          entry.description = buildFlangeDescription(entry);

          if (!materialCodes.has(entry.material_code)) {
            materialCodes.add(entry.material_code);
            catalog.push(entry);
          }
        }
      }
    }
  }

  // B. Weld Neck RTJ (WNRTJ, RTJ face)
  const wnrtjNpsSizes = [2, 3, 4, 6, 8, 10, 12, 16, 20, 24];
  for (const gradeInfo of CS_GRADES) {
    for (const nps of wnrtjNpsSizes) {
      for (const rating of [600, 900, 1500]) {
        const entry = {
          category: 'flange',
          flange_type: 'WNRTJ',
          face_type: 'RTJ',
          rating_class: rating,
          nps_inch: nps,
          schedule: '80',
          material_family: gradeInfo.material_family,
          standard: gradeInfo.standard,
          grade: gradeInfo.grade
        };
        entry.material_code = buildFlangeMaterialCode(entry);
        entry.description = buildFlangeDescription(entry);

        if (!materialCodes.has(entry.material_code)) {
          materialCodes.add(entry.material_code);
          catalog.push(entry);
        }
      }
    }
  }

  // C. Slip-On RF (SORF, RF)
  for (const nps of wnrfCsNps) {
    for (const rating of [150, 300]) {
      // A105N
      const entry1 = {
        category: 'flange',
        flange_type: 'SORF',
        face_type: 'RF',
        rating_class: rating,
        nps_inch: nps,
        schedule: null,
        material_family: 'CS',
        standard: 'ASME B16.5',
        grade: 'A105N'
      };
      entry1.material_code = buildFlangeMaterialCode(entry1);
      entry1.description = buildFlangeDescription(entry1);

      if (!materialCodes.has(entry1.material_code)) {
        materialCodes.add(entry1.material_code);
        catalog.push(entry1);
      }

      // F316L
      const entry2 = {
        category: 'flange',
        flange_type: 'SORF',
        face_type: 'RF',
        rating_class: rating,
        nps_inch: nps,
        schedule: null,
        material_family: 'SS',
        standard: 'ASME B16.5',
        grade: 'F316L'
      };
      entry2.material_code = buildFlangeMaterialCode(entry2);
      entry2.description = buildFlangeDescription(entry2);

      if (!materialCodes.has(entry2.material_code)) {
        materialCodes.add(entry2.material_code);
        catalog.push(entry2);
      }
    }
  }

  // D. Blind RF (BLRF, RF)
  for (const nps of wnrfCsNps) {
    for (const rating of [150, 300, 600]) {
      // A105N
      const entry1 = {
        category: 'flange',
        flange_type: 'BLRF',
        face_type: 'RF',
        rating_class: rating,
        nps_inch: nps,
        schedule: null,
        material_family: 'CS',
        standard: 'ASME B16.5',
        grade: 'A105N'
      };
      entry1.material_code = buildFlangeMaterialCode(entry1);
      entry1.description = buildFlangeDescription(entry1);

      if (!materialCodes.has(entry1.material_code)) {
        materialCodes.add(entry1.material_code);
        catalog.push(entry1);
      }

      // A350 LF2
      const entry2 = {
        category: 'flange',
        flange_type: 'BLRF',
        face_type: 'RF',
        rating_class: rating,
        nps_inch: nps,
        schedule: null,
        material_family: 'LTCS',
        standard: 'ASME B16.5',
        grade: 'A350 LF2'
      };
      entry2.material_code = buildFlangeMaterialCode(entry2);
      entry2.description = buildFlangeDescription(entry2);

      if (!materialCodes.has(entry2.material_code)) {
        materialCodes.add(entry2.material_code);
        catalog.push(entry2);
      }
    }
  }

  // E. Blind RTJ (BLRTJ, RTJ)
  const blrtjNpsSizes = [4, 6, 8, 10, 12, 16, 20, 24];
  for (const nps of blrtjNpsSizes) {
    for (const rating of [600, 900]) {
      const entry = {
        category: 'flange',
        flange_type: 'BLRTJ',
        face_type: 'RTJ',
        rating_class: rating,
        nps_inch: nps,
        schedule: null,
        material_family: 'CS',
        standard: 'ASME B16.5',
        grade: 'A105N'
      };
      entry.material_code = buildFlangeMaterialCode(entry);
      entry.description = buildFlangeDescription(entry);

      if (!materialCodes.has(entry.material_code)) {
        materialCodes.add(entry.material_code);
        catalog.push(entry);
      }
    }
  }

  return catalog;
}

// ============================================================================
// FASTENER GENERATION
// ============================================================================

function buildFastenerMaterialCode({ fastener_type, diameter_type, diameter_metric_m, diameter_imperial_in, length_mm, bolt_standard, bolt_grade, nut_standard, nut_grade, coating }) {
  const type = fastener_type.toUpperCase().replace('_', '');
  let diameterPart;
  if (diameter_type === 'metric') {
    diameterPart = metricLabel(diameter_metric_m);
  } else {
    diameterPart = imperialLabel(diameter_imperial_in);
  }

  let lengthPart = '';
  if (length_mm !== null) {
    if (diameter_type === 'metric') {
      lengthPart = `-${lengthLabelMm(length_mm)}`;
    } else {
      // Convert mm to inches for imperial
      const lengthInches = length_mm / 25.4;
      lengthPart = `-${lengthLabelInches(lengthInches)}`;
    }
  }

  let boltPart = '';
  if (bolt_standard && bolt_grade) {
    const std = bolt_standard.replace(/\s+/g, '').replace('ASTM', '');
    const grd = bolt_grade.replace(/\s+/g, '');
    boltPart = `-${std}${grd}`;
  }

  let nutPart = '';
  if (nut_standard && nut_grade) {
    const std = nut_standard.replace(/\s+/g, '').replace('ASTM', '');
    const grd = nut_grade.replace(/\s+/g, '');
    nutPart = `-${std}${grd}`;
  }

  const coatingPart = coating ? `-${coating}` : '';

  return `FAST-${type}-${diameterPart}${lengthPart}${boltPart}${nutPart}${coatingPart}`;
}

function buildFastenerDescription(entry) {
  if (entry.fastener_type === 'stud_bolt') {
    if (entry.diameter_type === 'metric') {
      return `M${entry.diameter_metric_m} x ${entry.length_mm}mm stud bolt ${entry.bolt_standard || ''} ${entry.bolt_grade || ''} with ${entry.nut_standard || ''} ${entry.nut_grade || ''} nuts, ${entry.coating.toLowerCase()}`;
    } else {
      const diameterInch = entry.diameter_imperial_in;
      const lengthInch = entry.length_mm / 25.4;
      return `${diameterInch}" x ${lengthInch}" stud bolt ${entry.bolt_standard || ''} ${entry.bolt_grade || ''} with ${entry.nut_standard || ''} ${entry.nut_grade || ''} nuts, ${entry.coating.toLowerCase()}`;
    }
  } else if (entry.fastener_type === 'hex_bolt') {
    if (entry.diameter_type === 'metric') {
      const stdPart = entry.bolt_standard ? `${entry.bolt_standard} ` : '';
      return `M${entry.diameter_metric_m} x ${entry.length_mm}mm hex bolt ${stdPart}${entry.bolt_grade || ''}, ${entry.coating.toLowerCase()}`;
    } else {
      const stdPart = entry.bolt_standard ? `${entry.bolt_standard} ` : '';
      const lengthInch = entry.length_mm / 25.4;
      return `${entry.diameter_imperial_in}" x ${lengthInch}" hex bolt ${stdPart}${entry.bolt_grade || ''}, ${entry.coating.toLowerCase()}`;
    }
  } else if (entry.fastener_type === 'nut') {
    if (entry.diameter_type === 'metric') {
      return `M${entry.diameter_metric_m} hex nut ${entry.nut_standard || ''} ${entry.nut_grade || ''}, ${entry.coating.toLowerCase()}`;
    } else {
      return `${entry.diameter_imperial_in}" hex nut ${entry.nut_standard || ''} ${entry.nut_grade || ''}, ${entry.coating.toLowerCase()}`;
    }
  } else if (entry.fastener_type === 'anchor_bolt') {
    return `M${entry.diameter_metric_m} x ${entry.length_mm}mm anchor bolt ${entry.bolt_standard || ''} ${entry.bolt_grade || ''}, ${entry.coating.toLowerCase()}`;
  }
  return `Fastener ${entry.fastener_type}`;
}

function generateFastenersCatalog() {
  const METRIC_DIAMETERS = [12, 16, 20, 24, 30];
  const IMPERIAL_DIAMETERS = [0.5, 0.625, 0.75, 0.875, 1.0];
  const METRIC_LENGTHS = [50, 60, 70, 80, 90, 100, 110, 120, 140, 160, 180, 200, 220, 240];
  const IMPERIAL_LENGTHS = [2, 2.5, 3, 3.5, 4, 4.5, 5, 6];

  const CS_BOLT_GRADES = [
    { bolt_standard: 'ASTM A193', bolt_grade: 'B7', material_family: 'CS' },
    { bolt_standard: 'ASTM A193', bolt_grade: 'B7M', material_family: 'CS' }
  ];

  const LTCS_BOLT_GRADES = [
    { bolt_standard: 'ASTM A320', bolt_grade: 'L7', material_family: 'LTCS' },
    { bolt_standard: 'ASTM A320', bolt_grade: 'L7M', material_family: 'LTCS' }
  ];

  const SS_BOLT_GRADES = [
    { bolt_standard: null, bolt_grade: 'SS304', material_family: 'SS' },
    { bolt_standard: null, bolt_grade: 'SS316', material_family: 'SS' }
  ];

  const NUT_GRADES = [
    { nut_standard: 'ASTM A194', nut_grade: '2H' },
    { nut_standard: 'ASTM A194', nut_grade: '7' }
  ];

  const COATINGS = ['PLAIN', 'GALVANIZED', 'PTFE'];

  const catalog = [];
  const materialCodes = new Set();

  // A. Metric stud bolts (with nuts)
  const metricStudLengths = [60, 80, 100, 120, 140, 160, 180, 200];
  for (const diameter of METRIC_DIAMETERS) {
    for (const length of metricStudLengths) {
      for (const boltGrade of [...CS_BOLT_GRADES, ...LTCS_BOLT_GRADES]) {
        const nutGrade = boltGrade.material_family === 'CS' 
          ? { nut_standard: 'ASTM A194', nut_grade: '2H' }
          : { nut_standard: 'ASTM A194', nut_grade: '7' };
        
        for (const coating of ['PLAIN', 'GALVANIZED']) {
          const entry = {
            category: 'fastener',
            fastener_type: 'stud_bolt',
            diameter_type: 'metric',
            diameter_metric_m: diameter,
            diameter_imperial_in: null,
            length_mm: length,
            bolt_standard: boltGrade.bolt_standard,
            bolt_grade: boltGrade.bolt_grade,
            nut_standard: nutGrade.nut_standard,
            nut_grade: nutGrade.nut_grade,
            material_family: boltGrade.material_family,
            coating: coating
          };
          entry.material_code = buildFastenerMaterialCode(entry);
          entry.description = buildFastenerDescription(entry);

          if (!materialCodes.has(entry.material_code)) {
            materialCodes.add(entry.material_code);
            catalog.push(entry);
          }
        }
      }
    }
  }

  // B. Imperial stud bolts (with nuts)
  for (const diameter of IMPERIAL_DIAMETERS) {
    for (const lengthInches of IMPERIAL_LENGTHS) {
      const lengthMm = Math.round(lengthInches * 25.4);
      for (const boltGrade of CS_BOLT_GRADES) {
        const nutGrade = { nut_standard: 'ASTM A194', nut_grade: '2H' };
        for (const coating of ['PLAIN', 'PTFE']) {
          const entry = {
            category: 'fastener',
            fastener_type: 'stud_bolt',
            diameter_type: 'imperial',
            diameter_metric_m: null,
            diameter_imperial_in: diameter,
            length_mm: lengthMm,
            bolt_standard: boltGrade.bolt_standard,
            bolt_grade: boltGrade.bolt_grade,
            nut_standard: nutGrade.nut_standard,
            nut_grade: nutGrade.nut_grade,
            material_family: boltGrade.material_family,
            coating: coating
          };
          entry.material_code = buildFastenerMaterialCode(entry);
          entry.description = buildFastenerDescription(entry);

          if (!materialCodes.has(entry.material_code)) {
            materialCodes.add(entry.material_code);
            catalog.push(entry);
          }
        }
      }
    }
  }

  // C. Metric hex bolts (no explicit nuts)
  const hexBoltLengths = [50, 60, 80, 100, 120, 150, 180];
  for (const diameter of METRIC_DIAMETERS) {
    for (const length of hexBoltLengths) {
      for (const boltGrade of [...CS_BOLT_GRADES, ...LTCS_BOLT_GRADES, ...SS_BOLT_GRADES]) {
        for (const coating of ['PLAIN', 'GALVANIZED']) {
          const entry = {
            category: 'fastener',
            fastener_type: 'hex_bolt',
            diameter_type: 'metric',
            diameter_metric_m: diameter,
            diameter_imperial_in: null,
            length_mm: length,
            bolt_standard: boltGrade.bolt_standard,
            bolt_grade: boltGrade.bolt_grade,
            nut_standard: null,
            nut_grade: null,
            material_family: boltGrade.material_family,
            coating: coating
          };
          entry.material_code = buildFastenerMaterialCode(entry);
          entry.description = buildFastenerDescription(entry);

          if (!materialCodes.has(entry.material_code)) {
            materialCodes.add(entry.material_code);
            catalog.push(entry);
          }
        }
      }
    }
  }

  // D. Nuts only
  for (const diameter of METRIC_DIAMETERS) {
    for (const nutGrade of NUT_GRADES) {
      for (const coating of ['PLAIN', 'GALVANIZED']) {
        const entry = {
          category: 'fastener',
          fastener_type: 'nut',
          diameter_type: 'metric',
          diameter_metric_m: diameter,
          diameter_imperial_in: null,
          length_mm: null,
          bolt_standard: null,
          bolt_grade: null,
          nut_standard: nutGrade.nut_standard,
          nut_grade: nutGrade.nut_grade,
          material_family: 'CS', // Default for nuts
          coating: coating
        };
        entry.material_code = buildFastenerMaterialCode(entry);
        entry.description = buildFastenerDescription(entry);

        if (!materialCodes.has(entry.material_code)) {
          materialCodes.add(entry.material_code);
          catalog.push(entry);
        }
      }
    }
  }

  for (const diameter of IMPERIAL_DIAMETERS) {
    for (const nutGrade of NUT_GRADES) {
      for (const coating of ['PLAIN', 'GALVANIZED']) {
        const entry = {
          category: 'fastener',
          fastener_type: 'nut',
          diameter_type: 'imperial',
          diameter_metric_m: null,
          diameter_imperial_in: diameter,
          length_mm: null,
          bolt_standard: null,
          bolt_grade: null,
          nut_standard: nutGrade.nut_standard,
          nut_grade: nutGrade.nut_grade,
          material_family: 'CS',
          coating: coating
        };
        entry.material_code = buildFastenerMaterialCode(entry);
        entry.description = buildFastenerDescription(entry);

        if (!materialCodes.has(entry.material_code)) {
          materialCodes.add(entry.material_code);
          catalog.push(entry);
        }
      }
    }
  }

  // E. Anchor bolts (small set)
  const anchorDiameters = [16, 20, 24];
  const anchorLengths = [300, 400, 500];
  for (const diameter of anchorDiameters) {
    for (const length of anchorLengths) {
      for (const boltGrade of CS_BOLT_GRADES) {
        const entry = {
          category: 'fastener',
          fastener_type: 'anchor_bolt',
          diameter_type: 'metric',
          diameter_metric_m: diameter,
          diameter_imperial_in: null,
          length_mm: length,
          bolt_standard: boltGrade.bolt_standard,
          bolt_grade: boltGrade.bolt_grade,
          nut_standard: null,
          nut_grade: null,
          material_family: boltGrade.material_family,
          coating: 'GALVANIZED'
        };
        entry.material_code = buildFastenerMaterialCode(entry);
        entry.description = buildFastenerDescription(entry);

        if (!materialCodes.has(entry.material_code)) {
          materialCodes.add(entry.material_code);
          catalog.push(entry);
        }
      }
    }
  }

  return catalog;
}

// ============================================================================
// MAIN EXECUTION
// ============================================================================

function main() {
  console.log('='.repeat(60));
  console.log('Generating Industrial Catalogue JSON Files');
  console.log('='.repeat(60));
  console.log();

  // Generate flanges catalog
  console.log('Generating flanges catalogue...');
  const flangesCatalog = generateFlangesCatalog();
  const flangesPath = path.join(__dirname, '..', 'seed', 'flanges_catalog.json');
  fs.writeFileSync(flangesPath, JSON.stringify(flangesCatalog, null, 2), 'utf8');
  console.log(`✓ Generated ${flangesCatalog.length} flange entries`);
  console.log(`  Written to: ${flangesPath}`);
  console.log();

  // Generate fasteners catalog
  console.log('Generating fasteners catalogue...');
  const fastenersCatalog = generateFastenersCatalog();
  const fastenersPath = path.join(__dirname, '..', 'seed', 'fasteners_catalog.json');
  fs.writeFileSync(fastenersPath, JSON.stringify(fastenersCatalog, null, 2), 'utf8');
  console.log(`✓ Generated ${fastenersCatalog.length} fastener entries`);
  console.log(`  Written to: ${fastenersPath}`);
  console.log();

  // Summary
  console.log('='.repeat(60));
  console.log('SUMMARY');
  console.log('='.repeat(60));
  console.log();
  console.log(`Flanges Catalogue:`);
  console.log(`  Path: ${flangesPath}`);
  console.log(`  Entries: ${flangesCatalog.length}`);
  if (flangesCatalog.length > 0) {
    console.log(`  Sample material codes:`);
    flangesCatalog.slice(0, 5).forEach(entry => {
      console.log(`    - ${entry.material_code}`);
    });
  }
  console.log();
  console.log(`Fasteners Catalogue:`);
  console.log(`  Path: ${fastenersPath}`);
  console.log(`  Entries: ${fastenersCatalog.length}`);
  if (fastenersCatalog.length > 0) {
    console.log(`  Sample material codes:`);
    fastenersCatalog.slice(0, 5).forEach(entry => {
      console.log(`    - ${entry.material_code}`);
    });
  }
  console.log();
  console.log('='.repeat(60));
  console.log('Generation completed successfully!');
  console.log('='.repeat(60));
  console.log();
  console.log('Next steps:');
  console.log('  cd backend');
  console.log('  npm run seed:flanges');
  console.log('  npm run seed:fasteners');
  console.log();
}

if (require.main === module) {
  main();
}

module.exports = {
  generateFlangesCatalog,
  generateFastenersCatalog
};


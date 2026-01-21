// backend/src/seeds/pdk2025_tariff_keywords.ts

export interface TariffKeywordSeed {
    keyword: string;                // SmartMetal material keyword (pipe, flange, etc.)
    schedule_code: string;          // e.g. "PDK2025"
    country: string;                // for future multi-country support
    hs_chapters: string[];          // HS chapter-level references (2–4 digit)
    example_hs_codes: string[];     // a few concrete examples from PDK 2025
    source: string;                 // where this mapping came from
    notes?: string;                 // free text notes
    is_active: boolean;
  }
  
  export const PDK2025_TARIFF_KEYWORDS: TariffKeywordSeed[] = [
    // 1. PIPE
    {
      keyword: "pipe",
      schedule_code: "PDK2025",
      country: "MY",
      hs_chapters: [
        "6811",
        "6906",
        "7019",
        "7303",
        "7304",
        "7305",
        "7306",
        "7307",
        "7326",
        "7507",
        "7609",
        "7806",
        "7907",
        "8007",
        "8203",
        "8708",
        "9614"
      ],
      example_hs_codes: [
        "6811.40.3000", // Tubes or pipes (refractory)
        "7303.00.1100", // Hubless tubes and pipes (cast iron)
        "7304.31.2000", // High-pressure pipe (seamless)
        "7305.31.1000", // Stainless steel pipes and tubes
        "7306.90.9100", // Other high-pressure pipes
        "7307.11.1000"  // Hubless tube or pipe fittings
      ],
      source: "ezHS PDK 2025 search: 'pipe%'",
      notes:
        "Covers tubes, pipes and high-pressure pipes in cast iron, steel, stainless, alloy and other metals, including hubless pipe systems and small-diameter heater pipes.",
      is_active: true
    },
  
    // 2. TUBE / TUBES
    {
      keyword: "tube",
      schedule_code: "PDK2025",
      country: "MY",
      hs_chapters: [
        "3917",
        "4009",
        "6811",
        "6906",
        "7002",
        "7011",
        "7017",
        "7020",
        "7303",
        "7305",
        "7306",
        "7806",
        "7907",
        "8007",
        "8419",
        "8422",
        "8424",
        "8441",
        "8475",
        "8477",
        "8504",
        "8539",
        "8540",
        "8549",
        "9022",
        "9301"
      ],
      example_hs_codes: [
        "3917.31",      // Flexible plastic tubes and hoses
        "7002.32.3000", // Borosilicate glass tubes for phials/ampoules
        "7305.31.1000", // Stainless steel pipes and tubes
        "7306.40.2000", // Stainless steel tubes >105 mm OD
        "7806.00.3000"  // Tubes, pipes and fittings of lead
      ],
      source: "ezHS PDK 2025 search: 'tubes%'",
      notes:
        "General tube/tubes keyword; includes plastic, glass, steel and special-purpose tubes. For SmartMetal we mostly care about steel/non-ferrous tubes in Chapters 73, 74–80.",
      is_active: true
    },
  
    // 3. FLANGE / FLANGES
    {
      keyword: "flange",
      schedule_code: "PDK2025",
      country: "MY",
      hs_chapters: ["3917", "4009", "7307"],
      example_hs_codes: [
        "3917.33",   // Plastic tubes, pipes and hoses with fittings (including flanges)
        "4009.12",   // Rubber tubes/hoses with fittings (including flanges)
        "7307.21",   // Tube or pipe fittings of iron/steel, flanges
        "7307.91"    // Other flanges of iron or steel
      ],
      source: "ezHS PDK 2025 search: 'flanges%'",
      notes:
        "Main engineering relevance is iron/steel tube or pipe flanges under 7307.21/7307.91. Plastic/rubber flanges also shown in PDK but less critical to SmartMetal core.",
      is_active: true
    },
  
    // 4. FITTINGS
    {
      keyword: "fitting",
      schedule_code: "PDK2025",
      country: "MY",
      hs_chapters: [
        "3917",
        "4009",
        "6811",
        "6906",
        "7307",
        "7326",
        "7412",
        "7507",
        "7609",
        "7806",
        "7907",
        "8007",
        "8302",
        "8305",
        "8547",
        "8608",
        "8708",
        "9405"
      ],
      example_hs_codes: [
        "3917.40.0000", // Plastic fittings
        "6811.40.4000", // Tube or pipe fittings (refractory/ceramic)
        "7307.11.1000", // Hubless tube or pipe fittings
        "7307.23",      // Butt welding fittings (iron or steel)
        "7307.93"       // Other butt welding fittings
      ],
      source: "ezHS PDK 2025 search: 'fittings%'",
      notes:
        "Tube/pipe fittings in multiple materials, with core mechanical items under heading 7307. Cast/ceramic/Al/Cu fittings also appear.",
      is_active: true
    },
  
    // 5. VALVE / VALVES
    {
      keyword: "valve",
      schedule_code: "PDK2025",
      country: "MY",
      hs_chapters: ["8475", "8481", "8540"],
      example_hs_codes: [
        "8481.10.1100", // Manually operated sluice/gate valves
        "8481.20",      // Valves for oleohydraulic/pneumatic transmissions
        "8481.30.1000", // Swing check-valves of cast iron
        "8481.40",      // Safety or relief valves
        "8481.80.3000"  // Gas appliance valves
      ],
      source: "ezHS PDK 2025 search: 'valve%'",
      notes:
        "Covers industrial valves for pipelines, LPG, fuel cut-off, etc. Core classification under 8481 for SmartMetal purposes.",
      is_active: true
    },
  
    // 6. PLATE / PLATES
    {
      keyword: "plate",
      schedule_code: "PDK2025",
      country: "MY",
      hs_chapters: [
        "3407",
        "3701",
        "3704",
        "3920",
        "4002",
        "4003",
        "4005",
        "4413",
        "4502",
        "4504",
        "4812",
        "4816",
        "6501",
        "6814",
        "7113",
        "7114",
        "7209",
        "7210",
        "7211",
        "7212",
        "7225",
        "7226",
        "7302",
        "7308",
        "7310",
        "7312",
        "7314",
        "7408",
        "7606",
        "7907",
        "8007",
        "8102",
        "8209",
        "8306",
        "8310",
        "8442",
        "8516",
        "9001",
        "9010",
        "9111",
        "9113",
        "9114",
        "9603",
        "9608"
      ],
      example_hs_codes: [
        "7209.18.1000", // Tin-mill blackplate
        "7211.13.1400", // Universal plates (non-alloy steel)
        "7212.50.1400", // Universal plates plated/coated
        "7302.40.0000", // Fish-plates and sole plates (railway)
        "7606.12.2000"  // Aluminium plates (printing)
      ],
      source: "ezHS PDK 2025 search: 'plate%'",
      notes:
        "Very broad. For SmartMetal focus on flat-rolled steel plates/sheets in Chapters 72–73 plus metal plates in 74–80.",
      is_active: true
    },
  
    // 7. SHEET / SHEETS
    {
      keyword: "sheet",
      schedule_code: "PDK2025",
      country: "MY",
      hs_chapters: [
        "3920",
        "3921",
        "4001",
        "4002",
        "4003",
        "4005",
        "4008",
        "4115",
        "4202",
        "4408",
        "4502",
        "4504",
        "4801",
        "4802",
        "4803",
        "4807",
        "4810",
        "4811",
        "4823",
        "5906",
        "6806",
        "6811",
        "6812",
        "6814",
        "7003",
        "7019",
        "7207",
        "7301",
        "7308",
        "7606",
        "7804",
        "8007",
        "8101",
        "8102",
        "8484",
        "9001",
        "8443"
      ],
      example_hs_codes: [
        "6811.40.1000", // Corrugated sheets (refractory)
        "7301.10.0000", // Sheet piling
        "7308.90.4000", // Corrugated/curved galvanised plates/sheets (conduits, culverts)
        "7606.12.3400", // Litho-grade aluminium sheet
        "8007.00.2000"  // Plates, sheets and strip of tin
      ],
      source: "ezHS PDK 2025 search: 'sheet%'",
      notes:
        "Similar spread as PLATE. For piping/structural steel, most relevant are sheet piling, corrugated steel sheets and metal sheets for fabrication.",
      is_active: true
    },
  
    // 8. BEAM / BEAMS
    {
      keyword: "beam",
      schedule_code: "PDK2025",
      country: "MY",
      hs_chapters: ["4418", "5911", "8456", "8486", "8514", "8539"],
      example_hs_codes: [
        "4418.30.0000", // Posts and beams of wood
        "4418.83.0000", // I-beams of wood
        "8456.12",      // Machine tools by light/photon beam
        "8486.40.1000", // Focused ion beam milling machines
        "8514.31"       // Electron beam furnaces
      ],
      source: "ezHS PDK 2025 search: 'beam%'",
      notes:
        "Only limited direct relevance to rolled steel beams; many hits relate to laser/electron beams or wooden beams. Steel I/H beams are generally under 7216 (sections).",
      is_active: true
    },
  
    // 9. SECTION / SECTIONS
    {
      keyword: "section",
      schedule_code: "PDK2025",
      country: "MY",
      hs_chapters: [
        "3901",
        "5405",
        "5407",
        "7207",
        "7213",
        "7214",
        "7215",
        "7216",
        "7218",
        "7222",
        "7223",
        "7228",
        "7301",
        "7306",
        "7308",
        "7314",
        "7403",
        "7407",
        "7408",
        "7605",
        "7605",
        "7610",
        "8306",
        "9013"
      ],
      example_hs_codes: [
        "7216.10.0000", // U, I or H sections <80mm
        "7216.22.0000", // T sections
        "7216.31",      // U sections 80mm+
        "7216.32",      // I sections 80mm+
        "7301.20.0000"  // Angles, shapes and sections (iron/steel)
      ],
      source: "ezHS PDK 2025 search: 'section%'",
      notes:
        "Key for structural shapes: angles, channels, I/H beams. This is where rolled structural steel is primarily classified.",
      is_active: true
    },
  
    // 10. ANGLE / ANGLES
    {
      keyword: "angle",
      schedule_code: "PDK2025",
      country: "MY",
      hs_chapters: ["7216", "7222", "7228", "7301", "7117", "8308", "8431"],
      example_hs_codes: [
        "7216.50",       // Other angles, shapes and sections, hot-rolled
        "7216.91.1000",  // Angles with ≥0.6% C
        "7222.40",       // Stainless angles/shapes/sections
        "7228.70",       // Alloy steel angles/shapes/sections
        "7301.20.0000"   // Angles, shapes and sections (iron/steel)
      ],
      source: "ezHS PDK 2025 search: 'angle%'",
      notes:
        "Structural angles in carbon, stainless and alloy steels. Important for structural BOM and customs risk mapping.",
      is_active: true
    },
  
    // 11. GRATING / GRATINGS
    {
      keyword: "grating",
      schedule_code: "PDK2025",
      country: "MY",
      hs_chapters: ["7325"],
      example_hs_codes: [
        "7325.10.2000", // Manhole covers, gratings and frames
        "7325.99.2000"  // Other manhole covers, gratings and frames
      ],
      source: "ezHS PDK 2025 search: 'grating%'",
      notes:
        "Heavy cast iron/steel gratings (e.g. manhole covers) used around plant and yard; narrow but clearly mapped.",
      is_active: true
    },
  
    // 12. GASKET / GASKETS
    {
      keyword: "gasket",
      schedule_code: "PDK2025",
      country: "MY",
      hs_chapters: ["6812", "4016", "5911", "8484"],
      example_hs_codes: [
        "6812.90",        // Fabricated asbestos fibre gaskets
        "4016.93.2000",   // Gaskets and o-rings for motor vehicles
        "5911.90.1000",   // Gaskets and seals (technical textiles)
        "8484.10.0000"    // Metal-jacketed gaskets, mechanical seals
      ],
      source: "ezHS PDK 2025 search: 'gasket%'",
      notes:
        "Covers soft, rubber, asbestos-free and metal-jacketed gaskets. For SmartMetal, typically linked to pipe-class items under 8484/4016.",
      is_active: true
    },
  
    // 13. BOLT / BOLTS
    {
      keyword: "bolt",
      schedule_code: "PDK2025",
      country: "MY",
      hs_chapters: ["2710", "5911", "7318", "7415", "7508", "7616", "7907", "8203", "9306"],
      example_hs_codes: [
        "7318.15",       // Other screws and bolts (iron/steel)
        "7318.16.1000",  // Bolts ≤16mm shank
        "7415.33.2000",  // Copper bolts and nuts
        "7508.90.3000",  // Nickel bolts and nuts
        "7616.10.2000"   // Aluminium bolts and nuts
      ],
      source: "ezHS PDK 2025 search: 'bolt%'",
      notes:
        "Fastening bolts across multiple metals. Main engineering fasteners in iron/steel under 7318.",
      is_active: true
    },
  
    // 14. NUT / NUTS (mechanical)
    {
      keyword: "nut",
      schedule_code: "PDK2025",
      country: "MY",
      hs_chapters: ["7318", "7415", "7508", "7616", "7907"],
      example_hs_codes: [
        "7318.16",       // Nuts (iron/steel)
        "7415.33.2000",  // Copper bolts and nuts
        "7508.90.3000",  // Nickel bolts and nuts
        "7616.10.2000",  // Aluminium bolts and nuts
        "7907.00.9300"   // Zinc fastening including nuts/bolts
      ],
      source: "ezHS PDK 2025 search: 'nuts%' (filtered to mechanical fasteners)",
      notes:
        "Edible nuts are also in PDK; SmartMetal only cares about mechanical nuts under 7318/7415/7508/7616/7907.",
      is_active: true
    },
  
    // 15. WASHER / WASHERS
    {
      keyword: "washer",
      schedule_code: "PDK2025",
      country: "MY",
      hs_chapters: ["6813", "4016", "7318", "7415", "7616", "7806"],
      example_hs_codes: [
        "6813.20",       // Friction material washers
        "4016.93",       // Gaskets, washers and seals
        "7318.21.0000",  // Spring and lock washers of iron/steel
        "7318.22.0000",  // Other washers of iron/steel
        "7415.21.0000"   // Copper washers (including spring washers)
      ],
      source: "ezHS PDK 2025 search: 'washer%'",
      notes:
        "Flat, spring and lock washers across key metals plus friction material washers for brakes and clutches.",
      is_active: true
    },
  
    // 16. STUD / STUDS (mechanical)
    {
      keyword: "stud",
      schedule_code: "PDK2025",
      country: "MY",
      hs_chapters: ["7315", "9606", "7117"],
      example_hs_codes: [
        "7315.81.0000", // Stud-link chain
        "7117.11",      // Cuff-links and studs (jewellery)
        "9606.10"       // Press-fasteners, snap-fasteners and press-studs
      ],
      source: "ezHS PDK 2025 search: 'stud%' (filtered to metal/fastener contexts)",
      notes:
        "Customs meaning of 'stud' includes decorative studs and chain links; SmartMetal may only loosely map to mechanical stud-bolts here.",
      is_active: true
    },
  
    // 17. FASTENER / FASTENERS
    {
      keyword: "fastener",
      schedule_code: "PDK2025",
      country: "MY",
      hs_chapters: ["5806", "7604", "9606"],
      example_hs_codes: [
        "5806.31.3000", // Ribbon for slide fasteners
        "5806.39.9300", // Other ribbons for slide fasteners
        "7604.29.3000", // Y-shaped aluminium zip profiles
        "9606.10"       // Press/snap fasteners, press-studs
      ],
      source: "ezHS PDK 2025 search: 'fastener%'",
      notes:
        "PDK 'fastener' hits are mostly for zips and garment-type fasteners, not structural metal fasteners. Core structural fasteners are instead under 7318 and are handled via bolt/nut/washer keywords.",
      is_active: true
    }
  ];
  
  // Optional example: Knex seed wrapper
  // (You can adapt this to your actual DB layer.)
  /*
  import type { Knex } from "knex";
  
  export async function seed(knex: Knex): Promise<void> {
    await knex("tariff_keyword_groups").del();
    await knex("tariff_keyword_groups").insert(
      PDK2025_TARIFF_KEYWORDS.map((row) => ({
        keyword: row.keyword,
        schedule_code: row.schedule_code,
        country: row.country,
        hs_chapters: JSON.stringify(row.hs_chapters),
        example_hs_codes: JSON.stringify(row.example_hs_codes),
        source: row.source,
        notes: row.notes ?? null,
        is_active: row.is_active
      }))
    );
  }
  */
  
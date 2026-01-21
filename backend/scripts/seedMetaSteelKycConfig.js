/**
 * Seed MetaSteel KYC Configuration
 * 
 * Creates a complete, realistic KYC profile for MetaSteel tenant with:
 * - Operator/AML rules (fictional but realistic)
 * - Notification rules
 * - Intelligence configuration
 * - Pricing policies and thresholds
 * - All stored in tenant_settings table
 * 
 * Pattern copied from: backend/src/config/operatorRules.js, notificationRules.js, intelligenceConfig.js, pricingRules.js
 * Tenant key: 'metasteel'
 * 
 * This is demo/fictional data for SmartMetal testing and demonstrations.
 * 
 * Usage: node scripts/seedMetaSteelKycConfig.js
 */

require('dotenv').config();
const { connectMigrationDb } = require('../src/db/supabaseClient');

/**
 * MetaSteel Operator Rules Configuration
 * 
 * HYBRID supplier operating in Malaysia + ASEAN + Middle East
 * Operators: PETRONAS, PRefChem, PTTEP, QatarEnergy, Shell, ExxonMobil
 */
const metaSteelOperatorRules = {
  // PETRONAS - China allowed for most, Non-China preferred for critical items
  PETRONAS: {
    allowedOrigins: ['CHINA', 'NON_CHINA'],
    bannedOrigins: [],
    requiresAml: true,
    amlSource: 'PETRONAS_LATEST',
    requiredCerts: ['API', 'ISO', 'ASME'],
    notes: 'PETRONAS AML/AVL used. China allowed for most categories, but Non-China preferred for critical items (valves, high-pressure piping).'
  },

  // PRefChem (RAPID) - Non-China required for pressure-retaining items
  PREFCHEM: {
    allowedOrigins: ['NON_CHINA'],
    bannedOrigins: ['CHINA'],
    requiresAml: false,
    amlSource: null,
    requiredCerts: ['PED', 'NACE', 'API', 'ASME'],
    notes: 'RAPID / PRefChem: NON-CHINA required for pressure-retaining items. China allowed for structural/accessories only.'
  },
  RAPID: {
    allowedOrigins: ['NON_CHINA'],
    bannedOrigins: ['CHINA'],
    requiresAml: false,
    amlSource: null,
    requiredCerts: ['PED', 'NACE', 'API', 'ASME'],
    notes: 'RAPID / PRefChem: NON-CHINA required for pressure-retaining items. China allowed for structural/accessories only.'
  },

  // PTT / PTTEP - Non-China required for pressure-retaining items
  PTT: {
    allowedOrigins: ['NON_CHINA'],
    bannedOrigins: ['CHINA'],
    requiresAml: false,
    amlSource: null,
    requiredCerts: ['API', 'ASME', 'ISO'],
    notes: 'PTT: NON-CHINA required for pressure-retaining items. China allowed for structural/accessories only.'
  },
  PTTEP: {
    allowedOrigins: ['NON_CHINA'],
    bannedOrigins: ['CHINA'],
    requiresAml: false,
    amlSource: null,
    requiredCerts: ['API', 'ASME', 'ISO'],
    notes: 'PTTEP: NON-CHINA required for pressure-retaining items. China allowed for structural/accessories only.'
  },

  // QatarEnergy / Qatargas - Non-China required for pressure-retaining items
  QATARENERGY: {
    allowedOrigins: ['NON_CHINA'],
    bannedOrigins: ['CHINA'],
    requiresAml: false,
    amlSource: null,
    requiredCerts: ['API', 'ASME', 'ISO', 'NACE'],
    notes: 'QatarEnergy: NON-CHINA required for pressure-retaining items. China allowed for structural/accessories only.'
  },
  QATARGAS: {
    allowedOrigins: ['NON_CHINA'],
    bannedOrigins: ['CHINA'],
    requiresAml: false,
    amlSource: null,
    requiredCerts: ['API', 'ASME', 'ISO', 'NACE'],
    notes: 'Qatargas: NON-CHINA required for pressure-retaining items. China allowed for structural/accessories only.'
  },

  // Shell - Global operator, flexible origin
  SHELL: {
    allowedOrigins: ['CHINA', 'NON_CHINA'],
    bannedOrigins: [],
    requiresAml: false,
    amlSource: null,
    requiredCerts: ['API', 'ISO'],
    notes: 'Shell: Flexible origin policy, API and ISO certifications required.'
  },

  // ExxonMobil - Global operator, flexible origin
  EXXONMOBIL: {
    allowedOrigins: ['CHINA', 'NON_CHINA'],
    bannedOrigins: [],
    requiresAml: false,
    amlSource: null,
    requiredCerts: ['API', 'ISO'],
    notes: 'ExxonMobil: Flexible origin policy, API and ISO certifications required.'
  },
};

/**
 * MetaSteel Approved Mills by Operator
 * Fictional mills/vendors for demo purposes
 */
const metaSteelApprovedMillsByOperator = {
  PETRONAS: {
    piping_and_fittings: ['SteelAsia Pipe Mills', 'NordicFlange AB', 'Mariner Valves BV'],
    structural_piping_and_fittings: ['SteelAsia Pipe Mills', 'Pacific Steel Works']
  },
  PREFCHEM: {
    piping_and_fittings: ['NordicFlange AB', 'Mariner Valves BV'],
    structural_piping_and_fittings: ['Pacific Steel Works']
  },
  RAPID: {
    piping_and_fittings: ['NordicFlange AB', 'Mariner Valves BV'],
    structural_piping_and_fittings: ['Pacific Steel Works']
  },
  PTTEP: {
    piping_and_fittings: ['SteelAsia Pipe Mills', 'NordicFlange AB'],
    structural_piping_and_fittings: ['Pacific Steel Works']
  },
  QATARENERGY: {
    piping_and_fittings: ['NordicFlange AB', 'Mariner Valves BV'],
    structural_piping_and_fittings: ['Pacific Steel Works']
  },
  QATARGAS: {
    piping_and_fittings: ['NordicFlange AB', 'Mariner Valves BV'],
    structural_piping_and_fittings: ['Pacific Steel Works']
  },
};

/**
 * MetaSteel Approved Vendors by Operator
 */
const metaSteelApprovedVendorsByOperator = {
  PETRONAS: ['SteelAsia Pipe Mills', 'NordicFlange AB'],
  PREFCHEM: ['NordicFlange AB'],
  RAPID: ['NordicFlange AB'],
  PTTEP: ['SteelAsia Pipe Mills'],
  QATARENERGY: ['NordicFlange AB'],
  QATARGAS: ['NordicFlange AB'],
};

/**
 * MetaSteel Notification Rules Configuration
 */
const metaSteelNotificationRules = {
  rfqPricing: {
    newRfqCreated: {
      recipients: [
        'sales@metasteel.com',
        'pricing@metasteel.com'
      ],
      backup: 'manager@metasteel.com',
      frequency: 'IMMEDIATE',
      notes: 'Notify primary sales and pricing teams when new RFQ is created'
    },
    rfqBelowMarginThreshold: {
      recipients: ['head.pricing@metasteel.com'],
      backup: null,
      frequency: 'IMMEDIATE',
      notes: 'Notify pricing head when margin falls below threshold'
    },
    rfqPendingApproval: {
      recipients: ['head.pricing@metasteel.com'],
      backup: null,
      frequency: 'IMMEDIATE',
      notes: 'Notify approver when quote requires approval'
    },
    rfqOverdue: {
      recipients: ['ops@metasteel.com'],
      backup: null,
      frequency: 'DAILY',
      notes: 'Notify operations team of overdue RFQs'
    }
  },
  renewalLme: {
    contractExpiringSoon: {
      recipient: 'sales@metasteel.com',
      frequency: 'DAILY',
      notes: 'Daily notification of contracts expiring within threshold period'
    },
    lmeMovementTriggersAdjustment: {
      recipient: 'pricing@metasteel.com',
      frequency: 'WEEKLY',
      notes: 'Weekly notification when LME movements suggest price adjustments'
    },
    renewalEmailDraftsReady: {
      recipient: 'sales@metasteel.com',
      frequency: 'MONTHLY',
      notes: 'Monthly notification when renewal email drafts are generated'
    }
  },
  supplierLogistics: {
    newFreightRateUpdates: {
      recipient: 'logistics@metasteel.com',
      frequency: 'IMMEDIATE',
      notes: 'Notify logistics coordinator of freight rate changes'
    },
    supplierPriceListUpdated: {
      recipient: 'pricing@metasteel.com',
      frequency: 'IMMEDIATE',
      notes: 'Notify pricing lead when supplier price lists are updated'
    },
    dutyOrHsCodeChanges: {
      recipient: 'logistics@metasteel.com',
      frequency: 'IMMEDIATE',
      notes: 'Notify logistics coordinator of duty/HS code changes'
    }
  }
};

/**
 * MetaSteel Intelligence Configuration
 */
const metaSteelIntelligenceConfig = {
  focusRegions: {
    malaysia: true,
    indonesia: true,
    vietnam: true,
    thailand: true,
    singapore: true,
    middle_east: true
  },
  focusIndustries: {
    oil_and_gas: true,
    power_generation: true,
    marine_shipbuilding: true,
    steel_fabrication: true,
    infrastructure: true,
    geothermal: false,
    chemical_process: true
  },
  strategicClients: [
    { name: 'Bayu Offshore Services', priority: 'HIGH' },
    { name: 'Penang Energy Solutions', priority: 'HIGH' },
    { name: 'StrataSteel Fabricators', priority: 'MEDIUM' },
    { name: 'Nusantara Marine Yards', priority: 'MEDIUM' },
    { name: 'UrbanNova Infrastructure Sdn Bhd', priority: 'LOW' }
  ],
  autoUpdateSettings: {
    updateLmeEveryCycle: {
      auto: false,
      requireApproval: true,
      notes: 'LME price updates from exchanges'
    },
    updateFreightOnNewData: {
      auto: false,
      requireApproval: true,
      notes: 'Freight rate updates from logistics providers'
    },
    updateSupplierPriceLists: {
      auto: false,
      requireApproval: true,
      notes: 'Supplier price list imports'
    },
    autoAdjustRenewalRecommendations: {
      auto: true,
      requireApproval: false,
      notes: 'Automatic renewal pricing suggestions based on LME'
    },
    autoTagRiskAlerts: {
      auto: false,
      requireApproval: true,
      notes: 'Risk alerts for margin/pricing issues'
    }
  },
  sensitivity: {
    pricingSuggestions: 'MEDIUM',
    renewalSuggestions: 'MEDIUM',
    marketIntelligenceAlerts: 'HIGH'
  },
  reportFrequencies: {
    winRateAnalysis: 'WEEKLY',
    marginBandPerformance: 'WEEKLY',
    supplierPerformance: 'WEEKLY',
    marketPriceMovement: 'MONTHLY',
    lmeMovementSummary: 'MONTHLY'
  }
};

/**
 * MetaSteel Approval Rules Configuration
 * Based on approvalRules.js structure
 */
const metaSteelApprovalRules = {
  sla: {
    sales: {
      hours: 24,
      description: 'Sales approval must be completed within 24 hours'
    },
    procurement: {
      hours: 48,
      description: 'Procurement approval must be completed within 48 hours'
    },
    management: {
      hours: 48,
      description: 'Management approval must be completed within 48 hours'
    },
    backupApprover: {
      idleHours: 24,
      description: 'Backup approver assigned after 24 hours of inactivity'
    }
  },
  valueThresholds: {
    VALUE_LOW: 100000,
    VALUE_MID: 500000,
    VALUE_HIGH: 1000000,
    currency: 'MYR',
    description: 'Value-based approval routing thresholds'
  },
  marginThresholds: {
    MARGIN_LOW_MAX: 8,
    MARGIN_MED_MIN: 8,
    MARGIN_MED_MAX: 15,
    MARGIN_HIGH_MIN: 15,
    description: 'Margin percentage thresholds for approval routing'
  },
  discountThresholds: {
    DISCOUNT_LOW_MAX: 10,
    DISCOUNT_MED_MIN: 10,
    DISCOUNT_MED_MAX: 15,
    DISCOUNT_HIGH_MIN: 15,
    description: 'Discount percentage thresholds for approval routing'
  },
  thresholds: {
    procurement: {
      quoteValueThreshold: {
        value: 100000,
        currency: 'MYR',
        description: 'Quote value threshold requiring procurement review'
      },
      marginThreshold: {
        value: 0.08,
        description: 'Minimum margin threshold requiring procurement review'
      },
      projectTypeExceptions: ['rush', 'urgent'],
      clientTypeExceptions: [],
      requiresCustomPricing: true,
      requiresNewMaterials: true
    },
    management: {
      quoteValueThreshold: {
        value: 500000,
        currency: 'MYR',
        description: 'Quote value threshold requiring management review'
      },
      marginThreshold: {
        value: 0.08,
        description: 'Minimum margin threshold requiring management review'
      },
      discountThreshold: {
        value: 0.15,
        description: 'Maximum discount threshold requiring management review'
      },
      projectTypeExceptions: ['rush', 'urgent'],
      clientTypeExceptions: [],
      rushProjectHighDiscount: {
        enabled: true,
        discountThreshold: 0.15
      }
    }
  },
  specialConditions: {
    urgent_or_rush: {
      enabled: true,
      requiresManagement: true,
      description: 'Urgent/Rush pricing requests require Management approval'
    },
    aml_or_avl_restricted: {
      enabled: true,
      requiresManagement: true,
      description: 'AML/AVL restricted materials require Management approval'
    },
    china_origin_exception: {
      enabled: true,
      requiresManagement: true,
      description: 'China-origin exceptions require Management approval'
    },
    client_specific: {
      enabled: true,
      requiresManagement: true,
      description: 'Client-specific rules require Management approval'
    },
    project_specific: {
      enabled: true,
      requiresManagement: true,
      description: 'Project-specific rules require Management approval'
    }
  }
};

/**
 * MetaSteel Pricing Rules Configuration
 * Based on pricingRules.js structure
 */
const metaSteelPricingRules = {
  quantityBreaks: {
    carbon_steel: [
      { minQty: 1, maxQty: 9, adjustmentPct: 0 },
      { minQty: 10, maxQty: 49, adjustmentPct: -3 },
      { minQty: 50, maxQty: null, adjustmentPct: -6 }
    ],
    stainless_steel: [
      { minQty: 1, maxQty: 9, adjustmentPct: 0 },
      { minQty: 10, maxQty: 49, adjustmentPct: -3 },
      { minQty: 50, maxQty: null, adjustmentPct: -6 }
    ],
    alloy: [
      { minQty: 1, maxQty: 9, adjustmentPct: 0 },
      { minQty: 10, maxQty: 49, adjustmentPct: -3 },
      { minQty: 50, maxQty: null, adjustmentPct: -6 }
    ]
  },
  clientSegmentMargins: {
    strategic: {
      minMarginPct: 8,
      targetMarginPct: 15,
      maxDiscountPct: 10
    },
    normal: {
      minMarginPct: 10,
      targetMarginPct: 18,
      maxDiscountPct: 15
    },
    distributor: {
      minMarginPct: 5,
      targetMarginPct: 12,
      maxDiscountPct: 8
    },
    project: {
      minMarginPct: 7,
      targetMarginPct: 14,
      maxDiscountPct: 12
    }
  },
  categoryMarginOverrides: {
    pipe: {
      minMarginPct: 8,
      targetMarginPct: 15
    },
    fittings: {
      minMarginPct: 10,
      targetMarginPct: 18
    },
    valves: {
      minMarginPct: 12,
      targetMarginPct: 20
    },
    structural: {
      minMarginPct: 7,
      targetMarginPct: 14
    }
  },
  roundingRules: {
    materials: 10,
    fabrication: 1,
    services: 1
  },
  approvalTriggers: {
    marginBelowPct: 8,
    discountAbovePct: 15
  },
  fixedMarginClients: {},
  regionalAdjustments: {
    malaysia: {
      minAdjPct: 0,
      maxAdjPct: 2
    },
    indonesia: {
      minAdjPct: 2,
      maxAdjPct: 4
    },
    vietnam: {
      minAdjPct: 1,
      maxAdjPct: 3
    },
    thailand: {
      minAdjPct: 0,
      maxAdjPct: 2
    },
    singapore: {
      minAdjPct: -1,
      maxAdjPct: 1
    },
    middle_east: {
      minAdjPct: 3,
      maxAdjPct: 6
    }
  },
  industryAdjustments: {
    oil_and_gas: {
      minAdjPct: 4,
      maxAdjPct: 8
    },
    power: {
      minAdjPct: 2,
      maxAdjPct: 5
    },
    marine_shipbuilding: {
      minAdjPct: 3,
      maxAdjPct: 6
    },
    steel_fabrication: {
      minAdjPct: -2,
      maxAdjPct: 1
    },
    infrastructure: {
      minAdjPct: 1,
      maxAdjPct: 4
    }
  }
};

/**
 * MetaSteel Logistics Configuration
 * Sea freight routes, inland trucking zones, HS codes, duty rules
 */
const metaSteelLogisticsConfig = {
  seaFreightRoutes: {
    'Port Klang → Singapore': {
      ratePerTon: 150,
      currency: 'USD',
      transitDays: 2,
      notes: 'Standard container shipping'
    },
    'Port Klang → Jakarta': {
      ratePerTon: 220,
      currency: 'USD',
      transitDays: 4,
      notes: 'Standard container shipping'
    },
    'Port Klang → Ho Chi Minh': {
      ratePerTon: 280,
      currency: 'USD',
      transitDays: 5,
      notes: 'Standard container shipping'
    },
    'Port Klang → Doha': {
      ratePerTon: 450,
      currency: 'USD',
      transitDays: 12,
      notes: 'Deep-sea shipping'
    },
    'Penang → Singapore': {
      ratePerTon: 120,
      currency: 'USD',
      transitDays: 1,
      notes: 'Short-haul shipping'
    }
  },
  inlandTruckingZones: {
    'Klang Valley': {
      baseRate: 100,
      currency: 'MYR',
      notes: 'Within Klang Valley area'
    },
    'Northern (Penang/Kedah)': {
      baseRate: 350,
      currency: 'MYR',
      notes: 'Northern region trucking'
    },
    'Southern (Johor)': {
      baseRate: 250,
      currency: 'MYR',
      notes: 'Southern region trucking'
    },
    'East Coast': {
      baseRate: 400,
      currency: 'MYR',
      notes: 'East Coast region trucking'
    }
  },
  hsCodeMappings: {
    pipes: {
      carbon_steel: '7304.11',
      stainless_steel: '7304.41',
      alloy: '7304.51'
    },
    fittings: {
      elbows: '7307.91',
      tees: '7307.92',
      reducers: '7307.93'
    },
    flanges: '7307.11',
    valves: '8481.20',
    structural: '7308.90'
  },
  dutyRules: {
    'ASEAN Origins → MY': {
      defaultRate: 0.0,
      notes: 'ASEAN FTA - typically 0% duty'
    },
    'EU/US Origins → MY': {
      defaultRate: 5.0,
      notes: 'Standard duty rate for non-FTA origins'
    },
    'China Origins → MY': {
      defaultRate: 8.0,
      notes: 'Standard duty rate for China origins'
    }
  },
  dutyExemptions: [
    {
      projectName: 'Penang Combined Cycle Plant',
      exemptionPercent: 100,
      applicableHsCodes: ['7304.11', '7307.91', '8481.20'],
      validFrom: '2024-01-01',
      validTo: '2026-12-31',
      notes: 'Project-based duty exemption'
    },
    {
      projectName: 'Bayu Offshore Redevelopment',
      exemptionPercent: 75,
      applicableHsCodes: ['7304.11', '7304.41', '7307.11'],
      validFrom: '2024-06-01',
      validTo: '2027-06-01',
      notes: 'Partial duty exemption for offshore project'
    }
  ]
};

/**
 * MetaSteel Regulatory & Compliance Rules Configuration
 */
const metaSteelRegulatoryConfig = {
  operatorOriginRules: {
    PETRONAS: {
      general: 'China allowed, but Non-China preferred for critical items (valves, high-pressure piping)',
      criticalItems: {
        valves: 'NON_CHINA_REQUIRED',
        highPressurePiping: 'NON_CHINA_REQUIRED'
      },
      certifications: ['API', 'ASME', 'ISO', 'NACE']
    },
    PREFCHEM: {
      general: 'Non-China required for pressure-retaining items',
      pressureRetaining: 'NON_CHINA_REQUIRED',
      structural: 'CHINA_ALLOWED',
      certifications: ['PED', 'NACE', 'API', 'ASME']
    },
    PTTEP: {
      general: 'Non-China required for pressure-retaining items',
      pressureRetaining: 'NON_CHINA_REQUIRED',
      structural: 'CHINA_ALLOWED',
      certifications: ['API', 'ASME', 'ISO']
    },
    QATARENERGY: {
      general: 'Non-China required for pressure-retaining items',
      pressureRetaining: 'NON_CHINA_REQUIRED',
      structural: 'CHINA_ALLOWED',
      certifications: ['API', 'ASME', 'ISO', 'NACE']
    }
  },
  certificationRequirements: {
    PETRONAS: {
      required: ['API', 'ASME', 'ISO'],
      conditional: ['NACE'],
      notes: 'NACE required for sour service'
    },
    PREFCHEM: {
      required: ['PED', 'NACE'],
      conditional: ['DNV'],
      notes: 'DNV required for offshore structures'
    },
    QATARENERGY: {
      required: ['API', 'ASME', 'ISO', 'NACE'],
      conditional: [],
      notes: 'Full certification suite required'
    }
  },
  additionalRules: [
    {
      rule: 'No GB-only (Chinese domestic) standard allowed for offshore structures',
      appliesTo: ['offshore', 'marine'],
      severity: 'BLOCKING'
    },
    {
      rule: 'NACE MR0175 required for sour service piping materials',
      appliesTo: ['sour_service', 'oil_and_gas'],
      severity: 'BLOCKING'
    }
  ]
};

/**
 * Upsert tenant setting
 */
async function upsertTenantSetting(db, tenantId, key, value) {
  await db.query(`
    INSERT INTO tenant_settings (tenant_id, key, value)
    VALUES ($1, $2, $3::jsonb)
    ON CONFLICT (tenant_id, key) DO UPDATE
    SET value = EXCLUDED.value,
        updated_at = NOW();
  `, [tenantId, key, JSON.stringify(value)]);
}

/**
 * Main seed function
 * @param {Object} options - Options for the seed function
 * @param {boolean} options.skipPoolClose - If true, don't close the pool (when called from parent script)
 */
async function seedMetaSteelKycConfig(options = {}) {
  const { skipPoolClose = false } = options;
  const db = await connectMigrationDb();

  console.log('🌱 Starting MetaSteel KYC configuration seeding...\n');

  try {
    // Get MetaSteel tenant ID
    console.log('📋 Step 1: Looking up MetaSteel tenant...');
    const tenantResult = await db.query(
      `SELECT id, code, name FROM tenants WHERE UPPER(code) = 'METASTEEL' LIMIT 1`
    );

    if (tenantResult.rows.length === 0) {
      throw new Error('MetaSteel tenant not found. Please run seedTenantsAndUsers.js first.');
    }

    const metaSteelTenant = tenantResult.rows[0];
    console.log(`  ✓ Found MetaSteel tenant: ${metaSteelTenant.code} (${metaSteelTenant.name}) - ID: ${metaSteelTenant.id}\n`);

    // Seed operator rules
    console.log('📋 Step 2: Seeding operator rules...');
    await upsertTenantSetting(db, metaSteelTenant.id, 'operator_rules', metaSteelOperatorRules);
    await upsertTenantSetting(db, metaSteelTenant.id, 'approved_mills', metaSteelApprovedMillsByOperator);
    await upsertTenantSetting(db, metaSteelTenant.id, 'approved_vendors', metaSteelApprovedVendorsByOperator);
    console.log('  ✓ Operator rules seeded\n');

    // Seed notification rules
    console.log('📋 Step 3: Seeding notification rules...');
    await upsertTenantSetting(db, metaSteelTenant.id, 'notification_rules', metaSteelNotificationRules);
    console.log('  ✓ Notification rules seeded\n');

    // Seed intelligence config
    console.log('📋 Step 4: Seeding intelligence configuration...');
    await upsertTenantSetting(db, metaSteelTenant.id, 'intelligence_config', metaSteelIntelligenceConfig);
    console.log('  ✓ Intelligence configuration seeded\n');

    // Seed pricing rules
    console.log('📋 Step 5: Seeding pricing rules...');
    await upsertTenantSetting(db, metaSteelTenant.id, 'pricing_rules', metaSteelPricingRules);
    console.log('  ✓ Pricing rules seeded\n');

    // Seed approval rules
    console.log('📋 Step 6: Seeding approval rules...');
    await upsertTenantSetting(db, metaSteelTenant.id, 'approval_rules', metaSteelApprovalRules);
    console.log('  ✓ Approval rules seeded\n');

    // Seed logistics configuration
    console.log('📋 Step 7: Seeding logistics configuration...');
    await upsertTenantSetting(db, metaSteelTenant.id, 'logistics_config', metaSteelLogisticsConfig);
    console.log('  ✓ Logistics configuration seeded\n');

    // Seed regulatory configuration
    console.log('📋 Step 8: Seeding regulatory configuration...');
    await upsertTenantSetting(db, metaSteelTenant.id, 'regulatory_config', metaSteelRegulatoryConfig);
    console.log('  ✓ Regulatory configuration seeded\n');

    console.log('✅ MetaSteel KYC configuration seeding completed successfully!\n');
    console.log('📊 Summary:');
    console.log(`  • Tenant: ${metaSteelTenant.code} (${metaSteelTenant.name})`);
    console.log(`  • Operator rules: ${Object.keys(metaSteelOperatorRules).length} operators configured`);
    console.log(`  • Notification rules: RFQ, Renewal/LME, Supplier/Logistics`);
    console.log(`  • Intelligence config: ${Object.keys(metaSteelIntelligenceConfig.focusRegions).filter(r => metaSteelIntelligenceConfig.focusRegions[r]).length} focus regions`);
    console.log(`  • Pricing rules: Quantity breaks, margins, approval thresholds`);
    console.log(`  • Approval rules: SLA thresholds, margin/discount triggers`);
    console.log(`  • Logistics config: Sea freight routes, inland zones, HS codes, duty rules`);
    console.log(`  • Regulatory config: Operator origin rules, certification requirements`);
    console.log('\n💡 All configurations are stored in tenant_settings table and can be accessed via tenantConfig.js\n');

  } catch (error) {
    console.error('\n❌ Seeding failed:', error);
    console.error(error.stack);

    // Only exit if running directly (not when called from parent script)
    if (!skipPoolClose) {
      process.exit(1);
    }
    throw error;
  } finally {
    // Only close pool if running directly (not when called from parent script)
    if (!skipPoolClose) {
      await db.end();
    }
  }
}

// Run if called directly
if (require.main === module) {
  seedMetaSteelKycConfig()
    .then(() => {
      console.log('✅ Script completed');
      process.exit(0);
    })
    .catch((error) => {
      console.error('❌ Script failed:', error);
      process.exit(1);
    });
}

module.exports = { seedMetaSteelKycConfig };

/**
 * Stage 8 Configuration: Regulatory Integration
 * 
 * IMPORTANT: Stage 8 operates in ADVISORY mode by default.
 * 
 * ADVISORY mode means:
 * - No blocking behavior
 * - No enforced validation
 * - No errors thrown for missing regulatory data
 * - Only metadata/warnings attached to pricing/approval results
 * - Final pricing totals are NEVER changed by Stage 8
 * 
 * ENFORCED mode (when enabled in future):
 * - Can block quote creation/approval based on regulatory rules
 * - Can require HS codes before pricing
 * - Can enforce material equivalence validation
 * 
 * TODO (NSC): Review and configure these settings before enabling ENFORCED mode
 * TODO (NSC): Populate regulatory data tables before enabling enforcement
 */

const config = {
  /**
   * Operating mode: "ADVISORY" or "ENFORCED"
   * Default: "ADVISORY" - no blocking, only advisory metadata
   */
  mode: process.env.STAGE8_MODE || 'ADVISORY',
  
  /**
   * Block on missing HS code
   * Only applies in ENFORCED mode
   * Default: false
   */
  blockOnMissingHsCode: process.env.STAGE8_BLOCK_MISSING_HS_CODE === 'true',
  
  /**
   * Block on missing material equivalence
   * Only applies in ENFORCED mode
   * Default: false
   */
  blockOnMissingEquivalence: process.env.STAGE8_BLOCK_MISSING_EQUIVALENCE === 'true',
  
  /**
   * Block on missing duty rule
   * Only applies in ENFORCED mode
   * Default: false
   */
  blockOnMissingDutyRule: process.env.STAGE8_BLOCK_MISSING_DUTY_RULE === 'true',
  
  /**
   * Allow demo/placeholder regulatory data
   * Should be false in production
   * Default: true in dev/test, false in production
   */
  allowDemoRegulatoryData: process.env.NODE_ENV !== 'production' && 
                            process.env.STAGE8_ALLOW_DEMO_DATA !== 'false',
  
  /**
   * Log regulatory advisory information
   * Default: true in development
   */
  logAdvisoryInfo: process.env.NODE_ENV === 'development' || 
                   process.env.STAGE8_LOG_ADVISORY === 'true',
};

// Validation
if (config.mode !== 'ADVISORY' && config.mode !== 'ENFORCED') {
  console.warn(`⚠️  Invalid STAGE8_MODE: ${config.mode}. Defaulting to ADVISORY.`);
  config.mode = 'ADVISORY';
}

// Safety check: In ADVISORY mode, all blocking flags must be false
if (config.mode === 'ADVISORY') {
  config.blockOnMissingHsCode = false;
  config.blockOnMissingEquivalence = false;
  config.blockOnMissingDutyRule = false;
}

// Log configuration on load (development only)
if (process.env.NODE_ENV === 'development') {
  console.log('📋 Stage 8 Configuration:');
  console.log(`   Mode: ${config.mode}`);
  console.log(`   Block on missing HS code: ${config.blockOnMissingHsCode}`);
  console.log(`   Block on missing equivalence: ${config.blockOnMissingEquivalence}`);
  console.log(`   Block on missing duty rule: ${config.blockOnMissingDutyRule}`);
  console.log(`   Allow demo data: ${config.allowDemoRegulatoryData}`);
}

module.exports = config;


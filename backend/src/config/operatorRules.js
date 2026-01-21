/**
 * NSC Operator Rules Configuration
 *
 * Based on "NSC AML Operator Rules (Filled).docx"
 *
 * Defines per-operator origin restrictions, AML requirements,
 * certification requirements, and approved mills/vendors.
 *
 * DO NOT MODIFY without NSC approval.
 * Last Updated: December 2025
 */

/**
 * Operator Rules
 *
 * Per-operator rules defining:
 * - allowedOrigins: Array of allowed origins ['CHINA', 'NON_CHINA']
 * - bannedOrigins: Array of banned origins
 * - requiresAml: Boolean flag indicating if AML/AVL check is required
 * - amlSource: String identifying the AML list to use (when available)
 * - requiredCerts: Array of required certifications (e.g., 'API', 'ISO')
 */
const operatorRules = {
  // PETRONAS - Uses AML/AVL (lists to come later)
  PETRONAS: {
    allowedOrigins: ['CHINA', 'NON_CHINA'],
    bannedOrigins: [],
    requiresAml: true,
    amlSource: 'PETRONAS_LATEST',
    requiredCerts: ['API', 'ISO'],
    notes: 'PETRONAS AML/AVL used. Lists to be provided later.'
  },

  // PPTEP - NO CHINA / NO INDIA
  PPTEP: {
    allowedOrigins: ['NON_CHINA'],
    bannedOrigins: ['CHINA', 'INDIA'],
    requiresAml: false,
    amlSource: null,
    requiredCerts: [],
    notes: 'NO CHINA / NO INDIA policy'
  },

  // PETROFAC - NO CHINA / NO INDIA
  PETROFAC: {
    allowedOrigins: ['NON_CHINA'],
    bannedOrigins: ['CHINA', 'INDIA'],
    requiresAml: false,
    amlSource: null,
    requiredCerts: [],
    notes: 'NO CHINA / NO INDIA policy'
  },

  // PERTAMINA - No origin restriction, requires API & ISO certs
  PERTAMINA: {
    allowedOrigins: ['CHINA', 'NON_CHINA'],
    bannedOrigins: [],
    requiresAml: false,
    amlSource: null,
    requiredCerts: ['API', 'ISO'],
    notes: 'No origin restriction. Requires API & ISO certifications.'
  },

  // TNB - No restrictions
  TNB: {
    allowedOrigins: ['CHINA', 'NON_CHINA'],
    bannedOrigins: [],
    requiresAml: false,
    amlSource: null,
    requiredCerts: [],
    notes: 'No origin or certification restrictions'
  },

  // CHEVRON - No restrictions
  CHEVRON: {
    allowedOrigins: ['CHINA', 'NON_CHINA'],
    bannedOrigins: [],
    requiresAml: false,
    amlSource: null,
    requiredCerts: [],
    notes: 'No origin or certification restrictions'
  },

  // SHELL - No restrictions
  SHELL: {
    allowedOrigins: ['CHINA', 'NON_CHINA'],
    bannedOrigins: [],
    requiresAml: false,
    amlSource: null,
    requiredCerts: [],
    notes: 'No origin or certification restrictions'
  },

  // EXXONMOBIL - No restrictions
  EXXONMOBIL: {
    allowedOrigins: ['CHINA', 'NON_CHINA'],
    bannedOrigins: [],
    requiresAml: false,
    amlSource: null,
    requiredCerts: [],
    notes: 'No origin or certification restrictions'
  },
};

/**
 * Approved Mills by Operator
 *
 * Defines approved mills per operator for specific material categories.
 * Structure: { OPERATOR: { category: [mills] } }
 */
const approvedMillsByOperator = {
  SEAH: {
    piping_and_fittings: ['WMASS', 'MELESI', 'ETC']
  },
  PETROFAC: {
    structural_piping_and_fittings: ['ARCELORMITTAL', 'STAHL TURENGEN', 'NSMMC']
  },
  CARI_GALI: {
    structural_piping_and_fittings: ['TPCO', 'HENYANG VALIN']
  }
};

/**
 * Approved Vendors by Operator
 *
 * Defines approved vendors per operator.
 * Structure: { OPERATOR: [vendors] }
 */
const approvedVendorsByOperator = {
  SEAH: ['WMASS'],
  PETROFAC: ['ARCELORMITTAL'],
  CARI_GALI: ['TPCO']
};

/**
 * Get operator rules for a given operator
 * @param {string} operatorName - Operator name (case-insensitive)
 * @returns {Object|null} Operator rules or null if not found
 */
function getOperatorRules(operatorName) {
  if (!operatorName) {
    return null;
  }

  const normalizedName = operatorName.toUpperCase().trim();
  return operatorRules[normalizedName] || null;
}

/**
 * Check if origin is allowed for operator
 * @param {string} operatorName - Operator name
 * @param {string} origin - Origin (CHINA, NON_CHINA, country code)
 * @returns {Object} { allowed: boolean, reason: string }
 */
function checkOriginAllowed(operatorName, origin) {
  const rules = getOperatorRules(operatorName);

  if (!rules) {
    // No rules = allow all
    return {
      allowed: true,
      reason: null
    };
  }

  const normalizedOrigin = origin?.toUpperCase();

  // Check if origin is explicitly banned
  if (rules.bannedOrigins.includes(normalizedOrigin)) {
    return {
      allowed: false,
      reason: `Origin ${origin} is banned for operator ${operatorName}`
    };
  }

  // Check if origin matches allowed list
  // For country codes, map to CHINA or NON_CHINA
  let effectiveOrigin = normalizedOrigin;
  if (normalizedOrigin && !['CHINA', 'NON_CHINA'].includes(normalizedOrigin)) {
    // Country code - treat as NON_CHINA unless it's CN
    effectiveOrigin = normalizedOrigin === 'CN' ? 'CHINA' : 'NON_CHINA';
  }

  if (!rules.allowedOrigins.includes(effectiveOrigin)) {
    return {
      allowed: false,
      reason: `Origin ${origin} is not in allowed origins for operator ${operatorName}`
    };
  }

  return {
    allowed: true,
    reason: null
  };
}

/**
 * Check if AML check is required for operator
 * @param {string} operatorName - Operator name
 * @returns {Object} { required: boolean, amlSource: string|null }
 */
function checkAmlRequired(operatorName) {
  const rules = getOperatorRules(operatorName);

  if (!rules) {
    return {
      required: false,
      amlSource: null
    };
  }

  return {
    required: rules.requiresAml,
    amlSource: rules.amlSource
  };
}

/**
 * Check if certifications are satisfied for operator
 * @param {string} operatorName - Operator name
 * @param {Array} availableCerts - Array of available certifications
 * @returns {Object} { satisfied: boolean, requiredCerts: Array, missingCerts: Array }
 */
function checkCertifications(operatorName, availableCerts = []) {
  const rules = getOperatorRules(operatorName);

  if (!rules || rules.requiredCerts.length === 0) {
    return {
      satisfied: true,
      requiredCerts: [],
      missingCerts: []
    };
  }

  const normalizedAvailable = availableCerts.map(c => c.toUpperCase());
  const missingCerts = rules.requiredCerts.filter(
    cert => !normalizedAvailable.includes(cert.toUpperCase())
  );

  return {
    satisfied: missingCerts.length === 0,
    requiredCerts: rules.requiredCerts,
    missingCerts
  };
}

/**
 * Check if mill is approved for operator
 * @param {string} operatorName - Operator name
 * @param {string} millName - Mill name
 * @param {string} category - Material category (optional)
 * @returns {Object} { approved: boolean, reason: string }
 */
function checkMillApproved(operatorName, millName, category = null) {
  if (!operatorName || !millName) {
    return { approved: true, reason: null };
  }

  const normalizedOperator = operatorName.toUpperCase().trim();
  const normalizedMill = millName.toUpperCase().trim();

  const approvedMills = approvedMillsByOperator[normalizedOperator];

  if (!approvedMills) {
    // No approved mills list = allow all
    return { approved: true, reason: null };
  }

  // Check all categories for this operator
  for (const [cat, mills] of Object.entries(approvedMills)) {
    const normalizedMills = mills.map(m => m.toUpperCase());
    if (normalizedMills.includes(normalizedMill)) {
      return {
        approved: true,
        reason: null
      };
    }
  }

  return {
    approved: false,
    reason: `Mill ${millName} is not in approved mills list for operator ${operatorName}`
  };
}

/**
 * Check if vendor is approved for operator
 * @param {string} operatorName - Operator name
 * @param {string} vendorName - Vendor name
 * @returns {Object} { approved: boolean, reason: string }
 */
function checkVendorApproved(operatorName, vendorName) {
  if (!operatorName || !vendorName) {
    return { approved: true, reason: null };
  }

  const normalizedOperator = operatorName.toUpperCase().trim();
  const normalizedVendor = vendorName.toUpperCase().trim();

  const approvedVendors = approvedVendorsByOperator[normalizedOperator];

  if (!approvedVendors) {
    // No approved vendors list = allow all
    return { approved: true, reason: null };
  }

  const normalizedApproved = approvedVendors.map(v => v.toUpperCase());

  if (!normalizedApproved.includes(normalizedVendor)) {
    return {
      approved: false,
      reason: `Vendor ${vendorName} is not in approved vendors list for operator ${operatorName}`
    };
  }

  return {
    approved: true,
    reason: null
  };
}

/**
 * Perform comprehensive operator compliance check
 * @param {Object} params - Check parameters
 * @param {string} params.operatorName - Operator name
 * @param {string} params.origin - Origin (CHINA, NON_CHINA, country code)
 * @param {Array} params.certifications - Available certifications
 * @param {string} params.millName - Mill name (optional)
 * @param {string} params.vendorName - Vendor name (optional)
 * @param {string} params.category - Material category (optional)
 * @returns {Object} Comprehensive compliance result
 */
function checkOperatorCompliance({
  operatorName,
  origin,
  certifications = [],
  millName = null,
  vendorName = null,
  category = null
}) {
  const originCheck = checkOriginAllowed(operatorName, origin);
  const amlCheck = checkAmlRequired(operatorName);
  const certCheck = checkCertifications(operatorName, certifications);
  const millCheck = checkMillApproved(operatorName, millName, category);
  const vendorCheck = checkVendorApproved(operatorName, vendorName);

  const compliant =
    originCheck.allowed &&
    certCheck.satisfied &&
    millCheck.approved &&
    vendorCheck.approved;

  const issues = [];
  if (!originCheck.allowed) {
    issues.push({
      type: 'ORIGIN_NOT_ALLOWED',
      severity: 'BLOCKING',
      message: originCheck.reason
    });
  }
  if (!certCheck.satisfied) {
    issues.push({
      type: 'MISSING_CERTIFICATIONS',
      severity: 'BLOCKING',
      message: `Missing required certifications: ${certCheck.missingCerts.join(', ')}`
    });
  }
  if (!millCheck.approved) {
    issues.push({
      type: 'UNAPPROVED_MILL',
      severity: 'ADVISORY',
      message: millCheck.reason
    });
  }
  if (!vendorCheck.approved) {
    issues.push({
      type: 'UNAPPROVED_VENDOR',
      severity: 'ADVISORY',
      message: vendorCheck.reason
    });
  }

  return {
    compliant,
    operatorName,
    checks: {
      origin: originCheck,
      aml: amlCheck,
      certifications: certCheck,
      mill: millCheck,
      vendor: vendorCheck
    },
    issues,
    flags: {
      originNotAllowed: !originCheck.allowed,
      amlCheckRequired: amlCheck.required,
      missingRequiredCerts: !certCheck.satisfied,
      unapprovedMill: !millCheck.approved,
      unapprovedVendor: !vendorCheck.approved
    }
  };
}

module.exports = {
  // Raw configuration
  operatorRules,
  approvedMillsByOperator,
  approvedVendorsByOperator,

  // Helper functions
  getOperatorRules,
  checkOriginAllowed,
  checkAmlRequired,
  checkCertifications,
  checkMillApproved,
  checkVendorApproved,
  checkOperatorCompliance
};

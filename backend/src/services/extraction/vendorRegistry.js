// Vendor/layout registry scaffold for opt-in extraction rules.
// Default is empty; no vendor-specific rules are applied unless registered.

const registry = [];

function normalizeSignaturePart(value) {
  if (!value) return '';
  return String(value).toLowerCase().replace(/\s+/g, ' ').trim();
}

function computeLayoutSignature({ fileType, text, tables } = {}) {
  const typePart = normalizeSignaturePart(fileType);
  const headerPart = Array.isArray(tables) && tables.length > 0
    ? normalizeSignaturePart((tables[0].headers || []).join('|'))
    : '';
  const textPart = normalizeSignaturePart((text || '').slice(0, 120));
  return [typePart, headerPart, textPart].filter(Boolean).join('::');
}

function registerVendorRule(rule) {
  if (!rule || typeof rule !== 'object') return;
  registry.push(rule);
}

function findVendorRule(context) {
  if (registry.length === 0) return null;
  const signature = computeLayoutSignature(context);
  return registry.find(rule => {
    if (typeof rule.match === 'function') {
      return rule.match({ ...context, signature });
    }
    if (rule.signature) {
      return normalizeSignaturePart(rule.signature) === normalizeSignaturePart(signature);
    }
    return false;
  }) || null;
}

module.exports = {
  registerVendorRule,
  findVendorRule,
  computeLayoutSignature
};

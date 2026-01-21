/**
 * Object Serialization Utility
 * Safely serializes objects by removing circular references and non-serializable properties
 */

/**
 * Creates a clean, serializable copy of an object
 * Removes circular references, functions, and non-serializable properties
 * @param {*} obj - Object to sanitize
 * @returns {*} Clean, serializable object
 */
function sanitizeForSerialization(obj) {
  const seen = new WeakSet();
  
  function clean(value) {
    // Handle null and undefined
    if (value === null || value === undefined) {
      return value;
    }
    
    // Handle primitives
    if (typeof value !== 'object') {
      return value;
    }
    
    // Handle Date objects
    if (value instanceof Date) {
      return value.toISOString();
    }
    
    // Handle arrays
    if (Array.isArray(value)) {
      return value.map(item => clean(item));
    }
    
    // Handle objects - check for circular references
    if (seen.has(value)) {
      return '[Circular Reference]';
    }
    
    seen.add(value);
    
    // Handle Error objects
    if (value instanceof Error) {
      return {
        name: value.name,
        message: value.message,
        stack: value.stack,
      };
    }
    
    // Create clean object
    const cleaned = {};
    
    for (const key in value) {
      // Skip functions and undefined
      if (typeof value[key] === 'function' || value[key] === undefined) {
        continue;
      }
      
      // Skip internal PostgreSQL properties that might cause issues
      if (key.startsWith('_') && (key === '_binary' || key === '_hasBinary')) {
        continue;
      }
      
      // Skip Symbol properties
      if (typeof key === 'symbol') {
        continue;
      }
      
      try {
        cleaned[key] = clean(value[key]);
      } catch (e) {
        // If cleaning fails, skip the property
        console.warn(`[ObjectSerializer] Failed to clean property "${key}":`, e.message);
        continue;
      }
    }
    
    // Note: WeakSet doesn't support delete, but we don't need it
    // The WeakSet will automatically handle garbage collection
    return cleaned;
  }
  
  return clean(obj);
}

/**
 * Safely stringifies an object, replacing circular references
 * @param {*} obj - Object to stringify
 * @returns {string} JSON string
 */
function safeStringify(obj) {
  try {
    return JSON.stringify(sanitizeForSerialization(obj));
  } catch (error) {
    // Last resort: try to stringify with a replacer that handles circular refs
    const seen = new WeakSet();
    return JSON.stringify(obj, (key, value) => {
      // Handle circular references
      if (typeof value === 'object' && value !== null) {
        if (seen.has(value)) {
          return '[Circular Reference]';
        }
        seen.add(value);
      }
      
      if (typeof value === 'function' || value === undefined) {
        return undefined;
      }
      if (value instanceof Error) {
        return { name: value.name, message: value.message };
      }
      if (value instanceof Date) {
        return value.toISOString();
      }
      return value;
    });
  }
}

module.exports = {
  sanitizeForSerialization,
  safeStringify,
};


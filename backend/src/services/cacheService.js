/**
 * Simple in-memory cache service
 * Replaces Redis/Memorystore for development
 * TODO: Replace with GCP Memorystore (Redis) for production
 */

const cache = new Map();

/**
 * Get a value from cache, or set it if it doesn't exist
 * @param {string} key - Cache key
 * @param {Function} factory - Function to generate value if not cached
 * @param {number} ttl - Time to live in seconds (ignored for now)
 * @returns {Promise<any>} Cached or generated value
 */
async function getOrSet(key, factory, ttl = 600) {
  if (cache.has(key)) {
    const entry = cache.get(key);
    // Check if expired
    if (entry.expiresAt > Date.now()) {
      return entry.value;
    }
    // Expired, remove it
    cache.delete(key);
  }

  // Generate new value
  const value = await factory();

  // Store with expiration
  cache.set(key, {
    value,
    expiresAt: Date.now() + (ttl * 1000),
  });

  return value;
}

/**
 * Delete a key from cache
 * @param {string} key - Cache key
 */
async function del(key) {
  cache.delete(key);
}

/**
 * Delete keys matching a pattern
 * @param {string} pattern - Pattern to match (supports * wildcard)
 */
async function delPattern(pattern) {
  const regex = new RegExp('^' + pattern.replace(/\*/g, '.*') + '$');
  for (const key of cache.keys()) {
    if (regex.test(key)) {
      cache.delete(key);
    }
  }
}

/**
 * Clear entire cache
 */
async function clear() {
  cache.clear();
}

module.exports = {
  getOrSet,
  del,
  delPattern,
  clear,
};

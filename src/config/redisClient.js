const Redis = require("ioredis");

const redisUrl = process.env.REDIS_URL || "redis://127.0.0.1:6379";

let redisErrorLogged = false;

const redis = new Redis(redisUrl, {
  connectTimeout: 5000, // Stop trying to connect after 5 seconds
  maxRetriesPerRequest: 1, // Fail fast instead of hanging the API
  retryStrategy(times) {
    // Stop retrying after 3 attempts - Redis is optional
    if (times > 3) {
      return null; // Stop retrying
    }
    const delay = Math.min(times * 50, 2000);
    return delay;
  },
});

redis.on("error", (err) => {
  if (!redisErrorLogged) {
    console.warn("⚠️  Redis not available (optional - caching disabled)");
    redisErrorLogged = true;
  }
});

/**
 * Helper to check if Redis is actually connected and usable.
 * The ioredis instance is always truthy, so `if (redis)` never catches disconnects.
 * Use `isRedisReady()` before any Redis call, or use the safe wrappers below.
 */
function isRedisReady() {
  return redis.status === "ready";
}

/** Safe GET – returns null when Redis is down */
async function safeGet(key) {
  try {
    if (!isRedisReady()) return null;
    return await redis.get(key);
  } catch {
    return null;
  }
}

/** Safe SETEX – silently fails when Redis is down */
async function safeSetex(key, ttl, value) {
  try {
    if (!isRedisReady()) return;
    await redis.setex(key, ttl, value);
  } catch {
    // ignore
  }
}

/** Safe DEL – silently fails when Redis is down */
async function safeDel(keys) {
  try {
    if (!isRedisReady()) return;
    await redis.del(keys);
  } catch {
    // ignore
  }
}

/** Safe KEYS – returns empty array when Redis is down */
async function safeKeys(pattern) {
  try {
    if (!isRedisReady()) return [];
    return await redis.keys(pattern);
  } catch {
    return [];
  }
}

module.exports = redis;
module.exports.isRedisReady = isRedisReady;
module.exports.safeGet = safeGet;
module.exports.safeSetex = safeSetex;
module.exports.safeDel = safeDel;
module.exports.safeKeys = safeKeys;

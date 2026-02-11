const Redis = require("ioredis");

const redisUrl = process.env.REDIS_URL || "redis://127.0.0.1:6379";

console.log("[RedisClient] Initializing with URL:", redisUrl);
console.log(
  "[RedisClient] REDIS_URL env var:",
  process.env.REDIS_URL || "NOT SET",
);

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

redis.on("ready", () => {
  console.log("[RedisClient] ✅ Connected to Redis successfully");
});

redis.on("error", (err) => {
  if (!redisErrorLogged) {
    console.warn(
      "⚠️  [RedisClient] Redis not available (optional - caching disabled)",
    );
    console.warn("[RedisClient] Error details:", err.message);
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
    if (!isRedisReady()) {
      console.log("[RedisClient] Redis not ready for GET:", key);
      return null;
    }
    return await redis.get(key);
  } catch (err) {
    console.error("[RedisClient] GET error for key", key, ":", err.message);
    return null;
  }
}

/** Safe SETEX – silently fails when Redis is down */
async function safeSetex(key, ttl, value) {
  try {
    if (!isRedisReady()) {
      console.log("[RedisClient] Redis not ready for SETEX:", key);
      return;
    }
    await redis.setex(key, ttl, value);
  } catch (err) {
    console.error("[RedisClient] SETEX error for key", key, ":", err.message);
  }
}

/** Safe DEL – silently fails when Redis is down */
async function safeDel(keys) {
  try {
    if (!isRedisReady()) {
      console.log("[RedisClient] Redis not ready for DEL:", keys);
      return;
    }
    await redis.del(keys);
  } catch (err) {
    console.error("[RedisClient] DEL error for keys", keys, ":", err.message);
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

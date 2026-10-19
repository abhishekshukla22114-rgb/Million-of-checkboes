import Redis from "ioredis";

const REDIS_HOST = process.env.REDIS_HOST || "127.0.0.1";
const REDIS_PORT = Number(process.env.REDIS_PORT) || 6379;
const REDIS_PASSWORD = process.env.REDIS_PASSWORD || undefined;

let redisClients = {};
let isRedisConnected = false;

/**
 * Robust connection config with exponential backoff & keep-alive
 */
function createRedisClient(clientName) {
  const client = new Redis({
    host: REDIS_HOST,
    port: REDIS_PORT,
    password: REDIS_PASSWORD,
    // Max retry strategy with exponential backoff
    retryStrategy(times) {
      if (times > 10) {
        console.warn(`[Valkey/Redis:${clientName}] Max retries reached, giving up`);
        return null; // Stop retrying
      }
      const delay = Math.min(times * 100, 3000); // Max delay 3s
      return delay;
    },
    maxRetriesPerRequest: 3,
    enableReadyCheck: true,
    connectTimeout: 10000,
    keepAlive: 10000,
    lazyConnect: true,
  });

  client.on("connect", () => {
    console.log(`[Valkey/Redis:${clientName}] Connected to ${REDIS_HOST}:${REDIS_PORT}`);
  });

  client.on("ready", () => {
    console.log(`[Valkey/Redis:${clientName}] Ready to accept commands`);
    isRedisConnected = true;
  });

  client.on("error", (err) => {
    if (err.message.includes('ECONNREFUSED')) {
      // Suppress noisy connection refused errors after first few attempts
    } else {
      console.error(`[Valkey/Redis:${clientName}] Connection Error:`, err.message);
    }
  });

  client.on("close", () => {
    console.warn(`[Valkey/Redis:${clientName}] Connection closed`);
    isRedisConnected = false;
  });

  client.on("reconnecting", () => {
    console.info(`[Valkey/Redis:${clientName}] Reconnecting...`);
  });

  return client;
}

// Separate client instances for General commands, Publisher, and Subscriber
const stateClient = createRedisClient("StateClient");
const pubClient = createRedisClient("Publisher");
const subClient = createRedisClient("Subscriber");

redisClients = {
  redis: stateClient,
  publisher: pubClient,
  subscriber: subClient,
};

// Lazy connect function
export async function connectRedis() {
  try {
    await Promise.allSettled([
      stateClient.connect(),
      pubClient.connect(),
      subClient.connect(),
    ]);
    
    // Wait a bit for connections to establish
    await new Promise(resolve => setTimeout(resolve, 2000));
    
    if (isRedisConnected) {
      console.log('[Redis] All clients connected successfully');
      return true;
    }
    console.warn('[Redis] Could not connect to Redis server');
    return false;
  } catch (err) {
    console.warn('[Redis] Connection failed:', err.message);
    return false;
  }
}

// Export clients and connection status
export const redis = stateClient;
export const publisher = pubClient;
export const subscriber = subClient;

export function getRedisStatus() {
  return isRedisConnected;
}

// Graceful shutdown hook for production process management (Docker/PM2)
process.on("SIGINT", async () => {
  console.log("Closing Valkey/Redis connections...");
  await Promise.allSettled([stateClient.quit(), pubClient.quit(), subClient.quit()]);
  process.exit(0);
});

process.on("SIGTERM", async () => {
  console.log("Closing Valkey/Redis connections...");
  await Promise.allSettled([stateClient.quit(), pubClient.quit(), subClient.quit()]);
  process.exit(0);
});
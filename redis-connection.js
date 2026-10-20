import Redis from "ioredis";

const REDIS_URL = process.env.REDIS_URL;
const REDIS_HOST = process.env.REDIS_HOST || "127.0.0.1";
const REDIS_PORT = Number(process.env.REDIS_PORT) || 6379;
const REDIS_PASSWORD = process.env.REDIS_PASSWORD || undefined;

let isRedisConnected = false;

function createRedisClient(clientName) {
  let client;

  const retryStrategy = (times) => {
    if (times > 10) {
      console.warn(`[Valkey/Redis:${clientName}] Max retries reached, giving up`);
      return null;
    }
    return Math.min(times * 100, 3000);
  };

  if (REDIS_URL) {
    // 1. Upstash Cloud (TLS / rediss://)
    client = new Redis(REDIS_URL, {
      tls: {
        rejectUnauthorized: false,
      },
      retryStrategy,
      maxRetriesPerRequest: 3,
      enableReadyCheck: true,
      connectTimeout: 10000,
      lazyConnect: true,
    });
  } else {
    // 2. Local Docker / Localhost Fallback
    client = new Redis({
      host: REDIS_HOST,
      port: REDIS_PORT,
      password: REDIS_PASSWORD,
      retryStrategy,
      maxRetriesPerRequest: 3,
      enableReadyCheck: true,
      connectTimeout: 10000,
      lazyConnect: true,
    });
  }

  client.on("connect", () => {
    const target = REDIS_URL ? "Upstash Cloud" : `${REDIS_HOST}:${REDIS_PORT}`;
    console.log(`[Valkey/Redis:${clientName}] Connected to ${target}`);
  });

  client.on("ready", () => {
    console.log(`[Valkey/Redis:${clientName}] Ready to accept commands`);
    isRedisConnected = true;
  });

  client.on("error", (err) => {
    if (!err.message.includes("ECONNREFUSED")) {
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

// Separate client instances
const stateClient = createRedisClient("StateClient");
const pubClient = createRedisClient("Publisher");
const subClient = createRedisClient("Subscriber");

// Connect logic
export async function connectRedis() {
  try {
    await Promise.allSettled([
      stateClient.connect(),
      pubClient.connect(),
      subClient.connect(),
    ]);

    await new Promise((resolve) => setTimeout(resolve, 1500));

    if (isRedisConnected) {
      console.log("[Redis] All clients connected successfully");
      return true;
    }
    console.warn("[Redis] Could not connect to Redis server");
    return false;
  } catch (err) {
    console.warn("[Redis] Connection failed:", err.message);
    return false;
  }
}

export const redis = stateClient;
export const publisher = pubClient;
export const subscriber = subClient;

export function getRedisStatus() {
  return isRedisConnected;
}

// Graceful shutdown
const handleShutdown = async () => {
  console.log("Closing Valkey/Redis connections...");
  await Promise.allSettled([stateClient.quit(), pubClient.quit(), subClient.quit()]);
  process.exit(0);
};

process.on("SIGINT", handleShutdown);
process.on("SIGTERM", handleShutdown);
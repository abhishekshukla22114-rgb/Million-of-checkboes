import http from 'node:http';
import express from 'express';
import cors from 'cors';
import helmet from 'helmet';
import rateLimit from 'express-rate-limit';
import { Server } from 'socket.io';
import { publisher, redis, subscriber, connectRedis, getRedisStatus } from './redis-connection.js';
import { initializeDatabase, closePool, getConnectionStatus } from './config/database.js';
import authRoutes from './auth/routes.js';
import checkboxRoutes from './routes/checkboxes.js';
import { errorHandler, notFoundHandler } from './middleware/errorHandler.js';
import { authMiddleware } from './auth/middleware.js';

const TOTAL_CHECKBOXES = Number(process.env.TOTAL_CHECKBOXES) || 1_000_000;
const CHECKBOX_BITMAP_KEY = process.env.CHECKBOX_BITMAP_KEY || 'checkboxes:bitmap:v1';
const PUB_SUB_CHANNEL = process.env.PUB_SUB_CHANNEL || 'checkboxes:batch:stream';
const CORS_ORIGIN = process.env.CORS_ORIGIN || '*';

// Socket-level rate limiting store: socketId -> lastTimestamp
const rateLimitingMap = new Map();

// In-memory queue to batch outbound updates before emitting
let pendingUpdates = [];

async function main() {
  const PORT = process.env.PORT || 5000;

  // Initialize PostgreSQL database (non-blocking)
  const dbConnected = await initializeDatabase();
  
  if (!dbConnected) {
    console.warn('[App] Running without PostgreSQL - authentication features will be limited');
  }

  // Initialize Redis (non-blocking)
  const redisConnected = await connectRedis();
  
  if (!redisConnected) {
    console.warn('[App] Running without Redis - real-time sync will be limited');
  }

  const app = express();
  const server = http.createServer(app);
  
  const io = new Server(server, {
    cors: { 
      origin: CORS_ORIGIN === '*' ? '*' : CORS_ORIGIN.split(',').map(o => o.trim()),
      methods: ['GET', 'POST'],
      credentials: true
    }
  });

  // Security middleware
  app.use(helmet({
    crossOriginResourcePolicy: { policy: 'cross-origin' },
    contentSecurityPolicy: false,
  }));
  
  app.use(cors({
    origin: CORS_ORIGIN === '*' ? '*' : CORS_ORIGIN.split(',').map(o => o.trim()),
    credentials: true,
    methods: ['GET', 'POST', 'PUT', 'DELETE', 'OPTIONS'],
    allowedHeaders: ['Content-Type', 'Authorization'],
  }));

  // Rate limiting
  const limiter = rateLimit({
    windowMs: 15 * 60 * 1000,
    max: 100,
    message: { error: 'Too many requests, please try again later' },
    standardHeaders: true,
    legacyHeaders: false,
  });
  app.use('/api/', limiter);

  // Auth rate limiting (stricter)
  const authLimiter = rateLimit({
    windowMs: 15 * 60 * 1000,
    max: 10,
    message: { error: 'Too many authentication attempts, please try again later' },
  });
  app.use('/api/auth/', authLimiter);

  // Body parsing
  app.use(express.json({ limit: '1mb' }));
  app.use(express.urlencoded({ extended: true, limit: '1mb' }));

  // Request logging
  app.use((req, res, next) => {
    const start = Date.now();
    res.on('finish', () => {
      const duration = Date.now() - start;
      console.log(`${req.method} ${req.path} ${res.statusCode} ${duration}ms`);
    });
    next();
  });

  // 1. Subscribe to Redis Pub/Sub for multi-instance sync
  if (redisConnected) {
    try {
      await subscriber.subscribe(PUB_SUB_CHANNEL);
      subscriber.on('message', (channel, message) => {
        if (channel === PUB_SUB_CHANNEL) {
          try {
            const batch = JSON.parse(message);
            io.emit('server:checkboxes:batch', batch);
          } catch (err) {
            console.error('PubSub parse error:', err);
          }
        }
      });
    } catch (err) {
      console.warn('[Redis] Pub/Sub not available:', err.message);
    }
  }

  // 2. Periodic flush of queued updates to Redis Pub/Sub (Every 50ms)
  if (redisConnected) {
    setInterval(async () => {
      if (pendingUpdates.length === 0) return;

      const batchToSend = pendingUpdates;
      pendingUpdates = [];

      try {
        await publisher.publish(PUB_SUB_CHANNEL, JSON.stringify(batchToSend));
      } catch (err) {
        console.error('PubSub publish error:', err);
      }
    }, 50);
  }

  // 3. Socket Handlers with authentication
  io.use(async (socket, next) => {
    const token = socket.handshake.auth.token || socket.handshake.query.token;
    if (token) {
      socket.userToken = token;
    }
    next();
  });

  io.on('connection', (socket) => {
    console.log(`Socket connected: ${socket.id}`);

    socket.on('client:checkbox:change', async (data) => {
      const { index, checked } = data;

      // Validate bounds
      if (typeof index !== 'number' || index < 0 || index >= TOTAL_CHECKBOXES) {
        return socket.emit('server:error', { message: 'Invalid checkbox index' });
      }

      // Rate limit: 200ms debounce per user
      const now = Date.now();
      const lastTime = rateLimitingMap.get(socket.id);
      if (lastTime && now - lastTime < 200) {
        return socket.emit('server:error', {
          message: 'Rate limit exceeded. Slow down.'
        });
      }
      rateLimitingMap.set(socket.id, now);

      // Atomic bitmap update in Redis: SETBIT key offset value (0 or 1)
      if (redisConnected) {
        const bitValue = checked ? 1 : 0;
        try {
          await redis.setbit(CHECKBOX_BITMAP_KEY, index, bitValue);
        } catch (err) {
          console.error('Redis setbit error:', err);
          return socket.emit('server:error', { message: 'Failed to update checkbox' });
        }
      }

      // Push to pending batch
      pendingUpdates.push({ index, checked: Boolean(checked), userId: socket.userId });
    });

    // Cleanup memory when client leaves
    socket.on('disconnect', () => {
      rateLimitingMap.delete(socket.id);
      console.log(`Socket disconnected: ${socket.id}`);
    });
  });

  // 4. API Routes
  app.get('/health', (req, res) => {
    return res.json({ 
      healthy: true, 
      timestamp: new Date().toISOString(),
      uptime: process.uptime(),
      memory: process.memoryUsage(),
      database: getConnectionStatus() ? 'connected' : 'disconnected',
      redis: getRedisStatus() ? 'connected' : 'disconnected',
    });
  });

  app.get('/ready', async (req, res) => {
    try {
      if (redisConnected) {
        await redis.ping();
      }
      const dbStatus = getConnectionStatus();
      if (!dbStatus || !redisConnected) {
        return res.status(503).json({ 
          ready: false, 
          error: 'Services not ready', 
          database: dbStatus ? 'connected' : 'disconnected',
          redis: redisConnected ? 'connected' : 'disconnected'
        });
      }
      return res.json({ ready: true, database: 'connected', redis: 'connected' });
    } catch (err) {
      return res.status(503).json({ ready: false, error: err.message, redis: 'disconnected' });
    }
  });

  // Auth routes (only if DB is connected)
  if (dbConnected) {
    app.use('/api/auth', authRoutes);
    app.use('/api/checkboxes', authMiddleware, checkboxRoutes);
  } else {
    // Mock auth endpoints for development
    app.post('/api/auth/register', (req, res) => {
      res.status(503).json({ error: 'Database not available. Start PostgreSQL to enable authentication.' });
    });
    app.post('/api/auth/login', (req, res) => {
      res.status(503).json({ error: 'Database not available. Start PostgreSQL to enable authentication.' });
    });
    app.post('/api/auth/logout', (req, res) => {
      res.status(503).json({ error: 'Database not available.' });
    });
    app.post('/api/auth/refresh', (req, res) => {
      res.status(503).json({ error: 'Database not available.' });
    });
    app.get('/api/auth/me', (req, res) => {
      res.status(503).json({ error: 'Database not available.' });
    });
    app.use('/api/checkboxes', (req, res) => {
      res.status(503).json({ error: 'Database not available. Start PostgreSQL to enable user features.' });
    });
  }

  // Public checkbox endpoints (for initial load, stats)
  // Initial state binary stream (122 KB raw binary instead of 10MB JSON)
  if (redisConnected) {
    app.get('/checkboxes/binary', async (req, res) => {
      try {
        const rawBuffer = await redis.getBuffer(CHECKBOX_BITMAP_KEY);
        
        res.setHeader('Content-Type', 'application/octet-stream');
        if (!rawBuffer) {
          return res.send(Buffer.alloc(Math.ceil(TOTAL_CHECKBOXES / 8), 0));
        }
        return res.send(rawBuffer);
      } catch (err) {
        console.error('Failed to fetch binary state:', err);
        return res.status(500).json({ error: 'Failed to fetch state' });
      }
    });

    // Total checked count using Redis native BITCOUNT
    app.get('/checkboxes/stats', async (req, res) => {
      try {
        const totalChecked = await redis.bitcount(CHECKBOX_BITMAP_KEY);
        return res.json({ totalChecked, total: TOTAL_CHECKBOXES });
      } catch (err) {
        console.error('Failed to fetch stats:', err);
        return res.status(500).json({ error: 'Failed to fetch stats' });
      }
    });
  } else {
    app.get('/checkboxes/binary', (req, res) => {
      res.setHeader('Content-Type', 'application/octet-stream');
      return res.send(Buffer.alloc(Math.ceil(TOTAL_CHECKBOXES / 8), 0));
    });

    app.get('/checkboxes/stats', (req, res) => {
      return res.json({ totalChecked: 0, total: TOTAL_CHECKBOXES });
    });
  }

  // Serve static files
  app.use(express.static('./public'));

  // Error handling
  app.use(notFoundHandler);
  app.use(errorHandler);

  // Graceful shutdown
  const shutdown = async (signal) => {
    console.log(`${signal} received, shutting down gracefully...`);
    
    server.close(async () => {
      console.log('HTTP server closed');
      await Promise.allSettled([
        redis.quit(),
        publisher.quit(),
        subscriber.quit(),
        closePool(),
      ]);
      console.log('All connections closed');
      process.exit(0);
    });

    // Force close after 30 seconds
    setTimeout(() => {
      console.error('Forced shutdown after timeout');
      process.exit(1);
    }, 30000);
  };

  process.on('SIGTERM', () => shutdown('SIGTERM'));
  process.on('SIGINT', () => shutdown('SIGINT'));

  server.listen(PORT, () => {
    console.log(`Server running at http://localhost:${PORT}`);
    console.log(`Environment: ${process.env.NODE_ENV || 'development'}`);
    console.log(`Database: ${dbConnected ? 'Connected' : 'Not connected (auth disabled)'}`);
    console.log(`Redis: ${redisConnected ? 'Connected' : 'Not connected (real-time disabled)'}`);
  });
}

main().catch((err) => {
  console.error('Failed to start server:', err);
  process.exit(1);
});
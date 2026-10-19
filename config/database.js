import pg from 'pg';

const { Pool } = pg;

let pool = null;
let isConnected = false;

function createPool() {
  if (pool) return pool;
  
  pool = new Pool({
    host: process.env.POSTGRES_HOST || 'localhost',
    port: Number(process.env.POSTGRES_PORT) || 5432,
    database: process.env.POSTGRES_DB || 'checkboxes',
    user: process.env.POSTGRES_USER || 'postgres',
    password: process.env.POSTGRES_PASSWORD || 'postgres',
    max: 20,
    idleTimeoutMillis: 30000,
    connectionTimeoutMillis: 5000,
  });

  pool.on('connect', () => {
    console.log('[PostgreSQL] New client connected');
    isConnected = true;
  });

  pool.on('error', (err) => {
    console.error('[PostgreSQL] Unexpected error on idle client:', err.message);
    isConnected = false;
  });

  return pool;
}

export async function query(text, params) {
  const p = createPool();
  if (!isConnected) {
    throw new Error('PostgreSQL not connected');
  }
  const start = Date.now();
  const res = await p.query(text, params);
  const duration = Date.now() - start;
  console.log('[PostgreSQL] Executed query', { duration, rows: res.rowCount });
  return res;
}

export async function getClient() {
  const p = createPool();
  if (!isConnected) {
    throw new Error('PostgreSQL not connected');
  }
  const client = await p.connect();
  const query = client.query;
  const release = client.release;
  client.query = (...args) => client.query.apply(client, args);
  client.release = () => {
    client.query = query;
    release.apply(client);
  };
  return client;
}

export async function initializeDatabase() {
  const p = createPool();
  try {
    // Test connection first
    await p.query('SELECT 1');
    isConnected = true;
    console.log('[PostgreSQL] Connection established');

    const createUsersTable = `
      CREATE TABLE IF NOT EXISTS users (
        id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
        email VARCHAR(255) UNIQUE NOT NULL,
        password_hash VARCHAR(255) NOT NULL,
        username VARCHAR(100) UNIQUE NOT NULL,
        created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
        updated_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
      );
    `;

    const createSessionsTable = `
      CREATE TABLE IF NOT EXISTS sessions (
        id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
        user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
        token_hash VARCHAR(255) NOT NULL,
        expires_at TIMESTAMP WITH TIME ZONE NOT NULL,
        created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
      );
      
      CREATE INDEX IF NOT EXISTS idx_sessions_user_id ON sessions(user_id);
      CREATE INDEX IF NOT EXISTS idx_sessions_token_hash ON sessions(token_hash);
      CREATE INDEX IF NOT EXISTS idx_sessions_expires_at ON sessions(expires_at);
    `;

    const createCheckboxChangesTable = `
      CREATE TABLE IF NOT EXISTS checkbox_changes (
        id BIGSERIAL PRIMARY KEY,
        user_id UUID REFERENCES users(id) ON DELETE SET NULL,
        checkbox_index INTEGER NOT NULL,
        checked BOOLEAN NOT NULL,
        created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
      );
      
      CREATE INDEX IF NOT EXISTS idx_checkbox_changes_user_id ON checkbox_changes(user_id);
      CREATE INDEX IF NOT EXISTS idx_checkbox_changes_created_at ON checkbox_changes(created_at);
    `;

    await query(createUsersTable);
    await query(createSessionsTable);
    await query(createCheckboxChangesTable);
    console.log('[PostgreSQL] Database initialized successfully');
    return true;
  } catch (err) {
    console.warn('[PostgreSQL] Database not available, running without persistence:', err.message);
    isConnected = false;
    return false;
  }
}

export async function closePool() {
  if (pool) {
    await pool.end();
    console.log('[PostgreSQL] Pool closed');
  }
}

export function getConnectionStatus() {
  return isConnected;
}

export default createPool();
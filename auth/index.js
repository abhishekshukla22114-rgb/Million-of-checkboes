import crypto from 'crypto';
import bcrypt from 'bcryptjs';
import jwt from 'jsonwebtoken';
import { query } from '../config/database.js';

const JWT_SECRET = process.env.JWT_SECRET || 'your-super-secret-jwt-key-change-in-production';
const JWT_EXPIRES_IN = process.env.JWT_EXPIRES_IN || '15m';
const REFRESH_TOKEN_EXPIRES_IN = process.env.REFRESH_TOKEN_EXPIRES_IN || '7d';
const BCRYPT_ROUNDS = 12;

export function generateAccessToken(user) {
  return jwt.sign(
    { userId: user.id, email: user.email, username: user.username },
    JWT_SECRET,
    { expiresIn: JWT_EXPIRES_IN }
  );
}

export function generateRefreshToken() {
  return crypto.randomBytes(64).toString('hex');
}

export function hashRefreshToken(token) {
  return crypto.createHash('sha256').update(token).digest('hex');
}

export async function hashPassword(password) {
  return bcrypt.hash(password, BCRYPT_ROUNDS);
}

export async function verifyPassword(password, hash) {
  return bcrypt.compare(password, hash);
}

export async function createUser(email, username, password) {
  const passwordHash = await hashPassword(password);
  
  const result = await query(
    `INSERT INTO users (email, username, password_hash) 
     VALUES ($1, $2, $3) 
     RETURNING id, email, username, created_at`,
    [email.toLowerCase().trim(), username.trim(), passwordHash]
  );
  
  return result.rows[0];
}

export async function findUserByEmail(email) {
  const result = await query(
    'SELECT id, email, username, password_hash, created_at FROM users WHERE email = $1',
    [email.toLowerCase().trim()]
  );
  return result.rows[0];
}

export async function findUserByUsername(username) {
  const result = await query(
    'SELECT id FROM users WHERE username = $1',
    [username.trim()]
  );
  return result.rows[0];
}

export async function findUserById(id) {
  const result = await query(
    'SELECT id, email, username, created_at FROM users WHERE id = $1',
    [id]
  );
  return result.rows[0];
}

export async function createSession(userId, refreshToken) {
  const tokenHash = hashRefreshToken(refreshToken);
  const expiresAt = new Date(Date.now() + 7 * 24 * 60 * 60 * 1000);
  
  await query(
    `INSERT INTO sessions (user_id, token_hash, expires_at) 
     VALUES ($1, $2, $3)`,
    [userId, tokenHash, expiresAt]
  );
}

export async function validateRefreshToken(refreshToken) {
  const tokenHash = hashRefreshToken(refreshToken);
  
  const result = await query(
    `SELECT s.id, s.user_id, s.expires_at, u.email, u.username 
     FROM sessions s 
     JOIN users u ON u.id = s.user_id 
     WHERE s.token_hash = $1 AND s.expires_at > NOW()`,
    [tokenHash]
  );
  
  return result.rows[0];
}

export async function deleteSession(refreshToken) {
  const tokenHash = hashRefreshToken(refreshToken);
  await query('DELETE FROM sessions WHERE token_hash = $1', [tokenHash]);
}

export async function deleteAllUserSessions(userId) {
  await query('DELETE FROM sessions WHERE user_id = $1', [userId]);
}

export async function cleanupExpiredSessions() {
  await query('DELETE FROM sessions WHERE expires_at < NOW()');
}

export function verifyAccessToken(token) {
  try {
    return jwt.verify(token, JWT_SECRET);
  } catch (err) {
    return null;
  }
}

export async function recordCheckboxChange(userId, checkboxIndex, checked) {
  await query(
    `INSERT INTO checkbox_changes (user_id, checkbox_index, checked) 
     VALUES ($1, $2, $3)`,
    [userId, checkboxIndex, checked]
  );
}
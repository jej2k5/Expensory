import { AuthManager, LocalProvider, verifyToken } from '@authy/core';
import { getPool } from './database.js';

export const JWT_SECRET = process.env.JWT_SECRET || 'expensory-dev-secret-please-change-in-production';
const TOKEN_TTL = 7 * 24 * 3600; // 7 days

// ── AuthManager (LocalProvider backed by PostgreSQL users table) ─────────────
export const authManager = new AuthManager(JWT_SECRET);

authManager.register(new LocalProvider({
  jwtSecret: JWT_SECRET,
  tokenTtl:  TOKEN_TTL,
  findUser: async (username) => {
    const { rows } = await getPool().query(
      'SELECT id, email, name, password_hash FROM users WHERE username = $1 OR email = $1',
      [username],
    );
    if (!rows.length) return null;
    const u = rows[0];
    return { id: String(u.id), email: u.email, name: u.name, passwordHash: u.password_hash };
  },
}));

// ── requireAuth middleware ────────────────────────────────────────────────────
export async function requireAuth(req, res, next) {
  const header = req.headers.authorization;
  if (!header?.startsWith('Bearer ')) {
    return res.status(401).json({ error: 'Authentication required' });
  }
  try {
    req.user = await verifyToken(header.slice(7), JWT_SECRET);
    next();
  } catch {
    res.status(401).json({ error: 'Invalid or expired token' });
  }
}

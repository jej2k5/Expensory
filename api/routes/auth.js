import { Router } from 'express';
import { hashPassword } from '@authy/core';
import { authManager, requireAuth } from '../auth.js';
import { getPool } from '../database.js';

const router = Router();

// POST /auth/register — create a new user account
router.post('/register', async (req, res, next) => {
  try {
    const { username, email, name, password } = req.body;
    if (!username || !email || !name || !password)
      return res.status(400).json({ error: 'username, email, name, and password are required' });
    if (password.length < 8)
      return res.status(400).json({ error: 'Password must be at least 8 characters' });

    const passwordHash = await hashPassword(password);

    try {
      const { rows } = await getPool().query(
        'INSERT INTO users (username, email, name, password_hash) VALUES ($1, $2, $3, $4) RETURNING id, username, email, name',
        [username.trim(), email.trim().toLowerCase(), name.trim(), passwordHash],
      );
      res.status(201).json({ user: rows[0] });
    } catch (err) {
      if (err.code === '23505')
        return res.status(409).json({ error: 'Username or email already exists' });
      throw err;
    }
  } catch (err) { next(err); }
});

// POST /auth/login — authenticate and return a JWT
router.post('/login', async (req, res, next) => {
  try {
    const { username, password } = req.body;
    if (!username || !password)
      return res.status(400).json({ error: 'username and password are required' });

    const result = await authManager.authenticate('local', { username, password });
    if (!result.success)
      return res.status(401).json({ error: 'Invalid username or password' });

    res.json({ token: result.token, user: result.user });
  } catch (err) { next(err); }
});

// GET /auth/me — return info about the authenticated user (requires valid JWT)
router.get('/me', requireAuth, async (req, res, next) => {
  try {
    // requireAuth already validated the token; req.user has the JWT payload
    const { rows } = await getPool().query(
      'SELECT id, username, email, name, created_at FROM users WHERE id = $1',
      [req.user.sub],
    );
    if (!rows.length) return res.status(404).json({ error: 'User not found' });
    res.json(rows[0]);
  } catch (err) { next(err); }
});

export default router;

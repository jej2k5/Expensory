import { Router } from 'express';
import { getPool } from '../database.js';

const router = Router();

// GET /categories
router.get('/', async (_req, res, next) => {
  try {
    const { rows } = await getPool().query(`
      SELECT c.*,
             COUNT(e.id)::int            AS expense_count,
             COALESCE(SUM(e.amount), 0)  AS total_spent
      FROM categories c
      LEFT JOIN expenses e ON e.category_id = c.id
      GROUP BY c.id
      ORDER BY c.name
    `);
    res.json(rows);
  } catch (err) { next(err); }
});

// GET /categories/:id
router.get('/:id', async (req, res, next) => {
  try {
    const { rows } = await getPool().query(`
      SELECT c.*,
             COUNT(e.id)::int            AS expense_count,
             COALESCE(SUM(e.amount), 0)  AS total_spent
      FROM categories c
      LEFT JOIN expenses e ON e.category_id = c.id
      WHERE c.id = $1
      GROUP BY c.id
    `, [req.params.id]);

    if (!rows.length) return res.status(404).json({ error: 'Category not found' });
    res.json(rows[0]);
  } catch (err) { next(err); }
});

// POST /categories
router.post('/', async (req, res, next) => {
  try {
    const pool = getPool();
    const { name, color, budget_limit } = req.body;
    if (!name) return res.status(400).json({ error: 'name is required' });

    try {
      const { rows } = await pool.query(`
        INSERT INTO categories (name, color, budget_limit)
        VALUES ($1, $2, $3)
        RETURNING *
      `, [name, color || '#6366f1', budget_limit || null]);
      res.status(201).json(rows[0]);
    } catch (err) {
      if (err.code === '23505') // unique_violation
        return res.status(409).json({ error: 'Category name already exists' });
      throw err;
    }
  } catch (err) { next(err); }
});

// PUT /categories/:id
router.put('/:id', async (req, res, next) => {
  try {
    const pool = getPool();
    const { rows: existing } = await pool.query(
      'SELECT * FROM categories WHERE id = $1', [req.params.id]
    );
    if (!existing.length) return res.status(404).json({ error: 'Category not found' });
    const ex = existing[0];

    const { name, color, budget_limit } = req.body;

    try {
      await pool.query(`
        UPDATE categories SET name = $1, color = $2, budget_limit = $3 WHERE id = $4
      `, [
        name         ?? ex.name,
        color        ?? ex.color,
        budget_limit !== undefined ? (budget_limit || null) : ex.budget_limit,
        req.params.id,
      ]);
    } catch (err) {
      if (err.code === '23505')
        return res.status(409).json({ error: 'Category name already exists' });
      throw err;
    }

    const { rows } = await pool.query('SELECT * FROM categories WHERE id = $1', [req.params.id]);
    res.json(rows[0]);
  } catch (err) { next(err); }
});

// DELETE /categories/:id
router.delete('/:id', async (req, res, next) => {
  try {
    const { rows } = await getPool().query(
      'DELETE FROM categories WHERE id = $1 RETURNING id', [req.params.id]
    );
    if (!rows.length) return res.status(404).json({ error: 'Category not found' });
    res.json({ message: 'Category deleted', id: rows[0].id });
  } catch (err) { next(err); }
});

export default router;

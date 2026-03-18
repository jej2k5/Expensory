import { Router } from 'express';
import { getPool } from '../database.js';

const router = Router();

// GET /budgets?month=YYYY-MM — budget vs actual for a month
router.get('/', async (req, res, next) => {
  try {
    const pool = getPool();
    const month = req.query.month || new Date().toISOString().slice(0, 7);

    const { rows } = await pool.query(`
      SELECT c.id AS category_id,
             c.name AS category_name,
             c.color AS category_color,
             COALESCE(b.limit_amount, c.budget_limit) AS budget_limit,
             COALESCE(SUM(
               CASE WHEN TO_CHAR(e.date, 'YYYY-MM') = $1 THEN e.amount END
             ), 0) AS spent,
             COUNT(
               CASE WHEN TO_CHAR(e.date, 'YYYY-MM') = $1 THEN 1 END
             )::int AS expense_count
      FROM categories c
      LEFT JOIN budgets b ON b.category_id = c.id AND b.month = $1
      LEFT JOIN expenses e ON e.category_id = c.id
      GROUP BY c.id, c.name, c.color, b.limit_amount
      ORDER BY c.name
    `, [month]);

    const budgets = rows.map((r) => {
      const budget_limit = r.budget_limit != null ? Number(r.budget_limit) : null;
      const spent        = Number(r.spent);
      return {
        ...r,
        budget_limit,
        spent,
        remaining:   budget_limit != null ? budget_limit - spent : null,
        pct_used:    budget_limit != null ? Math.round((spent / budget_limit) * 100) : null,
        over_budget: budget_limit != null ? spent > budget_limit : false,
      };
    });

    res.json({ month, budgets });
  } catch (err) { next(err); }
});

// POST /budgets — set (upsert) budget for a category+month
router.post('/', async (req, res, next) => {
  try {
    const pool = getPool();
    const { category_id, month, limit_amount } = req.body;

    if (!category_id || !month || limit_amount == null)
      return res.status(400).json({ error: 'category_id, month, and limit_amount are required' });
    if (!/^\d{4}-\d{2}$/.test(month))
      return res.status(400).json({ error: 'month must be in YYYY-MM format' });
    if (Number(limit_amount) <= 0)
      return res.status(400).json({ error: 'limit_amount must be positive' });

    const cat = await pool.query('SELECT id FROM categories WHERE id = $1', [category_id]);
    if (!cat.rows.length) return res.status(404).json({ error: 'Category not found' });

    const { rows } = await pool.query(`
      INSERT INTO budgets (category_id, month, limit_amount)
      VALUES ($1, $2, $3)
      ON CONFLICT (category_id, month) DO UPDATE SET limit_amount = EXCLUDED.limit_amount
      RETURNING *
    `, [category_id, month, Number(limit_amount)]);

    const budget = await pool.query(`
      SELECT b.*, c.name AS category_name
      FROM budgets b JOIN categories c ON b.category_id = c.id
      WHERE b.id = $1
    `, [rows[0].id]);

    res.status(201).json(budget.rows[0]);
  } catch (err) { next(err); }
});

// DELETE /budgets/:category_id/:month
router.delete('/:category_id/:month', async (req, res, next) => {
  try {
    const { category_id, month } = req.params;
    const { rows } = await getPool().query(
      'DELETE FROM budgets WHERE category_id = $1 AND month = $2 RETURNING id',
      [category_id, month]
    );
    if (!rows.length) return res.status(404).json({ error: 'Budget not found' });
    res.json({ message: 'Budget removed', category_id: Number(category_id), month });
  } catch (err) { next(err); }
});

export default router;

import { Router } from 'express';
import { getDb } from '../database.js';

const router = Router();

// GET /budgets?month=YYYY-MM — budget vs actual for a month
router.get('/', (req, res) => {
  const db = getDb();
  const month = req.query.month || new Date().toISOString().slice(0, 7);

  const rows = db.prepare(`
    SELECT c.id AS category_id,
           c.name AS category_name,
           c.color AS category_color,
           COALESCE(b.limit_amount, c.budget_limit) AS budget_limit,
           COALESCE(SUM(CASE WHEN strftime('%Y-%m', e.date) = ? THEN e.amount ELSE 0 END), 0) AS spent,
           COUNT(CASE WHEN strftime('%Y-%m', e.date) = ? THEN 1 END) AS expense_count
    FROM categories c
    LEFT JOIN budgets b ON b.category_id = c.id AND b.month = ?
    LEFT JOIN expenses e ON e.category_id = c.id
    GROUP BY c.id
    ORDER BY c.name
  `).all(month, month, month);

  const result = rows.map(row => ({
    ...row,
    remaining: row.budget_limit != null ? row.budget_limit - row.spent : null,
    pct_used:  row.budget_limit != null ? Math.round((row.spent / row.budget_limit) * 100) : null,
    over_budget: row.budget_limit != null ? row.spent > row.budget_limit : false,
  }));

  res.json({ month, budgets: result });
});

// POST /budgets — set budget for a category/month
router.post('/', (req, res) => {
  const db = getDb();
  const { category_id, month, limit_amount } = req.body;

  if (!category_id || !month || !limit_amount) {
    return res.status(400).json({ error: 'category_id, month, and limit_amount are required' });
  }
  if (!/^\d{4}-\d{2}$/.test(month)) {
    return res.status(400).json({ error: 'month must be in YYYY-MM format' });
  }
  if (limit_amount <= 0) {
    return res.status(400).json({ error: 'limit_amount must be positive' });
  }

  const cat = db.prepare('SELECT id FROM categories WHERE id = ?').get(category_id);
  if (!cat) return res.status(404).json({ error: 'Category not found' });

  db.prepare(`
    INSERT INTO budgets (category_id, month, limit_amount)
    VALUES (?, ?, ?)
    ON CONFLICT(category_id, month) DO UPDATE SET limit_amount = excluded.limit_amount
  `).run(category_id, month, Number(limit_amount));

  const budget = db.prepare(`
    SELECT b.*, c.name AS category_name
    FROM budgets b JOIN categories c ON b.category_id = c.id
    WHERE b.category_id = ? AND b.month = ?
  `).get(category_id, month);

  res.status(201).json(budget);
});

// DELETE /budgets/:category_id/:month
router.delete('/:category_id/:month', (req, res) => {
  const db = getDb();
  const { category_id, month } = req.params;

  const result = db.prepare(
    'DELETE FROM budgets WHERE category_id = ? AND month = ?'
  ).run(category_id, month);

  if (result.changes === 0) {
    return res.status(404).json({ error: 'Budget not found' });
  }
  res.json({ message: 'Budget removed', category_id: Number(category_id), month });
});

export default router;

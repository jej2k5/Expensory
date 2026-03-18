import { Router } from 'express';
import { getDb } from '../database.js';

const router = Router();

// GET /categories
router.get('/', (req, res) => {
  const db = getDb();
  const categories = db.prepare(`
    SELECT c.*,
           COUNT(e.id) AS expense_count,
           COALESCE(SUM(e.amount), 0) AS total_spent
    FROM categories c
    LEFT JOIN expenses e ON e.category_id = c.id
    GROUP BY c.id
    ORDER BY c.name
  `).all();
  res.json(categories);
});

// GET /categories/:id
router.get('/:id', (req, res) => {
  const db = getDb();
  const category = db.prepare(`
    SELECT c.*,
           COUNT(e.id) AS expense_count,
           COALESCE(SUM(e.amount), 0) AS total_spent
    FROM categories c
    LEFT JOIN expenses e ON e.category_id = c.id
    WHERE c.id = ?
    GROUP BY c.id
  `).get(req.params.id);

  if (!category) return res.status(404).json({ error: 'Category not found' });
  res.json(category);
});

// POST /categories
router.post('/', (req, res) => {
  const db = getDb();
  const { name, color, budget_limit } = req.body;

  if (!name) return res.status(400).json({ error: 'name is required' });

  const existing = db.prepare('SELECT id FROM categories WHERE name = ?').get(name);
  if (existing) return res.status(409).json({ error: 'Category name already exists' });

  const result = db.prepare(
    'INSERT INTO categories (name, color, budget_limit) VALUES (?, ?, ?)'
  ).run(name, color || '#6366f1', budget_limit || null);

  const category = db.prepare('SELECT * FROM categories WHERE id = ?').get(result.lastInsertRowid);
  res.status(201).json(category);
});

// PUT /categories/:id
router.put('/:id', (req, res) => {
  const db = getDb();
  const existing = db.prepare('SELECT * FROM categories WHERE id = ?').get(req.params.id);
  if (!existing) return res.status(404).json({ error: 'Category not found' });

  const { name, color, budget_limit } = req.body;

  if (name && name !== existing.name) {
    const conflict = db.prepare('SELECT id FROM categories WHERE name = ? AND id != ?').get(name, req.params.id);
    if (conflict) return res.status(409).json({ error: 'Category name already exists' });
  }

  db.prepare(
    'UPDATE categories SET name = ?, color = ?, budget_limit = ? WHERE id = ?'
  ).run(
    name         ?? existing.name,
    color        ?? existing.color,
    budget_limit !== undefined ? (budget_limit || null) : existing.budget_limit,
    req.params.id
  );

  res.json(db.prepare('SELECT * FROM categories WHERE id = ?').get(req.params.id));
});

// DELETE /categories/:id
router.delete('/:id', (req, res) => {
  const db = getDb();
  const existing = db.prepare('SELECT * FROM categories WHERE id = ?').get(req.params.id);
  if (!existing) return res.status(404).json({ error: 'Category not found' });

  db.prepare('DELETE FROM categories WHERE id = ?').run(req.params.id);
  res.json({ message: 'Category deleted', id: Number(req.params.id) });
});

export default router;

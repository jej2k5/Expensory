import { Router } from 'express';
import { getDb } from '../database.js';

const router = Router();

// GET /expenses — list with optional filters
router.get('/', (req, res) => {
  const db = getDb();
  const { category_id, start_date, end_date, min_amount, max_amount, limit = 100, offset = 0 } = req.query;

  let sql = `
    SELECT e.*, c.name AS category_name, c.color AS category_color
    FROM expenses e
    LEFT JOIN categories c ON e.category_id = c.id
    WHERE 1=1
  `;
  const params = [];

  if (category_id) { sql += ' AND e.category_id = ?'; params.push(category_id); }
  if (start_date)  { sql += ' AND e.date >= ?';        params.push(start_date); }
  if (end_date)    { sql += ' AND e.date <= ?';        params.push(end_date); }
  if (min_amount)  { sql += ' AND e.amount >= ?';      params.push(min_amount); }
  if (max_amount)  { sql += ' AND e.amount <= ?';      params.push(max_amount); }

  sql += ' ORDER BY e.date DESC, e.created_at DESC LIMIT ? OFFSET ?';
  params.push(Number(limit), Number(offset));

  const expenses = db.prepare(sql).all(...params);
  const total = db.prepare(
    `SELECT COUNT(*) as n FROM expenses e WHERE 1=1${
      category_id ? ' AND e.category_id = ?' : ''}${
      start_date  ? ' AND e.date >= ?'        : ''}${
      end_date    ? ' AND e.date <= ?'        : ''}${
      min_amount  ? ' AND e.amount >= ?'      : ''}${
      max_amount  ? ' AND e.amount <= ?'      : ''}`
  ).get(...params.slice(0, -2));

  res.json({ expenses, total: total.n, limit: Number(limit), offset: Number(offset) });
});

// GET /expenses/summary — aggregate stats
router.get('/summary', (req, res) => {
  const db = getDb();
  const { start_date, end_date, group_by = 'category' } = req.query;

  const dateFilter = [];
  const params = [];
  if (start_date) { dateFilter.push('e.date >= ?'); params.push(start_date); }
  if (end_date)   { dateFilter.push('e.date <= ?'); params.push(end_date); }
  const where = dateFilter.length ? 'WHERE ' + dateFilter.join(' AND ') : '';

  let groupSql;
  if (group_by === 'month') {
    groupSql = `
      SELECT strftime('%Y-%m', e.date) AS period,
             COUNT(*) AS count,
             SUM(e.amount) AS total,
             AVG(e.amount) AS average
      FROM expenses e ${where}
      GROUP BY period
      ORDER BY period DESC
    `;
  } else {
    groupSql = `
      SELECT c.id AS category_id, c.name AS category_name, c.color AS category_color,
             COUNT(*) AS count,
             SUM(e.amount) AS total,
             AVG(e.amount) AS average
      FROM expenses e
      LEFT JOIN categories c ON e.category_id = c.id
      ${where}
      GROUP BY e.category_id
      ORDER BY total DESC
    `;
  }

  const breakdown = db.prepare(groupSql).all(...params);
  const totals = db.prepare(
    `SELECT COUNT(*) AS count, SUM(amount) AS total, AVG(amount) AS average,
            MIN(amount) AS min, MAX(amount) AS max
     FROM expenses e ${where}`
  ).get(...params);

  res.json({ summary: totals, breakdown });
});

// GET /expenses/:id
router.get('/:id', (req, res) => {
  const db = getDb();
  const expense = db.prepare(`
    SELECT e.*, c.name AS category_name, c.color AS category_color
    FROM expenses e LEFT JOIN categories c ON e.category_id = c.id
    WHERE e.id = ?
  `).get(req.params.id);

  if (!expense) return res.status(404).json({ error: 'Expense not found' });
  res.json(expense);
});

// POST /expenses
router.post('/', (req, res) => {
  const db = getDb();
  const { title, amount, category_id, date, description, receipt_url } = req.body;

  if (!title || !amount) {
    return res.status(400).json({ error: 'title and amount are required' });
  }
  if (amount <= 0) {
    return res.status(400).json({ error: 'amount must be positive' });
  }

  const result = db.prepare(`
    INSERT INTO expenses (title, amount, category_id, date, description, receipt_url)
    VALUES (?, ?, ?, ?, ?, ?)
  `).run(
    title,
    Number(amount),
    category_id || null,
    date || new Date().toISOString().split('T')[0],
    description || '',
    receipt_url || null
  );

  const expense = db.prepare(`
    SELECT e.*, c.name AS category_name, c.color AS category_color
    FROM expenses e LEFT JOIN categories c ON e.category_id = c.id
    WHERE e.id = ?
  `).get(result.lastInsertRowid);

  res.status(201).json(expense);
});

// PUT /expenses/:id
router.put('/:id', (req, res) => {
  const db = getDb();
  const existing = db.prepare('SELECT * FROM expenses WHERE id = ?').get(req.params.id);
  if (!existing) return res.status(404).json({ error: 'Expense not found' });

  const { title, amount, category_id, date, description, receipt_url } = req.body;

  if (amount !== undefined && amount <= 0) {
    return res.status(400).json({ error: 'amount must be positive' });
  }

  db.prepare(`
    UPDATE expenses
    SET title = ?, amount = ?, category_id = ?, date = ?, description = ?,
        receipt_url = ?, updated_at = datetime('now')
    WHERE id = ?
  `).run(
    title        ?? existing.title,
    amount       != null ? Number(amount) : existing.amount,
    category_id  !== undefined ? (category_id || null) : existing.category_id,
    date         ?? existing.date,
    description  ?? existing.description,
    receipt_url  !== undefined ? (receipt_url || null) : existing.receipt_url,
    req.params.id
  );

  const expense = db.prepare(`
    SELECT e.*, c.name AS category_name, c.color AS category_color
    FROM expenses e LEFT JOIN categories c ON e.category_id = c.id
    WHERE e.id = ?
  `).get(req.params.id);

  res.json(expense);
});

// DELETE /expenses/:id
router.delete('/:id', (req, res) => {
  const db = getDb();
  const existing = db.prepare('SELECT * FROM expenses WHERE id = ?').get(req.params.id);
  if (!existing) return res.status(404).json({ error: 'Expense not found' });

  db.prepare('DELETE FROM expenses WHERE id = ?').run(req.params.id);
  res.json({ message: 'Expense deleted', id: Number(req.params.id) });
});

export default router;

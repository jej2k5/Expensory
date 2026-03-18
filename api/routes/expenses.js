import { Router } from 'express';
import { getPool } from '../database.js';

const router = Router();

// Helper: build a sequential parameter list for pg ($1, $2, ...)
function paramBuilder() {
  const params = [];
  return {
    params,
    add(value) {
      params.push(value);
      return `$${params.length}`;
    },
  };
}

// GET /expenses — list with optional filters
router.get('/', async (req, res, next) => {
  try {
    const pool = getPool();
    const { category_id, start_date, end_date, min_amount, max_amount,
            limit = 100, offset = 0 } = req.query;

    const { params, add } = paramBuilder();
    let where = 'WHERE 1=1';
    if (category_id) where += ` AND e.category_id = ${add(category_id)}`;
    if (start_date)  where += ` AND e.date >= ${add(start_date)}`;
    if (end_date)    where += ` AND e.date <= ${add(end_date)}`;
    if (min_amount)  where += ` AND e.amount >= ${add(min_amount)}`;
    if (max_amount)  where += ` AND e.amount <= ${add(max_amount)}`;

    const filterParams = [...params];

    const dataQ = pool.query(`
      SELECT e.*, c.name AS category_name, c.color AS category_color
      FROM expenses e
      LEFT JOIN categories c ON e.category_id = c.id
      ${where}
      ORDER BY e.date DESC, e.created_at DESC
      LIMIT ${add(Number(limit))} OFFSET ${add(Number(offset))}
    `, params);

    const countQ = pool.query(
      `SELECT COUNT(*) AS n FROM expenses e ${where}`,
      filterParams
    );

    const [data, count] = await Promise.all([dataQ, countQ]);

    res.json({
      expenses: data.rows,
      total: parseInt(count.rows[0].n),
      limit: Number(limit),
      offset: Number(offset),
    });
  } catch (err) { next(err); }
});

// GET /expenses/summary — aggregate stats
router.get('/summary', async (req, res, next) => {
  try {
    const pool = getPool();
    const { group_by = 'category', start_date, end_date } = req.query;

    const { params, add } = paramBuilder();
    const conditions = [];
    if (start_date) conditions.push(`e.date >= ${add(start_date)}`);
    if (end_date)   conditions.push(`e.date <= ${add(end_date)}`);
    const where = conditions.length ? 'WHERE ' + conditions.join(' AND ') : '';

    let groupSql;
    if (group_by === 'month') {
      groupSql = `
        SELECT TO_CHAR(e.date, 'YYYY-MM') AS period,
               COUNT(*)::int      AS count,
               SUM(e.amount)      AS total,
               AVG(e.amount)      AS average
        FROM expenses e ${where}
        GROUP BY period
        ORDER BY period DESC
      `;
    } else {
      groupSql = `
        SELECT c.id AS category_id, c.name AS category_name, c.color AS category_color,
               COUNT(*)::int  AS count,
               SUM(e.amount)  AS total,
               AVG(e.amount)  AS average
        FROM expenses e
        LEFT JOIN categories c ON e.category_id = c.id
        ${where}
        GROUP BY c.id, c.name, c.color
        ORDER BY total DESC NULLS LAST
      `;
    }

    const [breakdown, totals] = await Promise.all([
      pool.query(groupSql, params),
      pool.query(
        `SELECT COUNT(*)::int AS count, SUM(amount) AS total,
                AVG(amount) AS average, MIN(amount) AS min, MAX(amount) AS max
         FROM expenses e ${where}`,
        params
      ),
    ]);

    res.json({ summary: totals.rows[0], breakdown: breakdown.rows });
  } catch (err) { next(err); }
});

// GET /expenses/:id
router.get('/:id', async (req, res, next) => {
  try {
    const { rows } = await getPool().query(`
      SELECT e.*, c.name AS category_name, c.color AS category_color
      FROM expenses e LEFT JOIN categories c ON e.category_id = c.id
      WHERE e.id = $1
    `, [req.params.id]);

    if (!rows.length) return res.status(404).json({ error: 'Expense not found' });
    res.json(rows[0]);
  } catch (err) { next(err); }
});

// POST /expenses
router.post('/', async (req, res, next) => {
  try {
    const pool = getPool();
    const { title, amount, category_id, date, description, receipt_url } = req.body;

    if (!title || amount == null)
      return res.status(400).json({ error: 'title and amount are required' });
    if (Number(amount) <= 0)
      return res.status(400).json({ error: 'amount must be positive' });

    const { rows } = await pool.query(`
      INSERT INTO expenses (title, amount, category_id, date, description, receipt_url)
      VALUES ($1, $2, $3, $4, $5, $6)
      RETURNING *
    `, [
      title,
      Number(amount),
      category_id || null,
      date || null,          // defaults to CURRENT_DATE in DB
      description || '',
      receipt_url || null,
    ]);

    const expense = await pool.query(`
      SELECT e.*, c.name AS category_name, c.color AS category_color
      FROM expenses e LEFT JOIN categories c ON e.category_id = c.id
      WHERE e.id = $1
    `, [rows[0].id]);

    res.status(201).json(expense.rows[0]);
  } catch (err) { next(err); }
});

// PUT /expenses/:id
router.put('/:id', async (req, res, next) => {
  try {
    const pool = getPool();
    const { rows: existing } = await pool.query(
      'SELECT * FROM expenses WHERE id = $1', [req.params.id]
    );
    if (!existing.length) return res.status(404).json({ error: 'Expense not found' });
    const ex = existing[0];

    const { title, amount, category_id, date, description, receipt_url } = req.body;
    if (amount !== undefined && Number(amount) <= 0)
      return res.status(400).json({ error: 'amount must be positive' });

    await pool.query(`
      UPDATE expenses
      SET title = $1, amount = $2, category_id = $3, date = $4,
          description = $5, receipt_url = $6, updated_at = NOW()
      WHERE id = $7
    `, [
      title        ?? ex.title,
      amount       != null ? Number(amount) : ex.amount,
      category_id  !== undefined ? (category_id || null) : ex.category_id,
      date         ?? ex.date,
      description  ?? ex.description,
      receipt_url  !== undefined ? (receipt_url || null) : ex.receipt_url,
      req.params.id,
    ]);

    const { rows } = await pool.query(`
      SELECT e.*, c.name AS category_name, c.color AS category_color
      FROM expenses e LEFT JOIN categories c ON e.category_id = c.id
      WHERE e.id = $1
    `, [req.params.id]);

    res.json(rows[0]);
  } catch (err) { next(err); }
});

// DELETE /expenses/:id
router.delete('/:id', async (req, res, next) => {
  try {
    const pool = getPool();
    const { rows } = await pool.query(
      'DELETE FROM expenses WHERE id = $1 RETURNING id', [req.params.id]
    );
    if (!rows.length) return res.status(404).json({ error: 'Expense not found' });
    res.json({ message: 'Expense deleted', id: rows[0].id });
  } catch (err) { next(err); }
});

export default router;

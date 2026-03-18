import pg from 'pg';

const { Pool } = pg;

let pool;

export function getPool() {
  if (!pool) {
    pool = new Pool({
      connectionString: process.env.DATABASE_URL ||
        'postgres://expensory:expensory@localhost:5432/expensory',
      // Sensible pool defaults
      max: 10,
      idleTimeoutMillis: 30000,
      connectionTimeoutMillis: 5000,
    });

    pool.on('error', (err) => {
      console.error('[DB] Unexpected pool error:', err.message);
    });
  }
  return pool;
}

export async function initSchema() {
  const pool = getPool();

  await pool.query(`
    CREATE TABLE IF NOT EXISTS users (
      id            SERIAL PRIMARY KEY,
      username      TEXT NOT NULL UNIQUE,
      email         TEXT NOT NULL UNIQUE,
      name          TEXT NOT NULL,
      password_hash TEXT NOT NULL,
      created_at    TIMESTAMPTZ NOT NULL DEFAULT NOW()
    );

    CREATE TABLE IF NOT EXISTS categories (
      id          SERIAL PRIMARY KEY,
      name        TEXT NOT NULL UNIQUE,
      budget_limit NUMERIC,
      color       TEXT NOT NULL DEFAULT '#6366f1',
      created_at  TIMESTAMPTZ NOT NULL DEFAULT NOW()
    );

    CREATE TABLE IF NOT EXISTS expenses (
      id          SERIAL PRIMARY KEY,
      title       TEXT NOT NULL,
      amount      NUMERIC NOT NULL CHECK (amount > 0),
      category_id INTEGER REFERENCES categories(id) ON DELETE SET NULL,
      date        DATE NOT NULL DEFAULT CURRENT_DATE,
      description TEXT NOT NULL DEFAULT '',
      receipt_url TEXT,
      created_at  TIMESTAMPTZ NOT NULL DEFAULT NOW(),
      updated_at  TIMESTAMPTZ NOT NULL DEFAULT NOW()
    );

    CREATE TABLE IF NOT EXISTS budgets (
      id           SERIAL PRIMARY KEY,
      category_id  INTEGER NOT NULL REFERENCES categories(id) ON DELETE CASCADE,
      month        CHAR(7) NOT NULL,        -- YYYY-MM
      limit_amount NUMERIC NOT NULL CHECK (limit_amount > 0),
      created_at   TIMESTAMPTZ NOT NULL DEFAULT NOW(),
      UNIQUE (category_id, month)
    );

    CREATE INDEX IF NOT EXISTS idx_expenses_date     ON expenses(date);
    CREATE INDEX IF NOT EXISTS idx_expenses_category ON expenses(category_id);
    CREATE INDEX IF NOT EXISTS idx_budgets_month     ON budgets(month);
  `);

  // Seed default categories if the table is empty
  const { rows } = await pool.query('SELECT COUNT(*) AS n FROM categories');
  if (parseInt(rows[0].n) === 0) {
    await pool.query(`
      INSERT INTO categories (name, color) VALUES
        ('Food & Dining',      '#f59e0b'),
        ('Transportation',     '#3b82f6'),
        ('Shopping',           '#ec4899'),
        ('Entertainment',      '#8b5cf6'),
        ('Health & Medical',   '#10b981'),
        ('Housing & Utilities','#ef4444'),
        ('Travel',             '#06b6d4'),
        ('Education',          '#f97316'),
        ('Other',              '#6b7280')
    `);
    console.log('[DB] Default categories seeded.');
  }

  console.log('[DB] Schema ready.');
}

export default getPool;

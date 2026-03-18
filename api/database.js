import Database from 'better-sqlite3';
import { fileURLToPath } from 'url';
import { dirname, join } from 'path';

const __dirname = dirname(fileURLToPath(import.meta.url));
const DB_PATH = join(__dirname, '..', 'expensory.db');

let db;

export function getDb() {
  if (!db) {
    db = new Database(DB_PATH);
    db.pragma('journal_mode = WAL');
    db.pragma('foreign_keys = ON');
    initSchema();
  }
  return db;
}

function initSchema() {
  db.exec(`
    CREATE TABLE IF NOT EXISTS categories (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      name TEXT NOT NULL UNIQUE,
      budget_limit REAL DEFAULT NULL,
      color TEXT DEFAULT '#6366f1',
      created_at TEXT DEFAULT (datetime('now'))
    );

    CREATE TABLE IF NOT EXISTS expenses (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      title TEXT NOT NULL,
      amount REAL NOT NULL CHECK(amount > 0),
      category_id INTEGER REFERENCES categories(id) ON DELETE SET NULL,
      date TEXT NOT NULL DEFAULT (date('now')),
      description TEXT DEFAULT '',
      receipt_url TEXT DEFAULT NULL,
      created_at TEXT DEFAULT (datetime('now')),
      updated_at TEXT DEFAULT (datetime('now'))
    );

    CREATE TABLE IF NOT EXISTS budgets (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      category_id INTEGER NOT NULL REFERENCES categories(id) ON DELETE CASCADE,
      month TEXT NOT NULL,
      limit_amount REAL NOT NULL CHECK(limit_amount > 0),
      created_at TEXT DEFAULT (datetime('now')),
      UNIQUE(category_id, month)
    );

    CREATE INDEX IF NOT EXISTS idx_expenses_date ON expenses(date);
    CREATE INDEX IF NOT EXISTS idx_expenses_category ON expenses(category_id);
    CREATE INDEX IF NOT EXISTS idx_budgets_month ON budgets(month);
  `);

  // Seed default categories if empty
  const count = db.prepare('SELECT COUNT(*) as n FROM categories').get();
  if (count.n === 0) {
    const insert = db.prepare(
      'INSERT INTO categories (name, color) VALUES (?, ?)'
    );
    const defaults = [
      ['Food & Dining', '#f59e0b'],
      ['Transportation', '#3b82f6'],
      ['Shopping', '#ec4899'],
      ['Entertainment', '#8b5cf6'],
      ['Health & Medical', '#10b981'],
      ['Housing & Utilities', '#ef4444'],
      ['Travel', '#06b6d4'],
      ['Education', '#f97316'],
      ['Other', '#6b7280'],
    ];
    const insertMany = db.transaction((rows) => {
      for (const row of rows) insert.run(...row);
    });
    insertMany(defaults);
  }
}

export default getDb;

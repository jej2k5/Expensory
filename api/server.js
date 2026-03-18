import express from 'express';
import { fileURLToPath } from 'url';
import { dirname, join } from 'path';
import { initSchema } from './database.js';
import { ensureBucket } from './minio.js';
import { requireAuth } from './auth.js';
import authRouter from './routes/auth.js';
import expensesRouter from './routes/expenses.js';
import categoriesRouter from './routes/categories.js';
import budgetsRouter from './routes/budgets.js';
import receiptsRouter from './routes/receipts.js';

const __dirname = dirname(fileURLToPath(import.meta.url));
const app  = express();
const PORT = process.env.API_PORT || 3001;

// Raise JSON limit to handle base64-encoded receipt images (up to ~15 MB files)
app.use(express.json({ limit: '20mb' }));

app.use((req, _res, next) => {
  console.log(`[API] ${req.method} ${req.path}`);
  next();
});

app.get('/health', (_req, res) => {
  res.json({ status: 'ok', timestamp: new Date().toISOString() });
});

// Auth routes — /auth/register and /auth/login are public;
// /auth/me applies requireAuth internally via the route handler.
app.use('/auth', authRouter);

// All data routes require a valid Bearer JWT
app.use('/expenses',   requireAuth, expensesRouter);
app.use('/categories', requireAuth, categoriesRouter);
app.use('/budgets',    requireAuth, budgetsRouter);
app.use('/receipts',   requireAuth, receiptsRouter);

// Mobile web UI — served at /
app.use(express.static(join(__dirname, '../web')));

app.use((_req, res) => res.status(404).json({ error: 'Not found' }));

app.use((err, _req, res, _next) => {
  console.error('[API Error]', err.message);
  res.status(500).json({ error: err.message || 'Internal server error' });
});

// Initialise dependencies then start listening
await initSchema();
await ensureBucket();

app.listen(PORT, () => {
  console.log(`[Expensory API] Running on http://localhost:${PORT}`);
  console.log(`[Expensory UI]  Mobile web app at http://localhost:${PORT}/`);
});

export default app;

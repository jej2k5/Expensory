import express from 'express';
import { mkdir } from 'fs/promises';
import { initSchema } from './database.js';
import expensesRouter from './routes/expenses.js';
import categoriesRouter from './routes/categories.js';
import budgetsRouter from './routes/budgets.js';
import receiptsRouter, { UPLOADS_DIR } from './routes/receipts.js';

const app = express();
const PORT = process.env.API_PORT || 3001;

// Increase JSON limit to handle base64-encoded receipt images (up to ~15 MB files)
app.use(express.json({ limit: '20mb' }));

app.use((req, _res, next) => {
  console.log(`[API] ${req.method} ${req.path}`);
  next();
});

app.get('/health', (_req, res) => {
  res.json({ status: 'ok', timestamp: new Date().toISOString() });
});

// Serve saved receipt images as static files at /receipts/<filename>
app.use('/receipts', express.static(UPLOADS_DIR));

app.use('/expenses', expensesRouter);
app.use('/categories', categoriesRouter);
app.use('/budgets', budgetsRouter);
app.use('/receipts', receiptsRouter);

app.use((_req, res) => res.status(404).json({ error: 'Not found' }));

app.use((err, _req, res, _next) => {
  console.error('[API Error]', err.message);
  res.status(500).json({ error: err.message || 'Internal server error' });
});

// Ensure uploads directory exists, then initialise schema and start
await mkdir(UPLOADS_DIR, { recursive: true });
await initSchema();

app.listen(PORT, () => {
  console.log(`[Expensory API] Running on http://localhost:${PORT}`);
});

export default app;

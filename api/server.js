import express from 'express';
import { initSchema } from './database.js';
import expensesRouter from './routes/expenses.js';
import categoriesRouter from './routes/categories.js';
import budgetsRouter from './routes/budgets.js';

const app = express();
const PORT = process.env.API_PORT || 3001;

app.use(express.json());

app.use((req, _res, next) => {
  console.log(`[API] ${req.method} ${req.path}`);
  next();
});

app.get('/health', (_req, res) => {
  res.json({ status: 'ok', timestamp: new Date().toISOString() });
});

app.use('/expenses', expensesRouter);
app.use('/categories', categoriesRouter);
app.use('/budgets', budgetsRouter);

app.use((_req, res) => res.status(404).json({ error: 'Not found' }));

app.use((err, _req, res, _next) => {
  console.error('[API Error]', err.message);
  res.status(500).json({ error: err.message || 'Internal server error' });
});

// Initialize schema then start listening
await initSchema();

app.listen(PORT, () => {
  console.log(`[Expensory API] Running on http://localhost:${PORT}`);
});

export default app;

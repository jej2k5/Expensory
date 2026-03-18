/**
 * Expensory MCP Server
 *
 * Exposes expense management tools over the Model Context Protocol.
 * Each tool calls the Expensory REST API which persists data in SQLite.
 *
 * Tools:
 *   - add_expense          Create a new expense
 *   - list_expenses        List/filter expenses
 *   - get_expense          Get a single expense by ID
 *   - update_expense       Update an existing expense
 *   - delete_expense       Delete an expense
 *   - get_expense_summary  Aggregate stats (by category or month)
 *   - list_categories      List all categories with spend totals
 *   - create_category      Create a new expense category
 *   - update_category      Update a category name / color / budget
 *   - set_monthly_budget   Set a monthly budget for a category
 *   - get_budget_status    Compare actual spend vs budgets for a month
 */

import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { StdioServerTransport } from '@modelcontextprotocol/sdk/server/stdio.js';
import { z } from 'zod';

const API_BASE = process.env.API_BASE || 'http://localhost:3001';

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

async function apiCall(method, path, body) {
  const url = `${API_BASE}${path}`;
  const opts = {
    method,
    headers: { 'Content-Type': 'application/json' },
  };
  if (body !== undefined) opts.body = JSON.stringify(body);

  const res = await fetch(url, opts);
  const data = await res.json();

  if (!res.ok) {
    throw new Error(data.error || `API error ${res.status}`);
  }
  return data;
}

function text(obj) {
  return { content: [{ type: 'text', text: JSON.stringify(obj, null, 2) }] };
}

function buildQuery(params) {
  const q = new URLSearchParams();
  for (const [k, v] of Object.entries(params)) {
    if (v !== undefined && v !== null && v !== '') q.set(k, String(v));
  }
  const s = q.toString();
  return s ? `?${s}` : '';
}

// ---------------------------------------------------------------------------
// MCP Server
// ---------------------------------------------------------------------------

const server = new McpServer({
  name: 'expensory',
  version: '1.0.0',
});

// ── add_expense ──────────────────────────────────────────────────────────────
server.tool(
  'add_expense',
  'Create a new expense record. Returns the created expense with its assigned ID.',
  {
    title:       z.string().min(1).describe('Short descriptive title for the expense'),
    amount:      z.number().positive().describe('Expense amount (must be > 0)'),
    category_id: z.number().int().optional().describe('ID of the category (use list_categories to find IDs)'),
    date:        z.string().regex(/^\d{4}-\d{2}-\d{2}$/).optional().describe('Date in YYYY-MM-DD format (defaults to today)'),
    description: z.string().optional().describe('Optional longer description or notes'),
    receipt_url: z.string().url().optional().describe('Optional URL to a receipt image'),
  },
  async ({ title, amount, category_id, date, description, receipt_url }) => {
    const expense = await apiCall('POST', '/expenses', {
      title, amount, category_id, date, description, receipt_url,
    });
    return text({ message: 'Expense created successfully', expense });
  }
);

// ── list_expenses ────────────────────────────────────────────────────────────
server.tool(
  'list_expenses',
  'List expenses with optional filters. Returns a paginated list of expenses.',
  {
    category_id: z.number().int().optional().describe('Filter by category ID'),
    start_date:  z.string().regex(/^\d{4}-\d{2}-\d{2}$/).optional().describe('Filter from date (YYYY-MM-DD, inclusive)'),
    end_date:    z.string().regex(/^\d{4}-\d{2}-\d{2}$/).optional().describe('Filter to date (YYYY-MM-DD, inclusive)'),
    min_amount:  z.number().positive().optional().describe('Minimum amount filter'),
    max_amount:  z.number().positive().optional().describe('Maximum amount filter'),
    limit:       z.number().int().min(1).max(500).optional().default(50).describe('Max results to return (default 50)'),
    offset:      z.number().int().min(0).optional().default(0).describe('Pagination offset'),
  },
  async ({ category_id, start_date, end_date, min_amount, max_amount, limit, offset }) => {
    const qs = buildQuery({ category_id, start_date, end_date, min_amount, max_amount, limit, offset });
    const result = await apiCall('GET', `/expenses${qs}`);
    return text(result);
  }
);

// ── get_expense ──────────────────────────────────────────────────────────────
server.tool(
  'get_expense',
  'Retrieve a single expense by its ID.',
  {
    id: z.number().int().positive().describe('The expense ID'),
  },
  async ({ id }) => {
    const expense = await apiCall('GET', `/expenses/${id}`);
    return text(expense);
  }
);

// ── update_expense ───────────────────────────────────────────────────────────
server.tool(
  'update_expense',
  'Update one or more fields of an existing expense. Only provided fields are changed.',
  {
    id:          z.number().int().positive().describe('ID of the expense to update'),
    title:       z.string().min(1).optional().describe('New title'),
    amount:      z.number().positive().optional().describe('New amount'),
    category_id: z.number().int().nullable().optional().describe('New category ID (null to unassign)'),
    date:        z.string().regex(/^\d{4}-\d{2}-\d{2}$/).optional().describe('New date (YYYY-MM-DD)'),
    description: z.string().optional().describe('New description'),
    receipt_url: z.string().url().nullable().optional().describe('New receipt URL (null to remove)'),
  },
  async ({ id, ...fields }) => {
    const expense = await apiCall('PUT', `/expenses/${id}`, fields);
    return text({ message: 'Expense updated successfully', expense });
  }
);

// ── delete_expense ───────────────────────────────────────────────────────────
server.tool(
  'delete_expense',
  'Permanently delete an expense by ID.',
  {
    id: z.number().int().positive().describe('ID of the expense to delete'),
  },
  async ({ id }) => {
    const result = await apiCall('DELETE', `/expenses/${id}`);
    return text(result);
  }
);

// ── get_expense_summary ──────────────────────────────────────────────────────
server.tool(
  'get_expense_summary',
  'Get aggregate expense statistics. Can group by category or by month.',
  {
    group_by:   z.enum(['category', 'month']).optional().default('category').describe('Group results by category or month'),
    start_date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).optional().describe('Summary start date (YYYY-MM-DD)'),
    end_date:   z.string().regex(/^\d{4}-\d{2}-\d{2}$/).optional().describe('Summary end date (YYYY-MM-DD)'),
  },
  async ({ group_by, start_date, end_date }) => {
    const qs = buildQuery({ group_by, start_date, end_date });
    const result = await apiCall('GET', `/expenses/summary${qs}`);
    return text(result);
  }
);

// ── list_categories ──────────────────────────────────────────────────────────
server.tool(
  'list_categories',
  'List all expense categories, including total spend and expense count per category.',
  {},
  async () => {
    const categories = await apiCall('GET', '/categories');
    return text(categories);
  }
);

// ── create_category ──────────────────────────────────────────────────────────
server.tool(
  'create_category',
  'Create a new expense category.',
  {
    name:         z.string().min(1).describe('Category name (must be unique)'),
    color:        z.string().regex(/^#[0-9a-fA-F]{6}$/).optional().describe('Hex color code (e.g. #f59e0b)'),
    budget_limit: z.number().positive().optional().describe('Default monthly budget limit for this category'),
  },
  async ({ name, color, budget_limit }) => {
    const category = await apiCall('POST', '/categories', { name, color, budget_limit });
    return text({ message: 'Category created successfully', category });
  }
);

// ── update_category ──────────────────────────────────────────────────────────
server.tool(
  'update_category',
  'Update a category\'s name, color, or default budget limit.',
  {
    id:           z.number().int().positive().describe('Category ID'),
    name:         z.string().min(1).optional().describe('New name'),
    color:        z.string().regex(/^#[0-9a-fA-F]{6}$/).optional().describe('New hex color'),
    budget_limit: z.number().positive().nullable().optional().describe('New default budget (null to remove)'),
  },
  async ({ id, ...fields }) => {
    const category = await apiCall('PUT', `/categories/${id}`, fields);
    return text({ message: 'Category updated', category });
  }
);

// ── set_monthly_budget ───────────────────────────────────────────────────────
server.tool(
  'set_monthly_budget',
  'Set a spending budget for a specific category and month. Overwrites any existing budget for that month.',
  {
    category_id:  z.number().int().positive().describe('Category ID'),
    month:        z.string().regex(/^\d{4}-\d{2}$/).describe('Month in YYYY-MM format (e.g. 2025-03)'),
    limit_amount: z.number().positive().describe('Budget limit in currency units'),
  },
  async ({ category_id, month, limit_amount }) => {
    const budget = await apiCall('POST', '/budgets', { category_id, month, limit_amount });
    return text({ message: 'Budget set successfully', budget });
  }
);

// ── get_budget_status ────────────────────────────────────────────────────────
server.tool(
  'get_budget_status',
  'Get a comparison of budgeted vs actual spending for all categories in a given month. Shows remaining budget, % used, and whether any category is over budget.',
  {
    month: z.string().regex(/^\d{4}-\d{2}$/).optional().describe('Month in YYYY-MM format (defaults to current month)'),
  },
  async ({ month }) => {
    const qs = month ? `?month=${month}` : '';
    const result = await apiCall('GET', `/budgets${qs}`);

    const overBudget = result.budgets.filter(b => b.over_budget);
    const summary = {
      month: result.month,
      total_budget: result.budgets.reduce((s, b) => s + (b.budget_limit || 0), 0),
      total_spent: result.budgets.reduce((s, b) => s + b.spent, 0),
      categories_over_budget: overBudget.length,
      over_budget_categories: overBudget.map(b => b.category_name),
    };

    return text({ summary, budgets: result.budgets });
  }
);

// ---------------------------------------------------------------------------
// Start
// ---------------------------------------------------------------------------

const transport = new StdioServerTransport();
await server.connect(transport);
console.error('[Expensory MCP] Server running on stdio');

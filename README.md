# Expensory

An expense management application entirely driven through **MCP (Model Context Protocol)** — Claude calls MCP tools, which call a REST API, which persists data in SQLite.

```
Claude (Anthropic API)
       │
       │  tool calls (MCP protocol over stdio)
       ▼
  MCP Server  (11 expense-management tools)
       │
       │  HTTP requests
       ▼
  REST API  (Express + 3 route groups)
       │
       │  SQL queries
       ▼
  SQLite Database  (expenses · categories · budgets)
```

---

## Features

| Area | Capabilities |
|---|---|
| **Expenses** | Create, read, update, delete; filter by category, date range, amount |
| **Categories** | 9 default categories pre-seeded; create custom ones with hex colors |
| **Budgets** | Set monthly per-category budgets; get % used and over-budget alerts |
| **Summaries** | Aggregate stats grouped by category or month with totals/averages |

---

## MCP Tools

The MCP server exposes 11 tools that Claude uses to manage all data:

| Tool | Description |
|---|---|
| `add_expense` | Create a new expense |
| `list_expenses` | List/filter expenses with pagination |
| `get_expense` | Fetch a single expense by ID |
| `update_expense` | Partially update an expense |
| `delete_expense` | Delete an expense |
| `get_expense_summary` | Aggregate stats (by category or month) |
| `list_categories` | List categories with totals |
| `create_category` | Create a custom category |
| `update_category` | Update category name / color / budget |
| `set_monthly_budget` | Set a budget for a category+month |
| `get_budget_status` | Budget vs actual spend with % used |

---

## REST API Endpoints

### Expenses
| Method | Path | Description |
|---|---|---|
| `GET` | `/expenses` | List with filters (`category_id`, `start_date`, `end_date`, `min_amount`, `max_amount`, `limit`, `offset`) |
| `GET` | `/expenses/summary` | Aggregate stats (`group_by=category\|month`) |
| `GET` | `/expenses/:id` | Single expense |
| `POST` | `/expenses` | Create expense |
| `PUT` | `/expenses/:id` | Update expense |
| `DELETE` | `/expenses/:id` | Delete expense |

### Categories
| Method | Path | Description |
|---|---|---|
| `GET` | `/categories` | List all with spend totals |
| `GET` | `/categories/:id` | Single category |
| `POST` | `/categories` | Create category |
| `PUT` | `/categories/:id` | Update category |
| `DELETE` | `/categories/:id` | Delete category |

### Budgets
| Method | Path | Description |
|---|---|---|
| `GET` | `/budgets?month=YYYY-MM` | Budget status for a month |
| `POST` | `/budgets` | Set/update a budget |
| `DELETE` | `/budgets/:category_id/:month` | Remove a budget |

---

## Setup

```bash
npm install
```

Requires Node.js 18+ (uses ES modules).

---

## Usage

### Option 1 — Interactive Chat

```bash
ANTHROPIC_API_KEY=sk-... node client/index.js
```

Start a conversation with Claude. Examples:

```
You: Add a $45 dinner at Nobu to Food & Dining for today
You: How much have I spent this month?
You: Set a $300 budget for Food & Dining for March 2026
You: Am I over budget anywhere this month?
You: Show me all expenses over $100
```

### Option 2 — Demo Mode (scripted walkthrough)

```bash
ANTHROPIC_API_KEY=sk-... DEMO_MODE=true node client/index.js
```

Automatically seeds sample expenses, sets budgets, and demonstrates summaries and budget status.

### Option 3 — Run components separately

```bash
# Terminal 1: REST API
node api/server.js

# Terminal 2: MCP server (connects to the API)
API_BASE=http://localhost:3001 node mcp/server.js

# Terminal 3: Client
ANTHROPIC_API_KEY=sk-... node client/index.js
```

---

## Project Structure

```
Expensory/
├── api/
│   ├── server.js          # Express app entry point
│   ├── database.js        # SQLite setup + schema migration
│   └── routes/
│       ├── expenses.js    # CRUD + summary for expenses
│       ├── categories.js  # CRUD for categories
│       └── budgets.js     # Budget management
├── mcp/
│   └── server.js          # MCP server with 11 expense tools
├── client/
│   └── index.js           # Claude client (Anthropic API + MCP)
├── package.json
└── expensory.db           # SQLite database (created on first run)
```

---

## Database Schema

```sql
categories (id, name, budget_limit, color, created_at)
expenses   (id, title, amount, category_id, date, description, receipt_url, created_at, updated_at)
budgets    (id, category_id, month, limit_amount, created_at)
```

Default categories: Food & Dining, Transportation, Shopping, Entertainment,
Health & Medical, Housing & Utilities, Travel, Education, Other.

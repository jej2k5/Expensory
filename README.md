# Expensory

An expense management application entirely driven through **MCP (Model Context Protocol)** — Claude calls MCP tools, which call a REST API, which persists data in PostgreSQL.

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
       │  SQL queries (pg pool)
       ▼
  PostgreSQL  (expenses · categories · budgets)
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

### Option A — Docker Compose (recommended)

Starts PostgreSQL and the REST API together:

```bash
docker compose up -d
```

Then run the client locally (it spawns the MCP server and connects to the Dockerized API):

```bash
npm install
ANTHROPIC_API_KEY=sk-... API_BASE=http://localhost:3001 node client/index.js
```

### Option B — Local development

Requires a running PostgreSQL instance (connection string via `DATABASE_URL`).

```bash
# 1. Create database
createdb expensory

# 2. Install dependencies
npm install

# 3. Run
ANTHROPIC_API_KEY=sk-... DATABASE_URL=postgres://user:pass@localhost:5432/expensory \
  node client/index.js
```

Copy `.env.example` to `.env` and fill in values, then simply run:

```bash
node client/index.js
```

---

## Usage

### Interactive Chat

```
You: Add a $45 dinner at Nobu to Food & Dining for today
You: How much have I spent this month?
You: Set a $300 budget for Food & Dining for March 2026
You: Am I over budget anywhere this month?
You: Show me all expenses over $100
```

### Demo Mode (scripted walkthrough)

```bash
ANTHROPIC_API_KEY=sk-... DEMO_MODE=true node client/index.js
# or: npm run demo
```

Automatically seeds sample expenses, sets budgets, and shows summaries + budget status.

### Run components separately

```bash
# Terminal 1: REST API (needs DATABASE_URL)
DATABASE_URL=postgres://... node api/server.js

# Terminal 2: MCP server (points at the API)
API_BASE=http://localhost:3001 node mcp/server.js

# Terminal 3: Client (connects to existing API, skips spawning one)
ANTHROPIC_API_KEY=sk-... API_BASE=http://localhost:3001 node client/index.js
```

### Environment variables

| Variable | Default | Description |
|---|---|---|
| `ANTHROPIC_API_KEY` | *(required)* | Anthropic API key for the client |
| `DATABASE_URL` | `postgres://expensory:expensory@localhost:5432/expensory` | PostgreSQL connection string |
| `API_PORT` | `3001` | REST API listen port |
| `API_BASE` | `http://localhost:{API_PORT}` | API URL used by MCP server and client. Set this to skip spawning a local API process. |
| `DEMO_MODE` | `false` | Run scripted demo instead of interactive chat |

---

## Project Structure

```
Expensory/
├── api/
│   ├── server.js           # Express app entry point (top-level await for DB init)
│   ├── database.js         # pg Pool + schema migration + category seeding
│   └── routes/
│       ├── expenses.js     # CRUD + filters + aggregate summary
│       ├── categories.js   # CRUD for categories
│       └── budgets.js      # Monthly budget upsert + status
├── mcp/
│   └── server.js           # MCP server — 11 expense-management tools (Zod-validated)
├── client/
│   └── index.js            # Anthropic API client with MCP tool loop
├── Dockerfile              # API image (node:20-alpine)
├── docker-compose.yml      # postgres + api services
├── .env.example            # Environment variable reference
└── package.json
```

---

## Database Schema

```sql
categories (id SERIAL, name TEXT UNIQUE, budget_limit NUMERIC, color TEXT, created_at TIMESTAMPTZ)
expenses   (id SERIAL, title TEXT, amount NUMERIC, category_id INT REFERENCES categories,
            date DATE, description TEXT, receipt_url TEXT, created_at TIMESTAMPTZ, updated_at TIMESTAMPTZ)
budgets    (id SERIAL, category_id INT, month CHAR(7), limit_amount NUMERIC,
            created_at TIMESTAMPTZ, UNIQUE(category_id, month))
```

Default categories seeded on first start: Food & Dining, Transportation, Shopping,
Entertainment, Health & Medical, Housing & Utilities, Travel, Education, Other.

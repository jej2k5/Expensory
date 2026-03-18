# Expensory

Expensory is an AI-powered expense manager where every data operation is performed by Claude through MCP (Model Context Protocol) tools. You talk to Claude in plain English; Claude calls the right tools; the tools hit a REST API; the API persists everything in PostgreSQL.

```
You ──► Claude (claude-opus-4-6)
              │
              │  MCP tool calls (stdio)
              ▼
         MCP Server  ── 11 expense tools
              │
              │  HTTP  (REST API)
              ▼
         Express API
              │
              │  SQL  (pg pool)
              ▼
         PostgreSQL
```

---

## Prerequisites

| Requirement | Version |
|---|---|
| Node.js | 20 or later |
| Docker & Docker Compose | any recent version (for the recommended setup) |
| Anthropic API key | [console.anthropic.com](https://console.anthropic.com) |

---

## Quick Start — Docker Compose

This is the recommended way to run Expensory. Docker Compose handles PostgreSQL and the REST API; you run the client locally.

**1. Clone and enter the repo**

```bash
git clone <repo-url>
cd Expensory
```

**2. Install client-side dependencies**

```bash
npm install
```

**3. Start PostgreSQL and the API**

```bash
docker compose up -d
```

This starts two containers:
- `postgres` — PostgreSQL 16, data persisted in a named Docker volume
- `api` — the Express REST API on port `3001`

The API automatically creates the database schema and seeds the 9 default categories on first boot.

**4. Set your Anthropic API key**

```bash
export ANTHROPIC_API_KEY=sk-ant-...
```

**5. Start the client**

```bash
API_BASE=http://localhost:3001 node client/index.js
```

Setting `API_BASE` tells the client to use the already-running Docker API instead of spawning one locally.

You should see:

```
[Expensory] Using external API at http://localhost:3001
[Expensory] Connecting to MCP server...
[Expensory] Loaded 11 MCP tools: add_expense, list_expenses, ...

══════════════════════════════════════════════════════════
  EXPENSORY — MCP-Driven Expense Manager
══════════════════════════════════════════════════════════
  Type your expense queries. Type "exit" to quit.

You:
```

**6. Stop the containers when done**

```bash
docker compose down
```

Data is preserved in the `postgres_data` Docker volume. To also delete the data:

```bash
docker compose down -v
```

---

## Local Development (no Docker)

Use this if you already have PostgreSQL running locally or prefer not to use Docker.

**1. Create the database**

```bash
createdb expensory
# or with explicit credentials:
psql -c "CREATE USER expensory WITH PASSWORD 'expensory';"
psql -c "CREATE DATABASE expensory OWNER expensory;"
```

**2. Configure environment**

```bash
cp .env.example .env
```

Edit `.env` and set your values:

```
ANTHROPIC_API_KEY=sk-ant-...
DATABASE_URL=postgres://expensory:expensory@localhost:5432/expensory
API_PORT=3001
```

**3. Install dependencies**

```bash
npm install
```

**4. Run the client**

```bash
node client/index.js
```

Without `API_BASE` set, the client automatically spawns the REST API server as a subprocess (using `DATABASE_URL` from your environment), then connects the MCP server to it.

---

## Usage

### Talking to Expensory

Once the client is running, type expense-related requests in plain English:

**Adding expenses**
```
You: Add a $45 dinner at Nobu to Food & Dining
You: Record a $1,200 flight to Tokyo under Travel for March 15
You: Log $34.50 for an Uber to the airport today
```

**Querying expenses**
```
You: What did I spend last month?
You: Show me all expenses over $100 this year
You: How much have I spent on food so far this month?
You: List my last 5 expenses
```

**Budgets**
```
You: Set a $500 monthly budget for Food & Dining
You: Am I over budget anywhere this month?
You: How much of my Entertainment budget have I used?
```

**Summaries and reports**
```
You: Give me a breakdown of my spending by category this month
You: What was my biggest expense last week?
You: Show my month-by-month spending for Q1
```

**Categories**
```
You: What categories are available?
You: Create a new category called "Freelance Tools" in blue
```

### Demo Mode

Run a scripted walkthrough that seeds sample data and demonstrates all major features:

```bash
DEMO_MODE=true node client/index.js
# or
npm run demo
```

The demo:
1. Creates five sample expenses across different categories
2. Sets monthly budgets for two categories
3. Prints a full category breakdown with totals
4. Shows budget status with % used and over-budget alerts
5. Identifies the most expensive purchase

---

## Environment Variables

| Variable | Default | Description |
|---|---|---|
| `ANTHROPIC_API_KEY` | *(required)* | Your Anthropic API key |
| `DATABASE_URL` | `postgres://expensory:expensory@localhost:5432/expensory` | PostgreSQL connection string |
| `API_PORT` | `3001` | Port the REST API listens on |
| `API_BASE` | `http://localhost:{API_PORT}` | Base URL of a running API. When set, the client skips spawning a local API process — use this when running via Docker Compose. |
| `DEMO_MODE` | `false` | Set to `true` to run the scripted demo instead of the interactive chat |

---

## Architecture

### Components

**`api/`** — Express REST API
Connects to PostgreSQL via a `pg.Pool`. Handles all database reads and writes. Exposes three resource groups:

- `/expenses` — CRUD, with filters for category, date range, and amount; aggregate summaries grouped by category or month
- `/categories` — CRUD; each category has a name, hex color, and optional default budget limit
- `/budgets` — monthly per-category budget upsert; status endpoint computes % used and over-budget flag

The API initialises the schema and seeds default categories automatically on startup using `CREATE TABLE IF NOT EXISTS` — safe to restart at any time.

**`mcp/server.js`** — MCP Server
Runs as a subprocess over stdio. Registers 11 tools with Zod-validated input schemas. Each tool makes one or more HTTP calls to the REST API and returns the result as JSON text. Claude never touches the database directly — all data access goes through this layer.

**`client/index.js`** — Anthropic API client
Spawns the MCP server, fetches its tool list, converts the schemas to Anthropic tool definitions, and runs a standard agentic loop: send messages → detect tool-use blocks → call MCP tools in parallel → feed results back → repeat until `end_turn`.

### MCP Tools

| Tool | What it does |
|---|---|
| `add_expense` | Create a new expense record |
| `list_expenses` | List expenses with optional filters (category, date range, amount range, pagination) |
| `get_expense` | Fetch a single expense by ID |
| `update_expense` | Partially update any field of an expense |
| `delete_expense` | Delete an expense by ID |
| `get_expense_summary` | Totals, averages, min/max — grouped by category or month |
| `list_categories` | All categories with cumulative spend and expense count |
| `create_category` | Add a custom category with a name and hex color |
| `update_category` | Rename a category, change its color, or set a default budget |
| `set_monthly_budget` | Set (or overwrite) a spending limit for a category+month |
| `get_budget_status` | Actual vs budgeted spend for every category in a given month |

### Database Schema

```sql
categories (
  id           SERIAL PRIMARY KEY,
  name         TEXT NOT NULL UNIQUE,
  budget_limit NUMERIC,                    -- optional default monthly limit
  color        TEXT NOT NULL DEFAULT '#6366f1',
  created_at   TIMESTAMPTZ NOT NULL DEFAULT NOW()
)

expenses (
  id           SERIAL PRIMARY KEY,
  title        TEXT NOT NULL,
  amount       NUMERIC NOT NULL CHECK (amount > 0),
  category_id  INTEGER REFERENCES categories(id) ON DELETE SET NULL,
  date         DATE NOT NULL DEFAULT CURRENT_DATE,
  description  TEXT NOT NULL DEFAULT '',
  receipt_url  TEXT,
  created_at   TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at   TIMESTAMPTZ NOT NULL DEFAULT NOW()
)

budgets (
  id           SERIAL PRIMARY KEY,
  category_id  INTEGER NOT NULL REFERENCES categories(id) ON DELETE CASCADE,
  month        CHAR(7) NOT NULL,           -- YYYY-MM
  limit_amount NUMERIC NOT NULL CHECK (limit_amount > 0),
  created_at   TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE (category_id, month)
)
```

**Default categories** (seeded on first boot): Food & Dining, Transportation, Shopping, Entertainment, Health & Medical, Housing & Utilities, Travel, Education, Other.

### Project Structure

```
Expensory/
├── api/
│   ├── server.js           # Express entry point; awaits schema init before listening
│   ├── database.js         # pg.Pool setup, schema migration, category seeding
│   └── routes/
│       ├── expenses.js     # GET/POST/PUT/DELETE + /summary
│       ├── categories.js   # GET/POST/PUT/DELETE
│       └── budgets.js      # GET/POST/DELETE with upsert logic
├── mcp/
│   └── server.js           # MCP server; 11 Zod-validated tools
├── client/
│   └── index.js            # Agentic loop: Anthropic API + MCP tool execution
├── Dockerfile              # node:20-alpine image for the API
├── docker-compose.yml      # postgres:16-alpine + api services
├── .env.example            # Reference for all environment variables
└── package.json
```

---

## REST API Reference

All endpoints return JSON. Errors follow `{ "error": "message" }`.

### Expenses

| Method | Path | Query params / Body |
|---|---|---|
| `GET` | `/expenses` | `category_id`, `start_date`, `end_date`, `min_amount`, `max_amount`, `limit` (default 100), `offset` |
| `GET` | `/expenses/summary` | `group_by=category\|month`, `start_date`, `end_date` |
| `GET` | `/expenses/:id` | — |
| `POST` | `/expenses` | `title`*, `amount`*, `category_id`, `date` (YYYY-MM-DD), `description`, `receipt_url` |
| `PUT` | `/expenses/:id` | Any subset of POST fields |
| `DELETE` | `/expenses/:id` | — |

### Categories

| Method | Path | Body |
|---|---|---|
| `GET` | `/categories` | — |
| `GET` | `/categories/:id` | — |
| `POST` | `/categories` | `name`*, `color` (#rrggbb), `budget_limit` |
| `PUT` | `/categories/:id` | Any subset of POST fields |
| `DELETE` | `/categories/:id` | — |

### Budgets

| Method | Path | Query / Body |
|---|---|---|
| `GET` | `/budgets` | `month=YYYY-MM` (defaults to current month) |
| `POST` | `/budgets` | `category_id`*, `month`* (YYYY-MM), `limit_amount`* |
| `DELETE` | `/budgets/:category_id/:month` | — |

\* required field

---

## Running Components Individually

Useful when developing or debugging a specific layer:

```bash
# Terminal 1 — PostgreSQL (via Docker only)
docker compose up postgres

# Terminal 2 — REST API
DATABASE_URL=postgres://expensory:expensory@localhost:5432/expensory node api/server.js

# Terminal 3 — MCP server (stdio; connects to the API)
API_BASE=http://localhost:3001 node mcp/server.js

# Terminal 4 — Client (skips spawning API since API_BASE is set)
ANTHROPIC_API_KEY=sk-... API_BASE=http://localhost:3001 node client/index.js
```

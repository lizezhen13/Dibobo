# Dibobo

> A self-hosted investment analysis and strategy data workbench for individual investors in the China A-share market

[中文 README](./README.md)

Dibobo is a full-stack personal investment management tool focused on the China A-share market (stocks and ETFs). It combines market overview, dividend stock screening, holdings bookkeeping, watchlist, financial event calendar, and investment journals in one place. The whole system is deployed privately with a single Docker Compose command, keeping all data on your own server. It is designed for small-scale usage (1–2 users per deployment).

## Features

| Module | Description |
|---|---|
| Overview Dashboard | Quotes of core broad-based indices, hot stocks, industry indices, market breadth and market temperature; global market snapshots (indices / FX / commodities / treasury yields) with per-group manual refresh |
| Dividend Radar | Screens A-share high-dividend stocks by market cap, dividend yield, PB, PE, ROE, etc.; automatically generates a daily snapshot at 15:30 (Beijing time) on trading days and also supports on-demand search; one-click add to watchlist |
| Watchlist | Watchlist management with keyword / asset-type filters, notes, drag ordering, batch deletion, and a per-stock detail page |
| Portfolios | Multiple portfolios (with a default one), holding CRUD, cost / quantity / open-date bookkeeping, close-out records, custom ordering, and valuation summaries |
| Event Calendar | Financial event calendar with multi-source merge & deduplication, filtering by category / market / importance, and manual refresh |
| Journals | Plain-text investment journals organized by date, with full CRUD |
| Settings | Account password change; data source management (CRUD, connection testing, per-module activation, Longbridge OAuth authorization for Fuyao / Longbridge) |

> The News and Review modules are currently placeholder pages.

## Tech Stack

**Frontend** (`frontend/`)

- React 19 + TypeScript + Vite 7
- Tailwind CSS v4 + shadcn/ui (Radix UI primitives) + lucide-react icons
- TanStack React Query v5 (server state & adaptive polling) + TanStack Table
- React Router v7, react-hook-form + Zod v4 (form validation and API response contract validation)
- Vitest + Testing Library for unit tests, pnpm as package manager

**Backend** (`backend/`)

- Python 3.13 + FastAPI + SQLAlchemy 2.0 (async via asyncpg)
- PostgreSQL 18 (persistence) + Valkey/Redis (quote snapshot cache)
- Alembic migrations (17 revisions), argon2 password hashing, encrypted storage of data-source API keys
- uv for dependency management; pytest + pytest-asyncio + ruff toolchain

**Data Sources** (adapter architecture, activated per module)

| Provider | Used for | Auth |
|---|---|---|
| Fuyao (Tonghuashun-family API) | Quotes, instrument search, industry indices, market breadth, hot lists, PB valuation | API Key |
| Longbridge OpenAPI | Financial calendar, dividend radar screening | API Key or OAuth authorization code |
| AKShare (built-in, no configuration needed) | Global markets (indices / FX / commodities / treasury yields) | None |

## Project Structure

```
Dibobo/
├── backend/                # FastAPI backend
│   ├── app/
│   │   ├── main.py         # App entry (routers, background schedulers)
│   │   ├── core/           # Config, database, ORM models, security
│   │   ├── auth/           # Login / logout / session / password
│   │   ├── overview/       # Market overview
│   │   ├── global_market/  # Global markets (AKShare)
│   │   ├── radar/          # Dividend radar
│   │   ├── watchlist/      # Watchlist
│   │   ├── portfolios/     # Portfolios
│   │   ├── holdings/       # Holdings
│   │   ├── calendar/       # Financial calendar
│   │   ├── journals/       # Investment journals
│   │   ├── settings/       # Data source management
│   │   └── data_sources/   # Data source adapters (Fuyao / Longbridge)
│   ├── alembic/            # Database migrations
│   └── tests/              # pytest suite (with global-market sample payloads)
├── frontend/               # React frontend
│   └── src/
│       ├── features/       # 11 domain-oriented feature modules
│       ├── components/     # Shared components (app-shell, data-table, ui/, ...)
│       └── lib/            # API client, query keys, polling lifecycle, ...
├── docs/                   # PRDs, design docs and prototypes
├── docker-compose.yml      # One-command deployment (web / api / postgres / valkey)
└── backups/
```

## Getting Started

### Option 1: Docker Compose (recommended)

Prerequisites: Docker and Docker Compose.

1. Create a `.env` file in the repository root:

```bash
# Required
POSTGRES_PASSWORD=your-strong-db-password
DIBOBO_DATABASE_URL=postgresql+asyncpg://dibobo:your-strong-db-password@postgres:5432/dibobo
DIBOBO_SESSION_SECRET=random-string-of-at-least-32-chars
DIBOBO_API_KEY_ENCRYPTION_KEY=random-key-for-encrypting-data-source-api-keys

# Initial user (created on first boot; skipped if unset)
DIBOBO_INITIAL_USERNAME=admin
DIBOBO_INITIAL_PASSWORD=your-login-password

# Optional
DIBOBO_WEB_PORT=8080
DIBOBO_TIMEZONE=Asia/Shanghai
DIBOBO_GLOBAL_MARKET_ENABLED=false   # enable global market quotes
```

2. Build and start:

```bash
docker compose up -d --build
```

The API container automatically runs `alembic upgrade head` on startup to apply database migrations.

3. Open `http://localhost:8080` and log in with the initial account.

### Option 2: Local Development

**Backend** (requires PostgreSQL and Valkey/Redis, locally or in containers):

```bash
cd backend
uv sync --dev
# Override DIBOBO_DATABASE_URL / DIBOBO_VALKEY_URL via environment variables as needed
uv run alembic upgrade head
uv run uvicorn app.main:app --reload --port 8000
```

API docs: `http://127.0.0.1:8000/api/docs`

**Frontend**:

```bash
cd frontend
pnpm install
pnpm dev        # http://127.0.0.1:5173, /api is proxied to 127.0.0.1:8000
```

Set the `DIBOBO_API_ORIGIN` environment variable to change the proxy target.

## Common Commands

**Backend**

```bash
cd backend
uv run pytest          # Run tests (SQLite-based, no external services needed)
uv run ruff check .    # Lint
uv run ruff format .   # Format
```

**Frontend**

```bash
cd frontend
pnpm test              # Unit tests
pnpm lint              # ESLint
pnpm typecheck         # TypeScript check
pnpm check             # Full gate: typecheck + lint + test + format:check + build
```

## Configuration

All backend configuration is injected via environment variables prefixed with `DIBOBO_`. Common options:

| Variable | Default | Description |
|---|---|---|
| `DIBOBO_DATABASE_URL` | `postgresql+asyncpg://dibobo:dibobo@localhost:5432/dibobo` | Database connection string |
| `DIBOBO_VALKEY_URL` | `redis://localhost:6379/0` | Cache connection string |
| `DIBOBO_SESSION_SECRET` | — (required) | Session signing secret, ≥ 32 chars |
| `DIBOBO_API_KEY_ENCRYPTION_KEY` | — (required) | Encryption key for data-source API keys |
| `DIBOBO_QUOTE_REFRESH_SECONDS` | `5` | Quote refresh interval (seconds) |
| `DIBOBO_GLOBAL_MARKET_ENABLED` | `false` | Enable background refresh of global markets |
| `DIBOBO_LOGIN_FAILURE_LIMIT` / `DIBOBO_LOGIN_LOCK_SECONDS` | `5` / `300` | Login failure lockout policy |
| `DIBOBO_INITIAL_USERNAME` / `DIBOBO_INITIAL_PASSWORD` | — | Initial user |

> In production (`DIBOBO_APP_ENV=production`), both secrets are strictly validated against default values.

## Security Notes

- Authentication uses cookie sessions with CSRF double-submit validation; passwords are hashed with argon2
- Data-source API keys are encrypted at rest; only the last 4 characters are kept for display
- All data is isolated per user; the frontend clears user-scoped caches and redirects to login on 401
- No public registration — users are pre-created by the deployer via environment variables

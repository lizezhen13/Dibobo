# Dibobo

> 面向个人投资者的 A 股投资分析策略数据工作台（私有化部署）

[English README](./README.en.md)

Dibobo 是一个全栈的个人投资管理工具，聚焦中国 A 股市场（股票及 ETF），提供行情总览、红利选股、持仓台账、自选股、财经日历与投资日记等一体化功能。系统采用 Docker Compose 一键私有化部署，数据完全存储在自有服务器上，适合 1～2 人的小规模使用场景。

## 功能特性

| 模块 | 说明 |
|---|---|
| 总览面板 | 核心宽基指数行情、热门股票、行业指数、市场宽度与市场温度，支持全球市场（指数/外汇/商品/国债收益率）快照与分组手动刷新 |
| 红利雷达 | 按总市值、股息率、市净率（PB）、市盈率（PE）、ROE 等条件筛选 A 股高股息标的；每个交易日 15:30（北京时间）自动生成快照，也支持按需实时搜索；可一键加入自选股 |
| 自选股 | 自选股列表管理、关键词/资产类型过滤、备注、拖拽排序、批量删除与个股详情页 |
| 投资组合 | 多组合管理（含默认组合）、组合内持仓 CRUD、成本/数量/开仓日期登记、平仓记录、组合与持仓排序、估值汇总 |
| 事件日历 | 财经事件日历，多来源合并去重，支持类别/市场/重要性筛选与手动刷新 |
| 投资日记 | 按日期记录的纯文本投资日记，支持增删改查 |
| 系统设置 | 账号改密；数据源管理（Fuyao / Longbridge 的增删改、连接测试、按模块激活、Longbridge OAuth 授权） |

> 财经资讯、复盘分析两个模块目前为占位页，规划中。

## 技术栈

**前端**（`frontend/`）

- React 19 + TypeScript + Vite 7
- Tailwind CSS v4 + shadcn/ui（Radix UI 原语）+ lucide-react 图标
- TanStack React Query v5（服务端状态与自适应轮询）+ TanStack Table
- React Router v7、react-hook-form + Zod v4（表单与 API 响应契约双端校验）
- Vitest + Testing Library 单元测试，pnpm 包管理

**后端**（`backend/`）

- Python 3.13 + FastAPI + SQLAlchemy 2.0（asyncpg 异步驱动）
- PostgreSQL 18（持久化）+ Valkey/Redis（行情快照缓存）
- Alembic 数据库迁移（17 个版本）、argon2 密码哈希、数据源 API Key 加密存储
- uv 依赖管理，pytest + pytest-asyncio + ruff 工具链

**数据源**（适配器架构，按模块独立激活）

| 数据源 | 用途 | 认证方式 |
|---|---|---|
| Fuyao（扶摇，同花顺系接口） | 行情、标的搜索、行业指数、市场宽度、热门榜、PB 估值 | API Key |
| Longbridge（长桥 OpenAPI） | 财经日历、红利雷达选股 | API Key 或 OAuth 授权码 |
| AKShare（系统内置，无需配置） | 全球市场行情（指数/外汇/商品/国债收益率） | 无 |

## 项目结构

```
Dibobo/
├── backend/                # FastAPI 后端
│   ├── app/
│   │   ├── main.py         # 应用入口（路由注册、后台调度任务）
│   │   ├── core/           # 配置、数据库、ORM 模型、安全
│   │   ├── auth/           # 登录/登出/会话/改密
│   │   ├── overview/       # 市场总览
│   │   ├── global_market/  # 全球市场（AKShare）
│   │   ├── radar/          # 红利雷达
│   │   ├── watchlist/      # 自选股
│   │   ├── portfolios/     # 投资组合
│   │   ├── holdings/       # 持仓
│   │   ├── calendar/       # 财经日历
│   │   ├── journals/       # 投资日记
│   │   ├── settings/       # 数据源管理
│   │   └── data_sources/   # 数据源适配层（Fuyao / Longbridge）
│   ├── alembic/            # 数据库迁移
│   └── tests/              # pytest 测试（含全球市场样例报文）
├── frontend/               # React 前端
│   └── src/
│       ├── features/       # 11 个按域划分的功能模块
│       ├── components/     # 共享组件（app-shell、data-table、ui/ 等）
│       └── lib/            # API 客户端、Query keys、轮询生命周期等
├── docs/                   # PRD、设计稿与原型
├── docker-compose.yml      # 一键部署（web / api / postgres / valkey）
└── backups/
```

## 快速开始

### 方式一：Docker Compose（推荐）

前置条件：Docker 与 Docker Compose。

1. 在仓库根目录创建 `.env` 文件：

```bash
# 必填
POSTGRES_PASSWORD=your-strong-db-password
DIBOBO_DATABASE_URL=postgresql+asyncpg://dibobo:your-strong-db-password@postgres:5432/dibobo
DIBOBO_SESSION_SECRET=至少32字符的随机字符串
DIBOBO_API_KEY_ENCRYPTION_KEY=用于加密数据源API Key的随机密钥

# 初始用户（首次启动时自动创建，不设置则不创建）
DIBOBO_INITIAL_USERNAME=admin
DIBOBO_INITIAL_PASSWORD=your-login-password

# 可选
DIBOBO_WEB_PORT=8080
DIBOBO_TIMEZONE=Asia/Shanghai
DIBOBO_GLOBAL_MARKET_ENABLED=false   # 是否开启全球市场行情
```

2. 构建并启动：

```bash
docker compose up -d --build
```

API 容器启动时会自动执行 `alembic upgrade head` 完成数据库迁移。

3. 访问 `http://localhost:8080`，使用初始账号登录。

### 方式二：本地开发

**后端**（需要本地或容器中的 PostgreSQL 与 Valkey/Redis）：

```bash
cd backend
uv sync --dev
# 按需通过环境变量覆盖 DIBOBO_DATABASE_URL / DIBOBO_VALKEY_URL
uv run alembic upgrade head
uv run uvicorn app.main:app --reload --port 8000
```

API 文档：`http://127.0.0.1:8000/api/docs`

**前端**：

```bash
cd frontend
pnpm install
pnpm dev        # http://127.0.0.1:5173，/api 自动代理到 127.0.0.1:8000
```

如需修改代理目标，设置环境变量 `DIBOBO_API_ORIGIN`。

## 常用命令

**后端**

```bash
cd backend
uv run pytest          # 运行测试（使用 SQLite，无需外部依赖）
uv run ruff check .    # 代码检查
uv run ruff format .   # 代码格式化
```

**前端**

```bash
cd frontend
pnpm test              # 单元测试
pnpm lint              # ESLint
pnpm typecheck         # TypeScript 检查
pnpm check             # typecheck + lint + test + format:check + build 全量校验
```

## 配置说明

后端所有配置通过 `DIBOBO_` 前缀的环境变量注入，常用项：

| 变量 | 默认值 | 说明 |
|---|---|---|
| `DIBOBO_DATABASE_URL` | `postgresql+asyncpg://dibobo:dibobo@localhost:5432/dibobo` | 数据库连接串 |
| `DIBOBO_VALKEY_URL` | `redis://localhost:6379/0` | 缓存连接串 |
| `DIBOBO_SESSION_SECRET` | —（必填） | 会话签名密钥，≥32 字符 |
| `DIBOBO_API_KEY_ENCRYPTION_KEY` | —（必填） | 数据源 API Key 加密密钥 |
| `DIBOBO_QUOTE_REFRESH_SECONDS` | `5` | 行情刷新频率（秒） |
| `DIBOBO_GLOBAL_MARKET_ENABLED` | `false` | 是否启用全球市场后台刷新 |
| `DIBOBO_LOGIN_FAILURE_LIMIT` / `DIBOBO_LOGIN_LOCK_SECONDS` | `5` / `300` | 登录失败锁定策略 |
| `DIBOBO_INITIAL_USERNAME` / `DIBOBO_INITIAL_PASSWORD` | — | 初始用户 |

> 生产环境（`DIBOBO_APP_ENV=production`）会强制校验两个密钥非默认值。

## 安全说明

- 认证采用 Cookie 会话 + CSRF 双提交校验，密码使用 argon2 哈希存储
- 数据源 API Key 经加密后入库，仅保存末 4 位用于展示
- 全部接口按用户隔离数据；前端在 401 时自动清理用户缓存并跳转登录
- 不提供公开注册，用户由部署方通过环境变量预创建
# Dibobo

Dibobo 是面向个人投资者的 A 股低波红利策略数据工作台。当前仓库已完成 V1 的工程基座、认证、总览、系统设置、持仓管理与投资日记纵向切片。

产品需求基线见 [Dibobo V1 PRD](docs/requirements/Dibobo-V1-PRD.md)。

## 当前实现范围

- React 19、TypeScript、Vite、Tailwind CSS、shadcn/ui 源码组件、React Router、TanStack Query；
- FastAPI、SQLAlchemy 2、Alembic、PostgreSQL 18、Valkey 8；
- Argon2id 密码哈希、可撤销服务端会话、HttpOnly Cookie、CSRF 双提交校验；
- 扶摇数据源适配器的指数行情、交易日历、A 股/ETF 标的检索和持仓行情能力；
- 系统级 AKShare 全球市场快照能力：21 个固定槽位，覆盖全球指数、汇率、伦敦金银现货、商品主连/连续合约和国债日频收益率；
- 四指数固定顺序、交易状态、5 秒交易时段轮询、后台标签页暂停、最后成功缓存降级；
- 当前持仓与已清仓档案、持仓汇总、行情估值、缺失行情降级、数量归零清仓，以及用户级数据隔离；
- 基于 TanStack Table 的项目级数据表格封装与横向滚动持仓账簿；
- 纯文本投资日记的新增、查看、编辑、永久删除、日期范围筛选、服务端分页，以及用户级数据隔离；
- 用户可修改密码并立即撤销全部会话；
- 数据源新增、编辑、永久删除、连接测试与单一启用，API Key 使用 Fernet 加密且查询只返回掩码；
- `web`、`api`、`postgres`、`valkey` 四服务 Compose 基座。

全球市场功能由 `DIBOBO_AKSHARE_ENABLED` 与 `DIBOBO_GLOBAL_MARKET_ENABLED` 两个独立开关共同控制，默认关闭发布。开启后由 API 进程中的锁保护刷新任务直接请求 AKShare 并写入 Valkey：指数/汇率默认每 10 秒刷新，商品每 8 秒刷新，收益率每天刷新一次，启动时各组错峰 5 秒；`GET /api/overview/global-market` 每 8 秒读取已发布快照，不在请求链路调用 AKShare。卡片上的手动同步按钮仍会立即触发对应分组的上游请求。首次联调可执行一次性刷新：

```bash
docker compose exec api python -m app.cli refresh-global-market
```

全球市场当前仅用于私有研究部署；伦敦金银通过 AKShare 的新浪外盘现货适配，其他海外连续合约通过东方财富全球期货适配。若上游映射无法通过身份校验，项目保留固定槽位并显示缺失原因，不以相近品种或虚构值替换。

## Docker Compose 启动

1. 复制 `.env.example` 为 `.env`。
2. 设置 PostgreSQL 密码、会话密钥和独立的 Fernet 加密密钥。
3. 可选填写首次初始化账号；首次启动成功后应从 `.env` 删除明文初始密码。
4. 启动：

   ```bash
   docker compose up -d --build
   ```

5. 打开 `http://localhost:8080`。

数据库迁移会在 API 对外服务前自动执行。`docker compose down` 不会删除数据卷。

## 创建用户

避免把密码放在命令行参数中。容器运行后，通过标准输入创建账号：

```bash
docker compose exec -T api python -m app.cli create-user --username dibobo < password.txt
```

命令会校验用户名是否重复，以及密码是否至少 8 位并同时包含字母和数字。执行后请安全删除临时密码文件。

## 本地开发

后端：

```bash
cd backend
uv sync --dev
uv run alembic upgrade head
uv run uvicorn app.main:app --reload
```

前端：

```bash
cd frontend
pnpm install --frozen-lockfile
pnpm dev
```

Vite 会把 `/api` 代理到 `http://127.0.0.1:8000`。

## 验证

```bash
cd backend
uv run ruff check .
uv run pytest

cd ../frontend
pnpm typecheck
pnpm build
```

## 备份与恢复

逻辑备份：

```bash
docker compose exec -T postgres pg_dump -U dibobo -d dibobo -Fc > backups/dibobo.dump
```

恢复前先停止会写数据库的应用服务，并确保目标环境使用原部署的 `DIBOBO_API_KEY_ENCRYPTION_KEY`，否则已加密的数据源 API Key 无法解密：

```bash
docker compose stop web api
docker compose exec -T postgres pg_restore -U dibobo -d dibobo --clean --if-exists < backups/dibobo.dump
docker compose start api web
```

升级前应先备份数据库和 `.env` 中的加密密钥。应用启动失败时不要回滚数据库卷；应恢复对应版本的应用镜像和升级前备份。

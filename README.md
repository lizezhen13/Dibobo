# Dibobo

Dibobo 是面向个人投资者的 A 股低波红利策略数据工作台。当前仓库已完成 V1 的工程基座、认证、总览、系统设置、持仓管理与投资日记纵向切片。

产品需求基线见 [Dibobo V1 PRD](docs/requirements/Dibobo-V1-PRD.md)。

## 当前实现范围

- React 19、TypeScript、Vite、Tailwind CSS、shadcn/ui 源码组件、React Router、TanStack Query；
- FastAPI、SQLAlchemy 2、Alembic、PostgreSQL 18、Valkey 8；
- Argon2id 密码哈希、可撤销服务端会话、HttpOnly Cookie、CSRF 双提交校验；
- 扶摇数据源适配器的指数行情、交易日历、A 股/ETF 标的检索和持仓行情能力；
- 四指数固定顺序、交易状态、5 秒交易时段轮询、后台标签页暂停、最后成功缓存降级；
- 当前持仓与已清仓档案、持仓汇总、行情估值、缺失行情降级、数量归零清仓，以及用户级数据隔离；
- 基于 TanStack Table 的项目级数据表格封装与横向滚动持仓账簿；
- 纯文本投资日记的新增、查看、编辑、永久删除、日期范围筛选、服务端分页，以及用户级数据隔离；
- 用户可修改密码并立即撤销全部会话；
- 数据源新增、编辑、永久删除、连接测试与单一启用，API Key 使用 Fernet 加密且查询只返回掩码；
- `web`、`api`、`postgres`、`valkey` 四服务 Compose 基座。

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

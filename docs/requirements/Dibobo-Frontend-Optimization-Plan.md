# Dibobo 前端工程优化方案

> 文档类型：前端工程治理方案、实施计划与验收标准  
> 适用范围：`frontend/`  
> 版本：4.0  
> 修订日期：2026-08-16  
> 优先级：样式收敛与组件化为本轮最高优先级  
> 基本原则：保持现有业务语义和后端接口兼容，采用小批次、可验证、可回滚的渐进式改造

## 1. 执行结论

当前前端工程已经具备 `PageContainer`、`PageHeader`、`FormField`、`LoadingButton`、`EmptyState`、`ErrorState`、`Pagination`、`DataTable` 等公共能力，因此“完全没有组件化”的问题已经有所改善。

但问题还没有真正解决：

1. 公共组件“已经存在”不等于“已经统一使用”。例如 `PageHeader` 目前只进入日志和自选股两个业务页面，其他页面仍各自组织标题、描述、操作区和间距。
2. 样式重复仍然明显。当前 `frontend/src` 内有 188 处任意字号写法，形成 40 种不同字号；同一类卡片外观字符串重复 7 次；Feature 代码中仍有 12 处 `!text-[12px]`。
3. 表格存在两套实现思路。公共 `DataTable` 已存在，但 443 行的 `watchlist-table.tsx` 仍手工实现表格外壳、排序、吸顶、加载、空态、选择和分页相关行为。
4. 多个“大组件”仍同时负责数据展示、筛选、排序、列定义、操作菜单和响应式布局。最典型的是 513 行的 `portfolio-holdings-workspace.tsx`，其外部参数约 25 个。
5. 当前重复的核心不是“少建了几个 JSX 文件”，而是缺少稳定的视觉语义、组件职责边界、迁移覆盖标准和自动化防回退约束。

因此，本方案不以“继续创建一批公共组件”为目标，而以以下三个结果为目标：

- 建立唯一、可执行的视觉语义层，优先消除重复字号、卡片外壳、页面头部和表格样式。
- 统一页面、异步状态、表单、弹窗、数据展示和表格的组件边界，并完成现有页面迁移。
- 用静态检查、组件测试、视觉回归和业务 E2E 防止重复样式及重复组件重新出现。

## 2. 改造边界

### 2.1 本轮必须保持不变的业务能力

除本文明确列出的缺陷修复外，优化期间必须保持以下行为不变：

- 登录、退出、会话恢复和鉴权路由。
- 投资组合的新增、修改、删除、默认组合、排序和持仓管理。
- 自选股的新增、删除、批量操作、备注、排序和详情跳转。
- 投资日志的新增、编辑、删除、筛选和分页。
- 财经日历的月份切换、筛选、事件查看和外部页面访问。
- 数据源配置、测试、启停和 OAuth 回跳。
- `/holdings` 兼容重定向。
- 现有后端 API 路径、请求字段、响应字段和缓存语义。

### 2.2 允许发生的变化

- 视觉间距、字号、圆角、阴影和控件密度会被统一，但不应改变信息层级和业务含义。
- 移动端可以从“强制横向滚动表格”调整为卡片或列表视图。
- 为修复现有缺陷，OAuth 回跳页签、鉴权错误展示和数据源状态文案会发生有意变化。
- 可以调整前端内部文件结构、组件 API、Query 封装和类型来源。

### 2.3 本轮不做

- 不进行一次性重写。
- 不为了减少文件行数机械拆文件。
- 不创建承载所有页面场景的“万能组件”。
- 不在同一个提交中同时修改接口协议、业务状态和大面积视觉样式。
- `news`、`review`、`radar` 当前仍为占位页面；其业务建设另立需求，不纳入本轮样式与组件化完成率。

## 3. 当前工程基线

以下数据基于 2026-08-16 的当前工作树，而不是原方案中的历史状态。

### 3.1 样式与公共模式

| 指标                                                               |   当前值 | 结论                                  |
| ------------------------------------------------------------------ | -------: | ------------------------------------- |
| `text-[...]` 任意字号使用次数                                      |      188 | 严重分散                              |
| 不同任意字号规格                                                   |       40 | 缺少统一排版比例                      |
| Feature 中 `!text-[12px]`                                          |       12 | 基础组件尺寸契约不完整                |
| 重复卡片链 `rounded-xl border border-border bg-card shadow-raised` |        7 | Surface/Card 语义未统一               |
| `DataTable` 中 important 工具类                                    |        4 | 可暂留在底层组件，禁止向 Feature 扩散 |
| `PageHeader` 业务页面覆盖                                          | 2 个页面 | 公共模式迁移不完整                    |
| 本地通用空态、错误态、分页包装器                                   |        0 | 该类重复已基本消除                    |
| `components/patterns` 文件                                         |        8 | 已有基础，但覆盖不足                  |

### 3.2 高复杂度文件

| 文件                               | 当前行数 | 主要问题                                                   |
| ---------------------------------- | -------: | ---------------------------------------------------------- |
| `portfolio-holdings-workspace.tsx` |      513 | 过滤、双表格、列定义、单元格、排序和操作耦合，参数约 25 个 |
| `calendar-page.tsx`                |      486 | 日期计算、工具栏、分类、月历和时间线集中                   |
| `global-market-panel.tsx`          |      477 | 数据分组、展示卡片、交互和布局集中                         |
| `journals-page.tsx`                |      459 | 筛选、异步状态、列表项和分页集中                           |
| `data-source-settings.tsx`         |      449 | OAuth、状态、操作、卡片布局和通知集中                      |
| `watchlist-table.tsx`              |      443 | 与公共表格能力并行发展                                     |
| `styles.css`                       |      430 | 全局 token、基础规则和业务样式边界不够清晰                 |
| `data-source-dialog.tsx`           |      330 | 表单状态与数据源类型分支较多                               |
| `global-market-types.ts`           |      328 | 类型与静态目录数据混放                                     |
| `holdings/queries.ts`              |      304 | Query、Mutation、Schema 和跨 Feature 依赖压力较大          |

行数本身不是缺陷。只有当一个文件同时承担多个变化原因、产生重复实现或难以独立测试时才拆分。

### 3.3 已经做对的部分

- UI 原子组件、公共 Pattern 和 Feature 目录已经分层。
- 通用空态、错误态、分页、表单字段和加载按钮已开始复用。
- TypeScript、ESLint、Prettier、Vitest 和生产构建脚本已经存在。
- 当前共有 9 个测试文件；在干净依赖环境中，类型检查、Lint、格式检查、17 个测试和生产构建均可通过。
- 关键读取接口已开始使用 Zod 做运行时校验。
- 当前构建包体没有需要立即阻断发布的异常：主入口约 329.68 kB，gzip 约 105.69 kB；投资组合 chunk 约 181.17 kB，gzip 约 51.53 kB；CSS 约 95.09 kB，gzip 约 15.14 kB。

这些基础应保留，不需要推倒重来。

## 4. 样式重复问题：根因与目标

### 4.1 当前问题不是 Tailwind 本身，而是缺少视觉语义

当前多个页面直接用具体数值表达设计意图，例如 `text-[10px]`、`text-[11px]`、`text-[12px]`、`text-[0.75rem]`、`text-[0.78rem]`、`text-[0.8rem]`、`text-[0.85rem]`。这些值中有大量视觉效果接近、语义相同的写法。

直接后果：

- 同样是表格辅助信息，在不同 Feature 中使用不同字号。
- 修改整体视觉密度时需要全局搜索和人工判断。
- Button、Badge、Dialog 等组件默认样式无法满足业务后，Feature 使用 `!` 覆盖。
- 设计一致性依赖开发者记忆，而不是系统约束。

### 4.2 建立语义化排版层

在 `styles.css` 的主题 token 中建立有限排版比例，并通过基础组件或语义类暴露，不再由 Feature 自由创造字号。

建议语义如下：

| 语义         | 用途                                   |
| ------------ | -------------------------------------- |
| `caption-xs` | 图表刻度、极小辅助标记，仅允许少量场景 |
| `caption`    | 次要元信息、时间、单位                 |
| `label`      | 表单标签、筛选项标签                   |
| `table`      | 表格正文                               |
| `body-sm`    | 卡片辅助正文                           |
| `body`       | 默认正文                               |
| `title-sm`   | 卡片标题、分组标题                     |
| `title`      | 面板标题                               |
| `heading`    | 页面标题                               |
| `display`    | 首页核心数字或强调展示                 |

实施时先将 40 种任意字号映射到上述语义，再决定是否保留少量例外。不能简单地把任意值改成另一组任意值。

### 4.3 建立 Surface 语义

`Card` 或新的轻量 `Surface` 需要覆盖当前真实场景：

- `flat`：普通内容分组，不带明显阴影。
- `raised`：标准业务卡片，对应当前重复的边框、背景和阴影链。
- `deep`：弹层或强层级信息。
- `dashed`：空态、创建入口或占位区。
- `interactive`：可点击卡片，才允许 hover 位移、阴影或边框变化。

现有 `Card` 的 `interactive` 默认值应改为 `false`。静态表单和信息卡不应因为使用 `Card` 自动获得可点击反馈。

目标是让 Feature 写出：

```tsx
<Card surface="raised">...</Card>
```

而不是重复：

```tsx
<div className="rounded-xl border border-border bg-card shadow-raised">...</div>
```

### 4.4 组件优先的样式迁移顺序

每一类样式必须按以下顺序迁移：

1. 统计重复场景，确认它们表达同一个视觉或交互语义。
2. 在 UI 原子组件或 Pattern 中新增 token、size、density、surface 或 state 变体。
3. 先迁移一个代表页面，完成 390、768、1440 三个宽度的视觉检查。
4. 批量迁移其余页面。
5. 删除 Feature 内重复 class，并运行静态扫描防止回退。

禁止先做全局字符串替换再补组件语义。

### 4.5 样式治理规则

- Feature 代码禁止新增任意字号；确有图表或第三方嵌入需求时，必须登记例外原因。
- Feature 代码禁止使用 `!important` 工具类覆盖基础组件。
- 同一组 3 个及以上视觉属性在 3 个及以上位置重复时，先判断是否属于已有组件变体。
- 只有视觉字符串相同、语义不同的场景，不强行合并为业务组件；可以共享 token。
- 只有视觉语义相同、结构或行为也稳定的场景，才抽取组件。
- 页面布局只使用统一的容器宽度、水平留白、纵向节奏和断点 token。
- 业务 CSS 只保留 Tailwind 难以清晰表达的复杂布局、动画、第三方覆盖和日历/表格专用规则。
- `styles.css` 只负责全局主题、reset、字体、动画和通用 token；Feature 专属样式放回对应 Feature。

### 4.6 样式验收指标

| 指标                                       |       当前 |                 本轮目标 |
| ------------------------------------------ | ---------: | -----------------------: |
| 任意字号使用次数                           |        188 |                不超过 20 |
| 不同任意字号规格                           |         40 | 不超过 6，且全部登记原因 |
| Feature 中 `!text-[12px]`                  |         12 |                        0 |
| Feature 中其他 important 工具类            | 待扫描固化 |                        0 |
| 重复通用卡片外观链                         |          7 |             Feature 中 0 |
| 标准页面 `PageContainer + PageHeader` 覆盖 |       部分 |                     100% |
| 静态 Card 默认 hover                       |   存在风险 |                        0 |

“不超过 20”是给数据可视化、第三方兼容和极特殊排版预留的上限，不是新增任意值的额度。

## 5. 组件化问题：根因与目标架构

### 5.1 目标分层

```text
routes / pages
    ↓
feature containers / controllers
    ↓
feature components
    ↓
cross-feature patterns
    ↓
UI primitives + style tokens

feature queries
    ↓
shared domain schemas / query keys / API client
```

各层职责：

| 层级                   | 允许包含                                                                   | 禁止包含                          |
| ---------------------- | -------------------------------------------------------------------------- | --------------------------------- |
| UI primitives          | Button、Input、Card、Badge、Dialog、Tabs 等视觉和基础交互                  | 业务字段、接口调用、路由知识      |
| Patterns               | PageHeader、AsyncState、Pagination、DataTable、FilterBar 等跨 Feature 模式 | 某个业务实体的专用规则            |
| Feature components     | 持仓行、自选股卡片、数据源状态等业务展示                                   | 跨 Feature 数据访问、全局样式规则 |
| Containers/controllers | Query、Mutation、URL 状态、业务编排                                        | 大段展示 JSX、重复视觉 class      |
| Domain/data            | Zod Schema、领域类型、queryKeys、API 适配                                  | 页面布局和 React 视图             |

依赖只允许向下。Feature 之间不能直接“借用”另一个 Feature 的内部组件和类型。

### 5.2 抽取组件的判断标准

满足以下任意两项才优先抽取：

- 相同语义或行为出现至少 3 次。
- 该部分有独立状态机或交互边界。
- 可以定义稳定、清晰且不依赖父组件内部细节的输入输出。
- 可以被独立测试。
- 修改该部分的原因与父组件其他区域不同。

以下情况不应抽取：

- 只为把 300 行拆成多个 100 行文件。
- 组件需要十几个布尔参数控制完全不同的页面。
- 抽取后仍要透传父组件几乎所有状态和回调。
- 两段 JSX 只是 class 相同，但业务语义和演进方向不同。

### 5.3 优先补齐或改造的公共组件

| 组件/模式         | 动作           | 必须解决的问题                                               |
| ----------------- | -------------- | ------------------------------------------------------------ |
| `Card/Surface`    | 改造           | 统一卡片外观；`interactive=false` 默认；提供 surface/density |
| `Button`          | 改造           | 完整 size/density，消除 `!text-[12px]`                       |
| `Badge`           | 改造           | 统一状态、涨跌、数据源和小尺寸标签                           |
| `PageHeader`      | 扩展并全量迁移 | 标题、描述、eyebrow、操作区、移动端换行                      |
| `FilterBar`       | 新增           | 搜索、Select、日期、清空和结果摘要的统一布局                 |
| `SortHeader`      | 新增或并入表格 | 排序图标、aria-sort、键盘行为                                |
| `DataTable`       | 重点改造       | 选择、吸顶、排序、骨架、空态、行操作、分页、密度             |
| `DataView`        | 新增 Pattern   | 同一数据源在桌面表格和移动卡片之间切换                       |
| `StatusIndicator` | 新增           | loading/error/unconfigured/active/disabled 等状态语义        |
| `AsyncBoundary`   | 评估扩展       | 页面级 loading/error/empty 的固定优先级和重试                |

公共组件应提供明确的 variant，而不是鼓励页面通过 `className` 重写内部契约。保留 `className` 作为布局补充，但不得用来改写核心字号、状态色和交互行为。

## 6. 表格统一专项

这是组件化的最高风险点之一，必须单列治理。

### 6.1 当前问题

- `DataTable` 已处理部分通用表格能力。
- `watchlist-table.tsx` 仍以 443 行手工实现另一套表格。
- `portfolio-holdings-workspace.tsx` 内还包含两套持仓相关表格、列定义和操作。
- 多处重复表格容器、吸顶表头、排序按钮、加载行、空态、横向滚动和行操作样式。
- 自选股使用 `min-w-[1420px]`，移动端实质上依赖横向滚动。

### 6.2 目标方案

保留 TanStack Table 作为行为内核，将公共层拆成可组合能力，而不是制作单一超大表格组件：

- `DataTableRoot`：表格状态和上下文。
- `DataTableViewport`：边框、背景、滚动和吸顶区域。
- `DataTableHeader`：表头与排序语义。
- `DataTableBody`：数据行、骨架、空态和错误态。
- `DataTablePagination`：分页。
- `DataTableSelection`：全选、部分选择和批量操作。
- `DataTableRowActions`：统一操作入口。
- `DataView`：桌面表格与移动卡片/列表共用同一份状态及数据。

不要求组件名称必须完全一致，但职责边界和单一表格体系必须达到上述效果。

### 6.3 迁移顺序

1. 以现有 `DataTable` 为基础补齐排序、选择、骨架、行操作和响应式插槽。
2. 选择自选股作为第一迁移对象，因为它覆盖排序、选择、批量操作、备注和大宽表。
3. 完成自选股桌面表格与移动卡片视图，删除原有重复表格外壳。
4. 迁移投资组合持仓表格。
5. 扫描并删除 Feature 中重复的表头、空态、加载和分页实现。

### 6.4 表格验收

- 项目内只保留一套通用表格基础设施。
- Feature 只提供列定义、单元格业务内容和行操作，不再实现通用表格状态。
- 排序使用 `aria-sort`，选择和操作可通过键盘完成。
- 390 px 下不存在依赖 1420 px 宽表格才能完成的核心操作。
- loading、error、empty 和有数据四种状态均有组件测试。
- 自选股和持仓的排序、选择、批量操作、分页行为有 E2E。

## 7. 重点模块拆分方案

### 7.1 投资组合与持仓

当前：

- `portfolio-holdings-workspace.tsx` 513 行。
- 同时管理筛选、双表格、列工厂、排序表头、单元格和行操作。
- 外部参数约 25 个，说明父子边界仍以状态透传为主。
- `portfolios` 直接依赖 `holdings` 内部的 Query、类型和组件，Feature 所有权模糊。

目标拆分：

```text
features/portfolios/
  portfolio-holdings-workspace.tsx
  holdings/
    holdings-filter-bar.tsx
    holdings-table.tsx
    holding-columns.tsx
    holding-row-actions.tsx
    holdings-mobile-list.tsx
    holdings-view-model.ts
```

要求：

- Workspace 只负责布局和组合，不直接定义所有列与单元格。
- 用一个内聚的 view model 或少量职责对象替代 25 个离散 props。
- 不把所有状态塞进一个巨型 Context；高频变化状态就近管理。
- 持仓领域归属要么迁入 portfolios，要么沉入共享 `domain/instruments`、`data/holdings`，禁止继续让两个 Feature 相互穿透。
- Workspace 目标控制在 250～300 行以内；该数字是结果指标，不是机械拆分依据。

### 7.2 自选股

当前：

- `watchlist-table.tsx` 443 行，与 `DataTable` 能力重复。
- 桌面表格最小宽度 1420 px，移动端体验不足。
- 页面、Controller、URL 状态已有一定分层，应保留。

目标拆分：

```text
features/watchlist/
  watchlist-page.tsx
  watchlist-data-view.tsx
  watchlist-columns.tsx
  watchlist-mobile-list.tsx
  watchlist-bulk-actions.tsx
  use-watchlist-selection.ts
  use-watchlist-reorder.ts
```

要求：

- 复用统一 DataTable/DataView。
- 列定义只描述数据、对齐、排序和单元格。
- 选择与拖拽/键盘排序逻辑从展示组件分离。
- 桌面和移动视图复用相同 Query、筛选、选择和操作模型。
- 表格展示组件目标控制在 250 行以内。

### 7.3 财经日历

当前 `calendar-page.tsx` 486 行，日期计算、月历、筛选和时间线集中。

目标：

```text
features/calendar/
  calendar-page.tsx
  calendar-toolbar.tsx
  calendar-filters.tsx
  calendar-month-grid.tsx
  calendar-timeline.tsx
  calendar-date.ts
```

- 纯日期计算迁入 `calendar-date.ts` 并单元测试。
- 月份、分类和筛选条件进入 URL，支持刷新、分享和返回。
- 页面只负责编排 Query、URL 状态和布局。
- 页面目标控制在 250～300 行以内。

### 7.4 全球市场

当前 `global-market-panel.tsx` 477 行，`global-market-types.ts` 328 行且混入静态目录。

目标：

- 拆分 `market-group-card`、`market-quote-item`、`market-toolbar`。
- 静态市场目录移入 `global-market-catalog.ts`，类型文件只保留类型。
- 卡片、Badge、涨跌色和微型字号全部接入统一 token。
- Panel 目标控制在 300 行以内。

### 7.5 数据源设置

当前 `data-source-settings.tsx` 449 行，状态判断、OAuth、通知、卡片和动作集中。

目标：

- 拆分 `data-source-card`、`data-source-actions`、`data-source-status`、`oauth-result-notice`。
- 状态必须明确区分 loading、error、unconfigured、disabled、active。
- OAuth 回跳处理成为独立、可测试的流程。
- 页面目标控制在 250～300 行以内。

### 7.6 投资日志

当前 `journals-page.tsx` 459 行。

目标：

- 拆分日期筛选、Entry Card、列表骨架和列表容器。
- Entry Card 使用统一 Surface、排版和操作模式。
- 页面只保留 URL 状态、Query/Mutation 编排和 Dialog 开关。
- 页面目标控制在 300 行以内。

## 8. 跨 Feature 依赖与数据层治理

### 8.1 依赖问题

- `portfolios` 引用 `features/holdings` 的 Query、类型和组件。
- 自选股新增弹窗引用持仓 Feature 的标的搜索与类型。
- Settings Query 引用 Auth 和 Overview 的 Query Key 别名。
- 相同领域的 Zod Schema 分散在 holdings、watchlist、overview。

### 8.2 目标结构

```text
src/
  domain/
    instruments/
      schemas.ts
      types.ts
    market/
      schemas.ts
      types.ts
    data-source/
      schemas.ts
      types.ts
  data/
    api-client.ts
    query-keys.ts
    instruments.ts
    portfolios.ts
```

实际目录可结合现有结构微调，但必须满足：

- 共享领域类型和 Schema 不归属于任一 Feature。
- 类型优先从 Zod Schema 推导，减少“TS 类型一份、运行时 Schema 一份”漂移。
- Query Key 由唯一工厂管理，不通过其他 Feature 间接导入。
- Feature 只能依赖共享 domain/data，不能依赖其他 Feature 的内部文件。
- 增加 ESLint boundary 或受控 import 规则，自动阻止逆向依赖。

### 8.3 API 运行时校验

当前仍有约 30 处泛型 `apiFetch<T>` 调用，Mutation 响应校验覆盖尤其不足。

执行方式：

1. 先为登录、数据源 OAuth、组合/持仓 Mutation、自选股批量操作建立共享 Schema。
2. 将 `apiFetch<T>` 逐步替换为 `apiFetch(schema, options)` 或同等显式解析接口。
3. 错误统一转换为可展示的领域错误，保留 HTTP 状态码。
4. 最终禁止业务代码只靠 TypeScript 泛型“假定”服务端响应正确。

## 9. 必须优先处理的功能正确性问题

这些不是单纯重构，应在大规模组件迁移前完成并加回归测试。

### P0-1 OAuth 回跳页签错误

现状：OAuth 回调进入 `/settings?oauth=...`，但 Settings 默认展示账户页签；OAuth 结果提示位于未激活的数据源页签中。

方案：

- Settings 页签改为 URL 控制。
- 存在 `oauth` 回跳参数时自动激活数据源页签。
- 消费结果后清理一次性参数，避免刷新重复提示。
- 覆盖成功、拒绝、状态不匹配和服务端错误。

### P0-2 鉴权错误被误判为未登录

现状：`AuthGuard` 将网络错误和服务端 500 等会话查询错误一律按未登录处理。

方案：

- 只有明确 401/无会话才跳转登录。
- 网络错误、超时和 5xx 展示可重试错误态。
- 保留原目标地址，登录后返回。

### P0-3 数据源状态误导

现状：`AppShell` 可能把加载中或请求失败显示成“未接入数据源”。

方案：

- 通过 `StatusIndicator` 明确区分加载中、读取失败、未配置、已停用和已连接。
- 失败状态提供重试，不把技术失败解释为业务未配置。

## 10. 状态、路由与缓存

- 自选股、投资组合和日志已有部分 URL 状态，应保留并统一序列化规则。
- 日历月份/分类/筛选、Overview 页签和 Settings 页签应进入 URL。
- 对 URL 参数建立 Schema 与默认值，非法值回退且不造成循环导航。
- Query Key 必须由集中工厂生成。
- Mutation 只失效受影响资源，避免全局刷新。
- 为新增、编辑、删除、批量操作编写“请求次数 + 缓存更新”测试，防止重复请求和陈旧数据。
- Controller 只暴露页面需要的 view model，不透传原始 Query 对象集合。

## 11. 响应式与可访问性

### 11.1 响应式问题

- 自选股宽表依赖 `min-w-[1420px]`。
- 数据源卡片使用固定 `grid-cols-[1fr_230px]`。
- 账户设置固定两列。
- 鉴权加载页固定 `grid-cols-[248px_1fr]`。
- 页面高度同时存在 `100vh` 和 `100dvh`。

方案：

- 统一以 390、768、1440 px 为最低验收视口。
- 统一使用动态视口高度策略，避免移动浏览器地址栏造成遮挡。
- 数据表在移动端提供卡片/列表，不仅依靠横向滚动。
- 两列设置页在小屏降为单列，操作区可换行。
- 固定宽操作列改为内容驱动或断点布局。

### 11.2 可访问性问题

- 登录表单错误尚未完整连接 `aria-invalid` 与 `aria-describedby`。
- 部分持仓筛选标签与控件没有 `htmlFor/id` 关系，并使用原生 Select 的孤立样式。
- 移动导航需要焦点圈定、Escape 关闭和背景隔离。
- iframe 只有 `onError` 回退，缺少加载超时和外部打开方案。

方案：

- 所有表单统一通过 `FormField` 提供 label、hint、error 和 aria 关联。
- Dialog、Sheet、移动导航完成键盘与焦点回归。
- 表格排序、选择和行操作均有可读名称。
- iframe 增加加载态、超时、失败说明和“在新窗口打开”；是否加 sandbox 先做兼容性验证。
- 引入 axe 自动检查，并对已知第三方限制建立白名单说明。

## 12. 测试与质量门禁

### 12.1 当前缺口

- 只有 9 个测试文件，重点仍在工具函数、Schema 和 Controller。
- 没有 Playwright 业务 E2E。
- 没有 axe 自动化。
- 没有视觉回归。
- 没有覆盖率阈值。
- 没有 Query 请求次数和缓存失效专项测试。
- 没有 bundle budget。

### 12.2 分层测试策略

| 层级                  | 重点                                                                    |
| --------------------- | ----------------------------------------------------------------------- |
| 单元测试              | token 映射、日期函数、格式化、Schema、URL 参数                          |
| 组件测试              | Card/Button variant、PageHeader、FilterBar、DataTable 四状态、表单 aria |
| Controller/Query 测试 | Mutation、失效范围、请求次数、错误分支                                  |
| E2E                   | 登录、OAuth、组合/持仓、自选股、日志、日历、移动导航                    |
| 视觉回归              | 390、768、1440 下的主要页面及 Dialog                                    |
| 无障碍                | axe + 键盘手工检查                                                      |

### 12.3 必须加入 CI 的命令

```bash
pnpm run typecheck
pnpm run lint
pnpm run test
pnpm run format:check
pnpm run build
pnpm run test:e2e
```

阶段性可以将 E2E 分成 smoke 与 full 两组，但合并主分支前至少运行核心 smoke。

新增门禁：

- 禁止 Feature 新增任意字号和 important 工具类。
- 禁止 Feature 直接依赖其他 Feature 内部模块。
- 监控主要 chunk 和 CSS gzip 体积，初始预算以当前基线加 10% 为警戒线。
- 新增/修改的共享组件必须有测试。
- 核心 Controller、Schema、URL 状态和共享组件覆盖率目标不低于 80%；不以短期全项目总覆盖率制造无效测试。

## 13. 工具链、构建与部署问题

### 13.1 包管理器状态不一致

- `.npmrc` 声明 `node-linker=hoisted`。
- 当前根依赖元数据曾显示 isolated 布局，导致现有依赖目录下根级 lint/test 链接异常。
- 干净离线安装后检查可通过，说明主要是安装状态漂移，不是业务代码错误。

方案：

- 统一 pnpm 版本并通过 Corepack 固定。
- 增加 `engines` 和 `.node-version`。
- 清理后按锁文件重新安装，禁止混用 npm。
- CI 每次使用锁文件冷安装。
- Docker 在 `pnpm install` 前复制 `.npmrc`。

### 13.2 Node、CI 与 Docker 不一致

- CI 使用 Node 22，Docker 使用 Node 24。
- `.github/workflows/frontend.yml` 当前未纳入版本控制时不会真正生效。

方案：

- CI、Docker、本地推荐版本统一到同一 Node LTS。
- 将工作流正式纳入版本控制并验证一次完整运行。
- 构建镜像执行与 CI 相同的 `pnpm run check`。

### 13.3 行尾与提交卫生

- 增加 `.gitattributes`，统一源代码和 Markdown 为 LF。
- 样式系统、组件迁移、功能修复、依赖调整分开提交。
- 当前工作树包含大量前端修改和少量后端并行修改；实施时不得顺带覆盖不相关改动。

### 13.4 Nginx 与前端安全

- 增加 `X-Content-Type-Options`、`Referrer-Policy`、`Permissions-Policy`。
- 制定 CSP；由于存在第三方 iframe，`frame-src` 需按真实域名放行并测试。
- 不在前端日志、URL 或错误提示中暴露数据源密钥和 OAuth 敏感信息。

### 13.5 字体与错误监控

- 当前声明 Inter、JetBrains Mono，但未明确打包字体文件或导入来源。
- 选择自托管字体或明确使用系统字体栈，避免不同环境渲染漂移。
- 当前只有全局 ErrorBoundary，应增加路由/模块级边界和可替换的生产错误上报适配器。

## 14. 分阶段实施计划

### 阶段 0：固化基线与修复 P0（1～2 人日）

交付：

- 保存 390、768、1440 主要页面截图。
- 为关键业务流程建立 smoke 清单。
- 修复 OAuth 页签、AuthGuard 错误分类和数据源状态。
- 固化样式扫描脚本和当前指标。
- 统一 Node/pnpm/CI 基础配置。

验收：

- P0 缺陷有自动化回归。
- `pnpm run check` 在干净环境稳定通过。
- 不修改后端 API。

### 阶段 1：视觉语义与基础组件（4～6 人日）

交付：

- 排版 token、间距/密度 token、Surface 语义。
- Card、Button、Badge variant 完整化。
- `interactive=false` 默认。
- 清除 Feature 中 `!text-[12px]`。
- 标准页面全量迁移 `PageContainer + PageHeader`。

验收：

- 任意字号种类从 40 降至不超过 10，最终阶段再降至 6。
- Feature important 工具类为 0。
- 通用卡片外观链不再出现在 Feature。
- 三视口视觉回归无信息丢失。

### 阶段 2：表格与跨页面 Pattern（5～8 人日）

交付：

- 统一 DataTable/DataView。
- FilterBar、SortHeader、StatusIndicator。
- 自选股桌面表格与移动列表迁移。
- 投资组合持仓表格迁移。

验收：

- 删除自选股重复表格基础设施。
- 两个业务域共用同一表格状态组件。
- 排序、选择、批量操作、分页和移动端有测试。

### 阶段 3：大组件按职责拆分（8～12 人日）

顺序：

1. 投资组合与持仓。
2. 自选股。
3. 数据源设置。
4. 日历。
5. 全球市场。
6. 投资日志。

验收：

- 目标页面/面板控制在 250～300 行左右。
- 当前约 25 props 的 Workspace 改为内聚接口，独立 props 原则上不超过 12 个；超出需说明原因。
- 展示组件不直接发请求。
- Controller 不包含大段 JSX。
- 每次迁移都完成业务 smoke 和视觉对比。

### 阶段 4：领域模型、API 与依赖边界（4～6 人日）

交付：

- 共享 instruments/market/data-source Schema。
- Query Key 唯一工厂。
- 跨 Feature import 清理。
- Mutation 响应运行时校验。
- URL 状态统一。

验收：

- Feature 间内部模块直接依赖为 0。
- 关键 API 读写均经过 Schema。
- Query 失效和请求次数测试通过。

### 阶段 5：响应式、无障碍、E2E 与发布门禁（5～8 人日）

交付：

- 390/768/1440 视觉回归。
- Playwright smoke/full。
- axe 检查。
- bundle budget。
- Nginx 安全头、字体策略和错误监控接口。

验收：

- 核心业务在三视口可完成。
- axe 无阻断级问题。
- 主包、投资组合 chunk 和 CSS gzip 不超过基线 10%，超出必须给出原因和拆包方案。
- CI 全绿后才能合并。

预计总投入：单人约 5～7 周；两名前端可并行压缩，但阶段 1 的视觉契约和阶段 2 的表格契约必须先统一，不能各自实现一套。

## 15. 工作项清单

### P0：功能正确性与基线

- [ ] FE-P0-01：OAuth 回跳自动进入数据源页签并清理一次性参数。
- [ ] FE-P0-02：AuthGuard 区分 401、网络错误和 5xx。
- [ ] FE-P0-03：AppShell 区分数据源加载、失败、未配置、停用和连接状态。
- [ ] FE-P0-04：固化业务 smoke、三视口截图和样式统计脚本。
- [ ] FE-P0-05：统一 Node/pnpm，确保 CI 文件正式生效。

### P1：样式重复专项

- [ ] FE-STYLE-01：建立语义化排版比例并完成 40 种字号映射表。
- [ ] FE-STYLE-02：完善 Card/Surface variant，静态 Card 默认不交互。
- [ ] FE-STYLE-03：完善 Button/Badge size 与 density，删除 12 处 `!text-[12px]`。
- [ ] FE-STYLE-04：消除 Feature 中 7 处重复卡片外观链。
- [ ] FE-STYLE-05：所有标准页面迁移 PageContainer/PageHeader。
- [ ] FE-STYLE-06：拆分全局样式与 Feature 专属样式。
- [ ] FE-STYLE-07：增加任意值、important 和重复模式的 CI 检查。

### P1：组件化专项

- [ ] FE-COMP-01：定义 UI/Pattern/Feature/Container/Domain 边界。
- [ ] FE-COMP-02：完成 DataTable 可组合能力。
- [ ] FE-COMP-03：自选股迁移到统一 DataTable/DataView。
- [ ] FE-COMP-04：投资组合持仓迁移到统一 DataTable/DataView。
- [ ] FE-COMP-05：新增 FilterBar、SortHeader、StatusIndicator。
- [ ] FE-COMP-06：拆分 PortfolioHoldingsWorkspace 并收敛 props。
- [ ] FE-COMP-07：拆分 CalendarPage。
- [ ] FE-COMP-08：拆分 GlobalMarketPanel 和静态目录。
- [ ] FE-COMP-09：拆分 DataSourceSettings。
- [ ] FE-COMP-10：拆分 JournalsPage。

### P2：数据、质量与发布

- [ ] FE-DATA-01：共享领域 Schema 与类型。
- [ ] FE-DATA-02：统一 Query Key，清除跨 Feature 引用。
- [ ] FE-DATA-03：补齐 Mutation 响应运行时校验。
- [ ] FE-STATE-01：统一 Settings、Overview、Calendar URL 状态。
- [ ] FE-A11Y-01：表单 aria、移动导航焦点和表格键盘支持。
- [ ] FE-TEST-01：Playwright 核心业务 E2E。
- [ ] FE-TEST-02：axe 和三视口视觉回归。
- [ ] FE-BUILD-01：bundle budget、Node/pnpm/Docker 一致性。
- [ ] FE-SEC-01：安全响应头、CSP、字体和错误上报接口。

## 16. 完整验收标准

只有同时满足以下条件，才可以认定“样式重复、组件化问题已经解决”，不能以“建了公共组件”作为完成标准。

### 16.1 样式

- 任意字号使用不超过 20 次、规格不超过 6 种，全部有明确例外说明。
- Feature 中不存在 important 工具类。
- Feature 中不存在重复通用 Card/Surface 外观链。
- Button、Badge、Input、Card、Dialog 的核心字号、状态色和密度由 variant 控制。
- 标准页面 100% 使用统一页面容器和页面头部。
- 390、768、1440 三个视口视觉回归通过。

### 16.2 组件

- 空态、错误态、分页、表单字段、加载按钮不存在 Feature 本地通用副本。
- 自选股与持仓共用一套 DataTable/DataView 基础设施。
- Feature 只定义业务列、业务单元格和业务操作。
- 大组件按变化原因拆分，当前六个重点模块完成目标拆分。
- 不存在 Feature 之间直接引用内部模块。
- 新共享组件有独立测试和使用说明。

### 16.3 业务与质量

- 本文第 2.1 节业务流程全部通过 smoke/E2E。
- OAuth、AuthGuard 和数据源状态三个 P0 缺陷修复并有回归。
- TypeScript、ESLint、Vitest、Prettier、Build、Playwright 全部通过。
- axe 无阻断级问题。
- 主要 bundle 不超过基线 10%，或有经过确认的合理说明。
- CI、Docker 和本地使用同一 Node/pnpm 契约。

## 17. 风险控制与回滚

每个迁移批次遵循：

1. 先补测试和截图基线。
2. 新增组件 variant，旧实现暂时保留。
3. 只迁移一个 Feature。
4. 对比视觉和业务行为。
5. 删除旧样式/旧组件。
6. 单独提交，必要时可按 Feature 回滚。

高风险事项：

| 风险                             | 控制方式                                      |
| -------------------------------- | --------------------------------------------- |
| 样式统一导致信息层级变化         | 三视口截图对比，不进行无依据的整体缩放        |
| 表格抽象过度                     | 采用可组合 primitives，业务单元格留在 Feature |
| 拆分后 props 继续层层透传        | 使用内聚 view model，状态就近管理             |
| Query 重构造成重复请求或陈旧缓存 | 请求次数和 invalidation 测试                  |
| 移动端改为卡片后功能缺失         | 桌面/移动共用操作模型，逐项核对功能矩阵       |
| OAuth/鉴权修复影响导航           | 单独提交并覆盖成功与失败路径                  |
| 并行改动冲突                     | 按 Feature 分批，不覆盖工作树中的无关后端改动 |

## 18. 推荐提交顺序

1. `fix(frontend): correct oauth auth-guard and datasource states`
2. `chore(frontend): align node pnpm ci and style audits`
3. `refactor(ui): add typography density and surface contracts`
4. `refactor(frontend): migrate page headers and shared surfaces`
5. `refactor(table): unify data table primitives`
6. `refactor(watchlist): migrate responsive data view`
7. `refactor(portfolios): split holdings workspace`
8. 按 settings、calendar、overview、journals 分别提交组件拆分。
9. `refactor(data): centralize schemas query keys and boundaries`
10. `test(frontend): add e2e accessibility and visual gates`
11. `chore(web): add bundle budgets fonts and security headers`

## 19. 最终判断

当前项目的基础组件化已经起步，通用空态、错误态、分页和表单字段的重复问题基本得到控制；但用户多次指出的“样式重复”和“组件化不足”仍只解决了一部分。

本轮优化的核心不是继续堆叠公共组件数量，而是完成四件事：

1. 把 40 种零散字号和重复 Surface 收敛为有限视觉语义。
2. 把已有公共组件迁移到全部适用页面，并禁止 Feature 覆盖基础契约。
3. 把自选股、持仓两套表格统一为可组合的数据展示体系。
4. 把六个高复杂度模块按变化原因拆开，同时用测试和静态规则防止回退。

达到第 16 节全部验收标准后，才能将“多样式重复、无组件化”问题标记为完成。

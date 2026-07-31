# BUG-001 lint 门禁未通过（37 errors），阻断上线

- Bug ID：BUG-001
- 标题：npm run lint 报 37 个 error，未达上线门禁
- 来源：测试（自动化门禁 `qa/研发质量Checklist.md` A 项）
- 发现日期：2026-08-01
- 报告人：资深开发（吴八哥）
- 严重程度：S2（代码质量/规范，无数据丢失，但阻断发布）
- 优先级：P0
- 是否阻断上线：是
- 关联需求/PRD/用例：研发质量Checklist A、README 第四节第 5 条
- 研发负责人：戚锦豪
- 当前状态：已修复（待阶段④回归 / 阶段⑤验收）

## ★ 复现环境
- 环境：Node 22（managed）/ 项目根目录
- 命令：`npm run lint`

## ★ 前置条件
- 已 `npm install`，源码为 2026-08-01 状态

## ★ 复现步骤
1. `cd E:/Vibe Coding/boss`
2. `npm run lint`

## ★ 实际结果
退出码 1，**37 errors / 4 warnings**。主要集中在：
- `src/components/AIChat.tsx`：activeSystemPrompt 未使用
- `src/components/AIProviderSettings.tsx`：translateApiError / getModelMaxTokens / MODEL_MAX_TOKENS 已 import 未使用
- `src/pages/ExportPage.tsx`：explicit any ×2、setIsGenerating/rangeLabel 未使用、irregular whitespace
- `src/store/useAppStore.ts`、`src/utils/dataLoader.ts`：explicit any 多处
- `src/utils/aiScoringParser.ts`：未使用变量、prefer-const、无用转义
- `src/pages/*`：多处未使用导入（Layout/ Deductions/ Today/ JobCategory/ CategoryDetail/ Dashboard）

## ★ 期望结果
`npm run lint` 退出码 0，无 error 级问题（warning 需说明）。

## 附件
- 完整输出见 `风险与执行清单.md` 执行记录栏（本次执行摘录）

## 影响范围
- 阻断上线（README 第四节第 5 条：lint 有 error 即阻断）。
- 多为未清理的 import / any 类型，属技术债，长期降低可读性与类型安全。

## —— 研发定位（修复前填）——
- 表面原因（有证据）：未使用的导入与 `any` 类型未清理。依据：`eslint` 输出明确指向具体文件/行。
- 深层原因（待定）：为何能合入仓库？疑似**缺 CI / pre-commit 门禁**，`check` 过了但 `lint` 未纳入门禁执行链。依据：本仓库 `package.json` scripts 有 `check`/`lint` 分离，但无 husky/lint-staged 或 CI 卡点。
- 排查路径：① 先 `npm run lint -- --fix` 修掉 2 个可自动修复项 → ② 人工清理未使用导入与 any → ③ 讨论是否加 pre-commit/CI 门禁防回归。
- 待补充信息：确认是否要我直接修（属代码改动，需你授权方向）。

## 根因（修复后填）
- 直接原因：未使用的导入 / `any` 类型 / 死代码长期堆积，未被任何自动化门禁拦截。依据：`eslint` 输出明确指向各文件具体行。
- 深层原因（有证据）：**仓库缺少提交门禁**——`.git/hooks` 为空、无 husky/lint-staged、无 CI 卡点；`npm run check`(tsc) 通过但 `npm run lint` 未纳入提交前执行链，故脏代码能直接合入。依据：本仓库 `package.json` 仅含 `check`/`lint` 分离脚本，无任何 hook/CI 配置。

## 修复说明（修复后必填）
1. `npm run lint -- --fix` 自动修复 2 项（unused-vars 自动删除）。
2. 人工清理剩余 35 errors，覆盖 9 个文件：
   - 删死代码：`aiScoringParser.ts` 的 `extractConceptRoot` 及其独占常量 `CONCEPT_KEYWORDS`(86行)、`BROAD_MAP`(23行)，共 113 行。
   - `any` 精确化：`TodayPage.exportExcel` 用 `ExportLog = DeliveryLog & { state_name?: string }`；`ExportPage.getStatusMeta` 用结构化类型 + `keyof typeof STATUS_META` 断言；`useAppStore`/`dataLoader` 用 `unknown` 断言并新增 `ExtensionDelta` 类型。
   - 删未使用导入/变量：`AIChat`/`AIProviderSettings`/`Layout`/`RawScoreBreakdown`/`CategoryDetailPage`/`DeductionsPage`/`ExportPage`/`JobCategoryPage`/`TodayPage`/`mockData`/`DashboardPage`。
   - `ExportPage` 全角空格(irregular whitespace)、`aiScoringParser` 无用转义 `\/`→`/` 修正。
3. 防回归：升级为 husky + lint-staged 团队化门禁（`.husky/pre-commit` 随仓库提交、clone 即自动生效，跑 lint-staged+check+lint，error 级即拦截提交；原本地 `.git/hooks/pre-commit` 与 `precommit` 脚本已退役）。
- 影响范围：纯代码质量清理，**不改变任何运行时行为**；`check`/`build` 均通过。

## 回归结论
- 阶段①门禁重跑：`npm run lint` = **0 errors（4 warnings 非阻断）**；`npm run check`(tsc) = 0 errors；`npm run build` = 通过（exit 0）。
- 4 个 warning 为非阻断项（Layout/TodayPage 的 react-hooks/exhaustive-deps、Pagination 的 react-refresh），已记录于下，建议后续专项清理，不阻塞本次上线。
- 未引入新缺陷：类型替换均经 tsc 校验；删除的常量仅被已删死函数引用，无运行时依赖。
- 结论：BUG-001 已修复，门禁已就位，满足上线条件（仍需产品/测试在阶段⑤做最终验收）。

## 遗留（非阻断，建议专项）
- Layout.tsx:43 / TodayPage.tsx:144,161：`react-hooks/exhaustive-deps` 警告，需评估是否补依赖或加 eslint-disable 注释。
- Pagination.tsx:22：`react-refresh/only-export-components` 警告，建议把常量/工具函数拆到独立文件。

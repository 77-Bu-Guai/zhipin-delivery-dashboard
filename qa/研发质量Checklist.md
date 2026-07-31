# 研发质量 Checklist（资深开发把关）

> 这是资深开发做**代码评审与上线门禁**的硬清单。每条都是 boss 项目踩过的坑或高风险点。
> 用法：① 提交前研发自查 → ② PR 评审资深开发逐条勾 → ③ 任一红线未过则打回。
> 随复盘持续补充（见 `templates/质量复盘模板.md` 第七节）。

---

## A. 提交前自动化门禁（红线，必须全绿）

- [ ] `npm run check`（`tsc -b --noEmit`）退出码 0，无类型错误
- [ ] `npm run build`（`tsc -b && vite build`）退出码 0，构建成功
- [ ] `npm run lint` 无 error 级问题（warning 需说明）
- [ ] 核心路径本地自测通过（至少走一遍主流程）

> 命中 README 第四节「阻断上线标准」第 5 条即阻断。

## B. 安全与密钥（最高优先级）

- [ ] API Key / PAT **只**存在于：用户输入、运行时内存、请求头 `x-ai-key`；**绝不**写进 `dist/`、`.env` 提交、源码常量
- [ ] `git status` 确认无 `.env.local`、`.ai-config.json`、密钥文件被跟踪
- [ ] AI 中继（`/ai-proxy`、`/mimo`）仅转发，不落盘 Key
- [ ] Electron 打包后从 `renderer` 读不到 Node 侧密钥

## C. AI 接口配置模块（aiProvider.ts / AIProviderSettings.tsx）

- [ ] 配置读取 `loadAISettings()`：localStorage → sessionStorage → cookie 三重兜底，按 `updatedAt` 取最新
- [ ] 保存 `saveAISettings()`：三处同写 + 异步落盘 `.ai-config.json`，失败不阻塞 UI
- [ ] 服务端落盘冲突：`syncAISettingsFromServer()` 比对 `updatedAt`，谁新用谁，避免来回抖动
- [ ] `validateConfig`：spark 允许空 Key（走 dev 代理注入）；agnes/custom 缺 Key 必拦截并给人话
- [ ] `translateApiError`：401/403/鉴权错误翻译成中文，明确区分「PAT vs 应用 APIPassword」
- [ ] `resolveEndpoint`：自动补 `/chat/completions`，空 baseUrl 返回空而非崩溃
- [ ] `testProvider`：先落盘再测，保证测的就是即将生效的配置
- [ ] 模型名大小写：`lite` 小写、`agnes-2.0-flash` 等严格匹配 `MODEL_MAX_TOKENS`

## D. 数据层（SQLite / extension-data.json / dataLoader）

- [ ] SQLite 是唯一数据源；`extension-data.json` 由 DB 生成，不双写
- [ ] 增量（watch 模式 `_delta`）与全量切片逻辑正确，tracker `last_analyzed_count` 与实际一致
- [ ] 海量数据（5000+ 条）下渲染不卡死（分页 / 虚拟列表 / 懒加载）
- [ ] 5 类投递分类（success / aiRejected / addressRejected / basicRejected / pending）统计字段与口径一致

## E. 评分体系（致命项 / 阈值）

- [ ] `-5000` 致命项（大小周/单休、CET 证书、英语工作语言、实习岗、非深圳）与提示词实际值**完全一致**
- [ ] `scoreDistribution` 阈值随致命分变更同步（如新增 `fatal_lowerThanNeg1000` 档）
- [ ] 评分解析 `aiScoringParser` 对「分数-920\n消极:…\n积极:…」格式健壮，异常文本不崩

## F. 导出与兼容

- [ ] PDF 导出走 `window.print()` 原生方案（已知 jsPDF/ html2canvas 中文乱码 + 离屏白图坑，勿回退）
- [ ] Chrome / Firefox / Electron 打包三端行为一致（特别留意 CORS：浏览器直连被拦，必须走 `/ai-proxy` 中继）
- [ ] 异步竞态：配置保存/读取、AI 请求重试、组件卸载后的 `setState` 已防护（alive 标志 / AbortController）

## G. 评审软要求（技术水位）

- [ ] 错误处理给「人话」，不让用户看到裸 stack 或英文报错
- [ ] 新增功能有对应测试用例（见 `phase1-测试准备/测试用例.md`），异常/边界至少各一条
- [ ] 魔法数字/阈值提为常量并注释来源（如各模型 max_tokens 上限注明官方文档）
- [ ] 不引入未使用的依赖；Node/Python 运行时用隔离环境，不污染全局

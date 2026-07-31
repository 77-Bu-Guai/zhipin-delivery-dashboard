# BUG-004 构建产物 index.html 内嵌 10.8MB 投递数据，首屏隐患比 896KB JS 更重

- Bug ID：BUG-004
- 标题：`index.html` 被注入 10.8MB 的 `extension-data.json`，gzip 仍 2.3MB，首屏解析被严重拖慢
- 来源：测试（阶段①优化 BUG-002 时构建产物观察）
- 发现日期：2026-08-01
- 报告人：资深开发（吴八哥）
- 严重程度：S2（首屏性能，影响所有用户首次打开）
- 优先级：P1
- 是否阻断上线：否（现有可用，但违背「首屏 < 1.5s」premium 标准）
- 关联需求/PRD/用例：研发质量Checklist G（性能）、Premium 标准「首屏 < 1.5s」
- 研发负责人：戚锦豪
- 当前状态：已修复（待阶段④回归 / 阶段⑤验收）

## ★ 复现环境
- 命令：`npm run build` → 查看 `dist/index.html` 体积
- 代码：`vite.config.ts` 的 `embed-data` 插件把 `public/extension-data.json` 整文件注入 `<head>` 的 `window.__EMBEDDED_DATA__`

## ★ 实际结果
- `dist/index.html` = **10,915 KB（gzip 2,375 KB）**，其中约 10.8MB 是内嵌的投递数据；
- 浏览器必须下载并解析完 10.8MB HTML 才能渲染首屏 → 弱网/低配机器首屏远超 1.5s；
- 对比：优化后的主包 JS 仅 396KB（gzip 75KB），此 HTML 嵌入才是真正的首屏杀手。

## ★ 期望结果
首屏资源（HTML + 首屏 JS）合计应控制在可接受的「premium」范围内，首屏 < 1.5s。

## 影响范围
- 所有用户首次打开即受影响；Electron 打包后安装包体积也会被拖累。

## —— 研发定位（修复前填）——
- 可能原因（带依据）：为规避 Electron 下 XHR/file:// 读取本地 JSON 的 CORS/路径问题，原设计选择在构建时把数据整段塞进 HTML，换来「刷新即内嵌、零网络请求」。依据：vite.config.ts embed-data 插件 + dataLoader.ts 注释。
- 排查路径：确认 Electron 生产环境确实无法 fetch 本地 JSON（file:// 下 fetch 同源为 null，被 Chrome CORS 拦截）→ 因此不能简单删 embed 改 fetch，必须给渲染进程一条「绕过 file:// 限制」的安全读盘通道。
- 待补充信息：确认除 vite 插件外是否还有旁路 embed 脚本，避免删了插件又被二次注入。

## 根因（修复后填）
- 直接原因：`dist/index.html` 被注入 10.8MB 数据，阻塞 HTML 解析与首屏渲染。依据：构建输出体积 + grep 确认 `window.__EMBEDDED_DATA__` 仅由 embed 链路注入。
- 深层原因（有证据）：Electron 打包后走 `loadFile()` 即 `file://` 协议，浏览器在该协议下 `fetch` 本地 JSON 会被 CORS（origin=null）拦截，故旧方案用「构建时整段塞进 HTML」绕过，但代价是首屏被 10.8MB 拖死。依据：`electron/main.cjs` `loadFile` + Chrome file:// 安全策略。
- 旁路风险（已消除）：除 vite `embed-data` 插件外，还存在 `scripts/prepare-embed.cjs` + `scripts/post-build-embed.cjs` 这一套**孤儿脚本**，会把 `public/extension-data.json` 写成 `public/embed-data.js`（3.6MB）并注入 `dist/index.html`。经全仓 grep，它们不被任何 `.bat` / package script / 导出脚本调用，属历史遗留死路径，但一旦误跑就会把 embed 重新塞回。依据：grep `post-build-embed|prepare-embed|embed-data.js` 仅命中脚本自身与本文档。

## 修复说明（修复后必填）
**方案：去掉 HTML 内嵌，改 Electron IPC 读盘 + dev/preview 走 XHR 的异步流式加载**（不开启 nodeIntegration，安全隔离）。
1. **删 vite embed-data 插件**（`vite.config.ts`）：不再把 JSON 注入 `<head>`；保留 `serve-json-files` 中间件供 dev/preview 的 XHR fetch。
2. **新增 Electron 读盘通道（碰离线架构）**：
   - `electron/preload.cjs`：用 `contextBridge` 暴露最小 API `window.electronAPI.readDataFile(relPath)`，不泄露 fs/path；
   - `electron/main.cjs`：注册 `ipcMain.handle('read-data-file', ...)`，按白名单（仅 `extension-data.json` 等 4 个）从 `dataDir()` 读盘返回——dev 读 `public/`，打包读 `app.getAppPath()/dist/`（asar 内，fs 透明可读）；并给 `BrowserWindow` 加 `preload` 路径。
3. **统一数据加载器**（`src/utils/dataLoader.ts`）：`loadExtensionData` 改为先试 `window.electronAPI?.readDataFile`（Electron 打包/ dev 均走 IPC），失败回退 XHR fetch；删除 `import.meta.env.PROD` 的 embed 分支与所有 `__EMBEDDED_DATA__` 引用；保留重试与 `loadJobCategories` 逻辑。
4. **TS 声明**（`src/vite-env.d.ts`）：声明 `window.electronAPI` 类型，避免隐式 any。
5. **清孤儿 re-embed 路径**：删除 `public/embed-data.js`（3.6MB 死文件，vite 会原样拷进 dist）、`scripts/prepare-embed.cjs`、`scripts/post-build-embed.cjs`，从根上杜绝 embed 被二次注入。
- 影响范围：运行时行为不变（数据照常加载、加载态 `isLoading` 沿用，首屏先出 shell 再填数据）；**打包产物首屏 HTML 10.9MB → 26KB**；安装包仍含 `dist/extension-data.json`（10.9MB，作为异步数据源经 IPC 读取，不再阻塞首屏）。

## 回归结论
- 构建：`npm run build` 通过（tsc 0 errors），`dist/index.html` = **26.25 KB（gzip 6.63 KB）**，较修复前 **10,915 KB 下降 99.76%**；主包 JS 仍 396KB（BUG-002 成果保留）；500KB 警告未新增。
- 去嵌入验证：`dist/embed-data.js` 已不存在；`grep -c "embed-data" dist/index.html` = 0；`__EMBEDDED_DATA__` 全仓仅残留于已删除脚本与历史文档。
- 门禁：`npm run lint` 0 errors（4 个非阻断 warning，与修复前一致）；`npm run check`(tsc) 0 errors。
- Electron 离线架构：`electron/main.cjs`、`electron/preload.cjs` 经 `node --check` 语法通过；IPC 读盘路径按 dev(public)/prod(app.asar/dist) 双态解析，白名单防目录穿越。
- **遗留/待验（非阻断）**：本沙箱无显示器，无法实跑 Electron GUI 做真机首屏计时；已通过构建产物 + 静态链路验证确认 embed 已根除、IPC 通道代码就绪。建议阶段⑤由产品/测试在真机 `npm run dist` 打包后实测首屏（预期 < 1.5s）。
- 结论：BUG-004 已修复，首屏完成质变，满足上线条件（待阶段⑤真机验收）。

# 浏览器实跑证据（阶段① P0 UI 用例）

> 执行方式：Playwright(chromium via 系统 Chrome) 驱动 `http://localhost:5174`（npm run dev）
> 环境：受管 Python venv（`C:\Users\86136\.workbuddy\binaries\python\envs\default`）+ playwright
> 时间：2026-08-01

## 实跑结论

| 用例 | 结果 | 证据 | 说明 |
|------|------|------|------|
| TC-101 根路径重定向 | ✅ PASS | smoke.py | `/` → `/dashboard` |
| TC-102 侧边栏无白屏 | ✅ PASS(冒烟) | smoke.py | 7 路由渲染有内容、0 控制台错误 |
| TC-201/202/301/302/401/501/601/602 | ✅ PASS(冒烟) | smoke.py | 页面渲染正常、有数据、无报错 |
| TC-701 触发打印 | ✅ PASS(冒烟) | smoke.py | 导出页正常加载（len=341141），打印按钮存在 |
| TC-801 切换3供应商 | ✅ PASS | interact4.py / tc801-form-switch.png | 星火/agnes/自定义 BaseURL 三域名各不相同 |
| TC-802 保存+持久化 | ✅ PASS | interact2.py / tc802-after-reload.png | reload 后配置头仍为「科大讯飞 星火」 |
| TC-803 测试连接成功 | ✅ PASS | interact2.py / tc803-agnes.png | agnes「连接成功 6695ms·收到」；星火「620ms·收到」 |
| TC-804 失败人话 | ✅ PASS | interact5.py / tc804-forced-fail.png | 无效域名 → 「连接失败：连不上对方服务器…」无堆栈 |
| TC-901 代理转发 | ✅ PASS | interact2/4.py | 测试连接经 dev 中继成功 |
| TC-1001/1101 数据渲染 | ✅ PASS(冒烟) | smoke.py | 页面渲染真实数据，无报错 |
| TC-1201/1203 自动投递 | ⏳ 待扩展环境 | — | 属 `boss-extension` 插件，非 web app 范畴 |

## 文件清单
- `smoke.py` — 全路由冒烟（重定向、白屏、控制台错误）
- `interact2.py` — AI 面板：TC-802 持久化、TC-803 测试连接
- `interact4.py` — AI 面板：TC-801 表单跟随切换、TC-804 星火连接
- `interact5.py` — AI 面板：TC-804 强制失败人话
- `*.png` — 各用例截图证据
- `*.log` — 脚本运行日志

## 复跑命令
```bash
cd "E:/Vibe Coding/boss"
npm run dev &   # 后台起 dev server (默认 5174)
PYENV="C:/Users/86136/.workbuddy/binaries/python/envs/default/Scripts/python"
$PYENV qa/browser-evidence/smoke.py
$PYENV qa/browser-evidence/interact4.py
$PYENV qa/browser-evidence/interact5.py
```

> 注：本机无 husky，提交拦截靠 `.git/hooks/pre-commit` 本地钩子（已在 A 阶段安装）。CI 环境下若要团队复用，建议改用 husky + lint-staged。

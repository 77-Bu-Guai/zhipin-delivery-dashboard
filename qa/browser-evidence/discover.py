import time, json, os
from playwright.sync_api import sync_playwright

BASE = "http://localhost:5174"
EVID = "E:/Vibe Coding/boss/qa/browser-evidence"
os.makedirs(EVID, exist_ok=True)
log = []
def L(m): log.append(m); print(m)

with sync_playwright() as p:
    b = p.chromium.launch(channel="chrome", headless=True,
                          args=["--no-sandbox", "--disable-dev-shm-usage"])
    pg = b.new_page()
    errs = []
    pg.on("console", lambda m: errs.append(f"{m.type}: {m.text}") if m.type in ("error", "warning") else None)
    pg.on("pageerror", lambda e: errs.append(f"pageerror: {e}"))

    pg.goto(BASE + "/assistant", wait_until="networkidle", timeout=30000)
    time.sleep(2)
    pg.screenshot(path=EVID + "/01-assistant.png")

    # 收集所有可点击元素的可见文本
    def texts(sel):
        out = []
        for el in pg.locator(sel).all():
            try:
                t = (el.inner_text() or "").strip()
                if t: out.append(t)
            except Exception:
                pass
        return out

    btns = texts("button")
    L("BUTTONS@assistant: " + json.dumps(btns, ensure_ascii=False))
    links = texts("a")
    L("LINKS@assistant: " + json.dumps(links, ensure_ascii=False))

    # 查找“设置”相关按钮（按文本包含）
    cand = []
    for t in btns:
        if "设置" in t or "AI" in t or "供应商" in t or "配置" in t:
            cand.append(t)
    L("SETTINGS_CANDIDATES: " + json.dumps(cand, ensure_ascii=False))

    L("CONSOLE_ERR: " + json.dumps(errs, ensure_ascii=False))
    with open(EVID + "/discover.log", "w", encoding="utf-8") as f:
        f.write("\n".join(log))
    b.close()

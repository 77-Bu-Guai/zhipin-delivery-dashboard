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
    time.sleep(1)
    pg.get_by_text("接口设置", exact=True).click()
    time.sleep(1.5)
    pg.screenshot(path=EVID + "/02-settings.png")

    def dump(sel):
        out = []
        for el in pg.locator(sel).all():
            try:
                t = (el.inner_text() or "").strip()
                if t: out.append(t)
            except Exception:
                pass
        return out

    L("BUTTONS@settings: " + json.dumps(dump("button"), ensure_ascii=False))
    # inputs: placeholder + value
    inp = []
    for el in pg.locator("input, textarea, select").all():
        try:
            ph = el.get_attribute("placeholder") or ""
            val = el.input_value() if el.tag_name() in ("input", "textarea") else ""
            inp.append({"ph": ph, "val": val[:40]})
        except Exception:
            pass
    L("INPUTS@settings: " + json.dumps(inp, ensure_ascii=False))
    # 整个面板文本（前 1500 字）
    try:
        L("PANEL_TEXT: " + (pg.locator("body").inner_text()[:1500]))
    except Exception as e:
        L("PANEL_TEXT_ERR " + str(e))

    L("CONSOLE_ERR: " + json.dumps(errs, ensure_ascii=False))
    with open(EVID + "/interact1.log", "w", encoding="utf-8") as f:
        f.write("\n".join(log))
    b.close()

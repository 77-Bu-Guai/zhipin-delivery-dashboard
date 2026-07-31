import time, json, os, re
from playwright.sync_api import sync_playwright

BASE = "http://localhost:5174"
EVID = "E:/Vibe Coding/boss/qa/browser-evidence"
os.makedirs(EVID, exist_ok=True)
log = []
def L(m): log.append(m); print(m)

PROVIDERS = ["科大讯飞 星火", "agnes", "自定义接口"]

def panel_text(pg):
    return pg.locator("body").inner_text()

def active_header(pg):
    t = panel_text(pg)
    m = re.search(r"AI 接口配置\s*\n\s*([^\n]+)", t)
    return (m.group(1).strip() if m else "?"), t

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
    time.sleep(1)

    # TC-801 切换供应商
    L("=== TC-801 切换 3 个供应商 ===")
    for prov in PROVIDERS:
        try:
            pg.get_by_text(prov, exact=True).click()
            time.sleep(0.8)
            head, _ = active_header(pg)
            L(f"  点击 [{prov}] -> 配置头: {head}")
            pg.screenshot(path=f"{EVID}/tc801-{prov}.png")
        except Exception as e:
            L(f"  点击 [{prov}] 失败: {e}")

    # TC-802 保存并持久化
    L("=== TC-802 保存并使用 -> reload 验证持久化 ===")
    try:
        pg.get_by_text("科大讯飞 星火", exact=True).click(); time.sleep(0.6)
        pg.get_by_text("保存并使用", exact=True).click(); time.sleep(1)
        L("  已点击 保存并使用")
        pg.goto(BASE + "/assistant", wait_until="networkidle"); time.sleep(1)
        pg.get_by_text("接口设置", exact=True).click(); time.sleep(1)
        head, _ = active_header(pg)
        L(f"  reload 后配置头: {head}  (期望=科大讯飞 星火)")
        pg.screenshot(path=f"{EVID}/tc802-after-reload.png")
    except Exception as e:
        L(f"  TC-802 失败: {e}")

    # TC-803/804 测试连接（agnes 有已存 key，可能成功；无 key 的供应商应给出人话错误）
    L("=== TC-803/804 测试连接 ===")
    # 先测 agnes（有 key）
    try:
        pg.get_by_text("agnes", exact=True).click(); time.sleep(0.6)
        pg.get_by_text("测试连接", exact=True).click()
        L("  已点击 测试连接(agnes)，等待<=20s...")
        time.sleep(12)
        _, t = active_header(pg)
        idx = t.find("测试连接")
        snippet = t[idx-150:idx+500] if idx >= 0 else t[-700:]
        L("  agnes 面板片段: " + snippet.replace("\n", " ⏎ "))
        pg.screenshot(path=f"{EVID}/tc803-agnes.png")
    except Exception as e:
        L(f"  测试连接(agnes) 异常: {e}")

    # 再测 科大讯飞 星火（大概率无 key，验证失败人话）
    try:
        pg.get_by_text("科大讯飞 星火", exact=True).click(); time.sleep(0.6)
        pg.get_by_text("测试连接", exact=True).click()
        L("  已点击 测试连接(星火)，等待<=20s...")
        time.sleep(12)
        _, t = active_header(pg)
        idx = t.find("测试连接")
        snippet = t[idx-150:idx+500] if idx >= 0 else t[-700:]
        L("  星火 面板片段: " + snippet.replace("\n", " ⏎ "))
        pg.screenshot(path=f"{EVID}/tc804-xinghuo.png")
    except Exception as e:
        L(f"  测试连接(星火) 异常: {e}")

    L("CONSOLE_ERR: " + json.dumps(errs, ensure_ascii=False))
    with open(EVID + "/interact2.log", "w", encoding="utf-8") as f:
        f.write("\n".join(log))
    b.close()

from playwright.sync_api import sync_playwright

BASE = "http://localhost:5174"
OUT = "E:/Vibe Coding/boss/qa/browser-evidence"
errors = []

def log(*a):
    print(*a, flush=True)

with sync_playwright() as p:
    browser = p.chromium.launch(channel="chrome", headless=True)
    page = browser.new_page()
    page.set_default_timeout(15000)
    page.on("console", lambda m: errors.append(f"{m.type}: {m.text}") if m.type == "error" else None)
    page.on("pageerror", lambda e: errors.append(f"PAGEERR: {e}"))

    def baseurl_input():
        return page.locator('input[placeholder*="v1"]').first

    log("=== 打开 /assistant ===")
    page.goto(BASE + "/assistant", wait_until="networkidle")
    page.get_by_role("button", name="接口设置").click()
    baseurl_input().wait_for(state="visible", timeout=10000)
    log("面板已打开")

    # ---------- TC-804 强制失败路径：写死一个不存在的域名 ----------
    log("\n=== TC-804 强制失败 → 人话而非堆栈 ===")
    page.get_by_role("button", name="科大讯飞 星火").click()
    page.wait_for_timeout(300)
    b = baseurl_input()
    b.fill("https://this-host-does-not-exist-xyz.invalid/v1")
    page.wait_for_timeout(200)
    page.get_by_role("button", name="测试连接").click()

    ok = None
    res_text = "(无)"
    try:
        page.locator("text=连接失败").first.wait_for(timeout=20000)
        res_text = page.locator("text=连接失败").first.inner_text()
        ok = False
    except Exception:
        try:
            page.locator("text=连接成功").first.wait_for(timeout=4000)
            res_text = page.locator("text=连接成功").first.inner_text()
            ok = True
        except Exception:
            res_text = "(超时无结果)"
    log(f"  结果: ok={ok} 文本='{res_text}'")
    # 判断是否「人话」：包含 连接失败： 且不含典型堆栈/JS error 关键字
    is_human = (ok is False) and ("连接失败" in res_text) and ("at " not in res_text) and ("TypeError" not in res_text) and ("stack" not in res_text.lower())
    log(f"  >> TC-804 {'PASS' if is_human else 'FAIL'}  (人话判定={is_human})")
    page.screenshot(path=f"{OUT}/tc804-forced-fail.png")

    log("\n=== 控制台错误（仅 error 级）===")
    log(errors if errors else "  (无)")
    browser.close()
log("\nDONE")

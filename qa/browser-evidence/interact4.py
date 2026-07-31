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

    def modal_text():
        return page.locator('div.fixed.inset-0.z-50').inner_text()

    log("=== 打开 /assistant ===")
    page.goto(BASE + "/assistant", wait_until="networkidle")
    page.get_by_role("button", name="接口设置").click()
    baseurl_input().wait_for(state="visible", timeout=10000)
    log("面板已打开")

    # ---------- TC-801 表单随供应商切换 ----------
    log("\n=== TC-801 供应商切换 → 表单字段跟随变化 ===")
    page.get_by_role("button", name="科大讯飞 星火").click()
    page.wait_for_timeout(400)
    spark_base = baseurl_input().input_value()
    log(f"  星火  : baseUrl='{spark_base}'")

    page.get_by_role("button", name="agnes").click()
    page.wait_for_timeout(400)
    agnes_base = baseurl_input().input_value()
    log(f"  agnes : baseUrl='{agnes_base}'")

    page.get_by_role("button", name="自定义接口").click()
    page.wait_for_timeout(400)
    custom_base = baseurl_input().input_value()
    log(f"  自定义: baseUrl='{custom_base}'")

    differs = (spark_base != agnes_base) or (agnes_base != custom_base) or (spark_base != custom_base)
    log(f"  >> 三者 BaseURL 至少两个不同? {differs}  → TC-801 {'PASS' if differs else 'FAIL'}")
    page.screenshot(path=f"{OUT}/tc801-form-switch.png")

    # ---------- TC-804 星火无有效 Key → 失败人话 ----------
    log("\n=== TC-804 星火 测试连接（预期失败 + 人话）===")
    page.get_by_role("button", name="科大讯飞 星火").click()
    page.wait_for_timeout(300)
    page.get_by_role("button", name="测试连接").click()
    ok = None
    res_text = "(无)"
    try:
        page.locator("text=连接成功").first.wait_for(timeout=25000)
        res_text = page.locator("text=连接成功").first.inner_text()
        ok = True
    except Exception:
        try:
            page.locator("text=连接失败").first.wait_for(timeout=6000)
            res_text = page.locator("text=连接失败").first.inner_text()
            ok = False
        except Exception:
            res_text = "(等待超时无结果)"
    log(f"  星火测试结果: ok={ok} 文本='{res_text}'")
    log(f"  >> TC-804 {'PASS' if (ok is False and '连接失败' in res_text) else 'CHECK'}  (需人话而非堆栈)")
    page.screenshot(path=f"{OUT}/tc804-result.png")

    log("\n=== 控制台错误 ===")
    log(errors if errors else "  (无)")
    browser.close()
log("\nDONE")

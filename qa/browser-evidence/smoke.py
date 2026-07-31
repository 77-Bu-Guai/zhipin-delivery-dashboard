from playwright.sync_api import sync_playwright

BASE = "http://localhost:5174"
ROUTES = ["/", "/dashboard", "/today", "/deductions", "/categories", "/export", "/assistant"]
errors = []

def log(*a):
    print(*a, flush=True)

with sync_playwright() as p:
    browser = p.chromium.launch(channel="chrome", headless=True)
    page = browser.new_page()
    page.set_default_timeout(15000)
    page.on("console", lambda m: errors.append(f"{m.type}: {m.text}") if m.type == "error" else None)
    page.on("pageerror", lambda e: errors.append(f"PAGEERR: {e}"))

    for r in ROUTES:
        err_before = len(errors)
        try:
            page.goto(BASE + r, wait_until="networkidle", timeout=20000)
            page.wait_for_timeout(800)
            txt = page.evaluate("document.body.innerText")
            length = len(txt or "")
            final_url = page.url
            new_err = errors[err_before:]
            status = "OK" if length > 50 else "BLANK?"
            log(f"  {r:14s} -> {final_url.replace(BASE,'') or '/':14s} len={length:5d} {status}  errs={len(new_err)}")
        except Exception as e:
            log(f"  {r:14s} -> EXCEPTION {type(e).__name__}: {str(e)[:80]}")

    log("\n=== 全部控制台/页面错误 ===")
    log(errors if errors else "  (无)")
    browser.close()
log("DONE")

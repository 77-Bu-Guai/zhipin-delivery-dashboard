import time, json, os, re
from playwright.sync_api import sync_playwright

BASE = "http://localhost:5174"
EVID = "E:/Vibe Coding/boss/qa/browser-evidence"
os.makedirs(EVID, exist_ok=True)
log = []
def L(m): log.append(m); print(m)

def val(pg, ph):
    try:
        return pg.get_by_placeholder(ph).input_value()[:60]
    except Exception as e:
        return f"<err:{e}>"

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

    # TC-801 细节：切到 科大讯飞 星火，确认表单 BaseURL/Model 变化
    L("=== TC-801 表单切换细节 ===")
    pg.get_by_text("agnes", exact=True).click(); time.sleep(0.6)
    agnes_url = val(pg, "接口地址 Base URL"); agnes_model = val(pg, "模型 Model")
    L(f"  agnes  -> BaseURL='{agnes_url}' Model='{agnes_model}'")
    pg.get_by_text("科大讯飞 星火", exact=True).click(); time.sleep(0.6)
    xh_url = val(pg, "接口地址 Base URL"); xh_model = val(pg, "模型 Model")
    L(f"  星火  -> BaseURL='{xh_url}' Model='{xh_model}'")
    L(f"  -> 切换前后 BaseURL 不同? {agnes_url != xh_url}")
    pg.screenshot(path=f"{EVID}/tc801-detail-xinghuo.png")

    # TC-804 星火测试连接（无 key，应给人话错误）
    L("=== TC-804 星火 测试连接（失败人话）===")
    try:
        pg.get_by_text("测试连接", exact=True).click()
    except Exception as e:
        L(f"  点击测试连接失败(可能正测试中): {e}")
    # 轮询结果
    result = ""
    for i in range(10):
        time.sleep(2)
        t = pg.locator("body").inner_text()
        # 截取 测试连接 附近
        idx = t.find("测试连接")
        seg = t[idx-300:idx+500] if idx >= 0 else t[-800:]
        if "连接成功" in seg or "失败" in seg or "错误" in seg or "无法" in seg or "超时" in seg:
            result = seg.replace("\n", " ⏎ ")
            L(f"  [t={i*2}s] 结果片段: {result}")
            break
        if i == 9:
            L(f"  [轮询结束] 片段: {seg.replace(chr(10),' ⏎ ')}")
    pg.screenshot(path=f"{EVID}/tc804-xinghuo-detail.png")
    L("CONSOLE_ERR: " + json.dumps(errs, ensure_ascii=False))
    with open(EVID + "/interact3.log", "w", encoding="utf-8") as f:
        f.write("\n".join(log))
    b.close()

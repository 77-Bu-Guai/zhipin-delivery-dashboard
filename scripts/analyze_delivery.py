#!/usr/bin/env python3
"""BOSS投递数据分析脚本 - 阶段1：生成结构化分析报告 v2"""
import json
import os
import re
from datetime import datetime, timezone, timedelta

# ============ 路径配置 ============
DATA_FILE = r"E:\Vibe Coding\boss\public\extension-data.json"
TRACKER_FILE = r"E:\Vibe Coding\boss\scripts\.analyze_tracker.json"
REPORT_DIR = r"C:\Users\86136\Desktop\提示词"
TODAY = datetime.now().strftime("%Y-%m-%d")
REPORT_FILE = os.path.join(REPORT_DIR, f"提示词分析报告_{TODAY}.txt")

# ============ 步骤1：读取追踪文件 ============
with open(TRACKER_FILE, "r", encoding="utf-8") as f:
    tracker = json.load(f)
last_analyzed_count = tracker.get("last_analyzed_count", 0)
print(f"[步骤1] last_analyzed_count = {last_analyzed_count}")

# ============ 步骤2：读取并切片数据 ============
with open(DATA_FILE, "r", encoding="utf-8") as f:
    raw_data = json.load(f)

data = raw_data.get("pipeline-cache", {}).get("data", {})
print(f"[步骤2] 总记录数: {len(data)}")

def normalize_created_at(ts):
    if isinstance(ts, (int, float)):
        return datetime.fromtimestamp(ts / 1000, tz=timezone.utc)
    elif isinstance(ts, str):
        ts_clean = ts.replace("Z", "+00:00")
        return datetime.fromisoformat(ts_clean)
    return None

records = []
for encrypt_id, record in data.items():
    dt = normalize_created_at(record.get("createdAt"))
    if dt is None:
        continue
    records.append({
        "encryptJobId": encrypt_id,
        "jobName": record.get("jobName", ""),
        "brandName": record.get("brandName", ""),
        "status": record.get("status", ""),
        "message": record.get("message", ""),
        "processorType": record.get("processorType", ""),
        "createdAt": dt,
        "_source": record.get("_source", ""),
    })

records.sort(key=lambda r: r["createdAt"])
total_count = len(records)
print(f"[步骤2] 排序后总记录数: {total_count}")

if last_analyzed_count >= total_count:
    print("[步骤2] 无新数据，跳过分析")
    report_lines = [
        "===报告头部===",
        f"报告生成时间：{datetime.now().strftime('%Y-%m-%d %H:%M')}",
        "数据时间范围：无新数据",
        "本次新增记录数：0条",
        f"累计总记录数：{total_count}条（上次已分析过{last_analyzed_count}条）",
        "",
        "无新数据，跳过分析",
    ]
    os.makedirs(REPORT_DIR, exist_ok=True)
    with open(REPORT_FILE, "w", encoding="utf-8") as f:
        f.write("\n".join(report_lines))
    print(f"报告已写入: {REPORT_FILE}")
    exit(0)

new_records = records[last_analyzed_count:]
print(f"[步骤2] 本次新增记录数: {len(new_records)}")

earliest = new_records[0]["createdAt"]
latest = new_records[-1]["createdAt"]
tz_cn = timezone(timedelta(hours=8))

def fmt_dt(dt):
    return dt.astimezone(tz_cn).strftime("%Y-%m-%d %H:%M")

# ============ 步骤3：解析评分详情 ============
def parse_score_from_message(message):
    match = re.search(r"分数\s*(-?\d+)", message)
    if match:
        return int(match.group(1))
    return None

def parse_reasons(message, section="积极"):
    reasons = []
    if section == "积极":
        # 找到积极: 到 消极: 或 字符串末尾
        m = re.search(r"积极:\s*\n(.*?)(?:\n消极:|\Z)", message, re.DOTALL)
    else:
        # 找到消极: 到 积极: 或 字符串末尾
        m = re.search(r"消极:\s*\n(.*?)(?:\n积极:|\Z)", message, re.DOTALL)
    
    if not m:
        return reasons
    
    section_text = m.group(1).strip()
    if not section_text:
        return reasons
    
    for line in section_text.split("\n"):
        line = line.strip()
        if not line:
            continue
        # 格式: JD写：keyword/(±XX分)
        match = re.match(r"JD写：(.+?)/([-+]?\d+)分", line)
        if match:
            keyword = match.group(1).strip()
            score_val = int(match.group(2))
            reasons.append({
                "keyword": keyword,
                "score": score_val,
                "raw": line
            })
    return reasons

scored_records = []
all_new_success = 0
all_new_ai_filtered = 0
all_new_amap = 0
all_new_no_score = 0
all_new_other_status = 0

deduction_reasons = {}
bonus_reasons = {}
all_scores = []

for rec in new_records:
    status = rec["status"]
    
    if status == "success":
        all_new_success += 1
        msg = rec.get("message", "")
        score = parse_score_from_message(msg)
        
        if score is not None:
            pos_reasons = parse_reasons(msg, "积极")
            neg_reasons = parse_reasons(msg, "消极")
            
            scored_entry = {**rec, "score": score, "_pos_reasons": pos_reasons, "_neg_reasons": neg_reasons}
            scored_records.append(scored_entry)
            all_scores.append(score)
            
            for r in pos_reasons:
                kw = r["keyword"]
                if kw not in bonus_reasons:
                    bonus_reasons[kw] = {"count": 0, "total_score": 0}
                bonus_reasons[kw]["count"] += 1
                bonus_reasons[kw]["total_score"] += r["score"]
            
            for r in neg_reasons:
                kw = r["keyword"]
                if kw not in deduction_reasons:
                    deduction_reasons[kw] = {"count": 0, "total_score": 0}
                deduction_reasons[kw]["count"] += 1
                deduction_reasons[kw]["total_score"] += r["score"]
            
            # DEBUG
            print(f"  [评分] {rec['jobName']} | {rec['brandName']} | {score}分 | 加分{len(pos_reasons)}条 | 扣分{len(neg_reasons)}条")
        elif "投递成功" in msg or "成功" in msg:
            all_new_no_score += 1
        else:
            all_new_no_score += 1
    elif status in ("warn", "warning", "danger"):
        all_new_other_status += 1
        pt = rec.get("processorType", "")
        if pt == "aiFiltering":
            all_new_ai_filtered += 1
        elif pt == "amap":
            all_new_amap += 1

print(f"[步骤3] 评分记录: {len(scored_records)}, 加分keyword种类: {len(bonus_reasons)}, 扣分keyword种类: {len(deduction_reasons)}")

# ============ 步骤4：生成报告 ============
report_lines = []

report_lines.append("===报告头部===")
report_lines.append(f"报告生成时间：{datetime.now().strftime('%Y-%m-%d %H:%M')}")
report_lines.append(f"数据时间范围：{fmt_dt(earliest)} ~ {fmt_dt(latest)}")
report_lines.append(f"本次新增记录数：{len(new_records)}条（含所有status类型）")
report_lines.append(f"累计总记录数：{total_count}条（上次已分析过{last_analyzed_count}条）")
report_lines.append(f"本次新增评分记录数：{len(scored_records)}条（success且有分数）")
report_lines.append("")

report_lines.append("===总体概览===")
report_lines.append(f"新增成功投递：{all_new_success}条")
report_lines.append(f"新增AI筛选拦截：{all_new_ai_filtered}条")
report_lines.append(f"新增地址过滤：{all_new_amap}条")
report_lines.append(f"新增无评分投递：{all_new_no_score}条（success但message仅有投递成功无分数信息）")
report_lines.append(f"新增其他状态：{all_new_other_status}条（warn/warning/danger等）")
report_lines.append("")

report_lines.append("===分数分布===")
if all_scores:
    n = len(all_scores)
    buckets = {
        ">=50分 高分稳过": 0,
        "10~49分 中等": 0,
        "0~9分 低分擦边": 0,
        "-100~-1分 轻度扣分": 0,
        "-500~-101分 中度扣分": 0,
        "<-500分 绝杀": 0,
    }
    for s in all_scores:
        if s >= 50:
            buckets[">=50分 高分稳过"] += 1
        elif s >= 10:
            buckets["10~49分 中等"] += 1
        elif s >= 0:
            buckets["0~9分 低分擦边"] += 1
        elif s >= -100:
            buckets["-100~-1分 轻度扣分"] += 1
        elif s >= -500:
            buckets["-500~-101分 中度扣分"] += 1
        else:
            buckets["<-500分 绝杀"] += 1
    for label, count in buckets.items():
        pct = round(count / n * 100, 1)
        report_lines.append(f"{label}：{count}条（{pct}%）")
else:
    report_lines.append("无评分记录")
report_lines.append("")

report_lines.append("===各阈值通过率===")
if scored_records:
    n = len(scored_records)
    for t in [50, 10, 0, -10, -30]:
        passed = sum(1 for r in scored_records if r["score"] >= t)
        pct = round(passed / n * 100, 1)
        report_lines.append(f">={t}分：{pct}%（{n}条中有{passed}条）")
else:
    for t in [50, 10, 0, -10, -30]:
        report_lines.append(f">={t}分：N/A（0条中有0条）")
report_lines.append("")

report_lines.append("===扣分TOP20===")
deduction_sorted = sorted(deduction_reasons.items(), key=lambda x: x[1]["count"], reverse=True)[:20]
if deduction_sorted:
    for kw, info in deduction_sorted:
        avg = round(info["total_score"] / info["count"], 1)
        report_lines.append(f"{kw} | {info['count']}次 | {info['total_score']}分 | 平均{avg}分")
else:
    report_lines.append("无扣分记录")
report_lines.append("")

report_lines.append("===加分TOP20===")
bonus_sorted = sorted(bonus_reasons.items(), key=lambda x: x[1]["count"], reverse=True)[:20]
if bonus_sorted:
    for kw, info in bonus_sorted:
        report_lines.append(f"{kw} | {info['count']}次 | {info['total_score']}分")
else:
    report_lines.append("无加分记录")
report_lines.append("")

report_lines.append("===误判检测（严重bug，重点标注）===")
user_strengths = ["粤语", "通信", "项目管理", "跨部门", "AI", "Python", "Java", "SQL", "飞书", "公益", "会议纪要", "活动策划"]
misjudge_found = 0

for kw in user_strengths:
    matches = []
    for rec in scored_records:
        neg_kws = [r["keyword"] for r in rec.get("_neg_reasons", [])]
        for nk in neg_kws:
            if kw in nk:
                matches.append({
                    "jobName": rec["jobName"],
                    "brandName": rec["brandName"],
                    "reason_raw": nk,
                })
    if matches:
        misjudge_found += 1
        report_lines.append(f"关键词：{kw}")
        report_lines.append(f"出现在消极区的记录数：{len(matches)}次")
        report_lines.append("典型案例（最多3例）：")
        for m in matches[:3]:
            report_lines.append(f"  {m['jobName']} | {m['brandName']} | {m['reason_raw']}")
        report_lines.append("")
    else:
        report_lines.append(f"关键词：{kw} -- 未发现误判")
        report_lines.append("")
report_lines.append("")

report_lines.append("===目标岗位表现===")
TARGET_KEYWORDS = ["产品助理", "项目助理", "AI产品", "技术支持", "售前", "实施", "管培", "产品经理", "项目经理", "项目专员", "数据运营", "数据标注", "数据分析"]

target_scored = []
for rec in scored_records:
    jn = rec.get("jobName", "")
    for tk in TARGET_KEYWORDS:
        if tk in jn:
            target_scored.append(rec)
            break

if target_scored:
    target_scored_sorted = sorted(target_scored, key=lambda r: r["score"], reverse=True)
    report_lines.append("目标岗通过TOP10（分数最高10个）：")
    for r in target_scored_sorted[:10]:
        pos_kws = [p["keyword"] for p in r.get("_pos_reasons", [])[:3]]
        pos_str = " | ".join(pos_kws) if pos_kws else "无加分"
        report_lines.append(f"{r['jobName']} | {r['brandName']} | {r['score']}分 | {pos_str}")
    report_lines.append("")
    
    killed = [r for r in target_scored if r["score"] < -500]
    report_lines.append("目标岗被绝杀（分数<-500）：")
    if killed:
        killed_sorted = sorted(killed, key=lambda r: r["score"])
        for r in killed_sorted:
            neg_kws = [p["keyword"] for p in r.get("_neg_reasons", [])[:3]]
            neg_str = " | ".join(neg_kws) if neg_kws else "无扣分"
            report_lines.append(f"{r['jobName']} | {r['brandName']} | {r['score']}分 | {neg_str}")
    else:
        report_lines.append("无")
    report_lines.append("")
    
    passed_target = sum(1 for r in target_scored if r["score"] >= 0)
    pct_target = round(passed_target / len(target_scored) * 100, 1)
    report_lines.append(f"目标岗整体通过率：{pct_target}%（{len(target_scored)}条中有{passed_target}条）")
else:
    report_lines.append("目标岗无评分记录")
report_lines.append("")

report_lines.append("===数据异常标记===")
if scored_records:
    high_anomalies = [r for r in scored_records if r["score"] > 500]
    if high_anomalies:
        report_lines.append(f"分数异常高（>500）的记录：共{len(high_anomalies)}条")
        for r in high_anomalies:
            report_lines.append(f"  {r['jobName']} | {r['brandName']} | {r['score']}分")
    else:
        report_lines.append("分数异常高（>500）：无")
    
    low_anomalies = [r for r in scored_records if r["score"] < -1000]
    if low_anomalies:
        report_lines.append(f"分数异常低（<-1000）的记录：共{len(low_anomalies)}条")
        for r in low_anomalies:
            report_lines.append(f"  {r['jobName']} | {r['brandName']} | {r['score']}分")
    else:
        report_lines.append("分数异常低（<-1000）：无")
else:
    report_lines.append("无评分记录，跳过异常检测")

report_lines.append("")
report_lines.append("===报告结束===")

report_text = "\n".join(report_lines)

os.makedirs(REPORT_DIR, exist_ok=True)
with open(REPORT_FILE, "w", encoding="utf-8") as f:
    f.write(report_text)
print(f"[步骤5] 报告已写入: {REPORT_FILE}")

# ============ 步骤6：更新追踪文件 ============
avg_score = round(sum(all_scores) / len(all_scores), 1) if all_scores else 0
pass_rate_0 = round(sum(1 for s in all_scores if s >= 0) / len(all_scores) * 100, 1) if all_scores else 0

tracker["last_analyzed_count"] = total_count
tracker["history"].append({
    "time": datetime.now().strftime("%Y-%m-%d %H:%M"),
    "records_analyzed": len(new_records),
    "total_records": total_count,
    "avg_score": avg_score,
    "pass_rate_0": pass_rate_0,
})

with open(TRACKER_FILE, "w", encoding="utf-8") as f:
    json.dump(tracker, f, ensure_ascii=False, indent=2)
print(f"[步骤6] 追踪文件已更新: last_analyzed_count = {total_count}")

print()
print("=" * 60)
print("分析完成摘要")
print("=" * 60)
print(f"报告路径：{REPORT_FILE}")
print(f"新增记录数：{len(new_records)}条")
print(f"评分记录数：{len(scored_records)}条")
print(f"平均分：{avg_score}")
print(f">=0通过率：{pass_rate_0}%")
print(f"发现误判数：{misjudge_found}个关键词")
print(f"扣分TOP3：{', '.join([kw for kw, _ in deduction_sorted[:3]]) if deduction_sorted else '无'}")
print(f"加分TOP3：{', '.join([kw for kw, _ in bonus_sorted[:3]]) if bonus_sorted else '无'}")
print("=" * 60)

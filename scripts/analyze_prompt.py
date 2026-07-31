"""
提示词分析报告生成器
分析 extension-data.json 中的AI评分数据，输出结构化分析报告
追踪分析进度，下次只分析新数据
"""
import json, os, re
from datetime import datetime, timezone, timedelta
from collections import Counter

DATA_FILE = r"E:\Vibe Coding\boss\public\extension-data.json"
TRACK_FILE = r"E:\Vibe Coding\boss\scripts\.analyze_tracker.json"
PROMPT_FILE = r"C:\Users\86136\Desktop\提示词v2-优化版.txt"
OUTPUT_DIR = r"C:\Users\86136\Desktop\提示词"

tz_cn = timezone(timedelta(hours=8))

# ===== 追踪进度 =====
def load_tracker():
    if os.path.exists(TRACK_FILE):
        with open(TRACK_FILE, 'r', encoding='utf-8') as f:
            return json.load(f)
    return {"last_analyzed_count": 0, "history": []}

def save_tracker(tracker):
    os.makedirs(os.path.dirname(TRACK_FILE), exist_ok=True)
    with open(TRACK_FILE, 'w', encoding='utf-8') as f:
        json.dump(tracker, f, ensure_ascii=False, indent=2)

# ===== 数据加载 =====
def load_data():
    with open(DATA_FILE, 'r', encoding='utf-8') as f:
        return json.load(f)

def parse_ts(val):
    if isinstance(val, str) and 'T' in val:
        return datetime.fromisoformat(val.replace('Z', '+00:00'))
    elif isinstance(val, (int, float)):
        return datetime.fromtimestamp(val / 1000, tz=timezone.utc)
    return None

# ===== 分析逻辑 =====
def analyze(data, tracker):
    d = data['pipeline-cache']['data']
    total = len(d)
    last_count = tracker.get("last_analyzed_count", 0)
    
    if total <= last_count:
        return None  # No new data
    
    # Get all records since last analysis
    all_recs = list(d.values())
    new_recs = all_recs[last_count:] if last_count > 0 else all_recs
    
    # Basic stats on NEW records
    success = sum(1 for v in new_recs if v.get('message') == '投递成功')
    ai_filter = sum(1 for v in new_recs if v.get('message') == 'AI筛选')
    basic = sum(1 for v in new_recs if v.get('message') in ('活跃度过滤', '工作地址筛选'))
    error = sum(1 for v in new_recs if '错误' in str(v.get('message', '')))
    inactive = sum(1 for v in new_recs if '不活跃' in str(v.get('message', '')))
    distance = sum(1 for v in new_recs if '距离超标' in str(v.get('message', '')))
    
    # Score analysis on new records
    scores = []
    for v in new_recs:
        msg = v.get('message', '')
        if msg.startswith('分数'):
            try:
                s = float(msg.split('\n')[0].replace('分数', ''))
                if s == s:
                    scores.append((s, v))
            except:
                pass
    
    if not scores:
        tracker["last_analyzed_count"] = total
        save_tracker(tracker)
        return None
    
    # Score distribution
    avg_score = sum(s[0] for s in scores) / len(scores)
    sorted_scores = sorted(s[0] for s in scores)
    median = sorted_scores[len(sorted_scores) // 2]
    
    buckets = Counter()
    for s, _ in scores:
        if s >= 50: buckets['>=50(稳过)'] += 1
        elif s >= 10: buckets['10~49(边缘过)'] += 1
        elif s >= 0: buckets['0~9(临界)'] += 1
        elif s >= -100: buckets['-100~-1(可抢救)'] += 1
        elif s >= -500: buckets['-500~-101(中度扣)'] += 1
        else: buckets['<-500(绝杀)'] += 1
    
    for th in [10, 0, -10, -30]:
        buckets[f'通过率(阈值>={th})'] = sum(1 for s, _ in scores if s >= th)
    
    # Deduction patterns
    deductions = Counter()
    ded_score_map = {}  # reason -> list of scores
    for s, v in scores:
        msg = v.get('message', '')
        try:
            neg_text = msg.split('积极:', 1)[0].replace('消极:', '')
        except:
            continue
        for line in neg_text.split('\n'):
            if 'JD写：' in line and '/(' in line:
                try:
                    sc = int(line.split('/(')[1].split('分)')[0])
                    reason = line.split('JD写：')[1].split('，')[0][:80]
                    deductions[reason] += 1
                    if reason not in ded_score_map:
                        ded_score_map[reason] = []
                    ded_score_map[reason].append(sc)
                except:
                    pass
    
    # Bonus patterns
    bonuses = Counter()
    for s, v in scores:
        msg = v.get('message', '')
        if '积极:' not in msg:
            continue
        pos_text = msg.split('积极:', 1)[1]
        for line in pos_text.split('\n'):
            if 'JD写：' in line and '/(' in line:
                try:
                    sc = int(line.split('/(')[1].split('分)')[0])
                    reason = line.split('JD写：')[1].split('，')[0][:80]
                    bonuses[reason] += 1
                except:
                    pass
    
    # Misclassification check: user strengths in negative section
    user_strengths = {
        '粤语': '粤语母语(应加分)',
        '通信': '本专业(应加分)',
        '项目管理': '核心能力(应加分)',
        '跨部门': '核心能力(应加分)',
        '智能体|Agent|RAG|大模型|Python|Java|SQL|飞书|SOP|公益|志愿者|NGO': '经历匹配(应加分)',
    }
    
    misclass = Counter()
    misclass_examples = []
    for s, v in scores:
        msg = v.get('message', '')
        try:
            neg_text = msg.split('积极:', 1)[0]
        except:
            continue
        for kw, label in user_strengths.items():
            for k in kw.split('|'):
                if k in neg_text:
                    misclass[label] += 1
                    if len(misclass_examples) < 5:
                        misclass_examples.append({
                            'job': f"{v.get('brandName','')} - {v.get('jobName','')}",
                            'keyword': k,
                            'score': s
                        })
                    break
    
    # Target job analysis
    target_kw = ['产品助理', '项目助理', 'AI产品', '技术支持', '售前', '实施', '管培', '储备干部', '产品经理', '项目经理', '项目专员']
    target_pass = []
    target_kill = []
    for s, v in scores:
        job = v.get('jobName', '')
        if not any(k in job for k in target_kw):
            continue
        if s >= 0:
            target_pass.append((s, v))
        elif s <= -500:
            target_kill.append((s, v))
    
    # Build report
    now = datetime.now(tz_cn).strftime('%Y-%m-%d %H:%M')
    report_date = datetime.now(tz_cn).strftime('%Y-%m-%d')
    
    report = []
    report.append(f"=== 提示词分析报告 ===\n生成时间: {now}\n分析范围: 第{last_count+1}条 至 第{total}条 (共{len(new_recs)}条新记录)")
    report.append(f"\n--- 一、核心指标 ---")
    report.append(f"新增记录数: {len(new_recs)}")
    report.append(f"新增评分记录数: {len(scores)}")
    report.append(f"平均分: {avg_score:.0f}")
    report.append(f"中位数: {median:.0f}")
    report.append(f"\n--- 二、分数分布 ---")
    for k, v in buckets.items():
        if '通过率' in k:
            pct = v / len(scores) * 100 if scores else 0
            report.append(f"{k}: {v} ({pct:.1f}%)")
        else:
            pct = v / len(scores) * 100 if scores else 0
            report.append(f"{k}: {v}条 ({pct:.1f}%)")
    
    report.append(f"\n--- 三、扣分TOP15 ---")
    for (reason, cnt) in deductions.most_common(15):
        avg_ded = sum(ded_score_map.get(reason, [0])) / max(len(ded_score_map.get(reason, [])), 1)
        report.append(f"[{cnt}次,均{avg_ded:.0f}分] {reason}")
    
    report.append(f"\n--- 四、加分TOP15 ---")
    for (reason, cnt) in bonuses.most_common(15):
        report.append(f"[{cnt}次] {reason}")
    
    report.append(f"\n--- 五、可能误判（候选人强项被当成扣分） ---")
    for kw, cnt in misclass.most_common():
        if cnt > 0:
            report.append(f"[{cnt}次] {kw}")
    if misclass_examples:
        report.append(f"\n误判案例:")
        for ex in misclass_examples:
            report.append(f"  [{ex['score']:.0f}分] {ex['job']} - 关键词: {ex['keyword']}")
    
    report.append(f"\n--- 六、目标岗位表现 ---")
    report.append(f"目标岗位通过(>=0分): {len(target_pass)}个")
    report.append(f"目标岗位被绝杀(<=-500): {len(target_kill)}个")
    if target_pass:
        report.append(f"\n高分通过的目标岗位:")
        for s, v in sorted(target_pass, key=lambda x: -x[0])[:10]:
            report.append(f"  [{s:.0f}] {v.get('brandName','')} - {v.get('jobName','')}")
    if target_kill:
        report.append(f"\n被绝杀的目标岗位TOP10:")
        for s, v in sorted(target_kill, key=lambda x: x[0])[:10]:
            msg = v.get('message', '')
            ded_text = msg.split('积极:', 1)[0] if '积极:' in msg else msg
            killers = []
            for line in ded_text.split('\n'):
                if '/(1000分)' in line:
                    killers.append(line.strip()[:80])
            report.append(f"  [{s:.0f}] {v.get('brandName','')} - {v.get('jobName','')}")
            for k in killers[:2]:
                report.append(f"    → {k}")
    
    report.append(f"\n--- 七、优化建议 ---")
    report.append(f"1. 检查{len(misclass)}处误判（强项被当扣分），建议强化铁律规则")
    report.append(f"2. 当前通过率约{buckets.get('通过率(阈值>=10)',0)/len(scores)*100:.0f}%，")
    if avg_score < -300:
        report.append(f"   平均分{avg_score:.0f}偏低，建议检查是否有一刀切规则过度使用")
    else:
        report.append(f"   评分分布合理")
    report.append(f"3. 目标岗位绝杀率 {len(target_kill)}/{len(target_pass)+len(target_kill)}，")
    if len(target_kill) > len(target_pass):
        report.append(f"   目标岗被砍多于通过，需检查绝杀规则是否误伤")
    report.append(f"4. 扣分TOP3: {', '.join([r for r,_ in deductions.most_common(3)])}")
    report.append(f"5. 加分TOP1: {bonuses.most_common(1)[0][0] if bonuses else '无'}")
    
    # Update tracker
    tracker["last_analyzed_count"] = total
    tracker["history"].append({
        "time": now,
        "records_analyzed": len(new_recs),
        "avg_score": round(avg_score, 1),
        "pass_rate_10": round(buckets.get('通过率(阈值>=10)', 0) / len(scores) * 100, 1),
    })
    save_tracker(tracker)
    
    return "\n".join(report), report_date


def main():
    try:
        data = load_data()
    except Exception as e:
        print(f"数据加载失败: {e}")
        return
    
    tracker = load_tracker()
    result = analyze(data, tracker)
    
    if result is None:
        print("没有新数据，跳过分析。")
        return
    
    report_text, report_date = result
    filename = f"提示词分析报告_{report_date}.txt"
    filepath = os.path.join(OUTPUT_DIR, filename)
    
    with open(filepath, 'w', encoding='utf-8') as f:
        f.write(report_text)
    
    print(f"报告已保存: {filepath}")
    print(f"分析记录已更新: 已分析至第{tracker['last_analyzed_count']}条")

if __name__ == '__main__':
    main()

import json, re
from collections import Counter, defaultdict

with open('public/extension-data.json', 'r', encoding='utf-8') as f:
    data = json.load(f)

logs = data.get('ai-scoring-logs', [])
pc = data['pipeline-cache']['data']

# ===== Extract all scoring data =====
neg_reasons_all = Counter()
pos_reasons_all = Counter()
neg_score_sum = Counter()
pos_score_sum = Counter()
neg_score_list = defaultdict(list)
pos_score_list = defaultdict(list)

score_entries = []

for log in logs:
    msg = log.get('message', '')
    state = log.get('state', '')
    
    m = re.search(r'分数(-?\d+)', msg)
    total_score = int(m.group(1)) if m else None
    
    neg_items = []
    pos_items = []
    
    in_neg = False
    in_pos = False
    for line in msg.split('\n'):
        line = line.strip()
        if '消极:' in line:
            in_neg = True; in_pos = False; continue
        if '积极:' in line:
            in_neg = False; in_pos = True; continue
        if 'JD写：' not in line:
            continue
        m2 = re.search(r'(JD写：.+?)/\((\d+)分\)', line)
        if not m2:
            m2 = re.search(r'(JD写：.+?)/(\d+)分', line)
        if m2:
            reason = m2.group(1)
            score = int(m2.group(2))
            if in_neg:
                neg_reasons_all[reason] += 1
                neg_score_sum[reason] += score
                neg_score_list[reason].append(score)
                neg_items.append({'reason': reason, 'score': score})
            elif in_pos:
                pos_reasons_all[reason] += 1
                pos_score_sum[reason] += score
                pos_score_list[reason].append(score)
                pos_items.append({'reason': reason, 'score': score})
    
    score_entries.append({
        'jobName': log.get('jobName', ''),
        'companyName': log.get('companyName', ''),
        'state': state,
        'stateName': log.get('state_name', ''),
        'totalScore': total_score,
        'negItems': neg_items,
        'posItems': pos_items
    })

def get_top_reasons(counter, score_sum, score_list, top_n=50):
    results = []
    for reason, cnt in counter.most_common(top_n):
        total = score_sum.get(reason, 0)
        avg = total / cnt if cnt > 0 else 0
        scores = score_list.get(reason, [])
        min_s = min(scores) if scores else 0
        max_s = max(scores) if scores else 0
        results.append({
            'reason': reason,
            'count': cnt,
            'totalScore': total,
            'avgScore': round(avg, 1),
            'minScore': min_s,
            'maxScore': max_s
        })
    return results

top_neg = get_top_reasons(neg_reasons_all, neg_score_sum, neg_score_list, 100)
top_pos = get_top_reasons(pos_reasons_all, pos_score_sum, pos_score_list, 100)
neg_by_impact = sorted(top_neg, key=lambda x: -x['totalScore'])
pos_by_impact = sorted(top_pos, key=lambda x: -x['totalScore'])

success_scores_list = [e['totalScore'] for e in score_entries if e['state'] == 'success' and e['totalScore'] is not None]
warning_scores_list = [e['totalScore'] for e in score_entries if e['state'] == 'warning' and e['totalScore'] is not None]

total_pipeline = len(pc)
by_status = Counter(e.get('status') for e in pc.values())

undefined_count = sum(1 for e in score_entries if any('undefined' in item['reason'] for item in e['negItems'] + e['posItems']))

borderline = [(e['jobName'], e['companyName'], e['totalScore']) 
              for e in score_entries 
              if e['state'] == 'success' and e['totalScore'] is not None and 0 <= e['totalScore'] <= 55]

suspicious_keywords = ['大小周','单休','英语四级','英语六级','CET-4','CET-6','销售','陌拜','实习','加班','996']
suspicious_pos_count = 0
for e in score_entries:
    for item in e['posItems']:
        if any(kw.lower() in item['reason'].lower() for kw in suspicious_keywords):
            suspicious_pos_count += 1

consistency_issues = []
for item in neg_by_impact[:30]:
    if item['minScore'] != item['maxScore'] and item['count'] > 5:
        consistency_issues.append({
            'reason': item['reason'],
            'count': item['count'],
            'min': item['minScore'],
            'max': item['maxScore'],
            'avg': item['avgScore']
        })

result = {
    'summary': {
        'totalPipeline': total_pipeline,
        'successCount': by_status.get('success', 0),
        'warningCount': by_status.get('warning', 0),
        'warnCount': by_status.get('warn', 0),
        'dangerCount': by_status.get('danger', 0),
        'successRate': round(by_status.get('success',0)/total_pipeline*100, 1),
        'filterRate': round(by_status.get('warning',0)/total_pipeline*100, 1),
        'aiScoringLogs': len(logs),
        'successAvgScore': round(sum(success_scores_list)/len(success_scores_list), 0) if success_scores_list else 0,
        'warningAvgScore': round(sum(warning_scores_list)/len(warning_scores_list), 0) if warning_scores_list else 0,
        'successScoreMin': min(success_scores_list) if success_scores_list else 0,
        'successScoreMax': max(success_scores_list) if success_scores_list else 0,
        'warningScoreMin': min(warning_scores_list) if warning_scores_list else 0,
        'warningScoreMax': max(warning_scores_list) if warning_scores_list else 0,
        'undefinedIssues': undefined_count,
        'suspiciousPosCount': suspicious_pos_count,
        'borderlineSuccessCount': len(borderline)
    },
    'topNegativeReasons': neg_by_impact[:30],
    'topPositiveReasons': pos_by_impact[:30],
    'consistencyIssues': consistency_issues[:20],
    'borderlineSuccess': [{'job': b[0], 'company': b[1], 'score': b[2]} for b in borderline[:30]],
    'scoreDistribution': {
        'success': {
            '0-50': sum(1 for s in success_scores_list if 0 <= s <= 50),
            '50-100': sum(1 for s in success_scores_list if 50 < s <= 100),
            '100-150': sum(1 for s in success_scores_list if 100 < s <= 150),
            '150-200': sum(1 for s in success_scores_list if 150 < s <= 200),
            '200-300': sum(1 for s in success_scores_list if 200 < s <= 300),
            '300-500': sum(1 for s in success_scores_list if 300 < s <= 500),
            '500+': sum(1 for s in success_scores_list if s > 500)
        },
        'warning': {
            '<-500': sum(1 for s in warning_scores_list if s < -500),
            '-500~-100': sum(1 for s in warning_scores_list if -500 <= s < -100),
            '-100~0': sum(1 for s in warning_scores_list if -100 <= s < 0),
            '0~50': sum(1 for s in warning_scores_list if 0 <= s < 50),
            '50~100': sum(1 for s in warning_scores_list if 50 <= s < 100)
        }
    }
}

with open('scripts/analysis_result.json', 'w', encoding='utf-8') as f:
    json.dump(result, f, ensure_ascii=False, indent=2)

print("Analysis result saved to scripts/analysis_result.json")
print(f"Summary: {result['summary']}")

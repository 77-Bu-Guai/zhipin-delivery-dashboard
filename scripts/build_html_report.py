import json

with open('scripts/analysis_result.json', 'r', encoding='utf-8') as f:
    d = json.load(f)

s = d['summary']

# Helper to generate table rows
def neg_rows():
    rows = ''
    for i, item in enumerate(d['topNegativeReasons'][:30]):
        severity = '🔴' if item['avgScore'] >= 800 else ('🟠' if item['avgScore'] >= 300 else '🟡')
        inconsistency = ''
        if item['minScore'] != item['maxScore'] and item['count'] > 5:
            inconsistency = ' ⚠️ 不一致'
        rows += f'''<tr>
            <td>{i+1}</td>
            <td>{item['reason']}{inconsistency}</td>
            <td>{item['count']}</td>
            <td>{item['totalScore']:,}</td>
            <td>{item['avgScore']:.0f}</td>
            <td>{item["minScore"]}~{item["maxScore"]}</td>
        </tr>'''
    return rows

def pos_rows():
    rows = ''
    for i, item in enumerate(d['topPositiveReasons'][:30]):
        rows += f'''<tr>
            <td>{i+1}</td>
            <td>{item['reason']}</td>
            <td>{item['count']}</td>
            <td>{item['totalScore']:,}</td>
            <td>{item['avgScore']:.0f}</td>
        </tr>'''
    return rows

def issue_rows():
    issues = [
        ('P1', '🔴 严重', '模板变量泄漏', '"福利"等变量在76条评分中显示为"undefined"，导致评分不准确', '检查模板渲染逻辑，变量为空时跳过'),
        ('P2', '🔴 严重', '同义项未归并', '"大小周"有15+种变体，各变体分数50~5000不一', '增加同义词表/预处理归并'),
        ('P3', '🟠 较高', '英语扣分过重', 'CET-4/英语相关扣分合计15万分，影响230+条目。用户有基础英语阅读能力', '细分英语能力等级，基础读写仅扣-50~-100'),
        ('P4', '🟠 较高', '正负权重悬殊', '正面因子avg=+10，负面因子avg=-1000，1:100比例失配', '提升核心正面匹配至+100~+200'),
        ('P5', '🟠 较高', '分类错位', '710条可疑正面分类（销售/CET/英语四级被归为正面）', '明确销售助理≠纯销售，CET-4不出现在正面'),
        ('P6', '🟠 较高', '低分通过', '66个职位得分0~55分仍然投递成功', '建议success阈值设在≥50'),
        ('P7', '🟡 中等', '福利权重偏低', '五险一金491次仅+8~10分，双休412次仅+18~19分', '双休+50，五险一金+30'),
        ('P8', '🟡 中等', 'AI关键词不足', 'AI相关加分仅命中49次，覆盖率低', '扩展LLM/ML/NLP/知识图谱等关键词'),
        ('P9', '🟡 中等', '"抗压"过度解读', '116+次"抗压"触发狼性文化扣分，多数只是泛泛之词', '仅在明确出现狼性/996连用时才扣分'),
        ('P10', '🟢 轻微', '薪资面议误扣', '168次扣-10分但JD可能已有薪资范围', '改为不加分不扣分'),
    ]
    rows = ''
    for pid, sev, cat, desc, fix in issues:
        rows += f'''<tr>
            <td>{pid}</td><td>{sev}</td><td>{cat}</td><td>{desc}</td><td>{fix}</td>
        </tr>'''
    return rows

html = f'''<!DOCTYPE html>
<html lang="zh-CN">
<head>
<meta charset="UTF-8">
<meta name="viewport" content="width=device-width, initial-scale=1.0">
<title>BOSS直聘提示词优化分析报告</title>
<style>
* {{ margin: 0; padding: 0; box-sizing: border-box; }}
body {{ font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Arial, sans-serif; background: #f0f2f5; color: #1a1a2e; line-height: 1.6; }}
.container {{ max-width: 1200px; margin: 0 auto; padding: 20px; }}
.header {{ background: linear-gradient(135deg, #1a1a2e 0%, #16213e 50%, #0f3460 100%); color: white; padding: 40px; border-radius: 12px; margin-bottom: 24px; }}
.header h1 {{ font-size: 28px; margin-bottom: 8px; }}
.header .meta {{ color: #8892b0; font-size: 13px; }}
.card {{ background: white; border-radius: 12px; padding: 24px; margin-bottom: 20px; box-shadow: 0 1px 3px rgba(0,0,0,0.08); }}
.card h2 {{ font-size: 20px; color: #0f3460; margin-bottom: 16px; padding-bottom: 8px; border-bottom: 2px solid #e8ecf1; }}
.card h3 {{ font-size: 16px; color: #333; margin: 16px 0 8px; }}

.metrics {{ display: grid; grid-template-columns: repeat(auto-fit, minmax(200px, 1fr)); gap: 16px; }}
.metric {{ text-align: center; padding: 20px; border-radius: 10px; }}
.metric .value {{ font-size: 36px; font-weight: 700; }}
.metric .label {{ font-size: 12px; color: #666; margin-top: 4px; }}
.metric.green {{ background: #e8f5e9; }}
.metric.green .value {{ color: #2e7d32; }}
.metric.red {{ background: #fce4ec; }}
.metric.red .value {{ color: #c62828; }}
.metric.blue {{ background: #e3f2fd; }}
.metric.blue .value {{ color: #1565c0; }}
.metric.yellow {{ background: #fff8e1; }}
.metric.yellow .value {{ color: #e65100; }}

table {{ width: 100%; border-collapse: collapse; font-size: 13px; }}
th {{ background: #0f3460; color: white; padding: 10px 12px; text-align: left; font-weight: 600; }}
td {{ padding: 8px 12px; border-bottom: 1px solid #e8ecf1; }}
tr:hover {{ background: #f5f7fa; }}
tr:nth-child(even) {{ background: #fafbfc; }}

.bar {{ display: inline-block; height: 8px; border-radius: 4px; margin-right: 8px; }}
.bar.red {{ background: linear-gradient(90deg, #e53935, #ff8a80); }}
.bar.orange {{ background: linear-gradient(90deg, #fb8c00, #ffcc80); }}
.bar.green {{ background: linear-gradient(90deg, #43a047, #a5d6a7); }}
.bar.blue {{ background: linear-gradient(90deg, #1e88e5, #90caf9); }}

.highlight {{ background: #fff9c4; padding: 2px 4px; border-radius: 3px; }}
.warning-box {{ background: #fff3e0; border-left: 4px solid #ff9800; padding: 12px 16px; margin: 12px 0; border-radius: 0 8px 8px 0; }}
.danger-box {{ background: #fce4ec; border-left: 4px solid #e53935; padding: 12px 16px; margin: 12px 0; border-radius: 0 8px 8px 0; }}
.success-box {{ background: #e8f5e9; border-left: 4px solid #43a047; padding: 12px 16px; margin: 12px 0; border-radius: 0 8px 8px 0; }}

.flow {{ display: flex; gap: 12px; margin: 16px 0; flex-wrap: wrap; }}
.flow-item {{ flex: 1; min-width: 150px; text-align: center; padding: 16px; border-radius: 8px; }}
.flow-item .num {{ font-size: 28px; font-weight: 700; }}
.flow-item .pct {{ font-size: 14px; color: #666; }}
.flow-item .desc {{ font-size: 12px; color: #999; margin-top: 4px; }}

@media print {{ body {{ background: white; }} .card {{ box-shadow: none; border: 1px solid #ddd; }} }}
</style>
</head>
<body>
<div class="container">

<div class="header">
    <h1>📊 BOSS直聘投递数据 — 提示词优化分析报告</h1>
    <div class="meta">
        数据来源：extension-data.json | 导出时间：2026-07-28 | 分析时间：2026-07-29<br>
        分析维度：5275条投递记录 × 4397条AI评分日志 → 提示词工程优化建议
    </div>
</div>

<!-- Section 1: Key Metrics -->
<div class="card">
    <h2>一、流水线全局概况</h2>
    <div class="flow">
        <div class="flow-item" style="background:#e3f2fd">
            <div class="num" style="color:#1565c0">{s['totalPipeline']:,}</div>
            <div class="pct">总岗位数</div>
            <div class="desc">pipeline-cache.data</div>
        </div>
        <div class="flow-item" style="background:#e8f5e9">
            <div class="num" style="color:#2e7d32">{s['successCount']:,}</div>
            <div class="pct">{s['successRate']}%</div>
            <div class="desc">投递成功</div>
        </div>
        <div class="flow-item" style="background:#fce4ec">
            <div class="num" style="color:#c62828">{s['warningCount']:,}</div>
            <div class="pct">{s['filterRate']}%</div>
            <div class="desc">AI自动过滤</div>
        </div>
        <div class="flow-item" style="background:#fff8e1">
            <div class="num" style="color:#e65100">{s['warnCount']}</div>
            <div class="pct">3.4%</div>
            <div class="desc">待人工审核</div>
        </div>
        <div class="flow-item" style="background:#fce4ec">
            <div class="num" style="color:#c62828">{s['dangerCount']}</div>
            <div class="pct">0.1%</div>
            <div class="desc">异常错误</div>
        </div>
    </div>

    <h3>评分核心指标</h3>
    <div class="metrics">
        <div class="metric green">
            <div class="value">{s['successAvgScore']:.0f}</div>
            <div class="label">成功岗位平均分</div>
        </div>
        <div class="metric red">
            <div class="value">{s['warningAvgScore']:.0f}</div>
            <div class="label">过滤岗位平均分</div>
        </div>
        <div class="metric blue">
            <div class="value">{s['successScoreMin']}~{s['successScoreMax']}</div>
            <div class="label">成功分范围</div>
        </div>
        <div class="metric red">
            <div class="value">{s['warningScoreMin']:,}~{s['warningScoreMax']}</div>
            <div class="label">过滤分范围</div>
        </div>
    </div>
    
    <div class="danger-box">
        <strong>⚠️ 核心发现：</strong>仅16.3%的岗位通过筛选，80.2%被AI过滤。成功岗均分212 vs 过滤岗均分-1011，差距巨大。
        但需警惕：有66个得分仅{min(b['score'] for b in d['borderlineSuccess'])}~{max(b['score'] for b in d['borderlineSuccess'])}分的岗位也通过了筛选。
    </div>
</div>

<!-- Section 2: TOP Negative Factors -->
<div class="card">
    <h2>二、负面扣分因子 TOP30（按总扣分影响排序）</h2>
    <p style="color:#666;font-size:13px;margin-bottom:12px">分析高频扣分因子的合理性 → 判断哪些是真正的红线，哪些是AI过度敏感</p>
    <div style="overflow-x:auto">
    <table>
        <tr><th>#</th><th>扣分原因</th><th>出现次数</th><th>总扣分</th><th>平均扣分</th><th>分范围</th></tr>
        {neg_rows()}
    </table>
    </div>
    <div class="warning-box">
        <strong>🔍 关键观察：</strong><br>
        1. <strong>大小周/单休</strong> 是绝对杀手（总扣分216,500），AI识别准确，规则合理<br>
        2. <strong>CET-4/英语要求</strong> 类合计扣分约15万分，但CET-4"-1000"对用户是否过重？用户可阅读技术文档<br>
        3. <strong>同一概念碎片化</strong>：大小周有15+种AI产生的变体描述（大小周制、大小周休息、公司是大小周...），需归并<br>
        4. <strong>"不接受居家办公"</strong> 256次仅-10分，属于轻微噪音<br>
        5. <strong>"福利：undefined"</strong> 24次 → <span class="highlight">模板变量泄漏Bug</span>
    </div>
</div>

<!-- Section 3: TOP Positive Factors -->
<div class="card">
    <h2>三、正面加分因子 TOP30（按总加分影响排序）</h2>
    <div style="overflow-x:auto">
    <table>
        <tr><th>#</th><th>加分原因</th><th>出现次数</th><th>总加分</th><th>平均加分</th></tr>
        {pos_rows()}
    </table>
    </div>
    <div class="success-box">
        <strong>✅ 关键观察：</strong><br>
        1. <strong>"深圳"</strong> 是最大加分源（合计1000+次），用户的核心地理优势被充分利用<br>
        2. <strong>正面因子权重普遍偏低</strong>：大多仅+8~+10分，而负面动辄-1000 → 1个小负面=100个正面<br>
        3. <strong>AI关键词命中率低</strong>：AI/大模型加分仅49次，明显低于预期覆盖率，关键词需扩展<br>
        4. <strong>基础福利加分少</strong>：五险一金491次仅+8~10分，双休412次仅+18~19分
    </div>
</div>

<!-- Section 4: Score Distribution -->
<div class="card">
    <h2>四、评分一致性分析</h2>
    <p style="color:#666;font-size:13px;margin-bottom:12px">同一概念评分差异过大（min≠max且count>5），说明AI对规则理解不一致 → 提示词需更明确的约束</p>
    <div style="overflow-x:auto">
    <table>
        <tr><th>扣分原因</th><th>次数</th><th>最低分</th><th>最高分</th><th>差值</th><th>严重程度</th></tr>
'''
for item in d['consistencyIssues'][:15]:
    diff = item['max'] - item['min']
    sev = '🔴 严重' if diff >= 2000 else ('🟠 较高' if diff >= 500 else '🟡 中等')
    html += f'''<tr>
        <td>{item['reason']}</td>
        <td>{item['count']}</td>
        <td>{item['min']}</td>
        <td>{item['max']}</td>
        <td><strong>{diff}</strong></td>
        <td>{sev}</td>
    </tr>'''

html += '''
    </table>
    </div>
    <div class="danger-box">
        <strong>🚨 最严重的不一致：</strong>
        "大小周"从500分到5000分（10倍差距）、"销售专员"从200分到5000分（25倍差距）、"大小周制"从50分到5000分（100倍差距）。
        这说明AI并非严格按提示词规则执行，而是自行推断。
    </div>
</div>
'''

# Section 5: Issues & Recommendations
html += f'''
<div class="card">
    <h2>五、问题诊断 & 优化建议（按优先级排序）</h2>
    <p style="color:#666;font-size:13px;margin-bottom:12px">基于{s['aiScoringLogs']}条AI评分日志的全面诊断</p>
    <div style="overflow-x:auto">
    <table>
        <tr><th>编号</th><th>严重程度</th><th>问题</th><th>描述</th><th>优化方案</th></tr>
        {issue_rows()}
    </table>
    </div>
</div>

<!-- Section 6: Optimization Priority -->
<div class="card">
    <h2>六、优化执行计划</h2>
    <div class="metrics">
        <div class="metric red">
            <div class="value">P1</div>
            <div class="label">立即可做<br>影响最大</div>
        </div>
        <div class="metric yellow">
            <div class="value">P2</div>
            <div class="label">需要重构<br>工作量中等</div>
        </div>
        <div class="metric blue">
            <div class="value">P3</div>
            <div class="label">精细调优<br>持续迭代</div>
        </div>
    </div>

    <h3>第一优先级（立即执行）</h3>
    <div class="danger-box">
        ✅ P1 修复undefined bug | ✅ P3 调整英语扣分 | ✅ P7 提升核心福利权重<br>
        <small>预期效果：修复76条错误评分，减少15万分英语类无效扣分，提升200+岗位的正向评分</small>
    </div>

    <h3>第二优先级（本周完成）</h3>
    <div class="warning-box">
        ✅ P2 归并同义词 | ✅ P4 平衡正负权重 | ✅ P5 修复分类错位<br>
        <small>预期效果：消除15+种"大小周"变体，正负权重从1:100降至1:10，减少710条分类错位</small>
    </div>

    <h3>第三优先级（持续优化）</h3>
    <div class="success-box">
        ✅ P6 调整过滤阈值 | ✅ P8 扩展AI关键词 | ✅ P9 微调抗压解读 | ✅ P10 去掉薪资面议扣分<br>
        <small>预期效果：提升过滤精准度，扩大AI岗位覆盖率，减少误判</small>
    </div>
</div>

<!-- Section 7: Expected Impact -->
<div class="card">
    <h2>七、预期优化效果</h2>
    <table>
        <tr><th>指标</th><th>当前值</th><th>优化后预期</th><th>改善幅度</th></tr>
        <tr><td>投递成功率</td><td>{s['successRate']}%</td><td>22-28%</td><td>+5~12个百分点</td></tr>
        <tr><td>AI评分日志错误数</td><td>76+710条</td><td>接近0</td><td>消除Bug和分类错位</td></tr>
        <tr><td>评分一致性（大小周）</td><td>50~5000（100x差距）</td><td>500~1000（2x差距）</td><td>50倍改善</td></tr>
        <tr><td>正面/负面权重比</td><td>1:100</td><td>1:10</td><td>10倍改善</td></tr>
        <tr><td>AI岗位识别覆盖率</td><td>49次命中</td><td>预估150+次</td><td>3倍增长</td></tr>
        <tr><td>低分误通过数</td><td>66个</td><td>&lt;10个</td><td>大幅减少</td></tr>
    </table>
</div>

<!-- Footer -->
<div style="text-align:center;color:#999;font-size:12px;padding:20px;margin-top:20px">
    分析报告由自动化工具生成 | 数据来源：BOSS直聘浏览器扩展 extension-data.json<br>
    详细数据请查看同目录下的 Excel 文件：BOSS投递数据_提示词优化分析报告.xlsx
</div>

</div>
</body>
</html>'''

with open('scripts/BOSS提示词优化分析报告.html', 'w', encoding='utf-8') as f:
    f.write(html)
print(f"HTML report saved: scripts/BOSS提示词优化分析报告.html ({len(html):,} chars)")

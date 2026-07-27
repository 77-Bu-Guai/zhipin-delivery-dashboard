const path = require('path');
const fs = require('fs');

const API_KEY = process.env.DEEPSEEK_API_KEY || '';
const API_URL = 'https://api.deepseek.com/chat/completions';
const CACHE_PATH = path.join(__dirname, '..', '.deduction-cache.json');

function loadCache() {
  try { if (fs.existsSync(CACHE_PATH)) return JSON.parse(fs.readFileSync(CACHE_PATH, 'utf-8')); } catch {}
  return {};
}
function saveCache(cache) {
  try { fs.writeFileSync(CACHE_PATH, JSON.stringify(cache, null, 2), 'utf-8'); } catch {}
}

function normalizeReason(reason) {
  return reason
    .replace(/^JD写[：:]\s*/, '')
    .replace(/\s*[（(]\s*\/?\s*\d+\s*分\s*[）)]\s*$/, '')
    .replace(/\s*\/\d+分\s*$/, '')
    .replace(/\/$/, '')
    .replace(/,+/g, '')
    .trim()
    .slice(0, 50);
}

// === 按提示词结构的分类映射 ===
// B.加分
const BONUS_DIRECTION = [/AI|大模型|LLM|Agent|RAG|Python|智能体|机器学习|开发|实施|运维|技术支持|技术岗|海外|出海|教育|公益|NGO|管培|储备|校招|售前|解决方案|客户成功|交付|实施|TOB|SaaS|B端/];
const BONUS_COMPANY = [/知名|上市|龙头|甲方|自研|融资|A轮|产研驱动|垂直|国企|央企|BAT|TMD|外企|新业务|扩张/];
const BONUS_WELFARE = [/五险一金|培训|晋升|双休|年终|13薪|餐补|房补|交通补|试用期全额|年轻|扁平|弹性|不打卡|项目奖金|期权|商保|公积金|薪资结构|包住|不加班|拒996|入职即缴|体检|年金|食堂|三餐|调薪|午休|朝九晚六/];
const BONUS_MATCH = [/跨部门|统筹|活动|志愿者|通信|计算机|电子|应届友好|粤语|学生组织|深圳|宝安|南山|职责≥3/];

// C.扣分
const NEG_BASIC = [/HR|实习|AI视频|AI图片|纯硬件|单休|大小周|996|007|纯算法|UI|美工|教师|培训师|会计|跨境电商|货代/];
const NEG_EXPERIENCE = [/3年\+|CET-4|CET-6|外语岗|英语工作语言|经验.*年|学历|大专|本科|研究生|硕士|博士|留学/];
const NEG_CONDITION = [/驻外|外派|出差|夜班|轮班|倒班|自带电脑|试用期/];
const NEG_SALES = [/陌拜|电话推销|纯BD|电话量|提成导向|狼性|抗压|高强度|末位淘汰|应酬/];
const NEG_RISK = [/无社保|创业未融资|小公司|皮包|传统非数字化|外包|派遣|画饼|猎头代招|成立<1年/];
const NEG_REDFLAG = [/押金|担保|医美|保健品|保险|信贷|强制文化|喊口号|名实脱节|自带客户|自带资源|驾照|JD空话|轮岗|综合岗|薪资面议|培训贷|纯提成无底薪|学历不限.*经理|薪资跨度|面试地≠|随叫随到|急招|主播|直播|3年\+/];

// ===== 按提示词关键词分类（含同义词扩展）=====
const CATEGORY_RULES = [
  // B.加分-方向
  [/AI|大模型|LLM|Agent|RAG|智能体|机器学习|深度学习|Python|提示词/, '加分-方向-AI'],
  [/经历匹配|项目管理|SOP|PMO|跨部门|协调|会议纪要|进度管理|立项/, '加分-方向-经历匹配'],
  [/活动策划|志愿者|展会|统筹|预算控制/, '加分-方向-活动'],
  [/功能模块|API对接|ECharts|Vibe Coding|低代码|全栈|前后端|Java|开发/, '加分-方向-技术岗'],
  [/售前|方案|客户成功|交付|实施/, '加分-方向-售前'],
  [/TOB|SaaS|B端/, '加分-方向-B端'],
  [/管培|储备|校招|应届友好|应届亦可|经验不限.*应届/, '加分-方向-应届友好'],
  [/海外|出海|外贸.*英语|英语.*外贸/, '加分-方向-海外'],
  [/教育|公益|NGO|支教/, '加分-方向-教育公益'],

  // B.加分-公司
  [/知名|上市|龙头|行业领先|独角兽/, '加分-公司-知名大厂'],
  [/甲方|自研|产研驱动|垂直方案/, '加分-公司-甲方自研'],
  [/融资|A轮|B轮|C轮|新业务|扩张/, '加分-公司-融资扩张'],
  [/国企|央企/, '加分-公司-国企央企'],
  [/BAT|TMD|外企|字节|腾讯|阿里|百度|华为/, '加分-公司-知名团队'],

  // B.加分-福利（同义词都要覆盖）
  [/五险一金|社保.*公积金|公积金.*社保|入职缴.*社保/, '加分-福利-五险一金'],
  [/双休|周末双休|5天制|大小周.*双休|五天工作/, '加分-福利-双休'],
  [/年终奖|13薪|双薪|年底双薪|绩效奖|季度奖/, '加分-福利-年终奖金'],
  [/餐补|食堂|包吃|餐饮补贴|下午茶|伙食/, '加分-福利-餐饮'],
  [/房补|交通补|住宿|包住|班车/, '加分-福利-住宿交通'],
  [/试用期全额|试用.*全薪/, '加分-福利-试用期全额'],
  [/年轻|扁平|活力|氛围|团队.*年轻|年轻.*团队/, '加分-福利-团队文化'],
  [/弹性|不打卡|朝九晚六|午休|朝十/, '加分-福利-弹性工时'],
  [/不加班|拒996|拒绝加班|955|不加.*班/, '加分-福利-不加班'],
  [/期权|股票|股权|分红|干股/, '加分-福利-股权激励'],
  [/商保|补充医疗|公积金.*补充|补充.*公积金|年金/, '加分-福利-补充保障'],
  [/培训|晋升|晋升通道|晋升机制|导师.*带教|带教|培训体系/, '加分-福利-培训晋升'],
  [/入职即缴|入职缴纳|入职当月.*社保|入职.*五险/, '加分-福利-入职即缴'],
  [/体检|调薪|三餐/, '加分-福利-额外保障'],

  // B.加分-契合
  [/通信|计算机|电子|信息工程|通信工程/, '加分-契合-专业匹配'],
  [/深圳|宝安|南山|福田|龙华|龙岗|罗湖/, '加分-契合-深圳位置'],
  [/职责≥3|多样职责|多项职责|多方面|多维/, '加分-契合-多维职责'],
  [/学生组织|粤语/, '加分-契合-个人背景'],

  // C.扣分-基础
  [/HR[^a-z]|人力[^a-z]|猎头|招聘.*岗位|人力.*岗/, '扣分-基础-HR岗'],
  [/实习[^生]|实习岗|实习期|实习生/, '扣分-基础-实习岗'],
  [/AI视频|AI图片|AI绘画|AI.*媒体/, '扣分-基础-AI媒体'],
  [/纯硬件|硬件设计|硬件开发|硬件产品|电路|PCB|EDA/, '扣分-基础-纯硬件'],
  [/单休|大小周|一周休一|6天制|5\.5天/, '扣分-基础-单休大小周'],
  [/996|007|加班.*文化|强制.*加班/, '扣分-基础-996加班'],
  [/纯算法|算法工程|算法开发/, '扣分-基础-纯算法'],
  [/UI[^a-z]|美工|平面设计|视觉设计|作品集/, '扣分-基础-UI美工'],
  [/教师|培训师|讲师|教练|教务/, '扣分-基础-教育培训'],
  [/会计|财务[^a-z]|审计|出纳|报税/, '扣分-基础-财务会计'],
  [/跨境电商|货代|外贸|亚马逊|速卖通|Shopee|海外仓|阿里巴巴.*国际/, '扣分-基础-跨境电商'],

  // C.扣分-经验
  [/3年.*经验|经验.*3年|三年.*经验|经验.*三年|5年.*经验|经验.*5年/, '扣分-经验-多年经验'],
  [/CET-4|四级|英语四级/, '扣分-经验-CET4'],
  [/CET-6|六级|英语六级/, '扣分-经验-CET6'],
  [/外语岗|英语工作语言|英语.*工作.*语言|工作.*语言.*英语|外语要求|英文.*能力/, '扣分-经验-外语要求'],

  // C.扣分-条件
  [/驻外|外派/, '扣分-条件-驻外'],
  [/出差.*50%|出差.*大于|频繁出差|需出差|适应出差|出差.*频/, '扣分-条件-出差'],
  [/夜班|轮班|倒班|晚班/, '扣分-条件-夜班轮班'],
  [/自带电脑|自带笔记本/, '扣分-条件-自带电脑'],
  [/试用期.*6月|试用期6月|试用期六个月|半年试用/, '扣分-条件-试用期6月'],

  // C.扣分-销售
  [/陌拜|电话推销|纯BD|电销/, '扣分-销售-推销陌拜'],
  [/电话量.*要求|要求.*电话量|KPI.*电话/, '扣分-销售-电话量'],
  [/末位淘汰|绩效.*淘汰|淘汰.*机制/, '扣分-销售-末位淘汰'],
  [/应酬|陪酒|商务.*应酬/, '扣分-销售-应酬'],
  [/狼性|抗压|高强度|吃苦|打鸡血|奋斗.*文化/, '扣分-销售-狼性高压'],

  // C.扣分-风险
  [/无社保|不交社保|不缴社保|没社保/, '扣分-风险-无社保'],
  [/创业未融资|天使轮|种子轮|未融资.*小|小.*未融资/, '扣分-风险-创业小公司'],
  [/皮包公司|空壳|套牌/, '扣分-风险-皮包公司'],
  [/传统非数字化|传统行业|制造业|工厂|车间/, '扣分-风险-传统行业'],
  [/外包|派遣|第三方编制|劳务派遣/, '扣分-风险-外包派遣'],
  [/画饼|空头支票/, '扣分-风险-画饼'],
  [/猎头代招|猎头.*代|代.*招聘/, '扣分-风险-猎头代招'],
  [/成立.*1年|成立.*不到|新成立|1年.*成立/, '扣分-风险-新公司'],

  // C.扣分-红旗
  [/押金|担保|保证金/ ,'扣分-红旗-押金担保'],
  [/医美|保健品|保险.*推销|信贷|网贷|理财.*推销/, '扣分-红旗-风险行业'],
  [/强制文化|喊口号|洗脑|打鸡血.*文化|军事化/, '扣分-红旗-强制文化'],
  [/名实脱节|岗位名不符|名与.*不符|职责.*不符|岗位.*不符/, '扣分-红旗-名实不符'],
  [/自带客户|自带资源|资源.*自带/, '扣分-红旗-自带资源'],
  [/驾照|驾驶证|C1|C2/, '扣分-红旗-驾照'],
  [/JD空话|JD空洞|JD.*模糊|岗位描述.*空|笼统|不清晰/, '扣分-红旗-JD空话'],
  [/轮岗|综合岗|万能岗/, '扣分-红旗-轮岗'],
  [/薪资面议|工资面议|薪水面议/, '扣分-红旗-薪资面议'],
  [/培训贷/, '扣分-红旗-培训贷'],
  [/纯提成|无底薪|0底薪|底薪.*0/, '扣分-红旗-纯提成'],
  [/学历不限.*经理|学历不限.*总监|学历.*不限.*管理/, '扣分-红旗-低学历高管'],
  [/薪资跨度.*2倍|工资.*跨度.*大|薪资.*范围.*大/, '扣分-红旗-薪资跨度'],
  [/面试地.*工作地|工作地.*面试|面试.*地点.*同/, '扣分-红旗-面试地不符'],
  [/随叫随到|随时.*加班|24小时.*待命/, '扣分-红旗-随叫随到'],
  [/急招|紧急.*招聘|立即.*到岗/, '扣分-红旗-急招'],
  [/主播|直播|带货/, '扣分-红旗-直播'],

  // C.扣分-提成（独立规则，必须在销售之前匹配）
  [/底薪.*提成|提成.*导向|提成.*工资|提成.*薪|底薪加提成|底薪\+提成/, '扣分-提成-底薪加提成'],
  [/销售|推销|客户开发|业务拓展|地推|陌拜/, '扣分-销售-岗位性质'],
  [/提成/, '扣分-提成-底薪加提成'],

  // 补充：常见但未在第一轮覆盖的项目 → 都用模糊匹配兜底
  [/电脑|笔记本|自带.*设备/, '扣分-条件-自带电脑'],
  [/不缴|不交|没.*社保|社保.*不|社保.*没|社保.*停/, '扣分-风险-无社保'],
  [/薪资.*低|低薪|工资.*低|薪资偏低|4-6K|5-6K|3-6K|工资.*偏低/, '扣分-提成-底薪加提成'],
  [/大小周|单休/, '扣分-基础-单休大小周'],
];

function getMergeKey(reason) {
  const s = normalizeReason(reason);
  for (const [re, category] of CATEGORY_RULES) {
    if (re.test(s)) return category;
  }
  return '其他';
}

function extractUniqueReasons(aiScoringLogs) {
  const neg = new Map();
  const pos = new Map();
  for (const log of aiScoringLogs) {
    if (!log.message || !log.message.includes('分数')) continue;
    const negMatch = log.message.match(/消极:\n([\s\S]*?)(?=\n积极:|$)/);
    if (negMatch) {
      for (const line of negMatch[1].split('\n').filter(Boolean)) {
        let r = line;
        const m = line.match(/^(.+?)\s*[（(]\s*\/?\s*(\d+)\s*分\s*[）)]\s*$/);
        const m2 = line.match(/^(.+?)\/(\d+)分$/);
        if (m) r = m[1].trim();
        else if (m2) r = m2[1].trim();
        if (r.length >= 3) { const n = normalizeReason(r); neg.set(n, (neg.get(n) || 0) + 1); }
      }
    }
    const posMatch = log.message.match(/积极:\n([\s\S]*)$/);
    if (posMatch) {
      for (const line of posMatch[1].split('\n').filter(Boolean)) {
        let r = line;
        const m = line.match(/^(.+?)\s*[（(]\s*\/?\s*(\d+)\s*分\s*[）)]\s*$/);
        const m2 = line.match(/^(.+?)\/(\d+)分$/);
        if (m) r = m[1].trim();
        else if (m2) r = m2[1].trim();
        if (r.length >= 3) { const n = normalizeReason(r); pos.set(n, (pos.get(n) || 0) + 1); }
      }
    }
  }
  return { neg, pos };
}

async function classifyAndMerge(aiScoringLogs) {
  if (!API_KEY) { console.log('   N/A 未配置 DEEPSEEK_API_KEY'); return {}; }
  const { neg, pos } = extractUniqueReasons(aiScoringLogs);
  const all = [...neg.keys(), ...pos.keys()];
  if (all.length === 0) return {};

  const highFreq = [], lowFreq = [];
  for (const r of all) {
    const cnt = (neg.get(r) || 0) + (pos.get(r) || 0);
    if (cnt >= 2) highFreq.push({ reason: r, count: cnt });
    else lowFreq.push(r);
  }
  highFreq.sort((a, b) => b.count - a.count);
  const toAI = highFreq.slice(0, 300).map(x => x.reason);
  const restHighFreq = highFreq.slice(300).map(x => x.reason);

  const cache = loadCache();
  const result = {};
  const needClassify = [];

  for (const r of toAI) {
    if (cache[r]) { result[r] = cache[r]; }
    else { needClassify.push(r); }
  }
  for (const r of [...restHighFreq, ...lowFreq]) {
    if (cache[r]) { result[r] = cache[r]; }
    else {
      const s = getMergeKey(r);
      const entry = { mergedKey: s, label: s };
      result[r] = entry;
    }
  }

  if (needClassify.length === 0) { console.log('   全部缓存'); return result; }

  console.log('   AI ' + needClassify.length + ' 条高频项...');
  try {
    const prompt = `对以下投递岗位扣分/加分原因进行同义词合并:
- 意思相同或相近的合并为一组
- 输出JSON对象，键使用原文本，值={"key":"英文唯一键","label":"简短中文标签"}

${needClassify.map(r => `- ${r}`).join('\n')}`;

    const resp = await fetch(API_URL, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${API_KEY}` },
      body: JSON.stringify({
        model: 'deepseek-v4-flash',
        messages: [
          { role: 'system', content: '输出纯JSON，键使用输入中的原文本，不要改文本，不要markdown包裹。' },
          { role: 'user', content: prompt },
        ],
        temperature: 0.1, max_tokens: 2048,
      }),
    });

    if (!resp.ok) { console.log('   API ' + resp.status); }
    else {
      const data = await resp.json();
      const raw = (data.choices?.[0]?.message?.content || '').replace(/```json\s*|\```\s*/g, '').trim();
      let aiResult;
      try { aiResult = JSON.parse(raw); } catch (e) {
        const m = raw.match(/\{[\s\S]*\}/);
        if (m) try { aiResult = JSON.parse(m[0]); } catch {}
      }
      if (aiResult && typeof aiResult === 'object' && !Array.isArray(aiResult)) {
        let ok = 0;
        for (const r of needClassify) {
          // 始终用本地规则确定分类，忽略 AI 给的不同 label（避免 "五险一金" vs "五险一金-基础福利" 一类）
          const category = getMergeKey(r);
          const e = { mergedKey: category, label: category };
          cache[r] = e; result[r] = e; ok++;
        }
        console.log('   OK ' + ok + '/' + needClassify.length + ' 条AI归并');
      }
    }
  } catch (e) { console.log('   ERR ' + e.message); }

  saveCache(cache);
  const keys = Object.values(result).map(v => v.mergedKey);
  console.log('   合并后 ' + new Set(keys).size + ' 类');
  return result;
}

module.exports = { classifyAndMerge, extractUniqueReasons };

/**
 * classify-factors.mjs — 用 讯飞星火 Spark 大模型把 AI 评分中的积极/消极因素各分 20 大类
 *
 * 数据流：
 *   public/extension-data.json (pipeline-cache 中每条记录的 aiScoring.message)
 *     → 解析出所有原始积极/消极因素文本 → 去重
 *     → 批量调 MiMo → 结果写 .factor-cache.json（持久缓存）
 *     → 生成 public/factor-categories.json
 *
 * 增量：缓存按「原始因素文本」存储，重复因素不再调 API；export-logs.cjs 每新增 500 条
 *       投递记录会 spawn 本脚本，只对新增因素做分类。
 *
 * 用法：
 *   node scripts/classify-factors.mjs            # 只分类尚未缓存的因素（增量/全量首跑）
 *   node scripts/classify-factors.mjs --limit 40 # 只处理前 40 个未分类因素（测试）
 *   node scripts/classify-factors.mjs --force    # 忽略缓存，全量重分（慎用，费 token）
 */

import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(__dirname, '..');
const DATA_PATH = path.join(ROOT, 'public', 'extension-data.json');
const CACHE_PATH = path.join(ROOT, '.factor-cache.json');
const OUT_PATH = path.join(ROOT, 'public', 'factor-categories.json');
const LOCK_PATH = path.join(ROOT, '.factor-classify-lock');

// ===== 20 大类定义（贴合应届生 AI/PM 深圳求职场景） =====
const NEGATIVE_CATEGORIES = [
  { name: '硬性条件不符', color: '#dc2626', desc: '学历、专业、经验年限、年龄等硬性门槛不匹配' },
  { name: '工作制度问题', color: '#b91c1c', desc: '大小周、单休、加班严重、996、弹性差' },
  { name: '薪资不匹配', color: '#991b1b', desc: '薪资过低、薪资面议、与期望差距大、无年终奖' },
  { name: '地点通勤问题', color: '#c2410c', desc: '非深圳、工作地点偏远、通勤时间过长' },
  { name: '英语/语言要求', color: '#9a3412', desc: '要求 CET-4/6、英语工作语言、外语能力' },
  { name: '岗位性质不符', color: '#7c2d12', desc: '实习、兼职、外包、劳务派遣、非全职' },
  { name: '行业不匹配', color: '#be123c', desc: '医美、金融、教培、保险、房地产等排斥行业' },
  { name: '岗位职责偏差', color: '#f59e0b', desc: '纯销售、地推、电销、客服、面销、BD' },
  { name: '公司规模/阶段', color: '#d97706', desc: '公司太小、初创风险高、不稳定、成立时间短' },
  { name: '福利待遇缺失', color: '#b45309', desc: '无五险一金、无公积金、福利差' },
  { name: '经验要求过高', color: '#92400e', desc: '要求 3-5 年、5 年以上、资深经验' },
  { name: '技能栈不匹配', color: '#78350f', desc: '技术栈不对、缺少特定工具/语言/框架' },
  { name: '工作内容低端/重复', color: '#ea580c', desc: '数据标注、内容审核、重复劳动、打杂' },
  { name: '企业文化/氛围', color: '#9f1239', desc: '狼性文化、PUA、高压、内卷、压榨' },
  { name: '稳定性差', color: '#701a75', desc: '频繁出差、项目制、短期合同、流动性高' },
  { name: '职业发展受限', color: '#86198f', desc: '晋升窄、学不到东西、成长天花板低' },
  { name: '融资经营状况', color: '#a21caf', desc: '资金链、裁员、亏损、经营风险' },
  { name: '团队管理问题', color: '#7e22ce', desc: '管理混乱、领导风格差、沟通成本高' },
  { name: '虚假招聘/信息不实', color: '#4338ca', desc: '岗位名不符、挂羊头卖狗肉、信息虚假' },
  { name: '其他消极因素', color: '#64748b', desc: '无法归入以上明确类别的消极因素（兜底）' },
];

const POSITIVE_CATEGORIES = [
  { name: '岗位高度匹配', color: '#059669', desc: '岗位与求职者目标、背景完全契合' },
  { name: 'AI/大模型相关', color: '#10b981', desc: 'AI、AIGC、大模型、智能体、深度学习' },
  { name: '产品经理相关', color: '#34d399', desc: 'PM、产品助理、产品专员、产品设计' },
  { name: '项目管理相关', color: '#6ee7b7', desc: '项目助理、项目专员、管培生、协调管理' },
  { name: '数据分析相关', color: '#14b8a6', desc: '数据分析、BI、商业分析、数据产品' },
  { name: '技术/研发友好', color: '#0d9488', desc: '接受技术背景转产品、重视技术理解力' },
  { name: '应届生友好', color: '#22c55e', desc: '接受应届生、无经验可投、校招、培养体系' },
  { name: '深圳本地/区位好', color: '#16a34a', desc: '深圳、南山、福田、交通便利、核心区位' },
  { name: '工作制度好', color: '#15803d', desc: '双休、弹性工作、不加班、WLB' },
  { name: '薪资福利优厚', color: '#ca8a04', desc: '高薪、年终奖、股票期权、项目分红' },
  { name: '社保公积金齐全', color: '#a16207', desc: '五险一金、社保公积金、补充商业险' },
  { name: '成长空间大', color: '#0ea5e9', desc: '培训、导师、晋升明确、能学东西' },
  { name: '公司知名度高', color: '#0284c7', desc: '大厂、名企、上市公司、行业头部' },
  { name: '团队/业务前景好', color: '#0369a1', desc: '新业务、核心部门、业务增长快' },
  { name: '工作氛围好', color: '#6366f1', desc: '扁平管理、年轻团队、人性化、沟通顺畅' },
  { name: '技能栈匹配', color: '#8b5cf6', desc: 'Python、SQL、Axure、Figma、数据分析工具等' },
  { name: '业务方向感兴趣', color: '#a855f7', desc: '游戏、内容、电商、社交、教育等感兴趣方向' },
  { name: '项目经验丰富', color: '#d946ef', desc: '有 0-1 经验、落地项目、完整项目周期' },
  { name: '学历/专业对口', color: '#ec4899', desc: '985/211、计算机、信息管理、工商管理对口' },
  { name: '其他积极因素', color: '#94a3b8', desc: '无法归入以上明确类别的积极因素（兜底）' },
];

const NEGATIVE_NAMES = NEGATIVE_CATEGORIES.map((c) => c.name);
const POSITIVE_NAMES = POSITIVE_CATEGORIES.map((c) => c.name);

// 进程锁
function createLock() {
  if (fs.existsSync(LOCK_PATH)) {
    const pid = fs.readFileSync(LOCK_PATH, 'utf8').trim();
    console.error(`⚠️ 已有 factor 分类进程在运行（PID ${pid}），退出以免重复调用 API`);
    process.exit(0);
  }
  fs.writeFileSync(LOCK_PATH, String(process.pid));
}
function releaseLock() {
  try {
    fs.unlinkSync(LOCK_PATH);
  } catch {
    /* ignore */
  }
}

// ===== 读取密钥 =====
function getApiKey() {
  try {
    const env = fs.readFileSync(path.join(ROOT, '.env.local'), 'utf8');
    const m = env.match(/SPARK_API_KEY=(.+)/);
    if (m) return m[1].trim();
  } catch {
    /* ignore */
  }
  if (process.env.SPARK_API_KEY) return process.env.SPARK_API_KEY;
  throw new Error('未找到 SPARK_API_KEY：请在 .env.local 设置，或 export SPARK_API_KEY=...');
}

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

// ===== 从 extension-data.json 提取所有原始因素文本 =====
function extractFactors() {
  const raw = JSON.parse(fs.readFileSync(DATA_PATH, 'utf8'));
  // ai-scoring-logs 可能是数组或对象（Map 结构）
  const aiScoringRaw = raw['ai-scoring-logs'] || {};
  const records = Array.isArray(aiScoringRaw) ? aiScoringRaw : Object.values(aiScoringRaw);

  const negatives = new Set();
  const positives = new Set();

  for (const record of records) {
    const msg = record.message || '';
    if (!msg || !msg.includes('分数')) continue;

    // 消极因素："消极:" 到 "积极:" 之间
    const negMatch = msg.match(/消极[:：]\n([\s\S]*?)(?=\n积极[:：]|$)/);
    if (negMatch) {
      const lines = negMatch[1].split('\n').filter(Boolean);
      for (const line of lines) {
        const cleaned = line.trim();
        if (!cleaned) continue;
        negatives.add(cleaned);
      }
    }

    // 积极因素："积极:" 到末尾
    const posMatch = msg.match(/积极[:：]\n([\s\S]*)$/);
    if (posMatch) {
      const lines = posMatch[1].split('\n').filter(Boolean);
      for (const line of lines) {
        const cleaned = line.trim();
        if (!cleaned) continue;
        positives.add(cleaned);
      }
    }
  }

  return {
    negatives: [...negatives],
    positives: [...positives],
  };
}

// ===== 调用 MiMo 批量分类 =====
async function callMiMoBatch(items, type, apiKey) {
  const isNeg = type === 'negative';
  const categories = isNeg ? NEGATIVE_CATEGORIES : POSITIVE_CATEGORIES;
  const categoryList = categories.map((c, i) => `${i + 1}. ${c.name}：${c.desc}`).join('\n');
  const typeLabel = isNeg ? '消极因素（扣分项）' : '积极因素（加分项）';
  const system = `你是求职分析专家。以下是固定的 ${categories.length} 个 ${typeLabel} 大类（最后一个是兜底"其他"）：
${categoryList}

规则：
1. 对每个 ${typeLabel} 文本，判断它最属于哪一类，只从以上类别名称中选择，严禁自创类别。
2. 若确实无法归入前 ${categories.length - 1} 个明确类别，才归为"其他"。
3. 输出严格 JSON 数组，格式：[{"text":"原始因素文本","category":"大类名"}]，不要任何额外文字、不要 markdown 代码块。`;
  const user = `请把以下 ${items.length} 条 ${typeLabel} 进行分类（保持 text 字段与输入完全一致）：
${JSON.stringify(items)}`;

  const res = await fetch('https://spark-api-open.xf-yun.com/v1/chat/completions', {
    method: 'POST',
    headers: { 'Authorization': `Bearer ${apiKey}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({
      model: 'lite',
      messages: [
        { role: 'system', content: system },
        { role: 'user', content: user },
      ],
      max_tokens: 2048,
      temperature: 0.1,
      top_p: 0.95,
      stream: false,
    }),
  });

  if (!res.ok) {
    const errText = await res.text().catch(() => '');
    throw new Error(`MiMo API ${res.status}: ${errText.slice(0, 200)}`);
  }

  const data = await res.json();
  const content = data?.choices?.[0]?.message?.content ?? '';
  const jsonMatch = content.match(/\[[\s\S]*\]/);
  if (!jsonMatch) throw new Error('返回中未找到 JSON 数组');
  const parsed = JSON.parse(jsonMatch[0]);
  if (!Array.isArray(parsed)) throw new Error('解析结果非数组');
  return parsed;
}

function normalizeCategory(cat, type) {
  const valid = type === 'negative' ? NEGATIVE_NAMES : POSITIVE_NAMES;
  if (cat && valid.includes(cat)) return cat;
  return '其他' + (type === 'negative' ? '消极因素' : '积极因素');
}

// ===== 主流程 =====
async function main() {
  createLock();
  const args = process.argv.slice(2);
  const LIMIT = args.includes('--limit') ? parseInt(args[args.indexOf('--limit') + 1], 10) : Infinity;
  const FORCE = args.includes('--force');

  if (!fs.existsSync(DATA_PATH)) {
    console.error(`❌ 未找到 ${DATA_PATH}，请先运行 npm run export-data`);
    process.exit(1);
  }

  const apiKey = getApiKey();

  // 加载缓存 { negative: {文本: 类别}, positive: {文本: 类别} }
  let cache = { negative: {}, positive: {} };
  if (!FORCE) {
    try {
      cache = JSON.parse(fs.readFileSync(CACHE_PATH, 'utf8'));
      if (!cache.negative) cache.negative = {};
      if (!cache.positive) cache.positive = {};
    } catch {
      cache = { negative: {}, positive: {} };
    }
  }

  const { negatives, positives } = extractFactors();

  let uncategorizedNeg = negatives.filter((t) => !(t in cache.negative));
  let uncategorizedPos = positives.filter((t) => !(t in cache.positive));
  if (LIMIT !== Infinity) {
    uncategorizedNeg = uncategorizedNeg.slice(0, LIMIT);
    uncategorizedPos = uncategorizedPos.slice(0, LIMIT);
  }

  console.log(
    `📊 消极因素 ${negatives.length} 个 | 已缓存 ${Object.keys(cache.negative).length} | 本次待分类 ${uncategorizedNeg.length}`,
  );
  console.log(
    `📊 积极因素 ${positives.length} 个 | 已缓存 ${Object.keys(cache.positive).length} | 本次待分类 ${uncategorizedPos.length}`,
  );

  const BATCH = 30;

  async function processType(items, type, label) {
    if (items.length === 0) return;
    let processed = 0;
    let okCount = 0;

    for (let i = 0; i < items.length; i += BATCH) {
      const batch = items.slice(i, i + BATCH);
      let results = null;

      for (let attempt = 1; attempt <= 3; attempt++) {
        try {
          results = await callMiMoBatch(batch, type, apiKey);
          break;
        } catch (e) {
          console.warn(`  ⚠️ ${label} 批次 ${i}-${i + batch.length} 第${attempt}次失败: ${e.message}`);
          await sleep(1500 * attempt);
        }
      }

      if (results && results.length) {
        for (const item of results) {
          if (item && item.text && item.category) {
            const norm = normalizeCategory(item.category, type);
            cache[type][item.text] = norm;
            okCount++;
          }
        }
      }

      processed += batch.length;
      fs.writeFileSync(CACHE_PATH, JSON.stringify(cache, null, 2));
      console.log(`  ✅ ${label} ${Math.min(processed, items.length)}/${items.length} 已处理（有效 ${okCount}）`);
      await sleep(400);
    }
  }

  await processType(uncategorizedNeg, 'negative', '消极');
  await processType(uncategorizedPos, 'positive', '积极');

  writeOut(cache);
}

function writeOut(cache) {
  const out = {
    version: 1,
    generatedAt: new Date().toISOString(),
    negativeCategories: NEGATIVE_CATEGORIES,
    positiveCategories: POSITIVE_CATEGORIES,
    negativeMap: cache.negative,
    positiveMap: cache.positive,
  };
  fs.writeFileSync(OUT_PATH, JSON.stringify(out, null, 2));
  console.log(`💾 写出 ${OUT_PATH}（消极 ${Object.keys(cache.negative).length} 条，积极 ${Object.keys(cache.positive).length} 条）`);
}

main()
  .catch((e) => {
    console.error('❌ factor 分类失败:', e.message);
    process.exit(1);
  })
  .finally(() => releaseLock());

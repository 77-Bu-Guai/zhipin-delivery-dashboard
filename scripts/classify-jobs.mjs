/**
 * classify-jobs.mjs — 用 讯飞星火 Spark 大模型按岗位名把所有岗位分 20 大类
 *
 * 数据流：
 *   public/extension-data.json (pipeline-cache 全部岗位名)
 *     → 去重 → 批量调 MiMo → 结果写 .job-category-cache.json（持久缓存）
 *     → 生成 public/job-categories.json（categories 定义 + map: {岗位名: 大类}）
 *
 * 增量：缓存按「岗位名」存储，重复岗位不再调 API；export-logs.cjs 每新增 500 条
 *       投递记录会 spawn 本脚本，只对新增的独特岗位名分类。
 *
 * 用法：
 *   node scripts/classify-jobs.mjs            # 只分类尚未缓存的岗位名（增量/全量首跑）
 *   node scripts/classify-jobs.mjs --limit 40 # 只处理前 40 个未分类岗位名（测试）
 *   node scripts/classify-jobs.mjs --force    # 忽略缓存，全量重分（慎用，费 token）
 */

import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(__dirname, '..');
const DATA_PATH = path.join(ROOT, 'public', 'extension-data.json');
const CACHE_PATH = path.join(ROOT, '.job-category-cache.json');
const OUT_PATH = path.join(ROOT, 'public', 'job-categories.json');
const LOCK_PATH = path.join(ROOT, '.classify-lock');

// ===== 20 大类定义（清晰可控，贴合应届生 AI/PM 深圳求职场景） =====
const CATEGORIES = [
  { name: '产品经理', color: '#a855f7', desc: '产品规划/设计/需求/运营，含产品助理、产品专员、AI产品经理、产品运营、需求分析' },
  { name: '项目助理/项目专员', color: '#06b6d4', desc: '项目管理/协调/跟进/实施，各类助理、行政文职、管培生、储备干部' },
  { name: '游戏相关', color: '#ec4899', desc: '游戏策划/设计/运营/测试/发行/推广/电竞' },
  { name: 'AI内容生成', color: '#14b8a6', desc: 'AI短剧、AI内容生成、AIGC创作、短视频/直播内容生成、数字人' },
  { name: '平台运营', color: '#f97316', desc: '新媒体/用户/社群/活动/电商/直播/内容运营、信息流投放优化' },
  { name: '人工智能/算法', color: '#0ea5e9', desc: '算法/机器学习/NLP/CV/大模型/AIGC研发/数据科学/知识图谱' },
  { name: '数据分析/商业分析', color: '#8b5cf6', desc: '数据分析/BI/经营分析/数据产品/商业分析/数据治理' },
  { name: '技术研发', color: '#3b82f6', desc: '前端/后端/全栈/客户端/架构/运维/DevOps/实施/技术支持/嵌入式' },
  { name: '软件测试/质量保障', color: '#6366f1', desc: '软件测试/QA/测试开发/质量保障/测试执行' },
  { name: '销售/商务', color: '#22c55e', desc: '销售/客户经理/BD/渠道/招商/外贸/商务/售前' },
  { name: '市场营销/品牌', color: '#eab308', desc: '市场/品牌/推广/营销策划/增长/媒介' },
  { name: 'UI/UX/视觉设计', color: '#f43f5e', desc: 'UI/视觉/交互/平面/美工设计' },
  { name: '内容/文案/新媒体编辑', color: '#fb7185', desc: '文案/编辑/新媒体内容/公众号/内容策划（非运营投放）' },
  { name: '人力资源/HR', color: '#f59e0b', desc: '人事/招聘/猎头/HRBP/薪酬绩效/员工关系' },
  { name: '行政/助理/文秘', color: '#64748b', desc: '行政/文员/前台/秘书/档案/总经办助理/后勤' },
  { name: '财务/会计', color: '#10b981', desc: '财务/会计/出纳/审计/税务/核算/资金' },
  { name: '供应链/采购', color: '#0d9488', desc: '采购/供应链/物流/仓储/供应商管理/履约' },
  { name: '客户成功/客服', color: '#84cc16', desc: '客服/售后/客诉/用户成功/客户运营/工单' },
  { name: '研究/战略/咨询', color: '#7c3aed', desc: '行业研究/战略/咨询/商业分析（非数据岗）/调研/投资' },
  { name: '教育培训/其他职能', color: '#0891b2', desc: '培训/教务/教育/其他综合职能/公益' },
  { name: '其他', color: '#94a3b8', desc: '无法归入以上任何类别的岗位（兜底）' },
];

const CATEGORY_NAMES = CATEGORIES.map((c) => c.name);

// 进程锁：防止多个分类进程并发调用 API 造成重复/超额
function createLock() {
  if (fs.existsSync(LOCK_PATH)) {
    const pid = fs.readFileSync(LOCK_PATH, 'utf8').trim();
    console.error(`⚠️ 已有分类进程在运行（PID ${pid}），退出以免重复调用 API`);
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

// ===== 读取密钥（优先 .env.local，其次环境变量） =====
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

// ===== 调用 MiMo 批量分类 =====
async function callMiMoBatch(jobNames, apiKey) {
  const categoryList = CATEGORIES.map((c, i) => `${i + 1}. ${c.name}：${c.desc}`).join('\n');
  const system = `你是岗位分类专家。以下是固定的 ${CATEGORIES.length} 个岗位大类（最后一个是兜底"其他"）：\n${categoryList}\n\n规则：
1. 对每个岗位名，判断它最属于哪一类，只从以上类别名称中选择，严禁自创类别。
2. 若确实无法归入前 ${CATEGORIES.length - 1} 个明确类别，才归为"其他"。
3. 输出严格 JSON 数组，格式：[{"job":"原始岗位名","category":"大类名"}]，不要任何额外文字、不要 markdown 代码块。`;
  const user = `请分类以下 ${jobNames.length} 个岗位名（保持 job 字段与输入完全一致）：\n${JSON.stringify(jobNames)}`;

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

// 校验 category 是否合法，不合法归为"其他"
function normalizeCategory(cat) {
  if (cat && CATEGORY_NAMES.includes(cat)) return cat;
  return '其他';
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

  // 加载缓存
  let cache = {};
  if (!FORCE) {
    try {
      cache = JSON.parse(fs.readFileSync(CACHE_PATH, 'utf8'));
    } catch {
      cache = {};
    }
  }

  // 提取独特岗位名
  const raw = JSON.parse(fs.readFileSync(DATA_PATH, 'utf8'));
  const pipeline = raw['pipeline-cache']?.data || {};
  const allNames = Object.values(pipeline)
    .map((r) => r.jobName)
    .filter((n) => typeof n === 'string' && n.trim());
  const unique = [...new Set(allNames)];

  let uncategorized = unique.filter((j) => !(j in cache));
  if (LIMIT !== Infinity) uncategorized = uncategorized.slice(0, LIMIT);

  console.log(
    `📊 独特岗位名 ${unique.length} 个 | 已缓存 ${Object.keys(cache).length} | 本次待分类 ${uncategorized.length}`,
  );

  if (uncategorized.length === 0) {
    writeOut(cache);
    return;
  }

  const BATCH = 40;
  let processed = 0;
  let okCount = 0;

  for (let i = 0; i < uncategorized.length; i += BATCH) {
    const batch = uncategorized.slice(i, i + BATCH);
    let results = null;

    for (let attempt = 1; attempt <= 3; attempt++) {
      try {
        results = await callMiMoBatch(batch, apiKey);
        break;
      } catch (e) {
        console.warn(`  ⚠️ 批次 ${i}-${i + batch.length} 第${attempt}次失败: ${e.message}`);
        await sleep(1500 * attempt);
      }
    }

    if (results && results.length) {
      const returnedJobs = new Set();
      for (const item of results) {
        if (item && item.job && item.category) {
          const norm = normalizeCategory(item.category);
          cache[item.job] = norm;
          returnedJobs.add(item.job);
          okCount++;
        }
      }
      // 模型漏返回的岗位：本轮不写入缓存，下次运行会重试
    }

    processed += batch.length;
    // 每批写盘，防止中断丢失已分类结果
    fs.writeFileSync(CACHE_PATH, JSON.stringify(cache, null, 2));
    console.log(`  ✅ ${Math.min(processed, uncategorized.length)}/${uncategorized.length} 已处理（有效 ${okCount}）`);
    await sleep(400);
  }

  writeOut(cache);
}

function writeOut(cache) {
  const out = {
    version: 1,
    generatedAt: new Date().toISOString(),
    categories: CATEGORIES,
    map: cache,
  };
  fs.writeFileSync(OUT_PATH, JSON.stringify(out, null, 2));
  console.log(`💾 写出 ${OUT_PATH}（分类条目 ${Object.keys(cache).length}）`);
}

main()
  .catch((e) => {
    console.error('❌ 分类失败:', e.message);
    process.exit(1);
  })
  .finally(() => releaseLock());

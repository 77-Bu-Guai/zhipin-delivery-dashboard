// 日志导出脚本 - 从 Chrome/Firefox 浏览器插件读取 Boss 直聘投递日志
// 用法: node scripts/export-logs.cjs [--watch]
const { Level } = require('level');
const path = require('path');
const fs = require('fs');
const { readFirefoxStorageData } = require('./decode-firefox.cjs');
const { readAiScoringLogs } = require('./extract-ai-scoring.cjs');

// ====== 配置 ======
const OUTPUT_PATH = path.join(__dirname, '..', 'public', 'extension-data.json');

// Chrome 插件路径
const CHROME_EXT_ID = 'ogkmgjbagackkdlcibcailacnncgonbn';
const CHROME_LDB_PATH = path.join(
  process.env.LOCALAPPDATA,
  'Google', 'Chrome', 'User Data', 'Default',
  'Local Extension Settings', CHROME_EXT_ID
);

// Firefox 配置
const FF_PROFILE = 'uz0ave2f.default-release-1782316007966';

// ====== 工具函数 ======
function copyDir(src, dst) {
  if (!fs.existsSync(src)) return false;
  if (fs.existsSync(dst)) fs.rmSync(dst, { recursive: true, force: true });
  fs.cpSync(src, dst, { recursive: true });
  return true;
}

async function readLevelDB(dbPath, label) {
  if (!fs.existsSync(dbPath)) {
    console.log(`  [${label}] 路径不存在，跳过`);
    return {};
  }

  const tmpPath = path.join(process.env.TEMP || '/tmp', `boss-ldb-${label.replace(/[^a-z0-9]/gi, '_')}`);
  if (!copyDir(dbPath, tmpPath)) {
    console.log(`  [${label}] 复制失败，跳过`);
    return {};
  }

  const db = new Level(tmpPath, { valueEncoding: 'utf8', createIfMissing: false });
  const data = {};

  try {
    await db.open();
    const keys = await db.keys().all();
    let count = 0;

    for (const key of keys) {
      if (key.startsWith('_') || key.startsWith('meta$') || key === 'VERSION') continue;
      try {
        const raw = await db.get(key);
        try { data[key] = JSON.parse(raw); } catch { data[key] = raw; }
        count++;
      } catch { /* skip */ }
    }
    console.log(`  [${label}] ✅ 读取成功，${count} 个存储键，${data['pipeline-cache']?.data ? Object.keys(data['pipeline-cache'].data).length : 0} 条记录`);
  } catch (err) {
    console.log(`  [${label}] ❌ 读取失败: ${err.message}`);
  }

  try { await db.close(); } catch {}
  return data;
}

// ====== 主流程 ======
async function exportAll() {
  console.log(`\n🔄 [${new Date().toLocaleTimeString('zh-CN')}] 开始导出日志...`);

  // 读取 Chrome 数据
  console.log('\n📁 Chrome 插件数据:');
  const chromeData = await readLevelDB(CHROME_LDB_PATH, 'Chrome');

  // 读取 Firefox 数据 (使用结构化克隆解码器)
  console.log('\n📁 Firefox 扩展数据:');
  let firefoxData = {};
  try {
    firefoxData = readFirefoxStorageData(FF_PROFILE);
  } catch (e) {
    console.log(`  ❌ 读取失败: ${e.message}`);
    console.log('  ⚠️ 跳过 Firefox，继续导出 Chrome 数据...');
  }

  // 读取 AI 评分详细日志（从 Chrome Local Storage LevelDB 读取）
  console.log('\n🤖 AI 评分详细日志:');
  let aiScoringLogs = null;
  try {
    const logs = await readAiScoringLogs();
    if (logs && logs.length > 0) {
      aiScoringLogs = logs;
      const withScore = logs.filter(r => r.message && r.message.includes('分数'));
      console.log(`  ✅ 成功读取 ${logs.length} 条评分日志（${withScore.length} 条含评分文本）`);
    } else {
      console.log(`  ⚠️ 暂无评分日志`);
    }
  } catch (e) {
    console.log(`  ❌ 读取失败: ${e.message}`);
  }

  // 合并数据 (合并 pipeline-cache.data，每条记录标记来源)
  // Chrome 数据优先（同一 key 时 Chrome 覆盖 Firefox）
  const ffPipelineData = firefoxData['pipeline-cache']?.data || {};
  const chPipelineData = chromeData['pipeline-cache']?.data || {};

  // 给 Firefox 记录添加 _source 标记
  for (const key of Object.keys(ffPipelineData)) {
    if (ffPipelineData[key] && typeof ffPipelineData[key] === 'object') {
      ffPipelineData[key]._source = 'firefox';
    }
  }
  // 给 Chrome 记录添加 _source 标记
  for (const key of Object.keys(chPipelineData)) {
    if (chPipelineData[key] && typeof chPipelineData[key] === 'object') {
      chPipelineData[key]._source = 'chrome';
    }
  }

  const mergedPipelineData = {
    ...ffPipelineData,
    ...chPipelineData,
  };
  const mergedPipeline = { data: mergedPipelineData };

  // 合并 Statistics (过滤非对象项，按日期合并)
  const ffStats = (firefoxData['web-geek-job-Statistics'] || []).filter(s => s && typeof s === 'object' && s.date);
  const chStats = (chromeData['web-geek-job-Statistics'] || []).filter(s => s && typeof s === 'object' && s.date);
  const allStats = [...ffStats, ...chStats];

  // 按日期合并（同一天的数据相加）
  const statsByDate = {};
  for (const s of allStats) {
    if (!statsByDate[s.date]) {
      statsByDate[s.date] = { ...s };
    } else {
      const existing = statsByDate[s.date];
      for (const key of Object.keys(s)) {
        if (key === 'date') continue;
        existing[key] = (existing[key] || 0) + (s[key] || 0);
      }
    }
  }
  const mergedStats = Object.values(statsByDate).sort((a, b) => a.date.localeCompare(b.date));

  const merged = {
    _meta: {
      exportedAt: new Date().toISOString(),
      sources: {
        chrome: Object.keys(chromeData).length > 0,
        firefox: Object.keys(firefoxData).length > 0,
      },
    },
    ...firefoxData,
    ...chromeData,
    'pipeline-cache': mergedPipeline,
    'web-geek-job-Statistics': mergedStats,
    'ai-scoring-logs': aiScoringLogs,
  };

  // 统计
  const pipeline = merged['pipeline-cache'];
  const stats = merged['web-geek-job-Statistics'];
  const recordCount = pipeline?.data ? Object.keys(pipeline.data).length : 0;
  const statsDays = Array.isArray(stats) ? stats.length : 0;

  // 写入文件
  const dir = path.dirname(OUTPUT_PATH);
  if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
  fs.writeFileSync(OUTPUT_PATH, JSON.stringify(merged, null, 2), 'utf-8');

  console.log(`\n✅ 导出完成 → ${OUTPUT_PATH}`);
  console.log(`   📊 投递记录: ${recordCount} 条`);
  console.log(`   📅 统计天数: ${statsDays} 天`);
  console.log(`   🤖 AI 评分: ${aiScoringLogs ? aiScoringLogs.length : 0} 条`);
  return merged;
}

// 监听模式
const watchMode = process.argv.includes('--watch');

if (watchMode) {
  const INTERVAL = 30 * 1000; // 30秒
  console.log(`👀 监听模式启动，每 ${INTERVAL / 1000} 秒检查一次...`);
  console.log(`   输出文件: ${OUTPUT_PATH}`);
  console.log('   按 Ctrl+C 退出\n');

  exportAll();
  setInterval(exportAll, INTERVAL);
} else {
  exportAll().catch(console.error);
}
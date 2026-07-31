// 日志导出脚本 - 从 Chrome/Firefox 浏览器插件读取 BOSS 投递数据
// 数据流：浏览器 LocalStorage → SQLite 数据库 → extension-data.json → 前端
// 用法: node scripts/export-logs.cjs [--watch] [--compact]
const { Level } = require('level');
const path = require('path');
const fs = require('fs');
const { readFirefoxStorageData } = require('./decode-firefox.cjs');
const { readAiScoringLogs } = require('./extract-ai-scoring.cjs');
const db = require('./boss-db.cjs');

// ====== 配置 ======
const CHROME_EXT_ID = 'ogkmgjbagackkdlcibcailacnncgonbn';
const CHROME_LDB_PATH = path.join(
  process.env.LOCALAPPDATA,
  'Google', 'Chrome', 'User Data', 'Default',
  'Local Extension Settings', CHROME_EXT_ID
);
const FF_PROFILE = 'uz0ave2f.default-release-1782316007966';

// ====== 工具函数 ======
const verbose = !process.argv.includes('--compact');

async function silent(fn) {
  if (verbose) return fn();
  const orig = console.log;
  console.log = () => {};
  try { return await fn(); } finally { console.log = orig; }
}
function log(...args) { if (verbose) console.log(...args); }

function copyDir(src, dst) {
  if (!fs.existsSync(src)) return false;
  if (fs.existsSync(dst)) fs.rmSync(dst, { recursive: true, force: true });
  fs.cpSync(src, dst, { recursive: true });
  return true;
}

async function readLevelDB(dbPath, label) {
  if (!fs.existsSync(dbPath)) {
    log(`  [${label}] 路径不存在，跳过`);
    return {};
  }
  const tmpPath = path.join(process.env.TEMP || '/tmp', `boss-ldb-${label.replace(/[^a-z0-9]/gi, '_')}`);
  if (!copyDir(dbPath, tmpPath)) {
    log(`  [${label}] 复制失败，跳过`);
    return {};
  }
  const ldb = new Level(tmpPath, { valueEncoding: 'utf8', createIfMissing: false });
  const data = {};
  try {
    await ldb.open();
    const keys = await ldb.keys().all();
    let count = 0;
    for (const key of keys) {
      if (key.startsWith('_') || key.startsWith('meta$') || key === 'VERSION') continue;
      try {
        const raw = await ldb.get(key);
        try { data[key] = JSON.parse(raw); } catch { data[key] = raw; }
        count++;
      } catch {}
    }
    log(`  [${label}] ${count} 键`);
  } catch (err) {
    console.log(`  ❌ [${label}] 读取失败: ${err.message}`);
  }
  try { await ldb.close(); } catch {}
  return data;
}

// ====== 主流程 ======
async function exportAll() {
  const ts = `[${new Date().toLocaleTimeString('zh-CN')}]`;

  // 1. 初始化数据库（如首次运行）
  db.init();

  // 2. 读取 Chrome LevelDB（扩展存储）
  const chromeData = await silent(() => readLevelDB(CHROME_LDB_PATH, 'Chrome'));

  // 自动修复 CURRENT 文件（确保指向最新的 MANIFEST）
  try {
    const lsPath = path.join(
      process.env.LOCALAPPDATA, 'Google', 'Chrome', 'User Data', 'Default', 'Local Storage', 'leveldb'
    );
    const currentFile = path.join(lsPath, 'CURRENT');
    if (fs.existsSync(currentFile)) {
      const manifests = fs.readdirSync(lsPath).filter(f => f.startsWith('MANIFEST-'));
      if (manifests.length > 1) {
        manifests.sort((a, b) => fs.statSync(path.join(lsPath, b)).mtime - fs.statSync(path.join(lsPath, a)).mtime);
        const newest = manifests[0];
        const currentVal = fs.readFileSync(currentFile, 'utf-8').trim();
        if (currentVal !== newest) {
          fs.writeFileSync(currentFile, newest + '\n');
          if (verbose) console.log(`  🔧 CURRENT ${currentVal} → ${newest}`);
        }
      }
    }
  } catch {}

  // 3. 读取 Chrome + Firefox localStorage pipeline cache
  let chromePipelineCache = {};
  let firefoxLsPipeline = {};
  let pipelineChromeCnt = 0, pipelineFirefoxCnt = 0;
  try {
    const { readChromePipelineCache, readFirefoxPipelineCache } = require('./extract-ai-scoring.cjs');
    chromePipelineCache = await readChromePipelineCache();
    if (chromePipelineCache && Object.keys(chromePipelineCache).length > 0) {
      pipelineChromeCnt = Object.keys(chromePipelineCache).length;
    }

    let firefoxLsPipelineTmp = {};
    try {
      firefoxLsPipelineTmp = await readFirefoxPipelineCache();
      if (firefoxLsPipelineTmp && Object.keys(firefoxLsPipelineTmp).length > 0) {
        pipelineFirefoxCnt = Object.keys(firefoxLsPipelineTmp).length;
      }
    } catch {}
    firefoxLsPipeline = firefoxLsPipelineTmp;
  } catch (e) {
    if (e.message && e.message.includes('null')) {
      console.log(`  ⚠️ Chrome LevelDB 可能损坏，建议重启 Chrome 自动修复`);
    } else {
      console.log(`  ⚠️ Pipeline 缓存读取失败: ${e.message}`);
    }
  }

  // 4. 读取 Firefox 扩展数据
  let firefoxData = {};
  try {
    firefoxData = await silent(() => readFirefoxStorageData(FF_PROFILE));
  } catch (e) {
    console.log(`  ❌ Firefox 读取失败: ${e.message}`);
    console.log('  ⚠️ 跳过 Firefox，继续导出 Chrome 数据...');
  }

  // 5. 读取 AI 评分
  let aiScoringLogs = null;
  try {
    const logs = await silent(() => readAiScoringLogs());
    if (logs && logs.length > 0) aiScoringLogs = logs;
  } catch (e) {
    console.log(`  ❌ AI 评分读取失败: ${e.message}`);
  }

  // 6. 把浏览器数据写入数据库（关键：数据库是真正的数据持久层）
  let writeStats = { pipeline: { inserted: 0, updated: 0 }, aiScoring: { inserted: 0, updated: 0 } };

  // 合并本次获取的 pipeline cache（Chrome 优先级 > Firefox）
  if (chromePipelineCache && Object.keys(chromePipelineCache).length > 0) {
    const r = db.upsertPipelineRecords(chromePipelineCache, 'chrome');
    writeStats.pipeline.inserted += r.inserted;
    writeStats.pipeline.updated += r.updated;
  }
  if (firefoxLsPipeline && Object.keys(firefoxLsPipeline).length > 0) {
    const r = db.upsertPipelineRecords(firefoxLsPipeline, 'firefox');
    writeStats.pipeline.inserted += r.inserted;
    writeStats.pipeline.updated += r.updated;
  }

  // 写入 AI 评分
  if (aiScoringLogs && aiScoringLogs.length > 0) {
    const aiChrome = aiScoringLogs.filter(r => r._source === 'chrome' || !r._source);
    const aiFirefox = aiScoringLogs.filter(r => r._source === 'firefox');
    if (aiChrome.length > 0) {
      const r = db.upsertAiScoringLogs(aiChrome, 'chrome');
      writeStats.aiScoring.inserted += r.inserted;
      writeStats.aiScoring.updated += r.updated;
    }
    if (aiFirefox.length > 0) {
      const r = db.upsertAiScoringLogs(aiFirefox, 'firefox');
      writeStats.aiScoring.inserted += r.inserted;
      writeStats.aiScoring.updated += r.updated;
    }
  }

  // 写入每日统计
  const allStats = [
    ...(Array.isArray(firefoxData['web-geek-job-Statistics']) ? firefoxData['web-geek-job-Statistics'].filter(s => s && typeof s === 'object' && s.date) : []),
    ...(Array.isArray(chromeData['web-geek-job-Statistics']) ? chromeData['web-geek-job-Statistics'].filter(s => s && typeof s === 'object' && s.date) : []),
  ];
  if (allStats.length > 0) db.upsertDailyStatistics(allStats);

  // 写入今日数据
  const today = chromeData['web-geek-job-Today'] || firefoxData['web-geek-job-Today'];
  if (today) db.upsertToday(today);

  // 7. 从数据库读取所有累积数据（关键：读取已包含历史+本次新增）
  const allPipelineData = db.getAllPipelineData();
  const allAiScoring = db.getAllAiScoringLogs();
  const allStatsFromDB = db.getAllDailyStatistics();
  const dbStats = db.getStats();

  // 8. 拼装 extension-data.json 完整结构
  const merged = {
    _meta: {
      exportedAt: new Date().toISOString(),
      sources: {
        chrome: pipelineChromeCnt > 0,
        firefox: pipelineFirefoxCnt > 0,
      },
      fromDatabase: true,
      newInThisRun: writeStats,
      dbStats,
    },
    ...firefoxData,
    ...chromeData,
    'pipeline-cache': { data: allPipelineData },
    'web-geek-job-Statistics': allStatsFromDB,
    'ai-scoring-logs': allAiScoring,
  };

  // 保留今日数据
  const todayData = db.getToday();
  if (todayData) merged['web-geek-job-Today'] = todayData;

  // 清理非业务字段（不要把配置类的 sameHr、conf-user 等塞进每日扩展）
  // 这些字段保留在 merged 里以兼容其他可能的读取方

  // 9. 写入文件（主输出 + dist 备份 + 每日快照）
  const outputs = db.writeJsonOutputs(merged);

  // 10. 显示摘要
  const w = writeStats;

  // 计算 Chrome 缓存中最新抓取时间 + 已同步数量（用于精简模式直观展示）
  let latestCapture = 0;
  if (chromePipelineCache && typeof chromePipelineCache === 'object') {
    for (const id of Object.keys(chromePipelineCache)) {
      const r = chromePipelineCache[id];
      const t = r && (r.createdAt || r.time || r.lastAccessed || 0);
      if (t > latestCapture) latestCapture = t;
    }
  }
  const synced = Math.max(0, pipelineChromeCnt - w.pipeline.inserted);
  const latestStr = latestCapture
    ? new Date(latestCapture).toLocaleString('zh-CN', { hour12: false })
    : '未知';

  // 今日维度：直接读 DB 中的 web-geek-job-Today（Helper 的权威今日数）
  const todayNow = todayData || {};
  const todayTotal = todayNow.total || 0;
  const todaySuccess = todayNow.success || 0;
  const todayStr = `今日 ${todayTotal}岗(成功${todaySuccess})`;

  if (verbose) {
    const totalPipeline = dbStats.pipeline;
    const totalAi = dbStats.aiScoring;
    console.log(`🔄 ${ts}  ✅ 累计 ${totalPipeline}条投递 · AI ${totalAi} · 本次 Chrome ${pipelineChromeCnt}/${pipelineFirefoxCnt}`);
    console.log(`   📥 写入: 投递 +${w.pipeline.inserted}条/~${w.pipeline.updated}条 · AI +${w.aiScoring.inserted}/${w.aiScoring.updated}`);
    console.log(`   🔍 Chrome缓存 ${pipelineChromeCnt}条 · 其中已同步 ${synced}条 · 最新抓取 ${latestStr}`);
    console.log(`   📅 ${todayStr}（与 Helper 今日统计对齐）`);
    console.log(`   📁 快照: ${outputs.snapshot}`);
  } else {
    // 精简模式：只显示今日维度（与 Helper 今日统计对齐，最直观）
    console.log(`  ${todayStr}`);
  }

  // 11. 清理 Chrome localStorage（仅清理 AI 评分，不动 pipeline_cache）
  // 策略：
  //   - boss_pipeline_cache 不动（Helper 插件依赖这些记录做去重）
  //   - boss_ai_scoring 超过 1000 条时，保留最近 800 条
  try {
    const lsPath = path.join(
      process.env.LOCALAPPDATA, 'Google', 'Chrome', 'User Data', 'Default', 'Local Storage', 'leveldb'
    );
    if (!fs.existsSync(lsPath)) return;

    const { Level: L2 } = require('level');
    const tmpTrim = path.join(process.env.TEMP || '/tmp', 'boss-trim-' + Date.now());
    if (fs.existsSync(tmpTrim)) fs.rmSync(tmpTrim, { recursive: true, force: true });

    fs.cpSync(lsPath, tmpTrim, { recursive: true });
    const tdb = new L2(tmpTrim, { valueEncoding: 'buffer', createIfMissing: false });
    try { await tdb.open(); } catch {
      await tdb.close().catch(() => {});
      try { fs.rmSync(tmpTrim, { recursive: true, force: true }); } catch {}
      return;
    }
    const tkeys = await tdb.keys().all();

    const skipFiles = new Set(['CURRENT', 'LOCK', 'CURRENT.bak']);
    let anyTrimmed = false;

    // ---- 仅清理 boss_ai_scoring（保留最近 800 条） ----
    const scoringKey = tkeys.find(k => k.includes('boss_ai_scoring'));
    if (scoringKey) {
      try {
        const buf = await tdb.get(scoringKey);
        let start = -1;
        for (let i = 0; i < buf.length - 1; i++) {
          if (buf[i] === 0x5B && buf[i + 1] === 0x00) { start = i; break; }
        }
        if (start >= 0) {
          const json = buf.slice(start);
          const str = json.toString('utf16le');
          const close = str.lastIndexOf(']');
          const arr = JSON.parse(str.slice(0, close + 1));
          if (arr.length > 1000) {
            const trimmed = arr.slice(-800);
            const prefix = buf.slice(0, start);
            const newBuf = Buffer.from(JSON.stringify(trimmed), 'utf16le');
            const combined = Buffer.concat([prefix, newBuf]);
            await tdb.put(scoringKey, combined);
            anyTrimmed = true;

            if (verbose) {
              const freed = ((buf.length - combined.length) / 1024).toFixed(1);
              console.log(`  🧹 已清理 ai_scoring ${arr.length}→${trimmed.length}条 (释放${freed}KB)`);
            }
          }
        }
      } catch {}
    }

    await tdb.close();

    // ---- 如果有清理发生，把修改后的 leveldb 文件写回 ----
    if (anyTrimmed) {
      for (const f of fs.readdirSync(tmpTrim)) {
        if (skipFiles.has(f) || f.startsWith('MANIFEST-')) continue;
        const srcFile = path.join(lsPath, f);
        const tmpFile = path.join(tmpTrim, f);
        try {
          try { fs.unlinkSync(srcFile); } catch {}
          fs.copyFileSync(tmpFile, srcFile);
        } catch {}
      }
    }
    try { fs.rmSync(tmpTrim, { recursive: true, force: true }); } catch {}
  } catch {}

  // 12. 增量触发岗位分类（累计新增 500 条投递记录，调用 MiMo 分类脚本）
  try {
    const cp = require('child_process');
    const lockFile = path.join(__dirname, '..', '.classify-lock');
    if (fs.existsSync(lockFile)) {
      if (verbose) console.log('  🏷️ 岗位分类进程运行中，跳过本次触发');
    } else {
      const stateFile = path.join(__dirname, '..', '.classification-state.json');
      let state = { pendingNew: 0 };
      try {
        state = JSON.parse(fs.readFileSync(stateFile, 'utf8'));
      } catch {
        /* 首次 */
      }
      state.pendingNew = (state.pendingNew || 0) + (w.pipeline.inserted || 0);
      if (state.pendingNew >= 500) {
        state.pendingNew = 0;
        fs.writeFileSync(stateFile, JSON.stringify(state));
        if (verbose) console.log('  🏷️ 累计新增达 500 条，触发岗位分类...');
        const child = cp.spawn(
          process.execPath,
          [path.join(__dirname, 'classify-jobs.mjs')],
          { detached: true, stdio: 'ignore', env: process.env },
        );
        child.unref();
      } else {
        fs.writeFileSync(stateFile, JSON.stringify(state));
      }
    }
  } catch (e) {
    if (verbose) console.log('  ⚠️ 岗位分类增量触发失败: ' + e.message);
  }

  // 13. 增量触发 AI 评分因素分类（累计新增 500 条 AI 评分记录，调用 MiMo factor 分类脚本）
  try {
    const cp = require('child_process');
    const lockFile = path.join(__dirname, '..', '.factor-classify-lock');
    if (fs.existsSync(lockFile)) {
      if (verbose) console.log('  🏷️ factor 分类进程运行中，跳过本次触发');
    } else {
      const stateFile = path.join(__dirname, '..', '.factor-classification-state.json');
      let state = { pendingNew: 0 };
      try {
        state = JSON.parse(fs.readFileSync(stateFile, 'utf8'));
      } catch {
        /* 首次 */
      }
      state.pendingNew = (state.pendingNew || 0) + (w.aiScoring.inserted || 0);
      if (state.pendingNew >= 500) {
        state.pendingNew = 0;
        fs.writeFileSync(stateFile, JSON.stringify(state));
        if (verbose) console.log('  🏷️ 累计新增达 500 条 AI 评分，触发 factor 分类...');
        const child = cp.spawn(
          process.execPath,
          [path.join(__dirname, 'classify-factors.mjs')],
          { detached: true, stdio: 'ignore', env: process.env },
        );
        child.unref();
      } else {
        fs.writeFileSync(stateFile, JSON.stringify(state));
      }
    }
  } catch (e) {
    if (verbose) console.log('  ⚠️ factor 分类增量触发失败: ' + e.message);
  }
}

// ====== 入口 ======
const watchMode = process.argv.includes('--watch');
const compactMode = process.argv.includes('--compact');

async function main() {
  if (watchMode) {
    const INTERVAL = 60 * 1000;
    console.log(`👀 监听模式启动，每 ${INTERVAL / 1000} 秒检查一次...`);
    console.log(`   数据库: ${db.DB_PATH}`);
    console.log(`   输出文件: ${db.OUTPUT_PATH}`);
    if (!compactMode) console.log('   按 Ctrl+C 退出\n');
    else console.log('   精简模式（--compact），仅显示摘要\n');

    // 优雅退出
    process.on('SIGINT', () => { db.close(); console.log('\n👋 已退出'); process.exit(0); });
    process.on('SIGTERM', () => { db.close(); process.exit(0); });

    await exportAll();
    setInterval(exportAll, INTERVAL);
  } else {
    await exportAll();
    db.close();
  }
}

main().catch(err => {
  console.error('❌ 致命错误:', err);
  db.close();
  process.exit(1);
});

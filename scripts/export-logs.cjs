// 日志导出脚本 - 从 Chrome/Firefox 浏览器插件读取 Boss 直聘投递日志
// 用法: node scripts/export-logs.cjs [--watch] [--compact]
const { Level } = require('level');
const path = require('path');
const fs = require('fs');
const { readFirefoxStorageData } = require('./decode-firefox.cjs');
const { readAiScoringLogs } = require('./extract-ai-scoring.cjs');

// ====== 配置 ======
const OUTPUT_PATH = path.join(__dirname, '..', 'public', 'extension-data.json');

// 上一轮的 ID 集合（用于检测新增投递）
let prevIds = null;
// 上一轮数据（用于增量显示）
let prevChromeCnt = 0;
let prevTotalCnt = 0;

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
const verbose = !process.argv.includes('--compact');

// 临时静音（屏蔽其他模块的 console.log）
async function silent(fn) {
  if (verbose) return fn();
  const orig = console.log;
  console.log = () => {};
  try { return await fn(); } finally { console.log = orig; }
}

function log(...args) {
  if (verbose) console.log(...args);
}
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
    log(`  [${label}] ${count} 键`);
  } catch (err) {
    console.log(`  ❌ [${label}] 读取失败: ${err.message}`);
  }

  try { await db.close(); } catch {}
  return data;
}

// ====== 主流程 ======
async function exportAll() {
  const ts = `[${new Date().toLocaleTimeString('zh-CN')}]`;

  // 读取 Chrome LevelDB（用 silent 屏蔽内部日志）
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

  // 读取 Chrome + Firefox localStorage pipeline cache
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

    if (Object.keys(chromePipelineCache || {}).length > 0 || Object.keys(firefoxLsPipeline || {}).length > 0) {
      const mergedLsPipeline = {};
      for (const k of Object.keys(firefoxLsPipeline || {})) mergedLsPipeline[k] = firefoxLsPipeline[k];
      for (const k of Object.keys(chromePipelineCache || {})) mergedLsPipeline[k] = chromePipelineCache[k];
      if (!chromeData['pipeline-cache']) chromeData['pipeline-cache'] = { data: {} };
      if (!chromeData['pipeline-cache'].data) chromeData['pipeline-cache'].data = {};
      Object.assign(chromeData['pipeline-cache'].data, mergedLsPipeline);
    }
  } catch (e) {
    // 检测是否是 LevelDB 损坏导致的 Object.keys(null)
    if (e.message && e.message.includes('null')) {
      console.log(`  ⚠️ Chrome LevelDB 可能损坏，建议重启 Chrome 自动修复`);
    } else {
      console.log(`  ⚠️ Pipeline 缓存读取失败: ${e.message}`);
    }
  }

  // 读取 Firefox 扩展数据
  let firefoxData = {};
  try {
    firefoxData = await silent(() => readFirefoxStorageData(FF_PROFILE));
  } catch (e) {
    console.log(`  ❌ Firefox 读取失败: ${e.message}`);
    console.log('  ⚠️ 跳过 Firefox，继续导出 Chrome 数据...');
  }

  // 读取 AI 评分
  let aiScoringLogs = null;
  let aiScoringWithScore = 0;
  try {
    const logs = await silent(() => readAiScoringLogs());
    if (logs && logs.length > 0) {
      aiScoringLogs = logs;
      aiScoringWithScore = logs.filter(r => r.message && r.message.includes('分数')).length;
    }
  } catch (e) {
    console.log(`  ❌ AI 评分读取失败: ${e.message}`);
  }

  // 合并数据 (合并 pipeline-cache.data，每条记录标记来源)
  // Chrome 数据优先（同一 key 时 Chrome 覆盖 Firefox）
  const ffPipelineData = firefoxData['pipeline-cache']?.data || {};
  const chPipelineData = chromeData['pipeline-cache']?.data || {};

  // 从 dist/extension-data.json 恢复旧记录（防止 Chrome 插件数据丢失）
  // dist 是历史部署版本，里面有旧的 Chrome/Firefox 投递记录，可以补充当前缺失的
  const DIST_BACKUP = path.join(__dirname, '..', 'dist', 'extension-data.json');
  if (fs.existsSync(DIST_BACKUP)) {
    try {
      const backupData = JSON.parse(fs.readFileSync(DIST_BACKUP, 'utf-8'));
      const backupPipeline = backupData['pipeline-cache']?.data || {};
      const backupChromeKeys = Object.keys(backupPipeline).filter(k => backupPipeline[k]?._source === 'chrome');
      const backupFirefoxKeys = Object.keys(backupPipeline).filter(k => backupPipeline[k]?._source === 'firefox');
      let restoredChrome = 0, restoredFirefox = 0;
      for (const k of backupChromeKeys) {
        if (!chPipelineData[k]) {
          chPipelineData[k] = backupPipeline[k];
          restoredChrome++;
        }
      }
      for (const k of backupFirefoxKeys) {
        if (!ffPipelineData[k]) {
          ffPipelineData[k] = backupPipeline[k];
          restoredFirefox++;
        }
      }
      if (restoredChrome > 0 || restoredFirefox > 0) {
        log(`  🔄 从备份恢复 ${restoredChrome} 条 Chrome / ${restoredFirefox} 条 Firefox`);
      }
    } catch (e) {
      console.log(`  ⚠️ 读取备份失败: ${e.message}`);
    }
  }

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

  // 检测新增记录（对比 Chrome/Firefox 实时数据，不含 backup）
  if (verbose && prevIds !== null) {
    try {
      // 当前实时数据 ID（仅 Chrome localStorage + Firefox localStorage）
      const liveIds = new Set();
      if (chromePipelineCache) {
        for (const id of Object.keys(chromePipelineCache)) liveIds.add(id);
      }
      if (typeof firefoxLsPipeline !== 'undefined' && firefoxLsPipeline) {
        for (const id of Object.keys(firefoxLsPipeline)) liveIds.add(id);
      }
      
      const newIds = [...liveIds].filter(id => !prevIds.has(id));
      
      if (newIds.length > 0) {
        const scoreMap = {};
        if (Array.isArray(aiScoringLogs)) {
          for (const r of aiScoringLogs) {
            const m = String(r.message || '');
            const match = m.match(/分数[：:]\s*(-?\d+)/);
            if (match) scoreMap[r.encryptJobId] = match[1];
          }
        }
        
        console.log(`\n📥 新增 ${newIds.length} 条投递:`);
        for (const id of newIds.slice(-20)) {
          const r = (chromePipelineCache && chromePipelineCache[id]) || (firefoxLsPipeline && firefoxLsPipeline[id]);
          if (!r) continue;
          const company = r.brandName || r.companyName || '?';
          const job = r.jobName || '?';
          const status = r.status === 'success' ? '✅' : r.status === 'warning' ? '⚠️' : '❌';
          const score = scoreMap[id] || '—';
          console.log(`   ${status} ${company} | ${job} | 分数 ${score}`);
        }
        if (newIds.length > 20) console.log(`   ... 还有 ${newIds.length - 20} 条`);
      }
    } catch {}
  }
  // 保存当前实时 ID 给下一轮用
  prevIds = new Set();
  if (chromePipelineCache) for (const id of Object.keys(chromePipelineCache)) prevIds.add(id);
  if (typeof firefoxLsPipeline !== 'undefined' && firefoxLsPipeline) for (const id of Object.keys(firefoxLsPipeline)) prevIds.add(id);

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

  // 从 dist 备份恢复 AI评分历史（防止 localStorage 清理后丢失）
  if (aiScoringLogs && aiScoringLogs.length > 0) {
    try {
      const distPath = path.join(__dirname, '..', 'dist', 'extension-data.json');
      if (fs.existsSync(distPath)) {
        const oldDist = JSON.parse(fs.readFileSync(distPath, 'utf-8'));
        const oldAi = oldDist['ai-scoring-logs'];
        if (Array.isArray(oldAi) && oldAi.length > aiScoringLogs.length) {
          const curIds = new Set(aiScoringLogs.map(r => r.encryptJobId + '|' + r.time));
          const missing = oldAi.filter(r => !curIds.has(r.encryptJobId + '|' + r.time));
          if (missing.length > 0) {
            merged['ai-scoring-logs'] = [...aiScoringLogs, ...missing];
            aiScoringLogs = merged['ai-scoring-logs'];
            log(`  📊 AI评分补回 ${missing.length} 条历史 (dist备份)`);
          }
        }
      }
    } catch {}
  }

  // 统计
  const pipeline = merged['pipeline-cache'];
  const stats = merged['web-geek-job-Statistics'];
  const recordCount = pipeline?.data ? Object.keys(pipeline.data).length : 0;
  const statsDays = Array.isArray(stats) ? stats.length : 0;

  // 写入文件
  const dir = path.dirname(OUTPUT_PATH);
  if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
  fs.writeFileSync(OUTPUT_PATH, JSON.stringify(merged, null, 2), 'utf-8');

  // 同步备份到 dist/（保留完整历史）
  try {
    const distDir = path.join(__dirname, '..', 'dist');
    if (!fs.existsSync(distDir)) fs.mkdirSync(distDir, { recursive: true });
    const distPath = path.join(distDir, 'extension-data.json');
    fs.copyFileSync(OUTPUT_PATH, distPath);
  } catch (e) {}

  if (verbose) {
    const aiCnt = aiScoringLogs ? aiScoringLogs.length : 0;
    console.log(`🔄 ${ts}  ✅ ${recordCount}条投递 · AI ${aiCnt} · Chrome缓存 ${pipelineChromeCnt} / Firefox ${pipelineFirefoxCnt}`);
  } else {
    console.log(`  ✅ 本次投递 Chrome${pipelineChromeCnt}条 | 累计 ${recordCount}`);
  }

  // 自动清理 Chrome localStorage 释放空间（跳过 CURRENT/LOCK/MANIFEST 避免覆盖）
  try {
    const lsPath = path.join(
      process.env.LOCALAPPDATA, 'Google', 'Chrome', 'User Data', 'Default', 'Local Storage', 'leveldb'
    );
    if (!fs.existsSync(lsPath)) return merged;

    const { Level } = require('level');
    const tmpTrim = path.join(process.env.TEMP || '/tmp', 'boss-trim-' + Date.now());
    if (fs.existsSync(tmpTrim)) fs.rmSync(tmpTrim, { recursive: true, force: true });

    fs.cpSync(lsPath, tmpTrim, { recursive: true });
    const tdb = new Level(tmpTrim, { valueEncoding: 'buffer', createIfMissing: false });
    try { await tdb.open(); } catch { 
      // LevelDB 损坏，跳过清理
      await tdb.close().catch(() => {});
      try { fs.rmSync(tmpTrim, { recursive: true, force: true }); } catch {}
      return merged;
    }
    const tkeys = await tdb.keys().all();
    const scoringKey = tkeys.find(k => k.includes('boss_ai_scoring'));

    if (scoringKey) {
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
          await tdb.close();

          // 逐文件写回（跳过元数据文件，避免覆盖 CURRENT/MANIFEST）
          let written = 0;
          const skipFiles = new Set(['CURRENT', 'LOCK', 'CURRENT.bak']);
          for (const f of fs.readdirSync(tmpTrim)) {
            if (skipFiles.has(f) || f.startsWith('MANIFEST-')) continue;
            const srcFile = path.join(lsPath, f);
            const tmpFile = path.join(tmpTrim, f);
            try {
              try { fs.unlinkSync(srcFile); } catch {}
              fs.copyFileSync(tmpFile, srcFile);
              written++;
            } catch {}
          }
          const freed = ((buf.length - combined.length) / 1024).toFixed(0);
          if (verbose) console.log(`  🧹 已清理 localStorage (bos_ai_scoring ${arr.length}→${trimmed.length}条, 释放${freed}KB)`);
        } else {
          await tdb.close();
        }
      } else {
        await tdb.close();
      }
    } else {
      await tdb.close();
    }
    try { fs.rmSync(tmpTrim, { recursive: true, force: true }); } catch {}
  } catch {}
  return merged;
}

// 监听模式
const watchMode = process.argv.includes('--watch');
const compactMode = process.argv.includes('--compact');

if (watchMode) {
  const INTERVAL = 60 * 1000; // 60秒
  console.log(`👀 监听模式启动，每 ${INTERVAL / 1000} 秒检查一次...`);
  console.log(`   输出文件: ${OUTPUT_PATH}`);
  if (!compactMode) console.log('   按 Ctrl+C 退出\n');
  else console.log('   精简模式（--compact），仅显示摘要\n');

  exportAll();
  setInterval(exportAll, INTERVAL);
} else {
  exportAll().catch(console.error);
}
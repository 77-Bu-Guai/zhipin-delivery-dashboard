// SQLite 数据库模块 - BOSS 投递历史持久化存储
// 文件位置: data/boss-records.db
// 用途: 解决 Chrome LocalStorage 容量限制导致的数据丢失问题
const path = require('path');
const fs = require('fs');
const Database = require('better-sqlite3');

const DB_DIR = path.join(__dirname, '..', 'data');
const DB_PATH = path.join(DB_DIR, 'boss-records.db');
const PUBLIC_DIR = path.join(__dirname, '..', 'public');
const SNAPSHOT_DIR = path.join(PUBLIC_DIR, 'snapshots');
const OUTPUT_PATH = path.join(PUBLIC_DIR, 'extension-data.json');

let db = null;

/** 初始化数据库（创建表） */
function init() {
  if (!fs.existsSync(DB_DIR)) fs.mkdirSync(DB_DIR, { recursive: true });

  db = new Database(DB_PATH);
  db.pragma('journal_mode = WAL');
  db.pragma('synchronous = NORMAL');

  // 投递记录表（按 encryptJobId 去重，覆盖更新）
  db.exec(`
    CREATE TABLE IF NOT EXISTS pipeline_records (
      id              TEXT PRIMARY KEY,
      encrypt_job_id  TEXT NOT NULL UNIQUE,
      job_name        TEXT,
      brand_name      TEXT,
      status          TEXT,
      message         TEXT,
      processor_type  TEXT,
      job_id          TEXT,
      hit_count       INTEGER DEFAULT 0,
      last_accessed   INTEGER,
      created_at      INTEGER,
      source          TEXT,
      raw_json        TEXT,
      updated_at      INTEGER DEFAULT (strftime('%s','now') * 1000)
    );
    CREATE INDEX IF NOT EXISTS idx_pipeline_created ON pipeline_records(created_at DESC);
    CREATE INDEX IF NOT EXISTS idx_pipeline_source ON pipeline_records(source);
  `);

  // AI 评分日志表（按 time + encryptJobId 去重）
  db.exec(`
    CREATE TABLE IF NOT EXISTS ai_scoring_logs (
      id              INTEGER PRIMARY KEY AUTOINCREMENT,
      time            INTEGER NOT NULL,
      encrypt_job_id  TEXT,
      job_name        TEXT,
      company_name    TEXT,
      state           TEXT,
      state_name      TEXT,
      message         TEXT,
      err_msg         TEXT,
      err_state       TEXT,
      source          TEXT,
      updated_at      INTEGER DEFAULT (strftime('%s','now') * 1000)
    );
    CREATE UNIQUE INDEX IF NOT EXISTS idx_ai_unique ON ai_scoring_logs(time, encrypt_job_id);
    CREATE INDEX IF NOT EXISTS idx_ai_time ON ai_scoring_logs(time DESC);
  `);

  // 每日统计表（按日期 PRIMARY KEY，UPSERT）
  db.exec(`
    CREATE TABLE IF NOT EXISTS daily_statistics (
      date             TEXT PRIMARY KEY,
      raw_json         TEXT,
      success          INTEGER DEFAULT 0,
      total            INTEGER DEFAULT 0,
      company          INTEGER DEFAULT 0,
      job_title        INTEGER DEFAULT 0,
      job_content      INTEGER DEFAULT 0,
      hr_position      INTEGER DEFAULT 0,
      salary_range     INTEGER DEFAULT 0,
      company_size_range INTEGER DEFAULT 0,
      activity_filter  INTEGER DEFAULT 0,
      gold_hunter_filter INTEGER DEFAULT 0,
      repeat           INTEGER DEFAULT 0,
      job_address      INTEGER DEFAULT 0,
      amap             INTEGER DEFAULT 0,
      updated_at       INTEGER DEFAULT (strftime('%s','now') * 1000)
    );
  `);

  // 今日数据（单行）
  db.exec(`
    CREATE TABLE IF NOT EXISTS today_data (
      id          INTEGER PRIMARY KEY CHECK (id = 1),
      raw_json    TEXT,
      updated_at  INTEGER DEFAULT (strftime('%s','now') * 1000)
    );
  `);

  return db;
}

function ensureDB() {
  if (!db) init();
  return db;
}

function close() {
  if (db) {
    try { db.close(); } catch {}
    db = null;
  }
}

// ============================================================
// 写入逻辑
// ============================================================

/** 批量写入投递记录（UPSERT - 同 encryptJobId 覆盖更新） */
function upsertPipelineRecords(recordsMap, source = 'unknown') {
  const d = ensureDB();
  const stmt = d.prepare(`
    INSERT INTO pipeline_records (
      encrypt_job_id, job_name, brand_name, status, message,
      processor_type, job_id, hit_count, last_accessed, created_at, source, raw_json, updated_at
    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, strftime('%s','now') * 1000)
    ON CONFLICT(encrypt_job_id) DO UPDATE SET
      job_name       = excluded.job_name,
      brand_name     = excluded.brand_name,
      status         = excluded.status,
      message        = excluded.message,
      processor_type = excluded.processor_type,
      job_id         = excluded.job_id,
      hit_count      = excluded.hit_count,
      last_accessed  = excluded.last_accessed,
      source         = excluded.source,
      raw_json       = excluded.raw_json,
      updated_at     = strftime('%s','now') * 1000
  `);

  let inserted = 0, updated = 0;
  const tx = d.transaction((entries) => {
    for (const [, r] of entries) {
      if (!r || !r.encryptJobId) continue;
      try {
        const before = d.prepare('SELECT encrypt_job_id FROM pipeline_records WHERE encrypt_job_id = ?').get(r.encryptJobId);
        stmt.run(
          r.encryptJobId,
          r.jobName || null,
          r.brandName || null,
          r.status || null,
          r.message || null,
          r.processorType || null,
          r.jobId || null,
          r.hitCount || 0,
          r.lastAccessed || null,
          r.createdAt || null,
          source,
          JSON.stringify(r),
        );
        if (before) updated++; else inserted++;
      } catch {}
    }
  });

  tx(Object.entries(recordsMap));
  return { inserted, updated };
}

/** 批量写入 AI 评分日志（按 time+encryptJobId 去重） */
function upsertAiScoringLogs(logs, source = 'unknown') {
  const d = ensureDB();
  const stmt = d.prepare(`
    INSERT INTO ai_scoring_logs (
      time, encrypt_job_id, job_name, company_name, state, state_name,
      message, err_msg, err_state, source, updated_at
    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, strftime('%s','now') * 1000)
    ON CONFLICT(time, encrypt_job_id) DO UPDATE SET
      message     = excluded.message,
      err_msg     = excluded.err_msg,
      state       = excluded.state,
      state_name  = excluded.state_name,
      source      = excluded.source,
      updated_at  = strftime('%s','now') * 1000
  `);

  let inserted = 0, updated = 0;
  const tx = d.transaction((arr) => {
    for (const r of arr) {
      if (!r || typeof r.time !== 'number') continue;
      try {
        const before = d.prepare('SELECT id FROM ai_scoring_logs WHERE time = ? AND encrypt_job_id = ?').get(r.time, r.encryptJobId || '');
        stmt.run(
          r.time,
          r.encryptJobId || null,
          r.jobName || null,
          r.companyName || null,
          r.state || null,
          r.state_name || null,
          r.message || null,
          r.errMsg || null,
          r.errState || null,
          source,
        );
        if (before) updated++; else inserted++;
      } catch {}
    }
  });

  tx(Array.isArray(logs) ? logs : []);
  return { inserted, updated };
}

/** 写入每日统计（按日期 UPSERT - 同日期数字相加） */
function upsertDailyStatistics(stats) {
  if (!Array.isArray(stats) || stats.length === 0) return { merged: 0 };
  const d = ensureDB();

  // 先把所有现有日期读出来
  const existing = {};
  for (const row of d.prepare('SELECT * FROM daily_statistics').all()) {
    existing[row.date] = row;
  }

  let merged = 0;
  const tx = d.transaction(() => {
    for (const s of stats) {
      if (!s || !s.date) continue;
      const prev = existing[s.date];
      const mergedRow = { ...s };
      if (prev) {
        // 同日期字段相加
        for (const k of Object.keys(s)) {
          if (k === 'date' || k === 'raw_json' || k === 'updated_at') continue;
          const v = Number(s[k]) || 0;
          const pv = Number(prev[k]) || 0;
          mergedRow[k] = v + pv;
        }
        merged++;
      }
      d.prepare(`
        INSERT INTO daily_statistics (
          date, raw_json, success, total, company, job_title, job_content,
          hr_position, salary_range, company_size_range, activity_filter,
          gold_hunter_filter, repeat, job_address, amap, updated_at
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, strftime('%s','now') * 1000)
        ON CONFLICT(date) DO UPDATE SET
          raw_json    = excluded.raw_json,
          success     = excluded.success,
          total       = excluded.total,
          company     = excluded.company,
          job_title   = excluded.job_title,
          job_content = excluded.job_content,
          hr_position = excluded.hr_position,
          salary_range= excluded.salary_range,
          company_size_range = excluded.company_size_range,
          activity_filter   = excluded.activity_filter,
          gold_hunter_filter = excluded.gold_hunter_filter,
          repeat      = excluded.repeat,
          job_address = excluded.job_address,
          amap        = excluded.amap,
          updated_at  = strftime('%s','now') * 1000
      `).run(
        mergedRow.date,
        JSON.stringify(mergedRow),
        mergedRow.success || 0,
        mergedRow.total || 0,
        mergedRow.company || 0,
        mergedRow.jobTitle || 0,
        mergedRow.jobContent || 0,
        mergedRow.hrPosition || 0,
        mergedRow.salaryRange || 0,
        mergedRow.companySizeRange || 0,
        mergedRow.activityFilter || 0,
        mergedRow.goldHunterFilter || 0,
        mergedRow.repeat || 0,
        mergedRow.jobAddress || 0,
        mergedRow.amap || 0,
      );
    }
  });

  tx();
  return { merged };
}

/** 写入今日数据（UPSERT 单行） */
function upsertToday(today) {
  if (!today) return;
  const d = ensureDB();
  d.prepare(`
    INSERT INTO today_data (id, raw_json, updated_at)
    VALUES (1, ?, strftime('%s','now') * 1000)
    ON CONFLICT(id) DO UPDATE SET
      raw_json = excluded.raw_json,
      updated_at = strftime('%s','now') * 1000
  `).run(JSON.stringify(today));
}

// ============================================================
// 读取逻辑（用于生成 extension-data.json）
// ============================================================

/** 读取所有投递记录为对象 { [encryptJobId]: record } */
function getAllPipelineData() {
  const d = ensureDB();
  const rows = d.prepare(`SELECT raw_json FROM pipeline_records ORDER BY created_at DESC`).all();
  const result = {};
  for (const r of rows) {
    try {
      const obj = JSON.parse(r.raw_json);
      if (obj && obj.encryptJobId) result[obj.encryptJobId] = obj;
    } catch {}
  }
  return result;
}

/** 读取所有 AI 评分日志 */
function getAllAiScoringLogs() {
  const d = ensureDB();
  const rows = d.prepare(`SELECT * FROM ai_scoring_logs ORDER BY time DESC`).all();
  return rows.map(r => ({
    time: r.time,
    encryptJobId: r.encrypt_job_id,
    jobName: r.job_name,
    companyName: r.company_name,
    state: r.state,
    state_name: r.state_name,
    message: r.message,
    errMsg: r.err_msg,
    errState: r.err_state,
    source: r.source,
  }));
}

/** 读取每日统计 */
function getAllDailyStatistics() {
  const d = ensureDB();
  const rows = d.prepare(`SELECT raw_json FROM daily_statistics ORDER BY date ASC`).all();
  return rows.map(r => {
    try { return JSON.parse(r.raw_json); } catch { return null; }
  }).filter(Boolean);
}

/** 读取今日数据 */
function getToday() {
  const d = ensureDB();
  const row = d.prepare(`SELECT raw_json FROM today_data WHERE id = 1`).get();
  if (!row) return null;
  try { return JSON.parse(row.raw_json); } catch { return null; }
}

/** 统计数据库中的记录数 */
function getStats() {
  const d = ensureDB();
  const pipe = d.prepare(`SELECT COUNT(*) as c FROM pipeline_records`).get();
  const ai = d.prepare(`SELECT COUNT(*) as c FROM ai_scoring_logs`).get();
  const stats = d.prepare(`SELECT COUNT(*) as c FROM daily_statistics`).get();
  return {
    pipeline: pipe.c,
    aiScoring: ai.c,
    dailyStats: stats.c,
  };
}

/** 读取其他非核心字段（conf-user、sameHr、netConf-* 等配置） */
function getOtherFields() {
  // 这些字段目前未迁移到数据库（属于配置/非历史数据）
  // 如果需要可扩展
  return {};
}

/** 从数据库生成完整 extension-data.json 结构 */
function buildFullExport(extraMeta = {}) {
  const pipelineData = getAllPipelineData();
  const aiLogs = getAllAiScoringLogs();
  const stats = getAllDailyStatistics();
  const today = getToday();

  const data = {
    _meta: {
      exportedAt: new Date().toISOString(),
      source: 'sqlite',
      ...extraMeta,
    },
    'pipeline-cache': { data: pipelineData },
    'ai-scoring-logs': aiLogs,
    'web-geek-job-Statistics': stats,
  };

  if (today) data['web-geek-job-Today'] = today;
  return data;
}

/** 写入 extension-data.json（同时备份至 dist/ 和每日快照） */
function writeJsonOutputs(mergedData) {
  // 1. 主输出文件
  if (!fs.existsSync(PUBLIC_DIR)) fs.mkdirSync(PUBLIC_DIR, { recursive: true });
  fs.writeFileSync(OUTPUT_PATH, JSON.stringify(mergedData, null, 2), 'utf-8');

  // 2. dist 备份
  const DIST_DIR = path.join(__dirname, '..', 'dist');
  if (!fs.existsSync(DIST_DIR)) fs.mkdirSync(DIST_DIR, { recursive: true });
  fs.copyFileSync(OUTPUT_PATH, path.join(DIST_DIR, 'extension-data.json'));

  // 3. 每日快照（按 YYYY-MM-DD）
  if (!fs.existsSync(SNAPSHOT_DIR)) fs.mkdirSync(SNAPSHOT_DIR, { recursive: true });
  const today = new Date().toISOString().slice(0, 10);
  const snapshotPath = path.join(SNAPSHOT_DIR, `extension-data-${today}.json`);
  fs.copyFileSync(OUTPUT_PATH, snapshotPath);

  return { output: OUTPUT_PATH, snapshot: snapshotPath };
}

module.exports = {
  init,
  close,
  ensureDB,
  upsertPipelineRecords,
  upsertAiScoringLogs,
  upsertDailyStatistics,
  upsertToday,
  getAllPipelineData,
  getAllAiScoringLogs,
  getAllDailyStatistics,
  getToday,
  getStats,
  buildFullExport,
  writeJsonOutputs,
  OUTPUT_PATH,
  DB_PATH,
  SNAPSHOT_DIR,
};

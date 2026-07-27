const path = require('path');
const fs = require('fs');
const { Level } = require('level');
const Database = require('better-sqlite3');
const snappy = require('snappy');

// Firefox 配置文件列表（自动扫描）
const FF_PROFILES_DIR = path.join(process.env.APPDATA, 'Mozilla', 'Firefox', 'Profiles');

/** 清理 JSON 字符串中的控制字符 */
function sanitizeJson(str) {
  return str.replace(/[\x00-\x1F]/g, '');
}

/**
 * 从 Chrome Local Storage LevelDB 中读取 boss_ai_scoring 数据
 */
async function readChromeAiScoring() {
  const lsPath = path.join(
    process.env.LOCALAPPDATA,
    'Google', 'Chrome', 'User Data', 'Default', 'Local Storage', 'leveldb'
  );

  if (!fs.existsSync(lsPath)) {
    console.log('  [AI评分-Chrome] 目录不存在');
    return [];
  }

  const tmpPath = path.join(process.env.TEMP || '/tmp', 'boss-ais-chrome-' + Date.now());
  if (fs.existsSync(tmpPath)) fs.rmSync(tmpPath, { recursive: true, force: true });
  try {
    fs.mkdirSync(tmpPath, { recursive: true });
    const items = fs.readdirSync(lsPath);
    let ok = 0;
    for (const item of items) {
      try {
        fs.copyFileSync(path.join(lsPath, item), path.join(tmpPath, item));
        ok++;
      } catch {}
    }
    if (ok === 0) return [];
  } catch (e) {
    return [];
  }

  let records = [];

  try {
    const db = new Level(tmpPath, { valueEncoding: 'buffer', createIfMissing: false });
    await db.open();
    const keys = await db.keys().all();

    for (const key of keys) {
      if (!key.includes('boss_ai_scoring')) continue;

      const buf = await db.get(key);

      // 查找 UTF-16LE 编码的 JSON 数组起始
      let start = -1;
      for (let i = 0; i < buf.length - 1; i++) {
        if (buf[i] === 0x5B && buf[i + 1] === 0x00) { // [ + \0 = UTF-16LE '['
          start = i;
          break;
        }
      }
      if (start < 0) continue;

      const jsonBuf = buf.slice(start);
      const jsonStr = jsonBuf.toString('utf16le');

      const closeIdx = jsonStr.lastIndexOf(']');
      if (closeIdx < 0) continue;

      const cleanJson = jsonStr.slice(0, closeIdx + 1);
      try {
        const parsed = JSON.parse(cleanJson);
        if (Array.isArray(parsed)) {
          records = records.concat(parsed);
        }
      } catch {}
    }

    await db.close();
  } catch {} finally {
    try { fs.rmSync(tmpPath, { recursive: true, force: true }); } catch {}
  }

  return records;
}

/**
 * 从 Firefox localStorage SQLite 中读取 boss_ai_scoring 数据
 * Firefox 的 localStorage 存储在：
 *   %APPDATA%\Mozilla\Firefox\Profiles\{profile}\storage\default\https+++www.zhipin.com\ls\data.sqlite
 * 新版 Firefox 使用 Snappy 压缩存储 BLOB 数据
 */
async function readFirefoxAiScoring() {
  if (!fs.existsSync(FF_PROFILES_DIR)) return [];

  const profiles = fs.readdirSync(FF_PROFILES_DIR).filter(d => {
    const ini = path.join(FF_PROFILES_DIR, d, 'storage', 'default');
    return fs.existsSync(ini);
  });

  let records = [];
  for (const profile of profiles) {
    const possiblePaths = [
      path.join(FF_PROFILES_DIR, profile, 'storage', 'default', 'https+++www.zhipin.com', 'ls', 'data.sqlite'),
      path.join(FF_PROFILES_DIR, profile, 'storage', 'default', 'https+++zhipin.com', 'ls', 'data.sqlite'),
      path.join(FF_PROFILES_DIR, profile, 'storage', 'default', 'http+++www.zhipin.com', 'ls', 'data.sqlite'),
    ];

    for (const sqlitePath of possiblePaths) {
      if (!fs.existsSync(sqlitePath)) continue;

      const tmpPath = path.join(process.env.TEMP || '/tmp', 'boss-ais-ff-' + Date.now() + '-' + Math.random().toString(36).slice(2, 4) + '.sqlite');
      try {
        fs.copyFileSync(sqlitePath, tmpPath);
        const db = new Database(tmpPath, { readonly: true });
        let rows;
        try {
          rows = db.prepare("SELECT key, value FROM data WHERE key = ?").all('boss_ai_scoring');
        } catch {
          // 兼容旧版 Firefox
          try { rows = db.prepare("SELECT key, value FROM webappsstore2 WHERE key = ?").all('boss_ai_scoring'); } catch {}
        }
        db.close();

        if (!rows || rows.length === 0) continue;

        for (const row of rows) {
          try {
            const buf = Buffer.isBuffer(row.value) ? row.value : Buffer.from(row.value);
            let jsonStr = null;

            // 尝试 Snappy 解压（新版 Firefox 使用 Snappy 压缩 BLOB）
            try {
              const decompressed = snappy.uncompressSync(buf);
              jsonStr = decompressed.toString('utf8');
            } catch {
              // 可能是未压缩的原始数据
            }

            // 如果 Snappy 解压失败，尝试直接解码
            if (!jsonStr) {
              // 尝试 UTF-16LE
              let start = -1;
              for (let i = 0; i < buf.length - 1; i++) {
                if (buf[i] === 0x5B && buf[i + 1] === 0x00) { // [ + \0 = UTF-16LE '['
                  start = i;
                  break;
                }
              }
              if (start >= 0) {
                const jsonBuf = buf.slice(start);
                const utf16Str = jsonBuf.toString('utf16le');
                const closeIdx = utf16Str.lastIndexOf(']');
                if (closeIdx >= 0) {
                  jsonStr = utf16Str.slice(0, closeIdx + 1);
                }
              }

              // 直接尝试 UTF-8
              if (!jsonStr) {
                try {
                  jsonStr = buf.toString('utf8').replace(/^\x00+/, '').replace(/\x00+$/, '');
                } catch {}
              }
            }

            if (!jsonStr) continue;

            // 尝试直接解析整个 JSON 数组
            try {
              const parsed = JSON.parse(jsonStr);
              if (Array.isArray(parsed)) {
                records = records.concat(parsed);
                break; // 单个 row 就够了
              }
            } catch {
              // 如果整个数组解析失败，退回到逐个对象提取
              let depth = 0, objStart = -1, inStr = false, esc = false;
              for (let i = 0; i < jsonStr.length; i++) {
                const c = jsonStr[i];
                if (inStr) {
                  if (esc) { esc = false; continue; }
                  if (c === '\\') { esc = true; continue; }
                  if (c === '"') { inStr = false; }
                  continue;
                }
                if (c === '"') { inStr = true; continue; }
                if (c === '{') {
                  if (depth === 0) objStart = i;
                  depth++;
                } else if (c === '}') {
                  depth--;
                  if (depth === 0 && objStart >= 0) {
                    try {
                      const obj = JSON.parse(jsonStr.slice(objStart, i + 1));
                      if (obj && typeof obj === 'object' && obj.time) {
                        records.push(obj);
                      }
                    } catch {}
                    objStart = -1;
                  }
                }
              }
            }
          } catch {}
        }
      } catch {} finally {
        try { fs.unlinkSync(tmpPath); } catch {}
      }
      break;
    }
  }

  return records;
}

/**
 * 从 Chrome 和 Firefox 读取 AI 评分日志，合并后去重
 */
async function readAiScoringLogs() {
  console.log('  [AI评分] 正在从浏览器读取...');

  // 同时读取两个浏览器
  const [chromeRecords, firefoxRecords] = await Promise.all([
    readChromeAiScoring(),
    readFirefoxAiScoring(),
  ]);

  if (chromeRecords.length > 0) {
    console.log(`  [AI评分-Chrome] ✅ ${chromeRecords.length} 条`);
  } else {
    console.log('  [AI评分-Chrome] ℹ️ 暂无评分日志');
  }

  if (firefoxRecords.length > 0) {
    console.log(`  [AI评分-Firefox] ✅ ${firefoxRecords.length} 条`);
  } else {
    console.log('  [AI评分-Firefox] ℹ️ 暂无评分日志');
  }

  // 合并 + 去重
  const all = [...chromeRecords, ...firefoxRecords];
  const seen = new Set();
  const unique = all.filter(r => {
    const key = r.time + '-' + (r.encryptJobId || '');
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  });

  // 按时间降序
  unique.sort((a, b) => (b.time || 0) - (a.time || 0));

  console.log(`  [AI评分] 📊 合并后共 ${unique.length} 条（Chrome ${chromeRecords.length} + Firefox ${firefoxRecords.length}）`);
  return unique;
}

/**
 * 从 Chrome Local Storage LevelDB 读取 boss_pipeline_cache（投递记录）
 * 读取方式与 readChromeAiScoring 相同，但解析的是 JSON 对象而非数组
 */
async function readChromePipelineCache() {
  const lsPath = path.join(
    process.env.LOCALAPPDATA,
    'Google', 'Chrome', 'User Data', 'Default', 'Local Storage', 'leveldb'
  );

  if (!fs.existsSync(lsPath)) return null;

  const tmpPath = path.join(process.env.TEMP || '/tmp', 'boss-plc-chrome-' + Date.now());
  if (fs.existsSync(tmpPath)) fs.rmSync(tmpPath, { recursive: true, force: true });
  try {
    fs.mkdirSync(tmpPath, { recursive: true });
    const items = fs.readdirSync(lsPath);
    let ok = 0;
    for (const item of items) {
      try {
        fs.copyFileSync(path.join(lsPath, item), path.join(tmpPath, item));
        ok++;
      } catch {}
    }
    if (ok === 0) return null;
  } catch (e) {
    return null;
  }

  let pipelineData = null;

  try {
    const db = new Level(tmpPath, { valueEncoding: 'buffer', createIfMissing: false });
    await db.open();
    const keys = await db.keys().all();

    // 合并所有 origin 的 boss_pipeline_cache（www.zhipin.com / zhipin.com / cv.zhipin.com 等）
    // 之前只保留最后一个 origin 的数据，会导致跨 origin 投递记录丢失
    const mergedByOrigin = {};

    for (const key of keys) {
      if (!key.includes('boss_pipeline_cache')) continue;

      const buf = await db.get(key);

      // 查找 UTF-16LE 编码的 JSON 对象起始 {
      let start = -1;
      for (let i = 0; i < buf.length - 1; i++) {
        if (buf[i] === 0x7B && buf[i + 1] === 0x00) { // { + \0 = UTF-16LE '{'
          start = i;
          break;
        }
      }
      if (start < 0) continue;

      const jsonBuf = buf.slice(start);
      const jsonStr = jsonBuf.toString('utf16le');

      const closeIdx = jsonStr.lastIndexOf('}');
      if (closeIdx < 0) continue;

      const cleanJson = jsonStr.slice(0, closeIdx + 1);
      try {
        const parsed = JSON.parse(cleanJson);
        if (parsed && typeof parsed === 'object') {
          // localStorage 的 boss_pipeline_cache 顶层就是 {encryptJobId: {...}}
          // 合并到 mergedByOrigin（后扫到的不覆盖前扫到的，保留首次写入的版本）
          for (const id of Object.keys(parsed)) {
            if (!(id in mergedByOrigin)) {
              mergedByOrigin[id] = parsed[id];
            }
          }
        }
      } catch {}
    }

    if (Object.keys(mergedByOrigin).length > 0) {
      pipelineData = mergedByOrigin;
    }

    await db.close();
  } catch {} finally {
    try { fs.rmSync(tmpPath, { recursive: true, force: true }); } catch {}
  }

  return pipelineData;
}

/**
 * 从 Firefox localStorage SQLite 读取 boss_pipeline_cache
 * 注意：新版 Firefox 表名为 data，value 为 BLOB(UTF-16LE)
 */
async function readFirefoxPipelineCache() {
  if (!fs.existsSync(FF_PROFILES_DIR)) return null;

  const profiles = fs.readdirSync(FF_PROFILES_DIR).filter(d => {
    const ini = path.join(FF_PROFILES_DIR, d, 'storage', 'default');
    return fs.existsSync(ini);
  });

  for (const profile of profiles) {
    const possiblePaths = [
      path.join(FF_PROFILES_DIR, profile, 'storage', 'default', 'https+++www.zhipin.com', 'ls', 'data.sqlite'),
      path.join(FF_PROFILES_DIR, profile, 'storage', 'default', 'https+++zhipin.com', 'ls', 'data.sqlite'),
      path.join(FF_PROFILES_DIR, profile, 'storage', 'default', 'http+++www.zhipin.com', 'ls', 'data.sqlite'),
    ];

    for (const sqlitePath of possiblePaths) {
      if (!fs.existsSync(sqlitePath)) continue;

      const tmpPath = path.join(process.env.TEMP || '/tmp', 'boss-plc-ff-' + Date.now() + '-' + Math.random().toString(36).slice(2, 4) + '.sqlite');
      try {
        fs.copyFileSync(sqlitePath, tmpPath);
        const db = new Database(tmpPath, { readonly: true });
        let rows;
        try {
          rows = db.prepare("SELECT key, value FROM data WHERE key = ?").all('boss_pipeline_cache');
        } catch {
          rows = db.prepare("SELECT key, value FROM webappsstore2 WHERE key = ?").all('boss_pipeline_cache');
        }
        db.close();

        for (const row of rows) {
          try {
            const buf = Buffer.isBuffer(row.value) ? row.value : Buffer.from(row.value);
            let jsonStr = null;

            // 尝试 Snappy 解压（新版 Firefox 使用 Snappy 压缩 BLOB）
            try {
              const decompressed = snappy.uncompressSync(buf);
              jsonStr = decompressed.toString('utf8');
            } catch {
              // 可能是未压缩的原始数据（旧版 Firefox 或直接存储）
            }

            // 如果 Snappy 解压失败，尝试直接解码
            if (!jsonStr) {
              // 尝试 UTF-16LE 解码（Chrome LocalStorage 格式）
              let start = -1;
              for (let i = 0; i < buf.length - 1; i++) {
                if (buf[i] === 0x7B && buf[i + 1] === 0x00) { // { + \0 = UTF-16LE '{'
                  start = i;
                  break;
                }
              }
              if (start >= 0) {
                const jsonBuf = buf.slice(start);
                const utf16Str = jsonBuf.toString('utf16le');
                const closeIdx = utf16Str.lastIndexOf('}');
                if (closeIdx >= 0) {
                  jsonStr = utf16Str.slice(0, closeIdx + 1);
                }
              }

              // 如果还是不行，直接尝试 UTF-8
              if (!jsonStr) {
                try {
                  jsonStr = buf.toString('utf8').replace(/^\x00+/, '').replace(/\x00+$/, '');
                } catch {}
              }
            }

            if (!jsonStr) continue;

            const parsed = JSON.parse(jsonStr);
            if (parsed && typeof parsed === 'object') {
              return parsed;
            }
          } catch {}
        }
      } catch {} finally {
        try { fs.unlinkSync(tmpPath); } catch {}
      }
      break;
    }
  }

  return null;
}

module.exports = { readAiScoringLogs, readChromePipelineCache, readFirefoxPipelineCache };

// 直接运行时输出
if (require.main === module) {
  readAiScoringLogs().then(records => {
    const withScore = records.filter(r => r.message && r.message.includes('分数'));
    console.log(`📊 共提取 ${records.length} 条 AI 评分记录，其中 ${withScore.length} 条包含评分文本`);
    process.stdout.write(JSON.stringify(records, null, 2));
  }).catch(e => {
    console.error('❌ 失败:', e.message);
    process.exit(1);
  });
}

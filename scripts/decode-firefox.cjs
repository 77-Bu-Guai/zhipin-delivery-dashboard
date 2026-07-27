// Firefox 结构化克隆数据解码器 v4
// 支持 UTF-16LE 字符串、Boolean、null、Date 等类型
// 修复：使用 END_MARKER 哨兵区分 null 值和对象/数组结束标记
const path = require('path');
const fs = require('fs');
const Database = require('better-sqlite3');
const snappy = require('snappy');

// 哨兵值：区分结构化克隆的"结束标记"和真正的 null 值
const END_MARKER = Symbol('sc_end');

function caesarDecode(str) {
  return str.split('').map(c => {
    const code = c.charCodeAt(0);
    if (code >= 65 && code <= 90) return String.fromCharCode(((code - 65 - 1 + 26) % 26) + 65);
    if (code >= 97 && code <= 122) return String.fromCharCode(((code - 97 - 1 + 26) % 26) + 97);
    return c;
  }).join('');
}

/**
 * 解析 Firefox 结构化克隆数据
 * 64-bit 标记格式 (little-endian 读取):
 * - 字符串(ASCII): [byte_len] 00 00 80 04 00 ff ff → high=FFFF0004, upper=8000, tag=byte_len
 * - 字符串(UTF-16): [byte_len] 00 00 00 04 00 ff ff → high=FFFF0004, upper=0000, tag=byte_len
 * - 整数:          [value] 00 00 00 03 00 ff ff → high=FFFF0003, upper=0000, tag=value
 * - 布尔:          [0/1] 00 00 00 02 00 ff ff → high=FFFF0002, upper=0000, tag=0/1
 * - null:          00 00 00 00 06 00 ff ff → high=FFFF0006
 * - 对象:          00 00 00 00 08 00 ff ff → high=FFFF0008
 * - 数组:          [count] 00 00 00 07 00 ff ff → high=FFFF0007, tag=count
 * - 结束:          00 00 00 00 13 00 ff ff → high=FFFF0013
 * - 头:            03 00 00 00 00 00 f1 ff → high=FFF10000, tag=0003
 */
function decodeStructuredClone(buf) {
  const off = { offset: 0 };
  return readValue(buf, off);
}

function readMarker(buf, off) {
  if (off.offset + 8 > buf.length) return null;
  const m = buf.readBigUInt64LE(off.offset);
  off.offset += 8;
  return {
    raw: m,
    tag: Number(m & 0xFFFFn),
    upper: Number((m >> 16n) & 0xFFFFn),
    high: Number((m >> 32n) & 0xFFFFFFFFn),
  };
}

function readValue(buf, off) {
  const m = readMarker(buf, off);
  if (!m) return null;
  
  // 头部标记: 03 00 00 00 00 00 f1 ff
  if (m.tag === 0x0003 && m.upper === 0x0000 && m.high === 0xFFF10000) {
    return readValue(buf, off);
  }
  
  // 对象开始: 00 00 00 00 08 00 ff ff
  if (m.tag === 0x0000 && m.upper === 0x0000 && m.high === 0xFFFF0008) {
    return readObject(buf, off);
  }
  
  // 数组开始: [count] 00 00 00 07 00 ff ff
  if (m.upper === 0x0000 && m.high === 0xFFFF0007) {
    return readArray(buf, off, m.tag);
  }
  
  // 字符串 (ASCII/Latin-1 或 UTF-16LE)
  // high=FFFF0004, 通过 upper 区分编码: 0x8000=Latin-1, 0x0000=UTF-16LE
  // 注意: ASCII 字符串 tag=字节数, UTF-16LE 字符串 tag=字符数(需×2得字节数)
  if (m.high === 0xFFFF0004) {
    const isWide = m.upper === 0x0000;
    const byteLen = isWide ? m.tag * 2 : m.tag;
    if (off.offset + byteLen > buf.length) return '';
    const raw = buf.slice(off.offset, off.offset + byteLen);
    off.offset += byteLen;
    // 对齐到 8 字节
    off.offset = (off.offset + 7) & ~7;
    if (isWide) {
      return raw.toString('utf16le');
    }
    return raw.toString('utf-8');
  }
  
  // 整数: [value] 00 00 00 03 00 ff ff（小整数 tag 内）
  // 或 32-bit: [value_low] [value_high] 03 00 ff ff
  if (m.high === 0xFFFF0003) {
    if (m.upper === 0x0000) return m.tag;
    // 32-bit integer: (upper << 16) | tag
    return (m.upper << 16) | m.tag;
  }
  
  // 布尔: [0/1] 00 00 00 02 00 ff ff
  if (m.upper === 0x0000 && m.high === 0xFFFF0002) {
    return m.tag === 1;
  }
  
  // null: 00 00 00 00 06 00 ff ff
  if (m.tag === 0x0000 && m.upper === 0x0000 && m.high === 0xFFFF0006) {
    return null;
  }
  
  // 结束标记: 00 00 00 00 13 00 ff ff
  // 使用哨兵值区分"结束标记"和真正的 null 值
  if (m.tag === 0x0000 && m.upper === 0x0000 && m.high === 0xFFFF0013) {
    return END_MARKER;
  }
  
  // 回退: 如果不是标记格式 (high 不以 0xFFFF 开头)，可能是 double 值
  // Firefox 结构化克隆中 Date 直接存为 8 字节 double
  if ((m.high & 0xFFFF0000) !== 0xFFFF0000) {
    // 解释为 double (little-endian)
    const doubleBuf = Buffer.alloc(8);
    doubleBuf.writeBigUInt64LE(m.raw);
    const doubleVal = doubleBuf.readDoubleLE(0);
    // 判断是否为合理的日期时间戳 (1970-2100 年范围: ~0 到 ~4.1e12 毫秒)
    if (doubleVal > 0 && doubleVal < 4100000000000) {
      return new Date(doubleVal).toISOString();
    }
    return doubleVal;
  }
  
  // 未知标记
  console.log(`  未知标记 at ${off.offset - 8}: raw=${m.raw.toString(16)}, tag=${m.tag.toString(16)}, upper=${m.upper.toString(16)}, high=${m.high.toString(16)}`);
  return null;
}

function readObject(buf, off) {
  const obj = {};
  while (off.offset < buf.length) {
    const key = readValue(buf, off);
    // 结束标记 → 对象结束
    if (key === END_MARKER) break;
    // 未知标记，跳过
    if (key === null || typeof key !== 'string') {
      continue;
    }
    
    const value = readValue(buf, off);
    // 结束标记 → 对象结束
    if (value === END_MARKER) break;
    
    obj[key] = value;
  }
  return obj;
}

function readArray(buf, off, count) {
  const arr = [];
  for (let i = 0; i < count; i++) {
    const value = readValue(buf, off);
    if (value === END_MARKER) break;
    arr.push(value);
  }
  return arr;
}

// Firefox key → Chrome key 映射（Firefox 用 . 分隔，Chrome 用 - 分隔）
const KEY_MAP = {
  '0pipeline.cache': 'pipeline-cache',
  '0web.geek.job.Statistics': 'web-geek-job-Statistics',
  '0web.geek.job.Today': 'web-geek-job-Today',
  '0web.geek.job.FormData': 'web-geek-job-FormData',
  '0sameHr': 'sameHr',
};

// ====== 读取 Firefox 数据 ======
function readFirefoxStorageData(profileName, options = {}) {
  const { verbose = false, dbPath: externalDbPath } = options;
  const log = verbose ? console.log : () => {};

  // 如果传入了外部 dbPath，直接使用（多轮重试场景）
  if (externalDbPath) {
    if (!fs.existsSync(externalDbPath)) {
      log(`  [Firefox] 外部 dbPath 不存在: ${externalDbPath}`);
      return {};
    }
    return readFromSqlite(externalDbPath, log);
  }

  const profile = profileName || 'uz0ave2f.default-release-1782316007966';
  const ffProf = path.join(process.env.APPDATA, 'Mozilla', 'Firefox', 'Profiles', profile, 'storage', 'default');

  if (!fs.existsSync(ffProf)) {
    log(`  [Firefox] 路径不存在: ${ffProf}`);
    return {};
  }

  const dirs = fs.readdirSync(ffProf);
  const extDir = dirs.find(d => d.startsWith('moz-extension'));
  if (!extDir) {
    log('  [Firefox] 未找到 moz-extension 目录');
    return {};
  }

  const idbPath = path.join(ffProf, extDir, 'idb');
  if (!fs.existsSync(idbPath)) {
    log('  [Firefox] idb 目录不存在');
    return {};
  }

  const files = fs.readdirSync(idbPath).filter(f => f.endsWith('.sqlite') && !f.endsWith('-shm') && !f.endsWith('-wal'));
  if (files.length === 0) {
    log('  [Firefox] 未找到 .sqlite 文件');
    return {};
  }

  const src = path.join(idbPath, files[0]);
  const tmp = path.join(process.env.TEMP || '/tmp', 'ff-export-v3.sqlite');
  fs.copyFileSync(src, tmp);

  const result = readFromSqlite(tmp, log);
  try { fs.unlinkSync(tmp); } catch {}
  return result;
}

/** 从指定的 SQLite 文件读取 IndexedDB 数据 */
function readFromSqlite(sqlitePath, log = () => {}) {
  let decodeErrors = [];
  
  try {
    const db = new Database(sqlitePath, { readonly: true });
    const rows = db.prepare("SELECT key, data FROM object_data").all();
    
    const result = {};
    let recordCount = 0;

    for (const row of rows) {
      const rawKey = Buffer.from(row.key).toString('utf-8');
      const decodedKey = caesarDecode(rawKey);
      const normalizedKey = KEY_MAP[decodedKey];

      if (!normalizedKey && decodedKey.startsWith('0netConf')) continue;
      if (!normalizedKey) {
        log(`  [Firefox] ⏭️ 跳过未知键: ${decodedKey}`);
        continue;
      }

      const dataBuf = Buffer.from(row.data);
      const isPipeline = normalizedKey === 'pipeline-cache';

      try {
        // 尝试 Snappy 解压
        let decompressed;
        try {
          decompressed = snappy.uncompressSync(dataBuf);
        } catch (e) {
          decodeErrors.push(`${normalizedKey}: Snappy 解压失败 (${e.message})`);
          if (isPipeline) {
            // pipeline-cache 必须解压成功，跳过
            continue;
          }
          // 非 pipeline 键尝试直接使用原始数据
          decompressed = dataBuf;
        }

        const decoded = decodeStructuredClone(decompressed);
        result[normalizedKey] = decoded;

        if (isPipeline && decoded?.data) {
          recordCount = Object.keys(decoded.data).length;
        } else if (isPipeline) {
          decodeErrors.push('pipeline-cache: 解码后无 data 字段');
        }
        log(`  [Firefox] ✅ ${normalizedKey}: ${JSON.stringify(decoded).slice(0, 80)}`);
      } catch (e) {
        const errMsg = `${normalizedKey}: 结构化克隆解码失败 (${e.message})`;
        decodeErrors.push(errMsg);
        log(`  [Firefox] ❌ ${errMsg}`);
      }
    }

    db.close();

    if (recordCount > 0) {
      console.log(`  [Firefox] ✅ 读取成功，${recordCount} 条投递记录`);
    } else {
      console.log(`  [Firefox] ⚠️ 未找到投递记录`);
    }

    // 输出解码错误汇总
    if (decodeErrors.length > 0) {
      console.log(`  [Firefox] ⚠️ ${decodeErrors.length} 个解码问题:`);
      for (const err of decodeErrors) {
        console.log(`     - ${err}`);
      }
    }
    
    return result;
  } catch (e) {
    console.log(`  [Firefox] ❌ SQLite 读取失败: ${e.message}`);
    return {};
  }
}

if (require.main === module) {
  console.log('🔍 测试 Firefox 数据解码 v3...\n');
  const data = readFirefoxStorageData(null, { verbose: true });
  console.log('\n📊 解码结果:');
  for (const [key, value] of Object.entries(data)) {
    if (key === 'pipeline-cache' || key === 'web-geek-job-Statistics' || key === 'web-geek-job-Today') {
      console.log(`\n${key}:`, JSON.stringify(value, null, 2).slice(0, 3000));
    }
  }
}

module.exports = { readFirefoxStorageData, caesarDecode };
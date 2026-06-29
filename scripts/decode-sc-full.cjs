// 完整的 Firefox 结构化克隆数据解码器
// 基于 Firefox JS Structured Clone 格式规范
const path = require('path');
const fs = require('fs');
const Database = require('better-sqlite3');

// Caesar 解码
function caesarDecode(str) {
  return str.split('').map(c => {
    const code = c.charCodeAt(0);
    if (code >= 65 && code <= 90) return String.fromCharCode(((code - 65 - 1 + 26) % 26) + 65);
    if (code >= 97 && code <= 122) return String.fromCharCode(((code - 97 - 1 + 26) % 26) + 97);
    return c;
  }).join('');
}

// 结构化克隆标签
const SCTAG_FLOAT32 = 0xFFF0;
const SCTAG_FLOAT64 = 0xFFF1;
const SCTAG_NULL = 0xFFF2;
const SCTAG_UNDEFINED = 0xFFF3;
const SCTAG_BOOLEAN = 0xFFF4;
const SCTAG_INT32 = 0xFFF5;
const SCTAG_STRING = 0xFFF6;
const SCTAG_DATE_OBJECT = 0xFFF7;
const SCTAG_REGEXP_OBJECT = 0xFFF8;
const SCTAG_ARRAY_OBJECT = 0xFFF9;
const SCTAG_OBJECT_OBJECT = 0xFFFA;
const SCTAG_ARRAY_BUFFER_OBJECT = 0xFFFB;
const SCTAG_BOOLEAN_OBJECT = 0xFFFC;
const SCTAG_STRING_OBJECT = 0xFFFD;
const SCTAG_NUMBER_OBJECT = 0xFFFE;
const SCTAG_BACK_REFERENCE_OBJECT = 0xFFFF;

// 读取 64-bit 小端序
function readU64(buf, off) {
  return Number(buf.readBigUInt64LE(off.offset));
}

// 读取 32-bit 小端序
function readU32(buf, off) {
  const v = buf.readUInt32LE(off.offset);
  off.offset += 4;
  return v;
}

// 读取 double
function readDouble(buf, off) {
  const v = buf.readDoubleLE(off.offset);
  off.offset += 8;
  return v;
}

// 使用 BufferList 格式解析
// BufferList 格式: [4字节: 段大小(字节)][数据] 重复
function parseBufferList(buf) {
  let offset = 0;
  const segments = [];
  
  while (offset < buf.length) {
    if (offset + 4 > buf.length) break;
    const segSize = buf.readUInt32LE(offset);
    offset += 4;
    
    if (segSize === 0) break;
    if (offset + segSize > buf.length) break;
    
    segments.push(buf.slice(offset, offset + segSize));
    offset += segSize;
  }
  
  return segments;
}

// 尝试不同方式解析数据
function tryDecodeValue(buf) {
  const results = {};
  
  // 方法1: 跳过前8字节(scope)，然后解析BufferList
  if (buf.length > 8) {
    const scope = buf.readBigUInt64LE(0);
    const remaining = buf.slice(8);
    const segments = parseBufferList(remaining);
    results.method1 = { scope: scope.toString(16), segments: segments.length, segSizes: segments.map(s => s.length) };
    
    // 如果只有一个段，尝试解析为结构化克隆数据
    if (segments.length === 1) {
      const scData = segments[0];
      try {
        const decoded = decodeStructuredClone(scData);
        results.method1Decoded = decoded;
      } catch (e) {
        results.method1Error = e.message;
      }
    }
  }
  
  // 方法2: 整个buf作为BufferList解析
  const segments = parseBufferList(buf);
  results.method2 = { segments: segments.length, segSizes: segments.map(s => s.length) };
  
  // 方法3: 跳过前4字节，解析BufferList
  if (buf.length > 4) {
    const remaining = buf.slice(4);
    const segments2 = parseBufferList(remaining);
    results.method3 = { segments: segments2.length, segSizes: segments2.map(s => s.length) };
  }
  
  // 方法4: 尝试snappy解压
  try {
    const snappy = require('snappy');
    const decompressed = snappy.uncompressSync(buf);
    results.snappyDecompressed = decompressed.length;
    try {
      const decoded = decodeStructuredClone(decompressed);
      results.snappyDecoded = decoded;
    } catch (e) {
      results.snappyDecodedError = e.message;
    }
  } catch (e) {
    results.snappyError = e.message;
  }
  
  return results;
}

// 结构化克隆解码器
function decodeStructuredClone(buf) {
  const off = { offset: 0 };
  const result = readStructuredCloneValue(buf, off);
  return result;
}

function readStructuredCloneValue(buf, off) {
  if (off.offset >= buf.length) return undefined;
  
  const tag = readU32(buf, off);
  
  switch (tag) {
    case SCTAG_FLOAT64:
      return readDouble(buf, off);
    
    case SCTAG_NULL:
      return null;
    
    case SCTAG_UNDEFINED:
      return undefined;
    
    case SCTAG_BOOLEAN: {
      const v = readU32(buf, off);
      return v === 1;
    }
    
    case SCTAG_INT32:
      return readU32(buf, off);
    
    case SCTAG_STRING: {
      const len = readU32(buf, off);
      const isWide = len & 0x80000000;
      const actualLen = len & 0x7FFFFFFF;
      
      if (isWide) {
        // UTF-16 字符串
        const chars = [];
        for (let i = 0; i < actualLen; i++) {
          chars.push(buf.readUInt16LE(off.offset));
          off.offset += 2;
        }
        // 对齐到4字节
        if (off.offset % 4 !== 0) off.offset += 4 - (off.offset % 4);
        return String.fromCharCode(...chars);
      } else {
        // Latin1 字符串
        const str = buf.slice(off.offset, off.offset + actualLen).toString('latin1');
        off.offset += actualLen;
        // 对齐到4字节
        if (off.offset % 4 !== 0) off.offset += 4 - (off.offset % 4);
        return str;
      }
    }
    
    case SCTAG_DATE_OBJECT: {
      const ms = readDouble(buf, off);
      // 跳过时区偏移
      readU32(buf, off);
      readU32(buf, off);
      return new Date(ms);
    }
    
    case SCTAG_ARRAY_OBJECT: {
      const count = readU32(buf, off);
      const arr = [];
      for (let i = 0; i < count; i++) {
        const id = readU32(buf, off);
        const value = readStructuredCloneValue(buf, off);
        arr.push(value);
      }
      return arr;
    }
    
    case SCTAG_OBJECT_OBJECT: {
      const obj = {};
      while (true) {
        const key = readStructuredCloneValue(buf, off);
        if (key === undefined || key === null) break;
        // 检查是否是 END_OF_KEYS
        if (typeof key === 'number' && key === 0) break;
        const value = readStructuredCloneValue(buf, off);
        if (typeof key === 'string') {
          obj[key] = value;
        }
      }
      return obj;
    }
    
    case SCTAG_BACK_REFERENCE_OBJECT:
      return null; // 简化处理
    
    case SCTAG_FLOAT32: {
      const v = buf.readFloatLE(off.offset);
      off.offset += 4;
      return v;
    }
    
    default:
      // 未知标签，尝试继续
      if (tag >= 0x0100 && tag <= 0x0110) {
        // 可能是短字符串
        const len = tag & 0xFF;
        const str = buf.slice(off.offset, off.offset + len).toString('latin1');
        off.offset += len;
        if (off.offset % 4 !== 0) off.offset += 4 - (off.offset % 4);
        return str;
      }
      // 无法识别的标签，返回原始数据
      return `_UNKNOWN_TAG_${tag.toString(16)}`;
  }
}

// 主函数
const ffProf = path.join(process.env.APPDATA, 'Mozilla', 'Firefox', 'Profiles', 'uz0ave2f.default-release-1782316007966', 'storage', 'default');
const dirs = fs.readdirSync(ffProf);
const extDir = dirs.find(d => d.startsWith('moz-extension'));
const idbPath = path.join(ffProf, extDir, 'idb');
const files = fs.readdirSync(idbPath).filter(f => f.endsWith('.sqlite') && !f.endsWith('-shm') && !f.endsWith('-wal'));

const src = path.join(idbPath, files[0]);
const tmp = path.join(process.env.TEMP || '/tmp', 'ff-full-decode.sqlite');
fs.copyFileSync(src, tmp);

const db = new Database(tmp, { readonly: true });
const rows = db.prepare("SELECT key, data FROM object_data").all();

for (const row of rows) {
  const rawKey = Buffer.from(row.key).toString('utf-8');
  const decodedKey = caesarDecode(rawKey);
  const dataBuf = Buffer.from(row.data);
  
  console.log(`\n=== ${decodedKey} (${dataBuf.length} bytes) ===`);
  
  const results = tryDecodeValue(dataBuf);
  console.log(JSON.stringify(results, (key, val) => {
    if (typeof val === 'object' && val !== null && !Array.isArray(val)) {
      // 如果对象太大，截断
      const str = JSON.stringify(val);
      if (str.length > 500) return str.slice(0, 500) + '...';
    }
    return val;
  }, 2));
  
  // 只处理前几个 key
  if (decodedKey.includes('pipeline.cache')) break;
}

db.close();
try { fs.unlinkSync(tmp); } catch {}
// 尝试多种方式解码 Firefox 结构化克隆数据
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

// 读取 Firefox 扩展数据
const ffProf = path.join(process.env.APPDATA, 'Mozilla', 'Firefox', 'Profiles', 'uz0ave2f.default-release-1782316007966', 'storage', 'default');
const dirs = fs.readdirSync(ffProf);
const extDir = dirs.find(d => d.startsWith('moz-extension'));
const idbPath = path.join(ffProf, extDir, 'idb');
const files = fs.readdirSync(idbPath).filter(f => f.endsWith('.sqlite') && !f.endsWith('-shm') && !f.endsWith('-wal'));

const src = path.join(idbPath, files[0]);
const tmp = path.join(process.env.TEMP || '/tmp', 'ff-decode.sqlite');
fs.copyFileSync(src, tmp);

const db = new Database(tmp, { readonly: true });

// 读取所有数据
const rows = db.prepare("SELECT key, data FROM object_data").all();
const result = {};

for (const row of rows) {
  const rawKey = Buffer.from(row.key).toString('utf-8');
  const decodedKey = caesarDecode(rawKey);
  const dataBuf = Buffer.from(row.data);

  console.log(`\n=== ${decodedKey} (${dataBuf.length} bytes) ===`);

  // 尝试用 Snappy 解压
  try {
    const snappy = require('snappy');
    const decompressed = snappy.uncompressSync(dataBuf);
    console.log(`Snappy 解压成功: ${decompressed.length} bytes`);
    console.log(`解压后(前200): ${decompressed.slice(0, 200).toString('hex')}`);
    console.log(`解压后ASCII(前200): ${Array.from(decompressed.slice(0, 200)).map(b => (b >= 32 && b <= 126) ? String.fromCharCode(b) : '.').join('')}`);
  } catch (e) {
    console.log(`Snappy 解压失败: ${e.message}`);
  }

  // 分析数据结构
  // 查找 JSON 模式
  const jsonStart = dataBuf.indexOf('{'.charCodeAt(0));
  const jsonEnd = dataBuf.lastIndexOf('}'.charCodeAt(0));
  if (jsonStart >= 0 && jsonEnd > jsonStart) {
    const jsonStr = dataBuf.slice(jsonStart, jsonEnd + 1).toString('utf-8');
    console.log(`JSON 片段 (${jsonStart}-${jsonEnd}): ${jsonStr.slice(0, 300)}`);
  }

  // 尝试找到所有可读字符串
  const readable = [];
  let current = '';
  for (let i = 0; i < dataBuf.length; i++) {
    const b = dataBuf[i];
    if (b >= 32 && b <= 126) {
      current += String.fromCharCode(b);
    } else {
      if (current.length >= 4) {
        readable.push(current);
      }
      current = '';
    }
  }
  if (current.length >= 4) readable.push(current);
  console.log(`可读字符串 (>=4字符): ${readable.slice(0, 20).join(' | ')}`);
}

db.close();
try { fs.unlinkSync(tmp); } catch {}
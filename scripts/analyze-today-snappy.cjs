// 分析 Snappy 解压后的 Today 和 Statistics 数据
const path = require('path');
const fs = require('fs');
const Database = require('better-sqlite3');
const snappy = require('snappy');

function caesarDecode(str) {
  return str.split('').map(c => {
    const code = c.charCodeAt(0);
    if (code >= 65 && code <= 90) return String.fromCharCode(((code - 65 - 1 + 26) % 26) + 65);
    if (code >= 97 && code <= 122) return String.fromCharCode(((code - 97 - 1 + 26) % 26) + 97);
    return c;
  }).join('');
}

const ffProf = path.join(process.env.APPDATA, 'Mozilla', 'Firefox', 'Profiles', 'uz0ave2f.default-release-1782316007966', 'storage', 'default');
const dirs = fs.readdirSync(ffProf);
const extDir = dirs.find(d => d.startsWith('moz-extension'));
const idbPath = path.join(ffProf, extDir, 'idb');
const files = fs.readdirSync(idbPath).filter(f => f.endsWith('.sqlite') && !f.endsWith('-shm') && !f.endsWith('-wal'));

const src = path.join(idbPath, files[0]);
const tmp = path.join(process.env.TEMP || '/tmp', 'ff-today.sqlite');
fs.copyFileSync(src, tmp);

const db = new Database(tmp, { readonly: true });
const rows = db.prepare("SELECT key, data FROM object_data").all();

for (const row of rows) {
  const rawKey = Buffer.from(row.key).toString('utf-8');
  const decodedKey = caesarDecode(rawKey);
  const dataBuf = Buffer.from(row.data);

  if (!decodedKey.includes('Today') && !decodedKey.includes('Statistics')) continue;

  console.log(`\n=== ${decodedKey} (${dataBuf.length} bytes) ===`);
  
  try {
    const decompressed = snappy.uncompressSync(dataBuf);
    console.log(`解压后: ${decompressed.length} bytes`);
    
    // 完整 hex dump
    for (let i = 0; i < decompressed.length; i += 16) {
      const hex = Array.from(decompressed.slice(i, i + 16)).map(b => b.toString(16).padStart(2, '0')).join(' ');
      const ascii = Array.from(decompressed.slice(i, i + 16)).map(b => (b >= 32 && b <= 126) ? String.fromCharCode(b) : '.').join('');
      console.log(`${i.toString(16).padStart(4, '0')}: ${hex.padEnd(48)} ${ascii}`);
    }
    
    // 尝试解析为 JSON
    const ascii = decompressed.toString('utf-8');
    const jsonStart = ascii.indexOf('{');
    const jsonEnd = ascii.lastIndexOf('}');
    if (jsonStart >= 0 && jsonEnd > jsonStart) {
      console.log(`\nJSON片段: ${ascii.slice(jsonStart, Math.min(jsonEnd + 1, jsonStart + 500))}`);
    }
    
    // 找到所有可读字符串（4字符以上）
    const readable = [];
    let current = '';
    for (let i = 0; i < decompressed.length; i++) {
      const b = decompressed[i];
      if (b >= 32 && b <= 126) {
        current += String.fromCharCode(b);
      } else {
        if (current.length >= 4) readable.push(current);
        current = '';
      }
    }
    if (current.length >= 4) readable.push(current);
    console.log(`\n可读字符串: ${readable.join(' | ')}`);
    
  } catch (e) {
    console.log(`解压失败: ${e.message}`);
  }
}

db.close();
try { fs.unlinkSync(tmp); } catch {}
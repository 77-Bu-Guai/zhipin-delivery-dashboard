// 详细分析 Firefox 结构化克隆数据格式
const path = require('path');
const fs = require('fs');
const Database = require('better-sqlite3');

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
const tmp = path.join(process.env.TEMP || '/tmp', 'ff-analyze.sqlite');
fs.copyFileSync(src, tmp);

const db = new Database(tmp, { readonly: true });

// 只分析 Today 和 Statistics (较小)
const rows = db.prepare("SELECT key, data FROM object_data").all();

for (const row of rows) {
  const rawKey = Buffer.from(row.key).toString('utf-8');
  const decodedKey = caesarDecode(rawKey);
  const buf = Buffer.from(row.data);

  if (!decodedKey.includes('Today') && !decodedKey.includes('Statistics')) continue;

  console.log(`\n=== ${decodedKey} (${buf.length} bytes) ===`);

  // 打印完整 hex dump
  for (let i = 0; i < buf.length; i += 16) {
    const hex = Array.from(buf.slice(i, i + 16)).map(b => b.toString(16).padStart(2, '0')).join(' ');
    const ascii = Array.from(buf.slice(i, i + 16)).map(b => (b >= 32 && b <= 126) ? String.fromCharCode(b) : '.').join('');
    console.log(`${i.toString(16).padStart(4, '0')}: ${hex.padEnd(48)} ${ascii}`);
  }
}

db.close();
try { fs.unlinkSync(tmp); } catch {}
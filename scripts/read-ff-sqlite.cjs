// 分析 Firefox SQLite 存储格式
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

const ffExtDir = (() => {
  const base = path.join(process.env.APPDATA, 'Mozilla', 'Firefox', 'Profiles', 'uz0ave2f.default-release-1782316007966', 'storage', 'default');
  const dirs = fs.readdirSync(base);
  const extDir = dirs.find(d => d.startsWith('moz-extension'));
  return path.join(base, extDir, 'idb');
})();

const sqliteFiles = fs.readdirSync(ffExtDir).filter(f => f.endsWith('.sqlite') && !f.endsWith('-shm') && !f.endsWith('-wal'));

for (const file of sqliteFiles) {
  const srcPath = path.join(ffExtDir, file);
  const tmpPath = path.join(process.env.TEMP || '/tmp', 'ff-read-' + file);
  try {
    fs.copyFileSync(srcPath, tmpPath);
    const db = new Database(tmpPath, { readonly: true });
    
    const rows = db.prepare("SELECT key, data FROM object_data").all();
    
    for (const row of rows) {
      const rawKey = Buffer.from(row.key).toString('utf-8');
      const decodedKey = caesarDecode(rawKey);
      const dataBuf = Buffer.from(row.data);
      
      console.log(`\n=== ${decodedKey} (${dataBuf.length} bytes) ===`);
      
      // 显示前 64 字节的 hex
      const hex = dataBuf.slice(0, 64).toString('hex');
      console.log(`Hex (first 64): ${hex}`);
      
      // 显示所有可打印的 ASCII 字符
      const ascii = [];
      for (let i = 0; i < Math.min(dataBuf.length, 200); i++) {
        const b = dataBuf[i];
        if (b >= 32 && b <= 126) {
          ascii.push(String.fromCharCode(b));
        } else {
          ascii.push('.');
        }
      }
      console.log(`ASCII: ${ascii.join('')}`);
      
      // 搜索 JSON 起始符
      const jsonStart = dataBuf.indexOf('{'.charCodeAt(0));
      if (jsonStart >= 0) {
        console.log(`JSON start at offset: ${jsonStart}`);
        // 显示从 { 开始的内容
        const tail = dataBuf.slice(jsonStart, jsonStart + 200).toString('utf-8');
        console.log(`After {: ${tail.slice(0, 200)}`);
      }
    }
    
    db.close();
    fs.unlinkSync(tmpPath);
  } catch (e) {
    console.log('Error:', e.message);
  }
}
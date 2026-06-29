// 深度检查插件存储，查找详细日志
const path = require('path');
const fs = require('fs');
const Database = require('better-sqlite3');

// ====== Firefox SQLite 检查 ======
function checkFirefox() {
  console.log('===== Firefox SQLite 深度检查 =====\n');
  const ffProf = path.join(process.env.APPDATA, 'Mozilla', 'Firefox', 'Profiles', 'uz0ave2f.default-release-1782316007966', 'storage', 'default');
  if (!fs.existsSync(ffProf)) { console.log('Firefox profile not found'); return; }
  
  const dirs = fs.readdirSync(ffProf);
  const extDir = dirs.find(d => d.startsWith('moz-extension'));
  if (!extDir) { console.log('No moz-extension dir'); return; }
  
  const idbPath = path.join(ffProf, extDir, 'idb');
  const files = fs.readdirSync(idbPath).filter(f => f.endsWith('.sqlite') && !f.endsWith('-shm') && !f.endsWith('-wal'));
  console.log('SQLite files:', files);
  
  const src = path.join(idbPath, files[0]);
  const tmp = path.join(process.env.TEMP || 'C:/temp', 'ff-deep-check.sqlite');
  fs.copyFileSync(src, tmp);
  
  const db = new Database(tmp, { readonly: true });
  
  // 列出所有表
  console.log('\n所有表:');
  const tables = db.prepare("SELECT name FROM sqlite_master WHERE type='table'").all();
  tables.forEach(t => console.log('  ', t.name));
  
  // 每个表的结构
  for (const t of tables) {
    console.log(`\n表 ${t.name} 结构:`);
    const cols = db.prepare(`PRAGMA table_info(${t.name})`).all();
    cols.forEach(c => console.log(`    ${c.name} (${c.type})`));
    const count = db.prepare(`SELECT COUNT(*) as c FROM ${t.name}`).get().c;
    console.log(`    行数: ${count}`);
  }
  
  // 查看 object_data 的所有 key
  console.log('\nobject_data 所有 key (原始→解码):');
  const caesarDecode = (str) => str.split('').map(c => {
    const code = c.charCodeAt(0);
    if (code >= 65 && code <= 90) return String.fromCharCode(((code - 65 - 1 + 26) % 26) + 65);
    if (code >= 97 && code <= 122) return String.fromCharCode(((code - 97 - 1 + 26) % 26) + 97);
    return c;
  }).join('');
  
  const rows = db.prepare('SELECT key FROM object_data').all();
  rows.forEach(r => {
    const raw = Buffer.from(r.key).toString('utf-8');
    console.log(`  ${raw} → ${caesarDecode(raw)}`);
  });
  
  db.close();
  try { fs.unlinkSync(tmp); } catch {}
}

// ====== Chrome IndexedDB 检查 ======
function checkChromeIDB() {
  console.log('\n\n===== Chrome IndexedDB 检查 =====\n');
  const chromeProf = path.join(process.env.LOCALAPPDATA, 'Google', 'Chrome', 'User Data', 'Default');
  const extId = 'ogkmgjbagackkdlcibcailacnncgonbn';
  
  // 检查 IndexedDB 目录
  const idbPaths = [
    path.join(chromeProf, 'IndexedDB', `chrome-extension_${extId}_0.indexeddb.leveldb`),
    path.join(chromeProf, 'IndexedDB', `chrome-extension_${extId}_0.indexeddb.blob`),
  ];
  
  for (const p of idbPaths) {
    if (fs.existsSync(p)) {
      console.log(`存在: ${p}`);
      const files = fs.readdirSync(p).filter(f => !f.endsWith('.log') && !f.endsWith('.ldb'));
      console.log('  文件:', files);
    } else {
      console.log(`不存在: ${p}`);
    }
  }
  
  // 检查是否有其他存储位置
  const extStorage = path.join(chromeProf, 'Local Extension Settings', extId);
  console.log(`\nLocal Extension Settings: ${fs.existsSync(extStorage) ? '存在' : '不存在'}`);
  
  const extSync = path.join(chromeProf, 'Sync Extension Settings', extId);
  console.log(`Sync Extension Settings: ${fs.existsSync(extSync) ? '存在' : '不存在'}`);
  
  // 搜索可能的日志文件
  console.log('\n搜索扩展目录中的日志文件:');
  const extLogDir = path.join(chromeProf, 'Local Extension Settings', extId);
  if (fs.existsSync(extLogDir)) {
    const allFiles = fs.readdirSync(extLogDir);
    console.log('  所有文件:', allFiles);
  }
}

checkFirefox();
checkChromeIDB();
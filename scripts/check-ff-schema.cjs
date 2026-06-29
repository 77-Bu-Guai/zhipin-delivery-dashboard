// 检查 Firefox SQLite 数据库 schema
const path = require('path');
const fs = require('fs');
const Database = require('better-sqlite3');

const ffProf = path.join(process.env.APPDATA, 'Mozilla', 'Firefox', 'Profiles', 'uz0ave2f.default-release-1782316007966', 'storage', 'default');
const dirs = fs.readdirSync(ffProf);
const extDir = dirs.find(d => d.startsWith('moz-extension'));
const idbPath = path.join(ffProf, extDir, 'idb');
const files = fs.readdirSync(idbPath).filter(f => f.endsWith('.sqlite') && !f.endsWith('-shm') && !f.endsWith('-wal'));

console.log('SQLite files:', files);

const src = path.join(idbPath, files[0]);
const tmp = path.join(process.env.TEMP || '/tmp', 'ff-schema-check.sqlite');
fs.copyFileSync(src, tmp);

const db = new Database(tmp, { readonly: true });

// 查看所有表
const tables = db.prepare("SELECT name, sql FROM sqlite_master WHERE type='table'").all();
tables.forEach(t => console.log('\n' + t.name + ':', t.sql));

// 查看 object_data 结构
const od = db.prepare("SELECT * FROM object_data LIMIT 1").all();
if (od.length > 0) {
  console.log('\nobject_data columns:', Object.keys(od[0]));
  console.log('object_data first row:', JSON.stringify(od[0], (key, val) => {
    if (val && val.type === 'Buffer') return '<Buffer len=' + val.length + '>';
    if (typeof val === 'string' && val.length > 50) return val.slice(0, 50) + '...';
    return val;
  }, 2));
}

// 查看 object_store 表
try {
  const os = db.prepare("SELECT * FROM object_store").all();
  console.log('\nobject_store rows:', os.length);
  os.forEach(r => {
    console.log('  id:', r.id, 'name:', r.name, 'key_path:', r.key_path);
  });
} catch (e) {
  console.log('object_store error:', e.message);
}

db.close();
try { fs.unlinkSync(tmp); } catch {}
// 读取 Firefox 的 zhipin.com 存储 (SQLite)
const Database = require('better-sqlite3');
const path = require('path');
const fs = require('fs');

const DB_PATH = path.join(
  process.env.APPDATA,
  'Mozilla', 'Firefox', 'Profiles',
  'uz0ave2f.default-release-1782316007966',
  'storage', 'default',
  'https+++www.zhipin.com',
  'data.sqlite'
);

// 复制到临时目录避免锁定
const tmpPath = path.join(process.env.TEMP || '/tmp', 'ff-zhipin-data.sqlite');
fs.copyFileSync(DB_PATH, tmpPath);
console.log('已复制到:', tmpPath);

const db = new Database(tmpPath, { readonly: true });

// 列出所有表
const tables = db.prepare("SELECT name FROM sqlite_master WHERE type='table'").all();
console.log('表:', tables.map(t => t.name));

for (const t of tables) {
  const cols = db.prepare(`PRAGMA table_info("${t.name}")`).all();
  const count = db.prepare(`SELECT COUNT(*) as c FROM "${t.name}"`).get();
  console.log(`  ${t.name} (${count.c} rows):`, cols.map(c => c.name).join(', '));
  
  if (count.c > 0 && count.c <= 20) {
    const rows = db.prepare(`SELECT * FROM "${t.name}" LIMIT 5`).all();
    rows.forEach(r => console.log('    ', JSON.stringify(r).slice(0, 300)));
  }
}

db.close();
fs.unlinkSync(tmpPath);
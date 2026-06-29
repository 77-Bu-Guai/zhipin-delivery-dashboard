// 读取 Firefox 扩展的 storage.local (IndexedDB/SQLite)
const Database = require('better-sqlite3');
const path = require('path');
const fs = require('fs');

const DB_PATH = path.join(
  process.env.APPDATA,
  'Mozilla', 'Firefox', 'Profiles',
  'uz0ave2f.default-release-1782316007966',
  'storage', 'default',
  'moz-extension+++5d83e026-4fdd-4bec-9a2e-c05943059e6a^userContextId=4294967295',
  '3647222921wleabcEoxlt-eengsairo.sqlite'
);

const tmpPath = path.join(process.env.TEMP || '/tmp', 'ff-local.sqlite');
fs.copyFileSync(DB_PATH, tmpPath);

const db = new Database(tmpPath, { readonly: true });

// 列出所有表
const tables = db.prepare("SELECT name FROM sqlite_master WHERE type='table'").all();
console.log('Tables:', tables.map(t => t.name));

for (const t of tables) {
  const cols = db.prepare(`PRAGMA table_info("${t.name}")`).all();
  const count = db.prepare(`SELECT COUNT(*) as c FROM "${t.name}"`).get();
  console.log(`\n${t.name} (${count.c} rows):`, cols.map(c => c.name).join(', '));

  if (count.c > 0 && count.c <= 30) {
    const rows = db.prepare(`SELECT * FROM "${t.name}" LIMIT 10`).all();
    rows.forEach(r => {
      const str = JSON.stringify(r);
      console.log('  ', str.slice(0, 300));
    });
  }
}

// 尝试查找包含 "pipeline" 或 "job" 或 "Statistics" 的键
for (const t of tables) {
  const cols = db.prepare(`PRAGMA table_info("${t.name}")`).all();
  const strCols = cols.filter(c => c.type && c.type.toUpperCase().includes('TEXT'));
  for (const col of strCols) {
    try {
      const rows = db.prepare(`SELECT "${col.name}" FROM "${t.name}" WHERE "${col.name}" LIKE '%pipeline%' OR "${col.name}" LIKE '%Statistics%' OR "${col.name}" LIKE '%job%' LIMIT 5`).all();
      if (rows.length > 0) {
        console.log(`\n=== 找到相关数据: ${t.name}.${col.name} ===`);
        rows.forEach(r => console.log('  ', JSON.stringify(r).slice(0, 500)));
      }
    } catch {}
  }
}

db.close();
fs.unlinkSync(tmpPath);
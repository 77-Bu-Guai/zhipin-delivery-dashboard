// 检查 Firefox 的 storage-sync-v2.sqlite（扩展同步存储）
const Database = require('better-sqlite3');
const path = require('path');
const fs = require('fs');

const DB_PATH = path.join(
  process.env.APPDATA,
  'Mozilla', 'Firefox', 'Profiles',
  'uz0ave2f.default-release-1782316007966',
  'storage-sync-v2.sqlite'
);

const tmpPath = path.join(process.env.TEMP || '/tmp', 'ff-sync-check.sqlite');
fs.copyFileSync(DB_PATH, tmpPath);

const db = new Database(tmpPath, { readonly: true });

const rows = db.prepare("SELECT ext_id, data FROM storage_sync_data").all();

for (const row of rows) {
  console.log(`\next_id: ${row.ext_id}`);
  try {
    const parsed = JSON.parse(row.data);
    console.log(JSON.stringify(parsed, null, 2));
  } catch {
    console.log('Raw:', row.data.slice(0, 500));
  }
}

db.close();
fs.unlinkSync(tmpPath);
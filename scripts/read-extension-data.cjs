// 读取 Chrome 插件 LevelDB 存储数据，导出为 JSON
const { Level } = require('level');
const path = require('path');
const fs = require('fs');

const DB_PATH = path.join(process.env.TEMP || '/tmp', 'boss-extension-ldb');
const OUTPUT_PATH = path.join(__dirname, '..', 'public', 'extension-data.json');

async function readLevelDB() {
  console.log('读取 LevelDB 路径:', DB_PATH);

  if (!fs.existsSync(DB_PATH)) {
    console.error('LevelDB 目录不存在:', DB_PATH);
    return;
  }

  const db = new Level(DB_PATH, { valueEncoding: 'utf8', createIfMissing: false });

  const data = {};
  let count = 0;

  try {
    // 先打开数据库
    await db.open();
    console.log('数据库已打开');

    const keys = await db.keys().all();
    console.log(`找到 ${keys.length} 个键`);

    for (const key of keys) {
      if (key.startsWith('_') || key.startsWith('meta$') || key === 'VERSION') continue;
      try {
        const raw = await db.get(key);
        try {
          data[key] = JSON.parse(raw);
        } catch {
          data[key] = raw;
        }
        count++;
        const preview = JSON.stringify(data[key]).slice(0, 150);
        console.log(`  [${count}] ${key}: ${preview}`);
      } catch (err) {
        console.log(`  跳过 ${key}: ${err.message}`);
      }
    }
  } catch (err) {
    console.error('读取失败:', err.message);
  }

  try { await db.close(); } catch {}

  const dir = path.dirname(OUTPUT_PATH);
  if (!fs.existsSync(dir)) {
    fs.mkdirSync(dir, { recursive: true });
  }

  fs.writeFileSync(OUTPUT_PATH, JSON.stringify(data, null, 2), 'utf-8');
  console.log(`\n数据已导出到: ${OUTPUT_PATH}`);
  console.log(`共 ${count} 个有效存储键`);
}

readLevelDB().catch(console.error);
// 恢复 Chrome localStorage 中的 pipeline_cache
// 用法: node scripts/restore-pipeline-cache.cjs
const path = require('path');
const fs = require('fs');
const { Level } = require('level');
const dbModule = require('./boss-db.cjs');

async function restore() {
  console.log('🔄 正在从数据库恢复到 Chrome localStorage...');

  // 1. 从数据库读取所有投递记录
  dbModule.init();
  const allRecords = dbModule.getAllPipelineData();
  console.log(`📦 数据库中有 ${Object.keys(allRecords).length} 条记录`);

  // 2. 读取 Chrome localStorage，准备修改
  const lsPath = path.join(
    process.env.LOCALAPPDATA, 'Google', 'Chrome', 'User Data', 'Default', 'Local Storage', 'leveldb'
  );

  if (!fs.existsSync(lsPath)) {
    console.log('❌ Chrome localStorage 目录不存在，请先打开 Chrome');
    dbModule.close();
    return;
  }

  // 3. 复制并打开 LevelDB
  const tmpPath = path.join(process.env.TEMP || '/tmp', 'boss-restore-' + Date.now());
  if (fs.existsSync(tmpPath)) fs.rmSync(tmpPath, { recursive: true, force: true });
  fs.cpSync(lsPath, tmpPath, { recursive: true });

  const tdb = new Level(tmpPath, { valueEncoding: 'buffer', createIfMissing: false });
  try { await tdb.open(); } catch {
    console.log('❌ Chrome LevelDB 打开失败，请关闭 Chrome 后重试');
    await tdb.close().catch(() => {});
    try { fs.rmSync(tmpPath, { recursive: true, force: true }); } catch {}
    dbModule.close();
    return;
  }

  const keys = await tdb.keys().all();
  const pipelineKey = keys.find(k => k.includes('boss_pipeline_cache'));

  if (!pipelineKey) {
    console.log('❌ Chrome 中未找到 boss_pipeline_cache');
    await tdb.close();
    try { fs.rmSync(tmpPath, { recursive: true, force: true }); } catch {}
    dbModule.close();
    return;
  }

  // 4. 读取当前 Chrome JSON，合并数据库记录（保留旧记录，追加缺失的）
  const buf = await tdb.get(pipelineKey);
  let start = -1;
  for (let i = 0; i < buf.length - 1; i++) {
    if (buf[i] === 0x7B && buf[i + 1] === 0x00) { start = i; break; }
  }

  if (start < 0) {
    console.log('❌ 无法解析 Chrome pipeline_cache 数据');
    await tdb.close();
    try { fs.rmSync(tmpPath, { recursive: true, force: true }); } catch {}
    dbModule.close();
    return;
  }

  const jsonBuf = buf.slice(start);
  const jsonStr = jsonBuf.toString('utf16le');
  const closeIdx = jsonStr.lastIndexOf('}');
  if (closeIdx < 0) {
    console.log('❌ 无法解析 JSON 结束位置');
    await tdb.close();
    try { fs.rmSync(tmpPath, { recursive: true, force: true }); } catch {}
    dbModule.close();
    return;
  }

  const cleanJson = jsonStr.slice(0, closeIdx + 1);
  const currentObj = JSON.parse(cleanJson);
  const currentCount = Object.keys(currentObj).length;
  console.log(`  Chrome 当前有 ${currentCount} 条记录`);

  // 5. 把数据库里所有记录 merge 进去（Chrome 数据优先，数据库补充缺失）
  let restored = 0;
  for (const id of Object.keys(allRecords)) {
    if (!currentObj[id]) {
      currentObj[id] = allRecords[id];
      restored++;
    }
  }

  const newCount = Object.keys(currentObj).length;
  console.log(`  ✅ 恢复了 ${restored} 条，恢复后共 ${newCount} 条`);

  // 6. 写回
  const prefix = buf.slice(0, start);
  const newJsonBuf = Buffer.from(JSON.stringify(currentObj), 'utf16le');
  const combined = Buffer.concat([prefix, newJsonBuf]);
  await tdb.put(pipelineKey, combined);
  await tdb.close();

  // 7. 写回原始 LevelDB
  const skipFiles = new Set(['CURRENT', 'LOCK', 'CURRENT.bak']);
  for (const f of fs.readdirSync(tmpPath)) {
    if (skipFiles.has(f) || f.startsWith('MANIFEST-')) continue;
    const srcFile = path.join(lsPath, f);
    const tmpFile = path.join(tmpPath, f);
    try {
      try { fs.unlinkSync(srcFile); } catch {}
      fs.copyFileSync(tmpFile, srcFile);
    } catch (e) {
      console.log(`  ⚠️ 写入 ${f} 失败: ${e.message}`);
    }
  }

  try { fs.rmSync(tmpPath, { recursive: true, force: true }); } catch {}
  dbModule.close();
  console.log(`🎉 恢复完成！Chrome pipeline_cache 从 ${currentCount} 恢复到 ${newCount} 条`);
}

restore().catch(e => {
  console.log('❌', e.message);
  dbModule.close();
});

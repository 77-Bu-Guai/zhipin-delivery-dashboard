const path = require('path');
const fs = require('fs');
const { Level } = require('level');

/**
 * 从 Chrome Local Storage LevelDB 中读取 boss_ai_scoring 数据
 * 数据来源：zhipin.com 页面的 localStorage["boss_ai_scoring"]
 * 由 patch-extension.cjs 补丁注入
 */
async function readAiScoringLogs() {
  const lsPath = path.join(
    process.env.LOCALAPPDATA,
    'Google', 'Chrome', 'User Data', 'Default', 'Local Storage', 'leveldb'
  );

  if (!fs.existsSync(lsPath)) {
    console.log('  [AI评分] ❌ Chrome Local Storage 目录不存在');
    return [];
  }

  // 复制目录避开 Chrome 文件锁
  const tmpPath = path.join(process.env.TEMP || '/tmp', 'boss-ais-' + Date.now());
  if (fs.existsSync(tmpPath)) fs.rmSync(tmpPath, { recursive: true, force: true });
  try {
    fs.cpSync(lsPath, tmpPath, { recursive: true });
  } catch (e) {
    console.log('  [AI评分] ⚠️ 复制目录失败:', e.message);
    return [];
  }

  let records = [];

  try {
    const db = new Level(tmpPath, { valueEncoding: 'buffer', createIfMissing: false });
    await db.open();
    const keys = await db.keys().all();

    for (const key of keys) {
      if (!key.includes('boss_ai_scoring')) continue;

      const buf = await db.get(key);

      // 查找 UTF-16LE 编码的 JSON 数组起始
      let start = -1;
      for (let i = 0; i < buf.length - 1; i++) {
        if (buf[i] === 0x5B && buf[i + 1] === 0x00) { // [ + \0 = UTF-16LE '['
          start = i;
          break;
        }
      }
      if (start < 0) continue;

      const jsonBuf = buf.slice(start);
      const jsonStr = jsonBuf.toString('utf16le');

      const closeIdx = jsonStr.lastIndexOf(']');
      if (closeIdx < 0) continue;

      const cleanJson = jsonStr.slice(0, closeIdx + 1);
      try {
        const parsed = JSON.parse(cleanJson);
        if (Array.isArray(parsed)) {
          records = records.concat(parsed);
        }
      } catch (e) {
        console.log('  [AI评分] ⚠️ 解析跳过:', e.message.slice(0, 60));
      }
    }

    await db.close();
  } catch (e) {
    console.log('  [AI评分] ⚠️ 读取失败:', e.message);
  } finally {
    try { fs.rmSync(tmpPath, { recursive: true, force: true }); } catch {}
  }

  // 去重（按 time + encryptJobId）
  const seen = new Set();
  const unique = records.filter(r => {
    const key = r.time + '-' + (r.encryptJobId || '');
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  });

  // 按时间降序
  unique.sort((a, b) => (b.time || 0) - (a.time || 0));

  return unique;
}

module.exports = { readAiScoringLogs };

// 直接运行时输出
if (require.main === module) {
  readAiScoringLogs().then(records => {
    const withScore = records.filter(r => r.message && r.message.includes('分数'));
    console.log(`📊 共提取 ${records.length} 条 AI 评分记录，其中 ${withScore.length} 条包含评分文本`);
    process.stdout.write(JSON.stringify(records, null, 2));
  }).catch(e => {
    console.error('❌ 失败:', e.message);
    process.exit(1);
  });
}

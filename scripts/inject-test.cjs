// 测试脚本：模拟 Chrome 来新投递
const path = require('path');
const fs = require('fs');

async function inject() {
  const { Level } = require('level');
  const src = path.join(process.env.LOCALAPPDATA, 'Google/Chrome/User Data/Default/Local Storage/leveldb');
  const tmp = path.join(process.env.TEMP, 'boss-inject-' + Date.now());

  fs.cpSync(src, tmp, { recursive: true });
  const db = new Level(tmp, { valueEncoding: 'buffer', createIfMissing: false });
  await db.open();

  const keys = await db.keys().all();
  const pcKey = keys.find(k => k.includes('boss_pipeline_cache'));
  const aiKey = keys.find(k => k.includes('boss_ai_scoring'));

  if (!pcKey) { console.log('No pipeline key!'); process.exit(1); }

  // Read current pipeline
  const buf = await db.get(pcKey);
  let start = -1;
  for (let i = 0; i < buf.length - 1; i++) {
    if (buf[i] === 0x7B && buf[i+1] === 0x00) { start = i; break; }
  }
  const json = buf.slice(start);
  const str = json.toString('utf16le');
  const close = str.lastIndexOf('}');
  const obj = JSON.parse(str.slice(0, close+1));

  // Add 3 fake records
  const now = Date.now();
  for (let i = 0; i < 3; i++) {
    const id = 'INJECT_' + now + '_' + i;
    obj[id] = {
      encryptJobId: id,
      jobName: '产品助理-' + i,
      brandName: '字节跳动',
      status: i === 0 ? 'success' : 'warning',
      message: 'AI 评分：' + (80 + i*3) + '分',
      createdAt: now + i*1000,
      _source: 'chrome',
    };
  }

  // Write back
  const prefix = buf.slice(0, start);
  const newBuf = Buffer.from(JSON.stringify(obj), 'utf16le');
  const combined = Buffer.concat([prefix, newBuf]);
  await db.put(pcKey, combined);

  // Also write AI scoring
  if (aiKey) {
    const aiBuf = await db.get(aiKey);
    let aiStart = -1;
    for (let i = 0; i < aiBuf.length - 1; i++) {
      if (aiBuf[i] === 0x5B && aiBuf[i+1] === 0x00) { aiStart = i; break; }
    }
    const aiJson = aiBuf.slice(aiStart);
    const aiStr = aiJson.toString('utf16le');
    const aiClose = aiStr.lastIndexOf(']');
    const aiArr = JSON.parse(aiStr.slice(0, aiClose+1));

    for (let i = 0; i < 3; i++) {
      const id = 'INJECT_' + now + '_' + i;
      aiArr.push({
        encryptJobId: id,
        jobName: '产品助理-' + i,
        companyName: '字节跳动',
        state: i === 0 ? 'success' : 'warning',
        message: 'AI 评分：' + (80 + i*3) + '分',
        time: now + i*1000,
      });
    }

    const aiPrefix = aiBuf.slice(0, aiStart);
    const aiNewBuf = Buffer.from(JSON.stringify(aiArr), 'utf16le');
    const aiCombined = Buffer.concat([aiPrefix, aiNewBuf]);
    await db.put(aiKey, aiCombined);
  }

  await db.close();

  // Copy back to Chrome
  for (const f of fs.readdirSync(tmp)) {
    if (f === 'LOCK') continue;
    try {
      const srcFile = path.join(src, f);
      const tmpFile = path.join(tmp, f);
      try { fs.unlinkSync(srcFile); } catch {}
      fs.copyFileSync(tmpFile, srcFile);
    } catch {}
  }

  fs.rmSync(tmp, { recursive: true, force: true });
  console.log('Injected 3 records at', new Date(now).toISOString());
}
inject();
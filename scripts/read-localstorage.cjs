/**
 * 读取 zhipin.com 的 localStorage["boss_ai_scoring"]
 * 
 * 两种方式：
 * 1. CDP（Chrome DevTools Protocol）- 需要 Chrome 以 --remote-debugging-port=9222 启动
 * 2. 磁盘 LevelDB - 直接从 Chrome 的 Local Storage 目录读取，无需任何配置
 * 
 * 优先级：CDP > 磁盘 LevelDB
 */
const http = require('http');
const path = require('path');
const fs = require('fs');

// ====== 方式 1: CDP ======

async function fetchFromCDP(host, port) {
  return new Promise((resolve, reject) => {
    http.get(`http://${host}:${port}/json`, (res) => {
      let data = '';
      res.on('data', chunk => data += chunk);
      res.on('end', () => {
        try { resolve(JSON.parse(data)); }
        catch (e) { reject(new Error('Failed to parse CDP response: ' + e.message)); }
      });
    }).on('error', reject);
  });
}

async function evaluateInTab(wsUrl, expression) {
  const WebSocket = require('ws');
  return new Promise((resolve, reject) => {
    const ws = new WebSocket(wsUrl);
    const msgId = 1;
    let result = null;

    ws.on('open', () => {
      ws.send(JSON.stringify({ id: msgId, method: 'Runtime.enable' }));
    });

    ws.on('message', (data) => {
      try {
        const msg = JSON.parse(data.toString());
        if (msg.id === msgId) {
          ws.send(JSON.stringify({
            id: msgId + 1,
            method: 'Runtime.evaluate',
            params: { expression, returnByValue: true }
          }));
        } else if (msg.id === msgId + 1) {
          if (msg.result && msg.result.result) {
            result = msg.result.result.value;
          }
          ws.close();
        }
      } catch (e) {}
    });

    ws.on('close', () => resolve(result));
    ws.on('error', (e) => reject(e));
  });
}

async function readViaCDP() {
  try {
    const tabs = await fetchFromCDP('localhost', 9222);
    const zhipinTab = tabs.find(t => t.url && t.url.includes('zhipin.com'));
    if (!zhipinTab) {
      return { error: '未找到 zhipin.com 标签页', data: null };
    }
    const wsUrl = zhipinTab.webSocketDebuggerUrl;
    if (!wsUrl) {
      return { error: '无法获取 WebSocket URL', data: null };
    }
    const result = await evaluateInTab(wsUrl, 'localStorage.getItem("boss_ai_scoring")');
    if (result) {
      try {
        return { error: null, data: JSON.parse(result) };
      } catch (e) {
        return { error: '解析 localStorage 数据失败', data: null };
      }
    }
    return { error: null, data: null };
  } catch (e) {
    if (e.code === 'ECONNREFUSED') {
      return { error: 'CDP 未连接 (端口 9222)', data: null };
    }
    return { error: 'CDP 连接失败: ' + e.message, data: null };
  }
}

// ====== 方式 2: 磁盘 LevelDB ======

/**
 * 复制目录（用于绕过 Chrome 文件锁）
 */
function copyDir(src, dst) {
  if (!fs.existsSync(src)) return false;
  if (fs.existsSync(dst)) fs.rmSync(dst, { recursive: true, force: true });
  fs.cpSync(src, dst, { recursive: true });
  return true;
}

/**
 * 从 Chrome 的 Local Storage LevelDB 读取 boss_ai_scoring
 * 
 * Chrome 的 Local Storage 路径:
 *   %LOCALAPPDATA%\Google\Chrome\User Data\Default\Local Storage\leveldb\
 * 
 * Key 格式: _<origin>\x00\x01<key_name>
 *   例如: _https://www.zhipin.com\x00\x01boss_ai_scoring
 */
async function readViaDiskLevelDB() {
  const { Level } = require('level');

  // 可能的 Chrome 用户数据目录
  const possiblePaths = [
    path.join(process.env.LOCALAPPDATA, 'Google', 'Chrome', 'User Data', 'Default'),
    path.join(process.env.LOCALAPPDATA, 'Google', 'Chrome', 'User Data', 'Profile 1'),
    path.join(process.env.LOCALAPPDATA, 'Microsoft', 'Edge', 'User Data', 'Default'),
  ];

  for (const userDataPath of possiblePaths) {
    const ldbPath = path.join(userDataPath, 'Local Storage', 'leveldb');
    if (!fs.existsSync(ldbPath)) continue;

    const tmpPath = path.join(process.env.TEMP || '/tmp', 'boss-ls-' + Math.random().toString(36).slice(2, 8));
    if (!copyDir(ldbPath, tmpPath)) continue;

    let db = null;
    try {
      db = new Level(tmpPath, { valueEncoding: 'binary', createIfMissing: false });
      await db.open();

      const keys = await db.keys().all();

      for (const key of keys) {
        if (!key.includes('zhipin.com')) continue;
        if (!key.includes('boss_ai_scoring')) continue;

        try {
          const buf = await db.get(key);
          let content = buf.toString('utf8');
          if (!content.startsWith('[')) {
            let start = 0;
            while (start < buf.length && buf[start] === 0) {
              start++;
            }
            content = buf.slice(start).toString('utf16le');
          }
          const firstBracket = content.indexOf('[');
          if (firstBracket >= 0) {
            content = content.substring(firstBracket);
            const lastBracket = content.lastIndexOf(']');
            if (lastBracket >= 0) {
              content = content.substring(0, lastBracket + 1);
            }
          }
          const parsed = JSON.parse(content);
          if (Array.isArray(parsed) && parsed.length > 0) {
            return { error: null, data: parsed };
          }
        } catch (e) {
          // 解析失败，跳过
        }
      }
    } catch (e) {
      // 读取失败，尝试下一个路径
    } finally {
      try { if (db) await db.close(); } catch {}
      try { if (fs.existsSync(tmpPath)) fs.rmSync(tmpPath, { recursive: true, force: true }); } catch {}
    }
  }

  return { error: null, data: null };
}

// ====== 主入口 ======

async function readZhipinLocalStorage() {
  // 1. 优先尝试 CDP（更快，数据更实时）
  console.log('  [CDP] 尝试连接...');
  const cdpResult = await readViaCDP();
  if (cdpResult.data && cdpResult.data.length > 0) {
    console.log(`  [CDP] ✅ 成功读取 ${cdpResult.data.length} 条评分日志`);
    return { error: null, data: cdpResult.data, method: 'cdp' };
  }
  if (cdpResult.error) {
    console.log(`  [CDP] ⚠️ ${cdpResult.error}`);
  }

  // 2. CDP 失败，尝试磁盘 LevelDB（无需任何配置）
  console.log('  [磁盘] 尝试从 Local Storage LevelDB 读取...');
  const diskResult = await readViaDiskLevelDB();
  if (diskResult.data && diskResult.data.length > 0) {
    console.log(`  [磁盘] ✅ 成功读取 ${diskResult.data.length} 条评分日志`);
    return { error: null, data: diskResult.data, method: 'disk' };
  }

  console.log('  [磁盘] ⚠️ 暂无评分日志（插件可能还未生成新的评分记录）');
  return { error: null, data: null, method: 'none' };
}

module.exports = { readZhipinLocalStorage };
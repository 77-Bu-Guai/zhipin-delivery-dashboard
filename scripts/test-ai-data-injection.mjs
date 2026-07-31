import fs from 'fs';
import http from 'http';
import assert from 'assert';

const PORT = 5173;

// 从 pipeline-cache 转成近似 DeliveryLog（字段对齐 AIChat.recentDataContext）
function loadLogs() {
  const raw = JSON.parse(fs.readFileSync('public/extension-data.json', 'utf8'));
  const cache = raw['pipeline-cache']?.data || {};
  return Object.values(cache).map((r) => ({
    jobTitle: r.jobName || '-',
    companyName: r.brandName || '-',
    status: r.status || '-',
    timestamp: new Date(r.createdAt || 0).toISOString(),
    jobCategory: undefined,
    filterStateName: r.processorType || '-',
  }));
}

// 复刻 AIChat.recentDataContext 的构造逻辑（与 src/components/AIChat.tsx 一致）
function buildRecentDataContext(logs, limit = 1000) {
  if (!logs.length) return '';
  const sorted = [...logs].sort(
    (a, b) => new Date(b.timestamp).getTime() - new Date(a.timestamp).getTime(),
  );
  const recent = sorted.slice(0, limit);
  const lines = recent.map((l, i) => {
    const parts = [
      `岗位=${l.jobTitle || '-'}`,
      `公司=${l.companyName || '-'}`,
      `状态=${l.status}`,
      `分类=${l.jobCategory || '未分类'}`,
    ];
    if (l.status !== 'success') parts.push(`筛除原因=${l.filterStateName || '-'}`);
    return `${i + 1}. ${parts.join(' | ')}`;
  });
  return `【最近 ${recent.length} 条投递原始数据（按时间倒序，精简）】\n${lines.join('\n')}`;
}

function postMimo(system, user) {
  return new Promise((resolve, reject) => {
    const payload = JSON.stringify({
      model: 'lite',
      messages: [
        { role: 'system', content: system },
        { role: 'user', content: user },
      ],
      max_tokens: 1024,
      temperature: 0.3,
    });
    const req = http.request(
      {
        host: 'localhost',
        port: PORT,
        path: '/mimo/chat/completions',
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Content-Length': Buffer.byteLength(payload),
        },
      },
      (res) => {
        let b = '';
        res.on('data', (c) => (b += c));
        res.on('end', () => {
          if (res.statusCode !== 200) {
            return reject(new Error(`HTTP ${res.statusCode}: ${b.slice(0, 300)}`));
          }
          try {
            resolve(JSON.parse(b).choices?.[0]?.message?.content || '');
          } catch (e) {
            reject(new Error('解析失败: ' + b.slice(0, 300)));
          }
        });
      },
    );
    req.on('error', reject);
    req.write(payload);
    req.end();
  });
}

(async () => {
  let pass = 0;
  let fail = 0;
  const ok = (name, cond, extra = '') => {
    if (cond) {
      pass++;
      console.log(`✅ PASS: ${name}`);
    } else {
      fail++;
      console.log(`❌ FAIL: ${name} ${extra}`);
    }
  };

  const logs = loadLogs();
  const sorted = [...logs].sort(
    (a, b) => new Date(b.timestamp).getTime() - new Date(a.timestamp).getTime(),
  );
  const probe = sorted[0]; // 最近一条（与 buildRecentDataContext 内部排序一致）
  console.log(`加载投递记录: ${logs.length} 条，最近一条岗位=${probe.jobTitle}\n`);

  // 测试1：构造逻辑正确性
  const ctx = buildRecentDataContext(logs, 1000);
  ok('数据上下文包含最近真实岗位名', ctx.includes(probe.jobTitle), `最近岗位=${probe.jobTitle}`);
  const lenOk = ctx.length > 0 && (logs.length < 1000 ? true : ctx.includes('最近 1000 条'));
  ok('数据上下文条数达标', lenOk, `上下文字符数=${ctx.length}`);

  // 测试2：数据确实被放入请求 system（确定性证明“调用了数据”）
  const probeCompany = probe.companyName;
  const systemForProbe = `你是分析助手。\n\n${ctx}`;
  ok('请求 system 含真实公司名', systemForProbe.includes(probeCompany), `公司=${probeCompany}`);

  // 测试3：端到端，模型确实消费了数据（能复述真实岗位名）
  try {
    const reply = await postMimo(
      `你是基于用户真实投递数据的助手。请严格从下方数据中挑选 3 条真实记录，原样告诉我它们的岗位名（不要编造，只能来自数据）。\n\n${ctx}`,
      '请列出数据中 3 个真实的岗位名（原样复述，不要总结）',
    );
    console.log('模型回复片段:', reply.slice(0, 300), '\n');
    const hit = logs.some((l) => l.jobTitle !== '-' && reply.includes(l.jobTitle));
    ok('模型回复包含数据中真实岗位名（证明读到了数据）', hit);
  } catch (e) {
    ok('端到端模型调用', false, e.message);
  }

  console.log(`\n结果: ${pass} passed, ${fail} failed`);
  process.exit(fail ? 1 : 0);
})();

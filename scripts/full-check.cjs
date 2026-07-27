// 全量数据一致性检查
const path = require('path');
const fs = require('fs');

const data = JSON.parse(fs.readFileSync(path.join(__dirname, '..', 'public', 'extension-data.json'), 'utf-8'));
const pipeline = data['pipeline-cache']?.data || {};
const logs = data['ai-scoring-logs'] || [];
const records = Object.values(pipeline);

console.log('═══════════════════════════════════════');
console.log('  全量数据一致性检查');
console.log('═══════════════════════════════════════\n');

// 1. status-message 矛盾
console.log('【1】status vs message 一致性');
console.log('─────────────────────────────\n');
const bad1 = records.filter(r => r.status === 'success' && r.message !== '投递成功');
const bad2 = records.filter(r => r.message === '投递成功' && r.status !== 'success');
if (bad1.length + bad2.length === 0) console.log('  ✅ 无矛盾\n');
for (const r of bad1) console.log(`  ⚠️ success 但 message=${r.message} | ${r.jobName} @ ${r.brandName}`);
for (const r of bad2) console.log(`  ⚠️ 投递成功 但 status=${r.status} | ${r.jobName} @ ${r.brandName}`);

// 2. processorType vs message 矛盾
console.log('【2】processorType vs message 一致性');
console.log('─────────────────────────────\n');
const issues = [];
for (const r of records) {
  if (r.processorType === 'aiFiltering' && !['AI筛选'].includes(r.message)) {
    issues.push(`aiFiltering 但 message="${r.message}" | ${r.jobName}`);
  }
  if (r.processorType === 'amap' && !['工作地址筛选'].includes(r.message)) {
    issues.push(`amap 但 message="${r.message}" | ${r.jobName}`);
  }
  if (r.processorType === 'basic' && r.status === 'warn' && !['活跃度过滤', '薪资筛选'].includes(r.message)) {
    if (!['投递成功', '沟通中'].includes(r.message)) {
      issues.push(`basic+warn 但 message="${r.message}" | ${r.jobName}`);
    }
  }
}
if (issues.length === 0) console.log('  ✅ 无矛盾\n');
else for (const i of issues) console.log(`  ⚠️ ${i}`);

// 3. 加密ID完整性
console.log('【3】加密 jobId 完整性');
console.log('─────────────────────────────\n');
const noId = records.filter(r => !r.encryptJobId);
const dupIds = {};
for (const r of records) {
  if (!r.encryptJobId) continue;
  dupIds[r.encryptJobId] = (dupIds[r.encryptJobId] || 0) + 1;
}
const dups = Object.entries(dupIds).filter(([,c]) => c > 1);
console.log(`  无 encryptJobId: ${noId.length} 条`);
console.log(`  重复 encryptJobId: ${dups.length} 组`);

// 4. 时间异常
console.log('\n【4】时间异常检查');
console.log('─────────────────────────────\n');
const now = Date.now();
const future = records.filter(r => new Date(r.createdAt).getTime() > now);
const ancient = records.filter(r => new Date(r.createdAt).getTime() < new Date('2026-01-01').getTime());
console.log(`  未来时间: ${future.length} 条`);
console.log(`  2026年之前: ${ancient.length} 条`);
if (ancient.length > 0) {
  for (const r of ancient.slice(0, 3)) {
    console.log(`    ${r.jobName} | createdAt=${new Date(r.createdAt).toLocaleString('zh-CN')}`);
  }
}

// 5. 空字段检查
console.log('\n【5】关键字段缺失');
console.log('─────────────────────────────\n');
const noJob = records.filter(r => !r.jobName);
const noCompany = records.filter(r => !r.brandName);
const noMsg = records.filter(r => !r.message);
const noStatus = records.filter(r => !r.status);
console.log(`  无岗位名: ${noJob.length} | 无公司名: ${noCompany.length} | 无消息: ${noMsg.length} | 无状态: ${noStatus.length}`);

// 6. AI 评分日志匹配率
console.log('\n【6】AI 评分日志匹配');
console.log('─────────────────────────────\n');
const scoreMap = {};
for (const l of logs) {
  if (l.encryptJobId) scoreMap[l.encryptJobId] = l;
}
const scoreIds = Object.keys(scoreMap);
const matched = records.filter(r => scoreIds.includes(r.encryptJobId));
const scoreOrphaned = logs.filter(l => l.encryptJobId && !records.some(r => r.encryptJobId === l.encryptJobId));
console.log(`  AI 评分日志总数: ${logs.length}`);
console.log(`  能匹配到投递记录: ${matched.length}/${records.length}`);
console.log(`  孤立的评分日志（无对应记录）: ${scoreOrphaned.length}`);

// 7. 成功记录中的 AI 评分
console.log('\n【7】成功记录附带 AI 评分（可能误导）');
console.log('─────────────────────────────\n');
const successWithScore = records.filter(r => r.status === 'success' && scoreIds.includes(r.encryptJobId));
const negScore = successWithScore.filter(r => {
  const score = scoreMap[r.encryptJobId];
  return score && score.message && (score.message.includes('分数-') || score.message.includes('消极'));
});
console.log(`  成功且有 AI 评分: ${successWithScore.length} 条`);
console.log(`  其中评分内容含负面: ${negScore.length} 条`);
if (negScore.length > 0) {
  for (const r of negScore.slice(0, 5)) {
    const s = scoreMap[r.encryptJobId];
    const scoreVal = (s.message.match(/分数([+-]?\d+)/) || [])[1] || '?';
    console.log(`    ${r.jobName} @ ${r.brandName} | 分数=${scoreVal}`);
  }
}

// 8. 前端的"加分项"逻辑会有什么问题
console.log('\n【8】加分项分析逻辑检查');
console.log('─────────────────────────────\n');
// generateBonusPoints: success → "AI筛选通过", warn → "AI筛选未通过"
const falsePositive = records.filter(r => r.status === 'warn' && r.message === '工作地址筛选');
const falsePositive2 = records.filter(r => r.status === 'warn' && r.message === '活跃度过滤');
console.log(`  warn+工作地址筛选 → 详情页会显示"AI筛选未通过"（误导）: ${falsePositive.length} 条`);
console.log(`  warn+活跃度过滤 → 详情页会显示"AI筛选未通过"（误导）: ${falsePositive2.length} 条`);
for (const r of falsePositive.slice(0, 3)) {
  console.log(`    例: ${r.jobName} @ ${r.brandName}`);
}

// 9. 详细的 status-message-processorType 三角关系
console.log('\n【9】完整数据矩阵 (status × message × processorType)');
console.log('─────────────────────────────\n');
const matrix = {};
for (const r of records) {
  const key = `${r.status} | ${r.message} | ${r.processorType}`;
  matrix[key] = (matrix[key] || 0) + 1;
}
const sorted = Object.entries(matrix).sort((a, b) => b[1] - a[1]);
for (const [key, count] of sorted) {
  console.log(`  ${String(count).padStart(5)}: ${key}`);
}

console.log('\n═══════════════════════════════════════');
console.log('  检查完成');
console.log('═══════════════════════════════════════');

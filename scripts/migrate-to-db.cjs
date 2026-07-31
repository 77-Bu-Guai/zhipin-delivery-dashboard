// 数据迁移脚本 - 一次性把现有 extension-data.json 灌入 SQLite 数据库
// 用途: 首次启用数据库时使用，之后不需要再跑
// 用法: node scripts/migrate-to-db.cjs
const path = require('path');
const fs = require('fs');
const dbModule = require('./boss-db.cjs');

const PUBLIC_JSON = path.join(__dirname, '..', 'public', 'extension-data.json');
const DIST_JSON = path.join(__dirname, '..', 'dist', 'extension-data.json');

function migrate(filePath, label) {
  if (!fs.existsSync(filePath)) {
    console.log(`⚠️ ${label} 不存在，跳过: ${filePath}`);
    return { source: label, ...{ pipeline: 0, aiScoring: 0, dailyStats: 0 } };
  }

  console.log(`\n📦 正在迁移 ${label}: ${filePath}`);
  const data = JSON.parse(fs.readFileSync(filePath, 'utf-8'));

  const pipelineData = data['pipeline-cache']?.data || {};
  const aiLogs = data['ai-scoring-logs'] || [];
  const stats = data['web-geek-job-Statistics'] || [];
  const today = data['web-geek-job-Today'];

  const r1 = dbModule.upsertPipelineRecords(pipelineData, 'migration');
  console.log(`  ✅ 投递记录: 新增 ${r1.inserted} / 更新 ${r1.updated} (共 ${Object.keys(pipelineData).length})`);

  const r2 = dbModule.upsertAiScoringLogs(aiLogs, 'migration');
  console.log(`  ✅ AI 评分: 新增 ${r2.inserted} / 更新 ${r2.updated} (共 ${aiLogs.length})`);

  const r3 = dbModule.upsertDailyStatistics(stats);
  console.log(`  ✅ 每日统计: 合并 ${r3.merged} (共 ${stats.length})`);

  if (today) {
    dbModule.upsertToday(today);
    console.log(`  ✅ 今日数据已更新`);
  }

  return {
    source: label,
    pipeline: Object.keys(pipelineData).length,
    aiScoring: aiLogs.length,
    dailyStats: stats.length,
  };
}

function main() {
  console.log('🚀 开始迁移历史数据到 SQLite 数据库...\n');
  console.log(`📁 数据库路径: ${dbModule.DB_PATH}\n`);

  // 初始化数据库
  dbModule.init();

  const results = [];
  results.push(migrate(PUBLIC_JSON, 'public/extension-data.json'));
  results.push(migrate(DIST_JSON, 'dist/extension-data.json'));

  // 显示最终统计
  const stats = dbModule.getStats();
  console.log('\n========================================');
  console.log('📊 数据库最终统计:');
  console.log(`   投递记录: ${stats.pipeline} 条`);
  console.log(`   AI 评分: ${stats.aiScoring} 条`);
  console.log(`   每日统计: ${stats.dailyStats} 天`);
  console.log('========================================\n');

  // 重新生成 extension-data.json（从数据库导出）
  console.log('🔄 从数据库重新生成 extension-data.json...');
  const full = dbModule.buildFullExport({ migratedFromFiles: results.map(r => r.source) });
  const outputs = dbModule.writeJsonOutputs(full);
  console.log(`✅ 主文件: ${outputs.output}`);
  console.log(`✅ 每日快照: ${outputs.snapshot}`);

  dbModule.close();
  console.log('\n🎉 迁移完成！');
}

main();

const fs = require('fs');
const path = require('path');
const AdmZip = require('adm-zip');

const xpiPath = path.join(
  process.env.APPDATA,
  'Mozilla', 'Firefox', 'Profiles',
  'uz0ave2f.default-release-1782316007966',
  'extensions',
  '{1b66669d-c871-43f3-8c0c-d8a1c0566071}.xpi'
);

if (!fs.existsSync(xpiPath)) {
  console.log('XPI 文件不存在:', xpiPath);
  process.exit(1);
}

try {
  const zip = new AdmZip(xpiPath);
  const entries = zip.getEntries();
  
  // Look for manifest.json
  const manifestEntry = entries.find(e => e.entryName === 'manifest.json');
  if (!manifestEntry) {
    console.log('manifest.json 未找到');
    process.exit(1);
  }
  
  const manifest = JSON.parse(manifestEntry.getData().toString('utf8'));
  console.log('名称:', manifest.name);
  console.log('版本:', manifest.version);
  console.log('ID:', manifest.browser_specific_settings?.gecko?.id || manifest.applications?.gecko?.id);
  
  // Check if main-world.js exists (or similar)
  const jsFiles = entries.filter(e => e.entryName.endsWith('.js')).map(e => e.entryName);
  console.log('\nJS 文件列表:');
  jsFiles.forEach(f => console.log('  ' + f));
  
  // Look for the add function in JS files
  for (const jsFile of jsFiles) {
    const content = entries.find(e => e.entryName === jsFile).getData().toString('utf8');
    if (content.includes('add:(V,L,z,j)')) {
      console.log('\n✅ 找到 add 函数在:', jsFile);
      const idx = content.indexOf('add:(V,L,z,j)');
      console.log('  代码片段:', content.slice(idx, idx + 200));
    }
  }
  
} catch (e) {
  console.log('读取失败:', e.message);
}
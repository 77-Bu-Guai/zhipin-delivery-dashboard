const fs = require('fs');
const code = fs.readFileSync('E:\\Vibe Coding\\boss\\boss-extension-firefox\\main-world.js', 'utf8');

// Search for different patterns of the 'add' function
const patterns = [
  'add:function', 'add:(', 'add(', '.add=', '"add"', "'add'", 'add(V', 'add:L', 'add:Z',
  'data.value.push', 'boss_ai_scoring', 'localStorage', 'pipeline-cache',
];

for (const p of patterns) {
  const idx = code.indexOf(p);
  if (idx >= 0) {
    console.log(`✅ 找到 "${p}" 位置: ${idx}`);
    console.log('  上下文:', code.slice(Math.max(0, idx - 50), idx + 100));
    console.log('');
  }
}

// Also check the background.js for add function
console.log('\n检查 background.js...');
const bg = fs.readFileSync('E:\\Vibe Coding\\boss\\boss-extension-firefox\\background.js', 'utf8');
for (const p of patterns) {
  const idx = bg.indexOf(p);
  if (idx >= 0) {
    console.log(`✅ background.js - 找到 "${p}" 位置: ${idx}`);
  }
}

// Search in content-scripts
const contentDir = 'E:\\Vibe Coding\\boss\\boss-extension-firefox\\content-scripts';
if (fs.existsSync(contentDir)) {
  const files = fs.readdirSync(contentDir, { recursive: true });
  for (const file of files) {
    const fp = require('path').join(contentDir, file);
    if (fp.endsWith('.js')) {
      const c = fs.readFileSync(fp, 'utf8');
      for (const p of patterns) {
        if (c.includes(p)) {
          console.log(`✅ ${file} - 找到 "${p}"`);
        }
      }
    }
  }
}
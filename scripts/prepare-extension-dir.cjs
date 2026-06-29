const path = require('path');
const fs = require('fs');

const EXT_DIR = path.join(process.env.LOCALAPPDATA, 'Google', 'Chrome', 'User Data', 'Default', 'Extensions', 'ogkmgjbagackkdlcibcailacnncgonbn', '0.4.4_0');
const OUTPUT_DIR = path.join(__dirname, '..', 'boss-extension');

if (!fs.existsSync(EXT_DIR)) {
  console.log('❌ 未找到插件目录:', EXT_DIR);
  process.exit(1);
}

if (fs.existsSync(OUTPUT_DIR)) {
  fs.rmSync(OUTPUT_DIR, { recursive: true, force: true });
}

fs.cpSync(EXT_DIR, OUTPUT_DIR, { recursive: true });
console.log(`✅ 插件文件已复制到: ${OUTPUT_DIR}`);

if (fs.existsSync(path.join(OUTPUT_DIR, '_metadata'))) {
  fs.rmSync(path.join(OUTPUT_DIR, '_metadata'), { recursive: true, force: true });
  console.log('✅ 已删除签名验证文件 (_metadata)');
}

console.log('\n📝 加载方式：');
console.log('  1. 打开 Chrome');
console.log('  2. 地址栏输入 chrome://extensions/');
console.log('  3. 右上角开启「开发者模式」');
console.log('  4. 点击「加载已解压的扩展程序」');
console.log('  5. 选择目录:', OUTPUT_DIR);
console.log('  6. 插件加载成功后，去 Boss 直聘正常使用投递即可');

console.log('\n💡 提示：每次修改插件代码后，点击扩展管理页面的刷新按钮即可重新加载');

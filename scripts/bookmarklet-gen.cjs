// BOSS投递记录导出书签脚本（Bookmarklet）
// 用法：新建书签，URL填入下面的代码（javascript:开头的内容）
// 在BOSS任意已登录页面点击此书签，自动下载 JSON 文件

// ====== 生成 bookmarklet ======
const code = `(async function(){let a=[],p=1,h=true;const S=100;while(h){try{const r=await fetch('https://www.zhipin.com/wapi/zpgeek/resume/myHistory.json?page='+p+'&pageSize='+S,{credentials:'include'}),j=await r.json();if(j.code!==0||!j.zpData)break;const l=j.zpData.list||[];if(a=a.concat(l),p*S>=(j.zpData.total||l.length)||l.length===0)h=false;p++}catch(e){break}}const b=new Blob([JSON.stringify({list:a,total:a.length,exportedAt:new Date().toISOString()})],{type:'application/json'}),d=document.createElement('a');d.href=URL.createObjectURL(b),d.download='boss-delivery-history.json',d.click()})()`;

const bookmarklet = 'javascript:' + encodeURIComponent(code);

console.log('===== 书签脚本（bookmarklet）=====');
console.log('');
console.log('使用方法：');
console.log('1. Chrome → 书签管理器（Ctrl+Shift+O）');
console.log('2. 右上角三个点 → 添加新书签');
console.log('3. 名称：导出BOSS投递记录');
console.log('4. 网址：粘贴下面整段内容');
console.log('');
console.log(bookmarklet);
console.log('');
console.log('5. 保存后，打开 BOSS 直聘任意页面');
console.log('6. 点击这个书签，会自动下载 boss-delivery-history.json');

// BOSS直聘控制台抓取脚本
// 使用方法：
// 1. 打开 BOSS 直聘网页（任意已登录页面）
// 2. F12 → Console → 粘贴并运行下面压缩版代码
//
// 完整版（用于理解）：
(async function() {
  const PAGE_SIZE = 100;
  let allItems = [];
  let page = 1;
  let hasMore = true;

  while (hasMore) {
    try {
      const url = `https://www.zhipin.com/wapi/zpgeek/resume/myHistory.json?page=${page}&pageSize=${PAGE_SIZE}`;
      const res = await fetch(url, { credentials: 'include' });
      const json = await res.json();
      
      if (json.code !== 0 || !json.zpData) break;
      
      const list = json.zpData.list || [];
      allItems = allItems.concat(list);
      
      const total = json.zpData.total || list.length;
      hasMore = page * PAGE_SIZE < total && list.length > 0;
      page++;
    } catch(e) {
      console.error('获取失败:', e);
      break;
    }
  }

  // 下载 JSON
  const blob = new Blob([JSON.stringify({ list: allItems, total: allItems.length, exportedAt: new Date().toISOString() }, null, 2)], { type: 'application/json' });
  const a = document.createElement('a');
  a.href = URL.createObjectURL(blob);
  a.download = 'boss-delivery-history.json';
  a.click();
  console.log(`✅ 已导出 ${allItems.length} 条投递记录`);
})();

// ====== 压缩版（粘贴用） ======
// (async function(){let a=[],p=1,h=true;const S=100;while(h){try{const r=await fetch(`https://www.zhipin.com/wapi/zpgeek/resume/myHistory.json?page=${p}&pageSize=${S}`,{credentials:'include'}),j=await r.json();if(j.code!==0||!j.zpData)break;const l=j.zpData.list||[];if(a=a.concat(l),p*S>=(j.zpData.total||l.length)||l.length===0)h=false;p++}catch(e){console.error(e);break}}const b=new Blob([JSON.stringify({list:a,total:a.length,exportedAt:new Date().toISOString()})],{type:'application/json'}),d=document.createElement('a');d.href=URL.createObjectURL(b),d.download='boss-delivery-history.json',d.click();console.log('✅ 已导出 '+a.length+' 条')})();

const path = require('path');
const fs = require('fs');

const EXT_DIR = path.join(process.env.LOCALAPPDATA, 'Google', 'Chrome', 'User Data', 'Default', 'Extensions', 'ogkmgjbagackkdlcibcailacnncgonbn', '0.4.4_0');
const mainWorldPath = path.join(EXT_DIR, 'main-world.js');

// Backup
const backupPath = mainWorldPath + '.backup';
if (!fs.existsSync(backupPath)) {
  fs.copyFileSync(mainWorldPath, backupPath);
  console.log('✅ 已备份 main-world.js');
}

let code = fs.readFileSync(mainWorldPath, 'utf-8');

// Find the current add function (may already be patched)
const OLD_ADD_V1 = `add:(V,L,z,j)=>{const re=L?L.state:"success",oe=j??(L?L.message:void 0);data.value.push({job:V,title:V.jobName,state:re,state_name:(L==null?void 0:L.name)??"投递成功",message:oe,data:z})}`;
const OLD_ADD_V2 = `add:(V,L,z,j)=>{const re=L?L.state:"success",oe=j??(L?L.message:void 0);data.value.push({job:V,title:V.jobName,state:re,state_name:(L==null?void 0:L.name)??"投递成功",message:oe,data:z});try{const ll=JSON.parse(localStorage.getItem("boss_ai_scoring")||"[]");ll.push({time:Date.now(),jobName:V.jobName,state:re,state_name:(L==null?void 0:L.name)??"投递成功",message:oe,errMsg:z&&z.err?z.err:"",errState:z&&z.state?z.state:""});if(ll.length>2000)ll.splice(0,ll.length-2000);localStorage.setItem("boss_ai_scoring",JSON.stringify(ll))}catch(e){}}`;

const NEW_ADD = `add:(V,L,z,j)=>{const re=L?L.state:"success",oe=j??(L?L.message:void 0);data.value.push({job:V,title:V.jobName,state:re,state_name:(L==null?void 0:L.name)??"投递成功",message:oe,data:z});try{const ll=JSON.parse(localStorage.getItem("boss_ai_scoring")||"[]");ll.push({time:Date.now(),encryptJobId:V.encryptJobId||"",jobName:V.jobName||"",companyName:V.brandName||"",state:re,state_name:(L==null?void 0:L.name)??"投递成功",message:oe,errMsg:z&&z.err?z.err:"",errState:z&&z.state?z.state:""});if(ll.length>2000)ll.splice(0,ll.length-2000);localStorage.setItem("boss_ai_scoring",JSON.stringify(ll))}catch(e){}}`;

if (code.includes(OLD_ADD_V1)) {
  code = code.replace(OLD_ADD_V1, NEW_ADD);
  console.log('✅ 已修改 add 函数 (v1 → v2)，添加 encryptJobId/companyName');
} else if (code.includes(OLD_ADD_V2)) {
  code = code.replace(OLD_ADD_V2, NEW_ADD);
  console.log('✅ 已更新 add 函数 (v2 → v3)，添加 encryptJobId/companyName');
} else {
  console.log('❌ 未找到 add 函数');
  const idx = code.indexOf('add:(V,L,z,j)');
  if (idx >= 0) {
    console.log('   找到位置:', idx);
    console.log('   代码:', code.substring(idx, idx + 200));
  }
}

// Also modify the finally block to include detailed error message in cache
// Find the cachePipelineResult call in finally
const OLD_FINALLY = `await cachePipelineResult(ie.encryptJobId,ie.jobName||"",ie.brandName||"",ie.status.status,ie.status.msg||"处理完成")`;

if (code.includes(OLD_FINALLY)) {
  const NEW_FINALLY = `await cachePipelineResult(ie.encryptJobId,ie.jobName||"",ie.brandName||"",ie.status.status,ie.status.msg||"处理完成",void 0,le&&le.err?le.err:void 0)`;
  code = code.replace(OLD_FINALLY, NEW_FINALLY);
  fs.writeFileSync(mainWorldPath, code);
  console.log('✅ 已修改 cachePipelineResult 调用，传递详细错误信息');
} else {
  console.log('⚠️ 未找到 cachePipelineResult 调用');
}

console.log('\n📝 修改完成！请重新加载 Chrome 扩展。');
console.log('   打开 chrome://extensions/ → 找到 Boss 插件 → 点击刷新按钮');
console.log('   然后继续使用插件投递，详细评分日志将自动保存。');
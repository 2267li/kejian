'use strict';
require('../scripts/local-env.cjs');
const fs=require('node:fs'),path=require('node:path'),assert=require('node:assert/strict');
const root=path.resolve(__dirname,'..');
const automator=require(process.env.KEJIAN_WECHAT_AUTOMATOR_MODULE||path.join(root,'.cache/wechat-tools/node_modules/miniprogram-automator'));
const {KEY}=require('../miniprogram/utils/tasks');
const output=path.join(root,'.cache/miniprogram');fs.mkdirSync(output,{recursive:true});
let mini,previous,storageCaptured=false;
const captureScreenshots=process.env.KEJIAN_WECHAT_SCREENSHOTS==='1';
const errors=[];
async function connectReady(){
  const deadline=Date.now()+30000;
  while(true){
    try{return await automator.connect({wsEndpoint:process.env.KEJIAN_WECHAT_ENDPOINT||'ws://127.0.0.1:9420'});}
    catch(error){if(Date.now()>=deadline||!/Failed connecting/.test(error.message))throw error;await new Promise(resolve=>setTimeout(resolve,1000));}
  }
}
async function bounded(operation,label,milliseconds=15000){
  let timer;
  try{return await Promise.race([operation,new Promise((_,reject)=>{timer=setTimeout(()=>reject(new Error(label+' timed out')),milliseconds)})]);}
  finally{clearTimeout(timer);}
}
async function tap(page,selector){const element=await page.$(selector);assert.ok(element,'Element missing: '+selector);await element.tap();await page.waitFor(150);}
async function screenshot(name){if(captureScreenshots)await bounded(mini.screenshot({path:path.join(output,name)}),'Screenshot '+name,10000);}
async function withinViewport(page,selector,width){
  console.log('Layout check: '+selector);
  const element=await bounded(page.$(selector),'Select '+selector,5000);assert.ok(element,'Layout element missing: '+selector);
  const box=await bounded(element.size(),'Size '+selector,5000),offset=await bounded(element.offset(),'Offset '+selector,5000);
  assert.ok(Number(offset.left)>=-1&&Number(offset.left)+Number(box.width)<=width+1,'Horizontal overflow: '+selector+' '+JSON.stringify({box,offset,width}));
}
(async()=>{
  try{
    mini=await bounded(connectReady(),'Connect',35000);
    console.log('Simulator connected');
    mini.on('exception',event=>errors.push(event));
    const result=await bounded((async()=>{
      let page=await mini.currentPage();assert.ok(page,'Simulator must have a loaded page');
      previous=await mini.callWxMethod('getStorageSync',KEY);storageCaptured=true;
      // Preserve the exact original storage in finally; use only synthetic records for screenshots.
      await mini.callWxMethod('setStorageSync',KEY,'[]');
      page=await mini.reLaunch('/pages/index/index');
      const system=await mini.systemInfo();
      assert.equal(await page.data('storageError'),'');
      for(const selector of ['.composer','.notice-input','.navigation'])await withinViewport(page,selector,system.windowWidth);
      const input=await page.$('.notice-input');assert.ok(input);
      await input.input('【模拟测试】明天晚上八点前提交实验报告。格式为 PDF。');
      await (await page.$('.reference-row picker')).trigger('change',{value:'2026-10-12'});
      await tap(page,'.composer .primary');
      let draft=await page.data('draft');assert.equal(draft.date,'2026-10-13');assert.equal(draft.time,'20:00');
      await tap(page,'.navigation [data-view="tasks"]');await tap(page,'.navigation [data-view="compose"]');
      assert.equal((await page.data('draft')).date,'2026-10-13');
      for(const selector of ['.draft-card','.draft-card input','.draft-card .notes-input'])await withinViewport(page,selector,system.windowWidth);
      await screenshot('runtime-compose.png');
      await tap(page,'.draft-card .primary');assert.equal(await page.data('totalCount'),1);
      page=await mini.reLaunch('/pages/index/index');assert.equal(await page.data('totalCount'),1);
      await tap(page,'.navigation [data-view="tasks"]');
      await tap(page,'.task .check');assert.equal(await page.data('pendingCount'),0);
      await tap(page,'.filters [data-filter="done"]');assert.equal((await page.data('visibleTasks')).length,1);
      await tap(page,'.task-actions button');
      await (await page.$('input[data-field="title"]')).input('模拟测试：编辑后保存');
      await tap(page,'.draft-card .primary');
      const saved=JSON.parse(await mini.callWxMethod('getStorageSync',KEY));assert.equal(saved[0].title,'模拟测试：编辑后保存');assert.equal(saved[0].done,true);
      await withinViewport(page,'.task',system.windowWidth);
      assert.ok(Number((await (await page.$('.task .check')).size()).width)<=30,'Native button style stretched completion control');
      await screenshot('runtime-tasks.png');
      await tap(page,'.navigation [data-view="help"]');
      assert.match(await (await page.$('.help-grid')).text(),/已保存 1 条待办/);
      await screenshot('runtime-help.png');
      assert.deepEqual(errors,[],'Unhandled simulator exceptions');
      return {passed:true,page:page.path,SDKVersion:system.SDKVersion,platform:system.platform,windowWidth:system.windowWidth,checks:['Chinese textarea input','date picker change event','extract date and time','draft across tabs','save','reload persistence','complete','edit completed task','help view','native component widths','no horizontal overflow'],exceptionCount:errors.length,captureScreenshots,realPhone:false,realFilePicker:false};
    })(),'Runtime workflow',60000);
    fs.writeFileSync(path.join(output,'runtime-result.json'),JSON.stringify(result,null,2)+'\n');
    console.log(JSON.stringify(result));
  }finally{
    if(mini){
      try{if(storageCaptured){await bounded(previous===''||previous===undefined?mini.callWxMethod('removeStorageSync',KEY):mini.callWxMethod('setStorageSync',KEY,previous),'Restore storage',8000);await bounded(mini.reLaunch('/pages/index/index'),'Restore page',8000);}}
      finally{mini.disconnect();}
    }
  }
})().catch(error=>{console.error(error.message);if(errors.length)console.error(JSON.stringify(errors));process.exitCode=1;});

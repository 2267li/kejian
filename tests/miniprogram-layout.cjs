'use strict';
require('../scripts/local-env.cjs');
const assert=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path');
const root=path.resolve(__dirname,'..');
const automator=require(process.env.KEJIAN_WECHAT_AUTOMATOR_MODULE||path.join(root,'.cache/wechat-tools/node_modules/miniprogram-automator'));
const core=require('../miniprogram/utils/core');
const {KEY}=require('../miniprogram/utils/tasks');
const output=path.join(root,'.cache/miniprogram');
const captureScreenshots=process.env.KEJIAN_WECHAT_SCREENSHOTS==='1';
fs.mkdirSync(output,{recursive:true});
let mini,page,original;
async function bounded(operation,label,milliseconds=10000){
  let timer;
  try{return await Promise.race([operation,new Promise((_,reject)=>{timer=setTimeout(()=>reject(new Error(label+' timed out')),milliseconds);})]);}
  finally{clearTimeout(timer);}
}
async function scrollTo(top){
  await mini.evaluate(value=>{wx.pageScrollTo({scrollTop:value,duration:0});return true;},top);
  // The older Windows simulator settles native controls after the scroll callback.
  await page.waitFor(500);
}
async function tapVisible(selector){
  await scrollTo(0);
  const offset=await (await page.$(selector)).offset();
  await scrollTo(Math.max(0,offset.top-160));
  await (await page.$(selector)).tap();
  await page.waitFor(600);
}
async function checkRow(selector,width){
  const row=await page.$(selector);assert.ok(row,'Missing row: '+selector);
  const rowSize=await row.size(),rowOffset=await row.offset();
  const elements=await page.$$(selector+' button'),buttons=[];
  assert.equal(elements.length,2,'Expected both action buttons: '+selector);
  for(const button of elements){
    const text=await button.text(),size=await button.size(),offset=await button.offset();
    assert.ok(size.height>=44&&size.height<=56,'Button must remain one line and touchable: '+text+' '+JSON.stringify(size));
    assert.ok(size.width>=text.length*14+24,'Button has too little room for its label: '+text);
    assert.ok(offset.left>=rowOffset.left-1&&offset.left+size.width<=rowOffset.left+rowSize.width+1,'Button outside row: '+text);
    assert.ok(offset.left>=-1&&offset.left+size.width<=width+1,'Button outside screen: '+text);
    buttons.push({text,...size,...offset});
  }
  assert.ok(Math.abs(buttons[0].top-buttons[1].top)<=1,'Buttons must share a line');
  assert.ok(buttons[1].left-buttons[0].left-buttons[0].width>=9,'Buttons must not overlap');
  console.log(JSON.stringify({selector,buttons}));
  return {selector,buttons};
}
async function checkExamples(width){
  const row=await page.$('.example-row'),rowOffset=await row.offset(),rowSize=await row.size();
  const buttons=[];
  for(const [example,content] of [['homework','实验报告'],['event','摄影比赛'],['exam','高等数学']]){
    const button=await page.$('.example-row [data-example="'+example+'"]');assert.ok(button);
    const text=await button.text(),size=await button.size(),offset=await button.offset();
    assert.ok(size.width>=60&&size.height>=44&&size.height<=48,'Example must fit its label and remain touchable');
    assert.ok(offset.left>=rowOffset.left-1&&offset.left+size.width<=rowOffset.left+rowSize.width+1,'Example outside row');
    assert.ok(offset.left>=0&&offset.left+size.width<=width+1,'Example outside screen');
    if(buttons.length){const previous=buttons[buttons.length-1];assert.ok(Math.abs(offset.top-previous.top)<=1,'Examples must share one line');assert.ok(offset.left-previous.left-previous.width>=7,'Examples must not overlap');}
    await tapVisible('.example-row [data-example="'+example+'"]');
    assert.ok((await page.data('notice')).includes(content),'Example did not fill the notice: '+example);
    buttons.push({text,...size,...offset});
  }
  console.log(JSON.stringify({selector:'.example-row',buttons,exampleTapsPassed:true}));
  return {selector:'.example-row',buttons,exampleTapsPassed:true};
}
async function checkHelp(width){
  await page.setData({view:'help',importOpen:false,pasteOpen:false,pasteText:'',helpSection:'',totalCount:2,pendingCount:1});
  await scrollTo(0);
  const mainText=await (await page.$('.help-page')).text();
  assert.doesNotMatch(mainText,/JSON|AppID|ICS|SDK|\bID\b/,'Help page exposes implementation terms');
  const buttons=[];
  for(const selector of ['.help-save','.help-restore']){
    const button=await page.$(selector),size=await button.size(),offset=await button.offset();
    assert.ok(size.height>=44&&size.height<=48,'Primary help action must remain one line');
    assert.ok(offset.left>=0&&offset.left+size.width<=width+1,'Help button overflows');
    buttons.push({text:await button.text(),...size,...offset});
  }
  await capture('layout-help-overview.png','.help-header',0);
  for(const [section,expected] of [['transfer','不会自动同步'],['calendar','提醒时间需要在日历里设置'],['privacy','不会自动上传']]){
    await tapVisible('[data-section="'+section+'"]');
    assert.equal(await page.data('helpSection'),section);
    assert.ok((await (await page.$('.help-answer')).text()).includes(expected));
    if(section==='transfer')await capture('layout-help-guide.png','.help-guide',12);
    await tapVisible('[data-section="'+section+'"]');
    assert.equal((await page.data()).helpSection,'');
  }
  await tapVisible('.backup-card .help-disclosure');
  await (await page.$('.paste-input')).input('待恢复的完整备份');
  await tapVisible('.backup-card .help-disclosure');await tapVisible('.backup-card .help-disclosure');
  assert.equal(await page.data('pasteText'),'待恢复的完整备份','Collapsing backup controls must preserve pasted text');
  await page.setData({pasteOpen:false,pasteText:''});
  await page.setData({totalCount:0,pendingCount:0});
  assert.match(await (await page.$('.backup-summary')).text(),/还没有待办/);
  assert.equal(await (await page.$('.help-save')).property('disabled'),true,'Empty device must not offer an empty backup');
  assert.ok(!(await (await page.$('.help-restore')).property('disabled')),'Empty device must still allow recovery');
  await page.setData({totalCount:2,pendingCount:1});
  console.log('Help: plain language, action widths, three topics, pasted text retention and empty state passed.');
  return {selector:'.help-page',buttons,topicsPassed:3,pasteRetained:true,emptyStatePassed:true};
}
async function capture(name,selector,topPadding=260){
  if(!captureScreenshots)return;
  await scrollTo(0);
  const offset=await (await page.$(selector)).offset();
  await scrollTo(Math.max(0,offset.top-topPadding));
  await bounded(mini.screenshot({path:path.join(output,name)}),'Screenshot '+name);
}
(async()=>{
  try{
    mini=await bounded(automator.connect({wsEndpoint:process.env.KEJIAN_WECHAT_ENDPOINT||'ws://127.0.0.1:9420'}),'Connect');
    page=await mini.currentPage();assert.ok(page,'Simulator must have a loaded page');
    original=await page.data();
    const storage=await mini.callWxMethod('getStorageSync',KEY),system=await mini.systemInfo(),checks=[];
    const draft=core.extract('【布局测试】明天晚上八点前提交实验报告。格式为 PDF，文件名为“学号＋姓名”。提交到课程平台。','2026-10-12');
    // Exercise example filling and rendered layouts without saving to storage.
    // Restore the user's unsaved draft; leave the pending import object untouched.
    await page.setData({view:'compose',draft:null,editingId:'',notice:'',status:'',storageError:'',pendingCount:0,totalCount:0});
    await scrollTo(0);
    checks.push(await checkExamples(system.windowWidth));
    await capture('layout-composer.png','.example-row');
    await page.setData({view:'compose',notice:draft.source,reference:'2026-10-12',draft,editingId:'',categoryIndex:0,status:'',storageError:'',pendingCount:0,totalCount:0});
    await scrollTo(0);
    checks.push(await checkRow('.draft-card .action-row',system.windowWidth));
    await capture('layout-draft-actions.png','.draft-card .action-row');
    await page.setData({editingId:'layout-test'});
    checks.push(await checkRow('.draft-card .action-row',system.windowWidth));
    checks.push(await checkHelp(system.windowWidth));
    await page.setData({view:'help',importOpen:true,importCount:2,importMode:'merge',pasteOpen:false});
    await scrollTo(0);
    checks.push(await checkRow('.import-panel .action-row',system.windowWidth));
    await capture('layout-import-actions.png','.import-panel .action-row');
    await page.setData({view:'tasks',visibleTasks:[],hasPrevious:true,hasMore:true,pageNumber:2});
    await scrollTo(0);
    checks.push(await checkRow('.board .action-row',system.windowWidth));
    assert.deepEqual(await mini.callWxMethod('getStorageSync',KEY),storage,'Layout test changed local records');
    fs.writeFileSync(path.join(output,'layout-result.json'),JSON.stringify({passed:true,SDKVersion:system.SDKVersion,windowWidth:system.windowWidth,checks,captureScreenshots,storageUnchanged:true,realPhone:false},null,2)+'\n');
    console.log('Native action layout passed; local records unchanged.');
  }finally{
    if(mini){
      try{if(original){await bounded(page.setData(original),'Restore page');await scrollTo(0);if(original.view==='compose'&&original.draft){const offset=await (await page.$('.draft-card .action-row')).offset();await scrollTo(Math.max(0,offset.top-260));}}}
      finally{mini.disconnect();}
    }
  }
})().catch(error=>{console.error(error);process.exitCode=1;});

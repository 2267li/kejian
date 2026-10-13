'use strict';
require('../scripts/local-env.cjs');
const fs=require('node:fs'),path=require('node:path'),assert=require('node:assert/strict'),cp=require('node:child_process');
const {chromium}=require(process.env.KEJIAN_PLAYWRIGHT_MODULE||'playwright');
const root=path.resolve(__dirname,'..'),version=require('../package.json').version,KEY='kejian-notice-tasks-v1';
const run=path.join(root,'.cache/desktop/qa','run-'+Date.now()),portable=path.join(run,'便携程序');
fs.mkdirSync(portable,{recursive:true});
const exe=path.join(portable,'课间.exe');fs.copyFileSync(path.join(root,'release/windows','v'+version,'课间.exe'),exe);
const data=path.join(portable,'课间数据'),exportsDir=path.join(data,'exports');
let child,browser,page;const errors=[],requests=[],checks=[];
const wait=ms=>new Promise(resolve=>setTimeout(resolve,ms));
async function until(fn,message,timeout=20000){const end=Date.now()+timeout;while(Date.now()<end){if(await fn())return;await wait(100);}throw new Error(message);}
function task(id,title,extra={}){return {id,title,date:'2026-10-14',time:'20:00',category:'作业',notes:'',source:'',done:false,createdAt:'2026-10-13T00:00:00.000Z',...extra};}
function backup(tasks){return JSON.stringify({app:'kejian',version:1,exportedAt:new Date().toISOString(),tasks},null,2);}
async function records(){return page.evaluate(key=>JSON.parse(localStorage.getItem(key)||'[]'),KEY);}
async function inputBackup(text,name='课间测试备份.json'){
  await page.locator('#toast span').evaluate(el=>el.textContent='');
  await page.locator('#restoreInput').setInputFiles({name,mimeType:'application/json',buffer:Buffer.from(text)});
}
async function importTasks(tasks,replace=false){
  await inputBackup(backup(tasks));await page.locator('#importDialog').waitFor({state:'visible'});
  if(replace)await page.locator('[name="importMode"][value="replace"]').check();
  // Replace and corrupt-storage recovery require explicit confirmation.
  const accept=dialog=>dialog.accept();page.on('dialog',accept);
  try{await page.locator('#confirmImport').click();await page.locator('#importDialog').waitFor({state:'hidden'});}
  finally{page.off('dialog',accept);}
}
async function section(name){await page.locator('button[data-section="'+name+'"]').click();}
async function clearToast(){await page.locator('#toast').evaluate(el=>el.classList.add('hidden'));}
async function start(){
  const port=9430;let endpoint;page=null;
  child=cp.spawn(exe,['--test-mode','--debug-port='+port],{cwd:portable,windowsHide:false,stdio:'ignore'});
  console.log('Starting desktop PID '+child.pid);
  await until(async()=>{
    if(child.exitCode!==null)throw new Error('Desktop exited '+child.exitCode+' '+(fs.existsSync(path.join(data,'startup.log'))?fs.readFileSync(path.join(data,'startup.log'),'utf8'):''));
    try{
      const response=await fetch('http://127.0.0.1:'+port+'/json/version',{signal:AbortSignal.timeout(500)});if(!response.ok)return false;
      endpoint=(await response.json()).webSocketDebuggerUrl;
      // Connecting before the local page exists can pause WebView2 while its
      // native host is still waiting for controller initialization.
      const targets=await (await fetch('http://127.0.0.1:'+port+'/json/list',{signal:AbortSignal.timeout(500)})).json();
      return !!endpoint&&targets.some(t=>t.url==='https://kejian.local/index.html');
    }catch{return false;}
  },'Desktop debugging endpoint not ready',120000);
  browser=await chromium.connectOverCDP(endpoint,{timeout:15000});
  await until(async()=>{page=browser.contexts().flatMap(c=>c.pages()).find(p=>p.url().startsWith('https://kejian.local/'));return !!page;},'Local desktop page not found');
  page.on('pageerror',e=>errors.push(e.message));page.on('request',r=>{if(/^https?:/.test(r.url())&&!r.url().startsWith('https://kejian.local/'))requests.push(r.url());});
  await page.locator('#notice').waitFor();await page.context().setOffline(true);
}
async function stop(){
  if(child&&child.exitCode===null){
    if(page&&!page.isClosed())await page.evaluate(()=>window.chrome.webview.postMessage({command:'test-close',id:'test-shutdown'})).catch(()=>{});
    await until(()=>child.exitCode!==null,'Desktop did not close cleanly',10000);
    console.log('Desktop exited with code '+child.exitCode);
  }
  if(browser)await browser.close().catch(()=>{});browser=null;child=null;await wait(1500);
}
async function assertNoOverflow(label){assert.ok(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth),label+' has horizontal overflow');}
(async()=>{
  try {
    await start();
    const duplicate=cp.spawn(exe,['--test-mode'],{cwd:portable,windowsHide:true,stdio:'ignore'});
    await until(()=>duplicate.exitCode!==null,'Second instance did not exit');
    assert.equal(duplicate.exitCode,2,'A duplicate profile must not open a second window');
    assert.equal(await page.locator('#taskList .task').count(),0);
    await section('data');assert.equal(await page.locator('#transferExport').isDisabled(),true);await section('workspace');
    checks.push('single EXE in a new folder; duplicate instance protection; empty backup state');

    await page.locator('#notice').fill('【桌面测试】明天晚上八点前提交实验报告。格式为 PDF。');
    await page.locator('#reference').fill('2026-10-13');await page.locator('#extractBtn').click();
    assert.equal(await page.locator('#taskDate').inputValue(),'2026-10-14');assert.equal(await page.locator('#taskTime').inputValue(),'20:00');
    await page.locator('#taskTitle').fill('保留手动核对的标题');
    page.once('dialog',dialog=>dialog.dismiss());await page.locator('#extractBtn').click();
    assert.equal(await page.locator('#taskTitle').inputValue(),'保留手动核对的标题','Repeated extraction discarded a draft');
    page.once('dialog',dialog=>dialog.dismiss());await page.locator('[data-example="exam"]').click();
    assert.equal(await page.locator('#taskTitle').inputValue(),'保留手动核对的标题','Example discarded a draft');
    assert.match(await page.locator('#notice').inputValue(),/桌面测试/);
    await inputBackup(backup([task('draft-import','恢复时不得直接丢弃草稿')]));
    page.once('dialog',dialog=>dialog.dismiss());await page.locator('#confirmImport').click();
    assert.equal(await page.locator('#taskTitle').inputValue(),'保留手动核对的标题','Backup recovery discarded a draft without confirmation');
    assert.equal((await records()).length,0);
    await page.locator('[data-close="importDialog"]').click();
    await page.locator('#taskTitle').press('Control+Enter');await page.locator('#taskList .task').waitFor();
    await page.reload();await page.locator('#notice').waitFor();assert.equal(await page.locator('#taskList .task').count(),1);
    await page.locator('.task-controls button').filter({hasText:'编辑'}).first().click();
    await page.locator('#taskTitle').fill('桌面核对 <img src=x onerror=alert(1)>');await page.locator('#saveBtn').click();
    assert.equal(await page.locator('#taskList img').count(),0);
    await page.locator('.task-toggle').click();await page.locator('[data-filter="done"]').click();
    await page.locator('.task-controls button').filter({hasText:'编辑'}).click();
    await page.locator('#taskNotes').fill('已完成的待办仍可补充说明');await page.locator('#saveBtn').click();
    assert.equal(await page.locator('[data-filter="done"]').getAttribute('aria-pressed'),'true','Editing a completed task lost its filter');
    assert.equal(await page.locator('#taskList .task').count(),1);
    await page.locator('.task-toggle').click();await page.locator('[data-filter="pending"]').click();
    checks.push('Chinese extraction; create/reload/edit/complete; Ctrl+Enter save; safe text rendering; draft replacement cancellation; completed edit filter');

    const extra=[task('import-1','提交数据结构实验报告',{notes:'上传到课程平台，PDF 格式'}),task('import-2','参加摄影社活动',{category:'活动',time:'18:00'})];
    await importTasks(extra);assert.equal((await records()).length,3);
    await section('data');await page.locator('#transferExport').click();
    await until(()=>fs.existsSync(exportsDir)&&fs.readdirSync(exportsDir).some(n=>n.endsWith('.json')),'Native backup save failed');
    const backupPath=path.join(exportsDir,fs.readdirSync(exportsDir).find(n=>n.endsWith('.json'))),exported=JSON.parse(fs.readFileSync(backupPath,'utf8'));
    assert.equal(exported.app,'kejian');assert.equal(exported.version,1);assert.deepEqual(exported.tasks,await records());
    await section('workspace');await page.locator('#exportCalendar').click();
    await until(()=>fs.existsSync(path.join(exportsDir,'课间待办.ics')),'Native calendar save failed');
    assert.match(fs.readFileSync(path.join(exportsDir,'课间待办.ics'),'utf8'),/DTSTART:20261014T200000/);
    const before=await page.evaluate(key=>localStorage.getItem(key),KEY);
    for(const invalid of ['{invalid',backup([task('bad','')]),backup([task('same','一'),task('same','二')]),backup([task('bad','不合法时间',{time:'25:00'})])]){
      await inputBackup(invalid,'错误备份.json');
      await page.waitForFunction(()=>document.querySelector('#toast span').textContent.includes('有效'));
      assert.equal(await page.evaluate(key=>localStorage.getItem(key),KEY),before,'Invalid backup changed saved records');
    }
    await inputBackup(backup(extra));await page.locator('[name="importMode"][value="replace"]').check();
    page.once('dialog',dialog=>dialog.dismiss());await page.locator('#confirmImport').click();assert.equal(await page.evaluate(key=>localStorage.getItem(key),KEY),before);
    page.once('dialog',dialog=>dialog.accept());await page.locator('#confirmImport').click();await page.locator('#importDialog').waitFor({state:'hidden'});
    assert.equal((await records()).length,2);
    checks.push('backup round trip; native backup/calendar writing; invalid schema and duplicate ID rejection; replacement cancel/confirm');

    await page.locator('.task[data-id="import-1"] .task-controls button').filter({hasText:'删除'}).click();
    await page.locator('.task[data-id="import-2"] .task-toggle').click();await page.locator('#undoBtn').click();
    const undone=await records();assert.equal(undone.length,2);assert.equal(undone.find(t=>t.id==='import-2').done,true,'Undo reverted a later completion');
    await page.locator('.task[data-id="import-1"] .task-controls button').filter({hasText:'删除'}).click();
    await importTasks([task('import-1','恢复文件中的最新标题')]);await page.locator('#undoBtn').click();
    assert.equal((await records()).find(t=>t.id==='import-1').title,'恢复文件中的最新标题','Undo overwrote a newer imported record');
    checks.push('undo restores one deleted record without reverting later completion or imported edits');

    const bulk=Array.from({length:121},(_,index)=>task('page-'+index,'课程待办 '+String(index+1).padStart(3,'0'),{notes:index===120?'寻找这个唯一关键词':'例行学习记录'}));
    await importTasks(bulk,true);assert.equal(await page.locator('#taskList .task').count(),50);
    assert.match(await page.locator('#taskPageLabel').innerText(),/1.*3/);
    await page.locator('#nextPage').click();assert.equal(await page.locator('#taskList .task').count(),50);
    await page.locator('#nextPage').click();assert.equal(await page.locator('#taskList .task').count(),21);
    await page.locator('#taskSearch').fill('唯一关键词');
    await until(async()=>await page.locator('#taskList .task').count()===1,'Search did not filter notes');
    assert.match(await page.locator('.task-title').innerText(),/121/);
    await page.locator('#taskSearch').fill('没有任何匹配');
    await until(async()=>await page.locator('#taskList .task').count()===0,'Empty search state not shown');
    await page.locator('#taskSearch').fill('');await page.locator('[data-filter="done"]').click();
    assert.equal(await page.locator('#taskList .task').count(),0);await page.locator('[data-filter="pending"]').click();
    assert.equal(await page.locator('#taskList .task').count(),50);
    checks.push('121 records render in 50-record pages; search includes notes; empty results; filter/search reset pagination');

    // Failed writes must leave both saved records and the user's draft intact.
    const beforeWriteFailure=await page.evaluate(key=>localStorage.getItem(key),KEY);
    await page.locator('#notice').fill('明天提交操作系统作业');await page.locator('#extractBtn').click();
    await page.evaluate(()=>{window.__originalStorageSet=Storage.prototype.setItem;Storage.prototype.setItem=function(){throw new DOMException('Test quota failure','QuotaExceededError');};});
    await page.locator('#saveBtn').click();assert.equal(await page.locator('#draftForm').isVisible(),true);
    assert.equal(await page.evaluate(key=>localStorage.getItem(key),KEY),beforeWriteFailure);
    await page.evaluate(()=>{Storage.prototype.setItem=window.__originalStorageSet;delete window.__originalStorageSet;});
    await page.reload();await page.locator('#notice').waitFor();
    // Corrupt storage is tested only in the isolated portable folder.
    await page.evaluate(key=>localStorage.setItem(key,'{broken'),KEY);await page.reload();await page.locator('#notice').waitFor();
    await page.locator('#notice').fill('明天提交作业');await page.locator('#extractBtn').click();await page.locator('#saveBtn').click();
    assert.equal(await page.evaluate(key=>localStorage.getItem(key),KEY),'{broken','Corrupt storage was silently overwritten');
    await page.reload();await page.locator('#notice').waitFor();await importTasks(extra,true);
    assert.equal((await records()).length,2,'A valid backup did not recover corrupt storage');
    checks.push('storage write failure keeps draft and data; corrupt storage protected; valid backup recovery');

    const showcase=[
      task('show-report','提交数据结构实验报告',{date:'2026-10-14',notes:'PDF 格式，文件名为“学号＋姓名”，提交到课程平台。',source:'请于10月14日晚上八点前提交数据结构实验报告。格式为 PDF，文件名为“学号＋姓名”。'}),
      task('show-exam','参加高等数学测验',{date:'2026-10-16',time:'09:00',category:'考试',notes:'教学楼 A203，带学生证和黑色签字笔。',source:'本周五上午九点参加高等数学测验。地点：教学楼 A203。请携带学生证、黑色签字笔。'}),
      task('show-activity','完成摄影比赛报名',{date:'2026-10-15',time:'18:00',category:'活动',notes:'填写报名表，作品命名为“专业＋姓名＋作品名”。',source:'10月15日下午六点前完成摄影比赛报名。请填写报名表。'})
    ];
    await importTasks(showcase,true);
    await page.locator('.task-source summary').first().click();
    await page.evaluate(()=>window.dispatchEvent(new Event('focus')));
    assert.equal(await page.locator('.task-source[open]').count(),1,'Returning to the window collapsed the original notice');
    await page.locator('.task-source summary').first().click();
    checks.push('returning to the window preserves expanded original notices');
    await page.locator('#notice').fill('【实验课通知】请于明天晚上八点前提交操作系统实验报告。格式为 PDF，文件名为“学号＋姓名”。提交到课程平台的实验二作业区。');
    await page.locator('#reference').fill('2026-10-13');await page.locator('#extractBtn').click();await clearToast();
    const cdp=await page.context().newCDPSession(page);
    await cdp.send('Emulation.setDeviceMetricsOverride',{width:1180,height:800,deviceScaleFactor:1,mobile:false});
    await page.locator('#cancelDraft').click();
    await page.evaluate(()=>{document.activeElement?.blur();scrollTo(0,0);document.querySelectorAll('*').forEach(el=>{if(el.scrollTop)el.scrollTop=0;});});await wait(200);
    await assertNoOverflow('1180px workspace');await page.screenshot({path:path.join(run,'windows-workspace.png'),scale:'css'});
    await page.locator('#extractBtn').click();
    await cdp.send('Emulation.setDeviceMetricsOverride',{width:1180,height:900,deviceScaleFactor:1,mobile:false});
    await page.evaluate(()=>{document.querySelector('#draftForm').scrollIntoView({block:'start'});document.activeElement?.blur();scrollTo(0,0);});
    await page.screenshot({path:path.join(run,'windows-draft.png'),scale:'css'});
    await cdp.send('Emulation.setDeviceMetricsOverride',{width:1180,height:800,deviceScaleFactor:1,mobile:false});
    await section('data');await clearToast();await page.evaluate(()=>scrollTo(0,0));
    assert.doesNotMatch(await page.locator('#dataSection').innerText(),/JSON|API|AppID|浏览器|小程序/);
    await assertNoOverflow('1180px backup page');await page.screenshot({path:path.join(run,'windows-backup.png'),fullPage:true,scale:'css'});
    await cdp.send('Emulation.setDeviceMetricsOverride',{width:820,height:650,deviceScaleFactor:1,mobile:false});
    await assertNoOverflow('820px backup page');await section('workspace');await assertNoOverflow('820px workspace');
    await page.screenshot({path:path.join(run,'windows-compact.png'),scale:'css'});
    await cdp.send('Emulation.setDeviceMetricsOverride',{width:780,height:600,deviceScaleFactor:1,mobile:false});
    await assertNoOverflow('780px workspace');await section('data');await assertNoOverflow('780px backup page');
    await cdp.send('Emulation.clearDeviceMetricsOverride');await cdp.detach();
    checks.push('plain-language Windows backup page; 1180px and 820px layouts; actual EXE screenshots');

    await stop();await start();assert.deepEqual(await records(),showcase,'Tasks did not survive an actual EXE restart');
    assert.deepEqual(errors,[]);assert.deepEqual(requests,[]);
    assert.ok(fs.existsSync(path.join(data,'webview')));assert.ok(fs.existsSync(path.join(data,'runtime')));
    checks.push('full EXE restart preserves saved records; no external page requests or script errors');
    const result={passed:true,version,exeBytes:fs.statSync(exe).size,offline:true,externalPageRequests:0,pageErrors:0,backupRoundTripRecords:3,paginationRecords:121,restartPersistence:true,isolatedDataDirectory:data,checks,nativeFileDialog:'automation chooses a test output path',screenshots:['windows-workspace.png','windows-draft.png','windows-backup.png','windows-compact.png'],screenshotViewport:'1180x800 workspace, 1180x900 draft, full-height backup and 820x650 compact; CSS pixels via CDP on actual EXE'};
    fs.writeFileSync(path.join(run,'result.json'),JSON.stringify(result,null,2)+'\n');
    fs.writeFileSync(path.join(root,'.cache/desktop/latest-qa.json'),JSON.stringify({run,...result},null,2)+'\n');
    console.log(JSON.stringify({run,...result},null,2));
  }catch(error){
    if(page&&!page.isClosed())await page.screenshot({path:path.join(run,'failure.png')}).catch(()=>{});
    fs.writeFileSync(path.join(run,'failure.txt'),String(error.stack||error));throw error;
  }finally{await stop().catch(error=>{if(child&&child.exitCode===null)child.kill();console.error(error.message);});}
})().catch(error=>{console.error(error);process.exitCode=1;});

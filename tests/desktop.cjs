'use strict';
require('../scripts/local-env.cjs');
const fs=require('node:fs'),path=require('node:path'),assert=require('node:assert/strict'),cp=require('node:child_process');
const {chromium}=require(process.env.KEJIAN_PLAYWRIGHT_MODULE||'playwright');
const model=require('../miniprogram/utils/tasks'),demo=require('./fixtures/demo-import.json');
const root=path.resolve(__dirname,'..'),version=require('../package.json').version;
const run=path.join(root,'.cache/desktop/qa','run-'+Date.now()),portable=path.join(run,'便携程序');
fs.mkdirSync(portable,{recursive:true});
const exe=path.join(portable,'课间.exe');fs.copyFileSync(path.join(root,'release/windows','v'+version,'课间.exe'),exe);
const data=path.join(portable,'课间数据'),exportsDir=path.join(data,'exports');
let child,browser,page;const errors=[],requests=[];
const wait=ms=>new Promise(resolve=>setTimeout(resolve,ms));
async function until(fn,message,timeout=20000){const end=Date.now()+timeout;while(Date.now()<end){if(await fn())return;await wait(100);}throw new Error(message);}
async function start(){
  const port=9430;let endpoint;
  page=null;
  child=cp.spawn(exe,['--test-mode','--debug-port='+port],{cwd:portable,windowsHide:false,stdio:'ignore'});
  console.log('Starting desktop PID '+child.pid);
  await until(async()=>{
    if(child.exitCode!==null)throw new Error('Desktop exited '+child.exitCode+' '+(fs.existsSync(path.join(data,'startup.log'))?fs.readFileSync(path.join(data,'startup.log'),'utf8'):''));
    try{
      const response=await fetch('http://127.0.0.1:'+port+'/json/version',{signal:AbortSignal.timeout(500)});if(!response.ok)return false;
      endpoint=(await response.json()).webSocketDebuggerUrl;
      // Attaching before EnsureCoreWebView2Async completes can pause the new
      // renderer while its host is still waiting for controller initialization.
      const targets=await (await fetch('http://127.0.0.1:'+port+'/json/list',{signal:AbortSignal.timeout(500)})).json();
      return !!endpoint&&targets.some(t=>t.url==='https://kejian.local/index.html');
    }catch{return false;}
  },'Desktop debugging endpoint not ready',120000);
  browser=await chromium.connectOverCDP(endpoint,{timeout:15000});
  await until(async()=>{page=browser.contexts().flatMap(c=>c.pages()).find(p=>p.url().startsWith('https://kejian.local/'));return !!page;},'Local desktop page not found');
  page.on('pageerror',e=>errors.push(e.message));page.on('request',r=>{if(/^https?:/.test(r.url())&&!r.url().startsWith('https://kejian.local/'))requests.push(r.url());});
  await page.locator('#notice').waitFor();
  await page.context().setOffline(true);
}
async function stop(){
  if(child&&child.exitCode===null){
    if(page&&!page.isClosed())await page.evaluate(()=>window.chrome.webview.postMessage({command:'test-close',id:'test-shutdown'})).catch(()=>{});
    await until(()=>child.exitCode!==null,'Desktop did not close cleanly',10000);
    console.log('Desktop exited with code '+child.exitCode);
  }
  if(browser)await browser.close().catch(()=>{});browser=null;child=null;
  await wait(1500);
}
(async()=>{
  try {
    await start();
    const duplicate=cp.spawn(exe,['--test-mode'],{cwd:portable,windowsHide:true,stdio:'ignore'});
    await until(()=>duplicate.exitCode!==null,'Second instance did not exit');
    assert.equal(duplicate.exitCode,2,'A duplicate profile must not open a second window');
    assert.equal(await page.locator('#taskList .task').count(),0);
    await page.locator('#notice').fill('【桌面测试】明天晚上八点前提交实验报告。格式为 PDF。');
    await page.locator('#reference').fill('2026-10-13');await page.locator('#extractBtn').click();
    assert.equal(await page.locator('#taskDate').inputValue(),'2026-10-14');assert.equal(await page.locator('#taskTime').inputValue(),'20:00');
    await page.locator('#saveBtn').click();await page.locator('#taskList .task').waitFor();
    await page.reload();await page.locator('#notice').waitFor();assert.equal(await page.locator('#taskList .task').count(),1);
    await page.locator('.task-controls button').filter({hasText:'编辑'}).first().click();
    await page.locator('#taskTitle').fill('桌面核对 <img src=x onerror=alert(1)>');await page.locator('#saveBtn').click();
    assert.equal(await page.locator('#taskList img').count(),0);
    await page.locator('.task-toggle').click();await page.locator('[data-filter="done"]').click();
    assert.equal(await page.locator('#taskList .task').count(),1);
    await page.locator('.task-toggle').click();await page.locator('[data-filter="pending"]').click();
    await page.locator('#restoreInput').setInputFiles({name:'小程序备份.json',mimeType:'application/json',buffer:Buffer.from(model.makeBackup(demo.tasks))});
    await page.locator('#confirmImport').click();
    assert.equal((await page.evaluate(key=>JSON.parse(localStorage.getItem(key)),model.KEY)).length,9);
    await page.locator('#backupBtn').click();
    await until(()=>fs.existsSync(exportsDir)&&fs.readdirSync(exportsDir).some(n=>n.endsWith('.json')),'Native backup save failed');
    const backupPath=path.join(exportsDir,fs.readdirSync(exportsDir).find(n=>n.endsWith('.json'))),exported=model.parseBackup(fs.readFileSync(backupPath,'utf8'));
    assert.equal(exported.length,9);assert.ok(model.validTasks(exported));
    await page.locator('#exportCalendar').click();
    await until(()=>fs.existsSync(path.join(exportsDir,'课间待办.ics')),'Native calendar save failed');
    assert.match(fs.readFileSync(path.join(exportsDir,'课间待办.ics'),'utf8'),/DTSTART:20261014T200000/);
    const before=await page.evaluate(key=>localStorage.getItem(key),model.KEY);
    await page.locator('#restoreInput').setInputFiles({name:'错误备份.json',mimeType:'application/json',buffer:Buffer.from('{invalid')});
    await page.waitForFunction(()=>document.querySelector('#toast span').textContent.includes('不是有效'));
    assert.equal(await page.evaluate(key=>localStorage.getItem(key),model.KEY),before);
    await page.locator('#restoreInput').setInputFiles({name:'小程序备份.json',mimeType:'application/json',buffer:Buffer.from(model.makeBackup(demo.tasks))});
    await page.locator('[name="importMode"][value="replace"]').check();
    page.once('dialog',dialog=>dialog.dismiss());await page.locator('#confirmImport').click();
    assert.equal(await page.evaluate(key=>localStorage.getItem(key),model.KEY),before);
    page.once('dialog',dialog=>dialog.accept());await page.locator('#confirmImport').click();
    await page.waitForFunction(key=>JSON.parse(localStorage.getItem(key)).length===8,model.KEY);
    // Make the preview readable while keeping all synthetic data in the test-only portable folder.
    await page.locator('#toast').evaluate(el=>el.classList.add('hidden'));
    await page.evaluate(()=>scrollTo(0,0));
    await page.screenshot({path:path.join(run,'desktop.png'),fullPage:true});
    await page.locator('#installBtn').click();
    assert.doesNotMatch(await page.locator('#transferDialog').innerText(),/JSON|API|AppID/);
    await page.screenshot({path:path.join(run,'desktop-help.png')});
    await page.locator('[data-close="transferDialog"]').click();
    const cdp=await page.context().newCDPSession(page);
    await cdp.send('Emulation.setDeviceMetricsOverride',{width:820,height:650,deviceScaleFactor:1,mobile:false});
    assert.ok(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth),'Narrow desktop window overflows');
    await cdp.send('Emulation.clearDeviceMetricsOverride');await cdp.detach();
    await stop();await start();
    assert.equal((await page.evaluate(key=>JSON.parse(localStorage.getItem(key)),model.KEY)).length,8,'Tasks did not survive an actual EXE restart');
    assert.deepEqual(errors,[]);assert.deepEqual(requests,[]);
    assert.ok(fs.existsSync(path.join(data,'webview')));assert.ok(fs.existsSync(path.join(data,'runtime')));
    const result={passed:true,version,exeBytes:fs.statSync(exe).size,offline:true,externalPageRequests:0,pageErrors:0,miniToDesktopRecords:8,desktopToMiniCompatibleRecords:9,restartPersistence:true,isolatedDataDirectory:data,checks:['single EXE in a new folder','Chinese extraction','create/reload/edit/complete','input rendered as text','mini-program backup import','native backup/calendar file writing','invalid backup protection','replacement cancel/confirm','plain-language help','820px layout','full EXE restart'],nativeFileDialog:'automation chooses a test output path',realWeChatFilePicker:false};
    fs.writeFileSync(path.join(run,'result.json'),JSON.stringify(result,null,2)+'\n');
    fs.writeFileSync(path.join(root,'.cache/desktop/latest-qa.json'),JSON.stringify({run,...result},null,2)+'\n');
    console.log(JSON.stringify({run,...result},null,2));
  }finally{await stop().catch(error=>{if(child&&child.exitCode===null)child.kill();console.error(error.message);});}
})().catch(error=>{console.error(error);process.exitCode=1;});

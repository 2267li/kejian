'use strict';
require('../scripts/local-env.cjs');
const assert=require('node:assert/strict'),path=require('node:path'),fs=require('node:fs');
const {chromium}=require(process.env.KEJIAN_PLAYWRIGHT_MODULE||'playwright');
const {createServer}=require('../scripts/serve.cjs');
const root=path.resolve(__dirname,'..'),shots=path.join(root,'.cache/previews');
const executablePath=[process.env.KEJIAN_BROWSER_PATH,'C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe','C:/Program Files/Google/Chrome/Application/chrome.exe'].filter(Boolean).find(p=>fs.existsSync(p));
const KEY='kejian-notice-tasks-v1';
(async()=>{
 const server=createServer();await new Promise(resolve=>server.listen(0,'127.0.0.1',resolve));
 const url=`http://127.0.0.1:${server.address().port}/`;
 const browser=await chromium.launch({headless:true,...(executablePath?{executablePath}:{})});
 const errors=[],external=[];
 async function context(options){const ctx=await browser.newContext({acceptDownloads:true,timezoneId:'Asia/Shanghai',...options});ctx.on('page',page=>{page.on('pageerror',e=>errors.push(e.message));page.on('request',r=>{if(/^https?:/.test(r.url())&&!r.url().startsWith(url))external.push(r.url());});});return ctx;}
 async function add(page,title){await page.locator('#notice').fill('明天晚上八点前提交实验报告。格式 PDF。');await page.locator('#extractBtn').click();await page.locator('#taskTitle').fill(title);await page.locator('#saveBtn').click();}
 async function data(page){return page.evaluate(key=>JSON.parse(localStorage.getItem(key)||'[]'),KEY);}
 async function importFile(page,file){await page.locator('#restoreInput').setInputFiles(file);await page.locator('#importDialog[open]').waitFor();await page.locator('#confirmImport').click();}
 try{
  const desk=await context({viewport:{width:1440,height:1080}}),page=await desk.newPage();await page.goto(url);
  await page.waitForFunction(()=>navigator.serviceWorker.controller!==null);
  assert.match(await page.locator('#appStatus').innerText(),/断网也能用/);
  const manifest=await (await page.request.get(url+'manifest.webmanifest')).json();assert.equal(manifest.display,'standalone');
  for(const icon of manifest.icons){const response=await page.request.get(url+icon.src);assert.equal(response.status(),200);assert.match(response.headers()['content-type'],/image\/png/);}
  const cdp=await desk.newCDPSession(page);await cdp.send('Page.enable');
  const installability=await cdp.send('Page.getInstallabilityErrors');assert.deepEqual(installability.installabilityErrors.filter(e=>e.errorId!=='in-incognito'),[]); // Isolated test contexts cannot install apps.
  await add(page,'电脑端实验报告');const download=page.waitForEvent('download');await page.locator('#backupBtn').click();const file=await (await download).path();
  const phone=await context({viewport:{width:390,height:844},deviceScaleFactor:2,isMobile:true,hasTouch:true}),mobile=await phone.newPage();await mobile.goto(url);
  await mobile.waitForFunction(()=>navigator.serviceWorker.controller!==null);
  assert.equal((await data(mobile)).length,0,'Devices must keep independent storage');
  await add(mobile,'手机上已有的待办');assert.equal(await mobile.locator('.tasks-panel').isVisible(),true);
  await importFile(mobile,file);assert.equal((await data(mobile)).length,2,'Merge must preserve phone records');
  await importFile(mobile,file);assert.equal((await data(mobile)).length,2,'Importing same backup must deduplicate');
  // Invalid backups never change existing data.
  await mobile.locator('#restoreInput').setInputFiles({name:'bad.json',mimeType:'application/json',buffer:Buffer.from('{"app":"kejian","version":1,"tasks":[{}]}')});
  await mobile.waitForFunction(()=>document.querySelector('#toast').textContent.includes('不是有效'));
  assert.equal((await data(mobile)).length,2);
  // Replace requires an explicit choice and confirmation.
  await mobile.locator('#restoreInput').setInputFiles(file);await mobile.locator('[value="replace"]').check();
  mobile.once('dialog',dialog=>dialog.dismiss());await mobile.locator('#confirmImport').click();assert.equal((await data(mobile)).length,2);
  mobile.once('dialog',dialog=>dialog.accept());await mobile.locator('#confirmImport').click();assert.equal((await data(mobile)).length,1);
  // Editing from task navigation reveals the form, then returns to tasks.
  await mobile.locator('.task-controls button').filter({hasText:'编辑'}).click();assert.equal(await mobile.locator('.compose').isVisible(),true);
  await mobile.locator('#taskTitle').fill('手机修改后的报告');await mobile.locator('#saveBtn').click();
  const back=mobile.waitForEvent('download');await mobile.locator('#backupBtn').click();await importFile(page,await (await back).path());assert.equal((await data(page))[0].title,'手机修改后的报告');
  await phone.setOffline(true);await mobile.reload();await mobile.locator('button[data-view="tasks"]').click();assert.equal(await mobile.locator('.task-title').innerText(),'手机修改后的报告');
  assert.match(await mobile.locator('#appStatus').innerText(),/离线中/);await mobile.locator('.task-toggle').click();await mobile.reload();assert.equal((await data(mobile))[0].done,true);
  await mobile.locator('button[data-view="compose"]').click();await add(mobile,'断网新增的待办');assert.equal((await data(mobile)).length,2);
  await mobile.locator('#moreBtn').click();assert.equal(await mobile.locator('#transferDialog').evaluate(d=>d.open),true);await mobile.locator('#moreHelp').click();await mobile.locator('#helpDialog .primary').click();
  await mobile.locator('#installBtn').click();assert.equal(await mobile.locator('#installDialog').evaluate(d=>d.open),true);await mobile.locator('#installDialog .primary').click();
  for(const width of [360,390,700,768,1440]){await mobile.setViewportSize({width,height:844});assert.ok(await mobile.evaluate(()=>document.documentElement.scrollWidth<=innerWidth),`Overflow at ${width}px`);}
  await mobile.setViewportSize({width:390,height:844});await mobile.locator('button[data-view="compose"]').click();assert.equal(await mobile.locator('#notice').evaluate(e=>getComputedStyle(e).fontSize),'16px');
  await mobile.evaluate(()=>{document.querySelector('#toast').classList.add('hidden');scrollTo(0,0);});fs.mkdirSync(shots,{recursive:true});await mobile.screenshot({path:path.join(shots,'mobile-compose.png'),fullPage:true});
  await mobile.locator('button[data-view="tasks"]').click();await mobile.screenshot({path:path.join(shots,'mobile-tasks.png'),fullPage:true});
  await page.evaluate(()=>{document.querySelector('#toast').classList.add('hidden');scrollTo(0,0);});await page.screenshot({path:path.join(shots,'desktop-pwa.png'),fullPage:true});
  assert.deepEqual(errors,[]);assert.deepEqual(external,[]);
  console.log(JSON.stringify({passed:true,checked:['manifest and icons','Chromium installability','independent device storage','bidirectional file transfer','merge deduplication','replace confirm and cancellation','invalid backup rejection','offline reload and CRUD','mobile navigation and forms','360–1440 px layouts'],pageErrors:errors.length,externalRequests:external.length},null,2));
 }finally{await browser.close();await new Promise(resolve=>server.close(resolve));}
})().catch(error=>{console.error(error);process.exitCode=1;});

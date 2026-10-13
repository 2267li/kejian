'use strict';
require('../scripts/local-env.cjs');
const fs=require('node:fs'),path=require('node:path'),assert=require('node:assert/strict');
const {createServer}=require('../scripts/serve.cjs');
const model=require('../miniprogram/utils/tasks');
const demo=require('./fixtures/demo-import.json');
const {chromium}=require(process.env.KEJIAN_PLAYWRIGHT_MODULE||'playwright');
const root=path.resolve(__dirname,'..');
(async()=>{
  const server=createServer(path.join(root,'dist'));await new Promise(resolve=>server.listen(0,'127.0.0.1',resolve));
  const executablePath=process.env.KEJIAN_BROWSER_PATH||['C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe','C:/Program Files/Google/Chrome/Application/chrome.exe'].find(p=>fs.existsSync(p));
  let browser;
  try{
    browser=await chromium.launch({executablePath,headless:true});const context=await browser.newContext({acceptDownloads:true,timezoneId:'Asia/Shanghai'}),page=await context.newPage(),errors=[];page.on('pageerror',e=>errors.push(e.message));
    await page.goto(`http://127.0.0.1:${server.address().port}`);
    await page.waitForFunction(()=>navigator.serviceWorker.controller!==null);
    const fromMini=model.makeBackup(demo.tasks);
    await page.locator('#restoreInput').setInputFiles({name:'kejian-backup.json',mimeType:'application/json',buffer:Buffer.from(fromMini)});
    await page.locator('#confirmImport').click();
    const webTasks=await page.evaluate(key=>JSON.parse(localStorage.getItem(key)),model.KEY);assert.deepEqual(webTasks,demo.tasks);
    await page.locator('.task-controls button').filter({hasText:'编辑'}).first().click();await page.locator('#taskTitle').fill('网页版修改后回到小程序');await page.locator('#saveBtn').click();
    const download=page.waitForEvent('download');await page.locator('#backupBtn').click();const backupPath=await (await download).path();
    const returnTasks=model.parseBackup(fs.readFileSync(backupPath,'utf8'));assert.equal(returnTasks.length,demo.tasks.length);assert.equal(returnTasks.filter(t=>t.title==='网页版修改后回到小程序').length,1);model.serialize(returnTasks);
    assert.deepEqual(errors,[]);console.log(JSON.stringify({passed:true,miniBackupToWeb:8,webBackupToMini:8,webPageErrors:errors.length,realWeChatFilePicker:'not covered'}));
  }finally{if(browser)await browser.close();await new Promise(resolve=>server.close(resolve));}
})().catch(e=>{console.error(e);process.exitCode=1;});

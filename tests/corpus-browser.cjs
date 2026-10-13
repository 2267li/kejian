'use strict';
require('../scripts/local-env.cjs');
const fs=require('node:fs'),path=require('node:path'),assert=require('node:assert/strict');
const {chromium}=require(process.env.KEJIAN_PLAYWRIGHT_MODULE||'playwright');
const {createServer}=require('../scripts/serve.cjs');
const cases=require('./fixtures/notice-cases.cjs'),{check}=require('./evaluate.cjs');
const KEY='kejian-notice-tasks-v1';
// These choices simulate the user's explicit review, not automatic extraction.
const confirmed={R02:['2026-03-19','14:30'],R03:['2026-09-18','14:30'],R04:['2026-03-27','14:30'],R05:['2025-06-16','17:00']};
(async()=>{
 const server=createServer();await new Promise(r=>server.listen(0,'127.0.0.1',r));const url=`http://127.0.0.1:${server.address().port}/`;
 const browser=await chromium.launch({headless:true,executablePath:process.env.KEJIAN_BROWSER_PATH||'C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe'});
 const results=[],errors=[];
 try{
  for(const mobile of [false,true]){
   const context=await browser.newContext({viewport:{width:mobile?390:1440,height:900},isMobile:mobile,hasTouch:mobile,acceptDownloads:true});
   const page=await context.newPage();page.on('pageerror',e=>errors.push(e.message));await page.goto(url);
   for(const item of cases){
    if(mobile)await page.locator('button[data-view="compose"]').click();
    await page.locator('#notice').fill(item.text);await page.locator('#reference').fill(item.base);await page.locator('#extractBtn').click();
    const actual={date:await page.locator('#taskDate').inputValue(),time:await page.locator('#taskTime').inputValue(),category:await page.locator('#taskCategory').inputValue(),title:await page.locator('#taskTitle').inputValue(),notes:await page.locator('#taskNotes').inputValue(),warnings:[await page.locator('#warnings').textContent()]};
    assert.deepEqual(check(item,actual),[],`${mobile?'phone':'desktop'} ${item.id}`);
    if(confirmed[item.id]){await page.locator('#taskDate').fill(confirmed[item.id][0]);await page.locator('#taskTime').fill(confirmed[item.id][1]);}
    await page.locator('#taskTitle').fill(`[测试 ${item.id}] `+actual.title.slice(0,100));await page.locator('#saveBtn').click();
    const tasks=await page.evaluate(key=>JSON.parse(localStorage.getItem(key)),KEY);assert.equal(tasks.at(-1).source,item.text);assert.equal(tasks.length,results.filter(r=>r.device===(mobile?'phone':'desktop')).length+1);
    results.push({id:item.id,device:mobile?'phone':'desktop',passed:true,manualConfirmation:!!confirmed[item.id]});
   }
   await page.reload();if(mobile)await page.locator('button[data-view="tasks"]').click();assert.equal(await page.locator('.task').count(),cases.length);
   const calendar=page.waitForEvent('download');await page.locator('#exportCalendar').click();const ics=fs.readFileSync(await (await calendar).path(),'utf8');assert.match(ics,/DTSTART:20260319T143000/);assert.match(ics,/DTSTART:20250616T170000/);
   assert.equal(await page.locator('.task img').count(),0);
   await context.close();
  }
  assert.deepEqual(errors,[]);const report={passed:true,flows:results.length,cases:cases.length,devices:['1440px desktop','390px mobile emulation'],checked:['paste','reference date','extraction fields','warnings','manual time confirmation','save','original source preserved','reload','ICS'],pageErrors:0,results};
  fs.writeFileSync(path.resolve(__dirname,'../docs/qa/browser-results-v0.2.1.json'),JSON.stringify(report,null,2));console.log(JSON.stringify({...report,results:undefined},null,2));
 }finally{await browser.close();await new Promise(r=>server.close(r));}
})().catch(e=>{console.error(e);process.exitCode=1;});

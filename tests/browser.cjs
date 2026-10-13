require('../scripts/local-env.cjs');
const assert=require('node:assert/strict');const path=require('node:path');const {pathToFileURL}=require('node:url');const fs=require('node:fs');
let chromium;
try { ({chromium}=require(process.env.KEJIAN_PLAYWRIGHT_MODULE || 'playwright')); }
catch { throw new Error('浏览器测试需要可选的 Playwright。设置 KEJIAN_PLAYWRIGHT_MODULE 为现有模块路径，或安装 Playwright；构建和使用产品无需此依赖。'); }
const projectRoot=path.resolve(__dirname,'..');const {version}=require('../package.json');
const out=path.join(projectRoot,'release',`v${version}`);const shots=path.join(projectRoot,'.cache','previews');fs.mkdirSync(shots,{recursive:true});
const url=pathToFileURL(path.join(out,'课间-免费离线版.html')).href;
const browserPaths=[process.env.KEJIAN_BROWSER_PATH,...(process.platform==='win32'?['C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe','C:/Program Files/Microsoft/Edge/Application/msedge.exe','C:/Program Files/Google/Chrome/Application/chrome.exe']:[])].filter(Boolean);
const executablePath=browserPaths.find(p=>fs.existsSync(p));
(async()=>{
 const browser=await chromium.launch({headless:true,...(executablePath?{executablePath}:{})});
 try{
  const context=await browser.newContext({viewport:{width:1440,height:1120},timezoneId:'Asia/Shanghai',offline:true,acceptDownloads:true});
  const page=await context.newPage();const errors=[],requests=[];page.on('pageerror',e=>errors.push(e.message));page.on('request',r=>{if(/^https?:/.test(r.url()))requests.push(r.url());});
  await page.goto(url);await page.locator('.empty').waitFor();
  assert.equal(await page.locator('#taskList .task').count(),0);
  await page.locator('[data-example="homework"]').click();await page.locator('#reference').fill('2026-10-11');await page.locator('#extractBtn').click();
  assert.equal(await page.locator('#taskDate').inputValue(),'2026-10-14');assert.equal(await page.locator('#taskTime').inputValue(),'20:00');
  await page.locator('#saveBtn').click();assert.equal(await page.locator('#taskList .task').count(),1);
  await page.reload();assert.equal(await page.locator('#taskList .task').count(),1);
  await page.locator('.task-controls button').filter({hasText:'编辑'}).first().click();await page.locator('#taskTitle').fill('提交实验报告 <img src=x onerror=alert(1)>');await page.locator('#saveBtn').click();
  assert.equal(await page.locator('#taskList img').count(),0);assert.match(await page.locator('.task-title').innerText(),/<img/);
  await page.locator('.task-toggle').click();assert.equal(await page.locator('#taskList .task').count(),0);await page.locator('[data-filter="done"]').click();assert.equal(await page.locator('#taskList .task').count(),1);await page.locator('.task-toggle').click();await page.locator('[data-filter="pending"]').click();
  const cal=page.waitForEvent('download');await page.locator('#exportCalendar').click();const dl=await cal;const calendar=fs.readFileSync(await dl.path(),'utf8');assert.match(calendar,/BEGIN:VCALENDAR/);assert.match(calendar,/DTSTART:20261014T200000/);
  const backup=page.waitForEvent('download');await page.locator('#backupBtn').click();const backupDl=await backup;const backupPath=await backupDl.path();const stored=JSON.parse(fs.readFileSync(backupPath,'utf8'));assert.equal(stored.tasks.length,1);
  await page.locator('.task-controls button').filter({hasText:'删除'}).click();assert.equal(await page.locator('#taskList .task').count(),0);await page.locator('#undoBtn').click();assert.equal(await page.locator('#taskList .task').count(),1);
  await page.locator('.task-controls button').filter({hasText:'删除'}).click();await page.locator('#restoreInput').setInputFiles(backupPath);await page.locator('#confirmImport').click();await page.locator('#taskList .task').waitFor();
  await page.locator('#notice').fill('10月12日开始报名，10月15日晚上八点截止。');await page.locator('#extractBtn').click();assert.equal(await page.locator('#taskDate').inputValue(),'');assert.match(await page.locator('#warnings').innerText(),/多个日期/);await page.locator('#cancelDraft').click();
  await page.locator('#helpBtn').click();assert.equal(await page.locator('#helpDialog').evaluate(d=>d.open),true);await page.locator('#helpDialog .primary').click();
  await page.locator('#feedbackBtn').click();await page.locator('#feedbackText').fill('希望可以更方便地核对多个截止日期');await page.evaluate(()=>Object.defineProperty(navigator,'clipboard',{value:{writeText:async()=>{throw new Error('Test denied permission');}},configurable:true}));const feedback=page.waitForEvent('download');await page.locator('#copyFeedback').click();await feedback;await page.locator('#feedbackDialog .close-btn').click();
  // Use actual example interactions for presentation captures, separate from the empty user deliverable.
  await page.evaluate(()=>localStorage.clear());await page.reload();
  for(const name of ['homework','event','exam']){await page.locator(`[data-example="${name}"]`).click();await page.locator('#reference').fill('2026-10-11');await page.locator('#extractBtn').click();await page.locator('#saveBtn').click();}
  await page.locator('[data-example="homework"]').click();await page.locator('#toast').evaluate(e=>e.classList.add('hidden'));await page.evaluate(()=>scrollTo(0,0));
  await page.screenshot({path:path.join(shots,'desktop.png'),fullPage:true});
  await page.setViewportSize({width:390,height:844});await page.evaluate(()=>scrollTo(0,0));
  assert.ok(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth),'Mobile overflows');
  await page.screenshot({path:path.join(shots,'mobile.png'),fullPage:true});
  assert.deepEqual(errors,[]);assert.deepEqual(requests,[]);
  console.log(JSON.stringify({passed:true,offline:true,externalRequests:requests.length,pageErrors:errors.length,checked:['date confirmation','create','reload persistence','edit and injection safety','complete and reopen','calendar download','backup and restore','delete and undo','multiple dates','help','feedback fallback','desktop and mobile layout']},null,2));
  await context.close();
 } finally{await browser.close();}
})().catch(e=>{console.error(e);process.exit(1);});

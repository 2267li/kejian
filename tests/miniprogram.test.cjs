'use strict';
const {test}=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs');
const path=require('node:path');
const vm=require('node:vm');
const core=require('../miniprogram/utils/core');
const model=require('../miniprogram/utils/tasks');
const {check}=require('./evaluate.cjs');
const fixtures=require('./fixtures/notice-cases.cjs');
const demo=require('./fixtures/demo-import.json');
const clone=x=>JSON.parse(JSON.stringify(x));
function harness(initial=[],opts={}){
  let definition;
  const storage=new Map([[model.KEY,typeof initial==='string'?initial:JSON.stringify(initial)]]),files=new Map(),messages=[],modals=[];
  const api={
    env:{USER_DATA_PATH:'/test'},getStorageSync:key=>storage.get(key),
    setStorageSync(key,value){if(opts.writeFails)throw new Error('quota');storage.set(key,value);},
    showToast:o=>messages.push(o.title),showShareMenu(){},pageScrollTo(){},
    showModal(o){modals.push(o);o.success({confirm:opts.confirm!==false});},
    setClipboardData(o){api.clipboard=o.data;o.success();},
    shareFileMessage(o){api.lastShare=o;assert.ok(files.has(o.filePath));o.success();},
    chooseMessageFile(o){o.success({tempFiles:[{path:'/test/incoming.json',size:(files.get('/test/incoming.json')||'').length}]});},
    getFileSystemManager(){return {writeFile(o){files.set(o.filePath,o.data);o.success();},readFile(o){o.success({data:files.get(o.filePath)});}};}
  };
  const context={Page:o=>definition=o,wx:api,require:name=>name.endsWith('/core')?core:model,Date,Math,Promise};
  vm.runInNewContext(fs.readFileSync(path.join(__dirname,'../miniprogram/pages/index/index.js'),'utf8'),context);
  const page={...definition,data:clone(definition.data),setData(patch){assert.ok(Buffer.byteLength(JSON.stringify(patch))<1024*1024,'setData must stay below WeChat limit');for(const [key,value] of Object.entries(patch)){let target=this.data;const segments=key.split('.');for(const part of segments.slice(0,-1))target=target[part];target[segments.at(-1)]=clone(value);}}};
  page.onLoad();return {page,api,storage,files,messages,modals,opts};
}
const event=(data={})=>({currentTarget:{dataset:data}});

test('generated core is exactly the tested shared source',()=>{
  assert.equal(fs.readFileSync(path.join(__dirname,'../miniprogram/utils/core.js'),'utf8').split('\n').slice(1).join('\n'),fs.readFileSync(path.join(__dirname,'../src/core.js'),'utf8'));
});
for(const row of fixtures)test('小程序核对与保存 '+row.id+' '+row.name,async()=>{
  const {page,storage}=harness();page.setData({notice:row.text,reference:row.base});await page.extractNotice();
  assert.deepEqual(check(row,page.data.draft),[]);page.saveDraft();
  const task=JSON.parse(storage.get(model.KEY))[0];assert.equal(task.source,row.text.trim());assert.equal(task.date,row.expected.date);assert.equal(task.time,row.expected.time);assert.equal(page.data.view,'tasks');
});
test('web backup imports, merges by ID and remains compatible after edits',async()=>{
  const local={...demo.tasks[0],id:'local-only',title:'本机已有'};
  const {page}=harness([local,{...demo.tasks[0],title:'旧标题'}]);
  page.prepareImport(JSON.stringify(demo));await page.confirmImport();
  assert.equal(page.tasks.length,9);assert.equal(page.tasks.find(t=>t.id===demo.tasks[0].id).title,demo.tasks[0].title);
  page.prepareImport(model.makeBackup(page.tasks));await page.confirmImport();assert.equal(page.tasks.length,9);
  const backup=JSON.parse(model.makeBackup(page.tasks));assert.equal(backup.app,'kejian');assert.equal(backup.version,1);assert.ok(model.validTasks(backup.tasks));
});
test('invalid backup and canceled replacement leave all records intact',async()=>{
  const {page,storage}=harness(demo.tasks,{confirm:false});const before=storage.get(model.KEY);
  for(const value of ['{bad',JSON.stringify({...demo,tasks:[{}]}),JSON.stringify({...demo,tasks:[demo.tasks[0],demo.tasks[0]]})]){page.prepareImport(value);assert.equal(storage.get(model.KEY),before);assert.equal(page.data.importOpen,false);}
  page.prepareImport(model.makeBackup([]));page.setData({importMode:'replace'});await page.confirmImport();assert.equal(storage.get(model.KEY),before);assert.equal(page.data.importOpen,true);
});
test('replacement asks explicitly and can import an intentionally empty backup',async()=>{
  const {page,modals}=harness(demo.tasks);page.prepareImport(model.makeBackup([]));page.setData({importMode:'replace'});await page.confirmImport();assert.equal(page.tasks.length,0);assert.ok(modals.some(m=>m.title==='替换本机全部记录？'));
});
test('write failures retain records and unsaved draft',async()=>{
  const {page,storage}=harness(demo.tasks,{writeFails:true});const before=storage.get(model.KEY);
  page.setData({notice:'明天18:00提交作业',reference:'2026-10-12'});await page.extractNotice();page.saveDraft();
  assert.equal(storage.get(model.KEY),before);assert.equal(page.tasks.length,8);assert.ok(page.data.draft);assert.match(page.data.status,/没有保存成功/);
});
test('corrupt storage blocks writes until confirmed replacement recovery',async()=>{
  const {page,storage}=harness('{broken');assert.ok(page.data.storageError);assert.equal(page.persist(demo.tasks),false);assert.equal(storage.get(model.KEY),'{broken');
  page.prepareImport(JSON.stringify(demo));await page.confirmImport();assert.equal(storage.get(model.KEY),'{broken');
  page.setData({importMode:'replace'});await page.confirmImport();assert.equal(page.tasks.length,8);assert.equal(page.data.storageError,'');
});
test('byte limit uses UTF-8 and prevents partial imports before storage write',()=>{
  assert.equal(model.utf8Bytes('中文😀'),Buffer.byteLength('中文😀'));
  const large=Array.from({length:45},(_,i)=>({...demo.tasks[0],id:'large-'+i,source:'测'.repeat(10000)}));
  const {page,storage}=harness(demo.tasks);const before=storage.get(model.KEY);assert.equal(page.persist(large),false);assert.equal(storage.get(model.KEY),before);assert.match(page.data.status,/空间/);
});
test('time without a date and invalid dates are rejected',()=>{
  assert.equal(model.validTasks([{...demo.tasks[0],date:''}]),false);assert.equal(model.validTasks([{...demo.tasks[0],date:'2026-02-30'}]),false);
});
test('editing completed task preserves source, ID and completion',async()=>{
  const saved={...demo.tasks[0],done:true};const {page}=harness([saved]);await page.editTask(event({id:saved.id}));
  page.inputDraft({currentTarget:{dataset:{field:'title'}},detail:{value:'修改完成事项'}});page.saveDraft();
  assert.equal(page.tasks[0].id,saved.id);assert.equal(page.tasks[0].source,saved.source);assert.equal(page.tasks[0].done,true);assert.equal(page.data.filter,'done');
});
test('canceling draft replacement and deletion preserves user content',async()=>{
  const {page}=harness(demo.tasks,{confirm:false});page.setData({notice:'明天交作业',reference:'2026-10-12'});await page.extractNotice();const draft=clone(page.data.draft);
  await page.useExample(event({example:'event'}));assert.deepEqual(page.data.draft,draft);
  page.removeTask(event({id:demo.tasks[0].id}));assert.equal(page.tasks.length,8);
});
test('file transfer and clipboard backups preserve the same tasks',async()=>{
  const {page,api,files}=harness(demo.tasks);page.exportBackup();assert.deepEqual(model.parseBackup(files.get('/test/kejian-backup.json')),model.normalize(demo.tasks));
  page.copyBackup();assert.deepEqual(model.parseBackup(api.clipboard),model.normalize(demo.tasks));
  files.set('/test/incoming.json',model.makeBackup([{...demo.tasks[0],title:'从文件修改'}]));page.chooseBackup();await page.confirmImport();assert.equal(page.tasks[0].title,'从文件修改');
  assert.deepEqual(clone(page.onShareAppMessage()),{title:'课间：把群通知整理成待办',path:'/pages/index/index'});
});
test('pagination bounds rendering payload and reaches all records',()=>{
  const tasks=Array.from({length:95},(_,i)=>({...demo.tasks[0],id:'page-'+String(i).padStart(3,'0'),notes:'备'.repeat(3000)}));const {page}=harness(tasks),seen=[];
  do{seen.push(...page.data.visibleTasks.map(t=>t.id));if(!page.data.hasMore)break;page.loadMore();}while(true);
  assert.equal(seen.length,95);assert.equal(new Set(seen).size,95);page.previousPage();assert.equal(page.data.pageNumber,3);
});

test('text recovery preserves pasted content across folding and existing tasks when merging',async()=>{
  const {page,storage}=harness([{...demo.tasks[0],id:'local-only'}]);
  const backup=model.makeBackup([demo.tasks[1]]),before=storage.get(model.KEY);
  page.togglePaste();page.inputPaste({detail:{value:backup}});page.togglePaste();page.togglePaste();
  assert.equal(page.data.pasteText,backup);
  page.importPaste();assert.equal(page.data.importCount,1);assert.equal(page.data.importMode,'merge');
  page.cancelImport();assert.equal(storage.get(model.KEY),before);assert.equal(page.data.pasteText,backup);
  page.importPaste();await page.confirmImport();
  assert.equal(page.tasks.length,2);assert.equal(page.tasks.some(t=>t.id==='local-only'),true);
});
test('calendar export runs without browser TextEncoder and folds Unicode correctly',()=>{
  const context={module:{exports:{}},Date};vm.runInNewContext(fs.readFileSync(path.join(__dirname,'../miniprogram/utils/core.js'),'utf8'),context);
  const content=context.module.exports.makeCalendar([{...demo.tasks[0],title:'实验😀'.repeat(40)}]);
  assert.match(content,/BEGIN:VEVENT/);for(const line of content.split('\r\n'))assert.ok(Buffer.byteLength(line)<=75);
  const {page,files}=harness([{...demo.tasks[0],date:'',time:''},demo.tasks[1]]);page.exportCalendar();assert.equal((files.get('/test/kejian-tasks.ics').match(/BEGIN:VEVENT/g)||[]).length,1);
});

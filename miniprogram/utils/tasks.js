'use strict';
const {parseDate,dateKey}=require('./core');
const CATEGORIES=['作业','考试','活动','其他'];
const KEY='kejian-notice-tasks-v1';
const MAX_BYTES=950*1024;
function validTasks(value){
  return Array.isArray(value)&&value.length<=5000&&value.every(t=>t&&typeof t.id==='string'&&t.id.length>0&&t.id.length<200&&typeof t.title==='string'&&t.title.trim().length>0&&t.title.length<=120&&typeof t.done==='boolean'&&(t.date===''||parseDate(t.date))&&typeof t.time==='string'&&(t.time===''||/^(?:[01]\d|2[0-3]):[0-5]\d$/.test(t.time))&&(!t.time||t.date)&&CATEGORIES.includes(t.category)&&typeof t.notes==='string'&&t.notes.length<=3000&&typeof t.source==='string'&&t.source.length<=10000)&&new Set(value.map(t=>t.id)).size===value.length;
}
function normalize(tasks){
  if(!validTasks(tasks))throw new Error('待办数据格式不正确或超过 5000 条');
  return tasks.map(t=>({id:t.id,title:t.title,date:t.date,time:t.time,category:t.category,notes:t.notes,source:t.source,done:t.done,createdAt:typeof t.createdAt==='string'&&t.createdAt.length<=50?t.createdAt:new Date().toISOString()}));
}
function utf8Bytes(text){let bytes=0;for(const char of text){const c=char.codePointAt(0);bytes+=c<=127?1:c<=2047?2:c<=65535?3:4;}return bytes;}
function serialize(tasks){
  const clean=normalize(tasks),raw=JSON.stringify(clean);
  if(utf8Bytes(raw)>MAX_BYTES)throw new Error('本机待办空间不足，请先导出备份，再减少记录或原文长度');
  return {clean,raw};
}
function readTasks(api){
  const raw=api.getStorageSync(KEY);
  if(raw===''||raw===undefined||raw===null)return [];
  return normalize(typeof raw==='string'?JSON.parse(raw):raw);
}
function writeTasks(api,tasks){
  const {clean,raw}=serialize(tasks);
  api.setStorageSync(KEY,raw);
  return clean;
}
function parseBackup(text){
  const data=JSON.parse(String(text).replace(/^\uFEFF/,''));
  if(!data||data.app!=='kejian'||data.version!==1)throw new Error('请选择课间导出的 JSON 备份');
  return normalize(data.tasks);
}
function makeBackup(tasks){return JSON.stringify({app:'kejian',version:1,exportedAt:new Date().toISOString(),tasks:normalize(tasks)},null,2);}
function mergeTasks(current,incoming){return normalize(Array.from(new Map([...normalize(current),...normalize(incoming)].map(t=>[t.id,t])).values()));}
function dueText(task,today=dateKey(new Date())){
  if(!task.date)return '日期待定';
  const date=parseDate(task.date),base=parseDate(today);
  const days=Math.round((Date.UTC(date.getFullYear(),date.getMonth(),date.getDate())-Date.UTC(base.getFullYear(),base.getMonth(),base.getDate()))/86400000);
  const label=days===0?'今天':days===1?'明天':days===2?'后天':`${date.getFullYear()!==base.getFullYear()?date.getFullYear()+'年':''}${date.getMonth()+1}月${date.getDate()}日`;
  return label+(task.time?' '+task.time:'')+(days<0&&!task.done?' · 已过期':'');
}
module.exports={KEY,CATEGORIES,MAX_BYTES,validTasks,normalize,utf8Bytes,serialize,readTasks,writeTasks,parseBackup,makeBackup,mergeTasks,dueText};

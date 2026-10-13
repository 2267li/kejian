(function () {
  'use strict';
  const $ = id => document.getElementById(id);
  const {dateKey,parseDate,extract,makeCalendar} = Kejian;
  const KEY='kejian-notice-tasks-v1';
  let tasks=[], filter='pending', draft=null, editingId=null, undo=null, toastTimer, storageBlocked=false, pendingImport=null;
  function setView(view, scroll=false) {
    document.body.dataset.view=view;
    document.querySelectorAll('[data-view]').forEach(b=>{if(b===document.body)return;b.classList.toggle('active',b.dataset.view===view);b.setAttribute('aria-pressed',String(b.dataset.view===view));});
    if(scroll && matchMedia('(max-width:700px)').matches) window.scrollTo({top:0,behavior:'instant'});
  }
  document.querySelectorAll('button[data-view]').forEach(b=>b.onclick=()=>setView(b.dataset.view,true));
  setView('compose');
  const uid=()=>globalThis.crypto?.randomUUID?.() || `task-${Date.now()}-${Math.random().toString(36).slice(2)}`;
  function toast(message, allowUndo=false) {
    clearTimeout(toastTimer); $('toast').querySelector('span').textContent=message;
    $('undoBtn').classList.toggle('hidden',!allowUndo); $('toast').classList.remove('hidden');
    toastTimer=setTimeout(()=>$('toast').classList.add('hidden'),allowUndo?10000:5500);
  }
  function validTasks(value) {
    return Array.isArray(value) && value.length<=5000 && value.every(t=>t && typeof t.id==='string' && t.id.length<200 && typeof t.title==='string' && t.title.trim().length>0 && t.title.length<=120 && typeof t.done==='boolean' && (t.date==='' || parseDate(t.date)) && typeof t.time==='string' && (t.time==='' || /^(?:[01]\d|2[0-3]):[0-5]\d$/.test(t.time)) && (!t.time || t.date) && ['作业','考试','活动','其他'].includes(t.category) && typeof t.notes==='string' && t.notes.length<=3000 && typeof t.source==='string' && t.source.length<=10000) && new Set(value.map(t=>t.id)).size===value.length;
  }
  try {
    const raw=localStorage.getItem(KEY);
    if(raw){const saved=JSON.parse(raw);if(!validTasks(saved))throw new Error('bad data');tasks=saved;}
  } catch(e) {storageBlocked=true;setTimeout(()=>toast('无法读取本地记录。请从备份恢复，或换一个允许保存数据的浏览器。'),300);}
  function persist(next, force=false) {
    if(storageBlocked && !force){toast('当前存储不可用。请先恢复有效备份，或换一个浏览器。');return false;}
    try{localStorage.setItem(KEY,JSON.stringify(next));tasks=next;storageBlocked=false;render();return true;}
    catch(e){toast('没有保存成功：浏览器禁止保存或空间不足。请先备份现有待办。');return false;}
  }
  function node(tag,cls,text) {const n=document.createElement(tag);if(cls)n.className=cls;if(text!==undefined)n.textContent=text;return n;}
  function dueText(task) {
    if(!task.date)return '截止日期待定';
    const today=new Date(), d=parseDate(task.date);
    const todayUtc=Date.UTC(today.getFullYear(),today.getMonth(),today.getDate()),dueUtc=Date.UTC(d.getFullYear(),d.getMonth(),d.getDate());
    const days=Math.round((dueUtc-todayUtc)/86400000);
    let label=days===0?'今天':days===1?'明天':days===2?'后天':`${d.getFullYear()!==today.getFullYear()?d.getFullYear()+'年':''}${d.getMonth()+1}月${d.getDate()}日`;
    if(days<0 && !task.done)label+=' · 已过期';
    return label+(task.time?' '+task.time:'');
  }
  function render() {
    const pending=tasks.filter(t=>!t.done);
    $('pendingCount').textContent=pending.length;
    $('mobileCount').textContent=pending.length;
    $('boardSummary').textContent=pending.length?`还有 ${pending.length} 件事待完成，按截止日期排好了。`:'把要做的事放在这里，给脑袋腾点空间。';
    $('exportCalendar').disabled=!pending.some(t=>t.date);
    $('backupBtn').disabled=tasks.length===0;
    document.querySelectorAll('[data-filter]').forEach(b=>{b.classList.toggle('active',b.dataset.filter===filter);b.setAttribute('aria-pressed',String(b.dataset.filter===filter));});
    const list=$('taskList');list.replaceChildren();
    const visible=tasks.filter(t=>filter==='all'||(filter==='done'?t.done:!t.done)).sort((a,b)=>Number(a.done)-Number(b.done)||((a.date||'9999')+(a.time||'23:59')).localeCompare((b.date||'9999')+(b.time||'23:59')));
    if(!visible.length) {
      const empty=node('div','empty');empty.append(node('div','empty-icon',filter==='done'?'✓':'☷'),node('strong','',filter==='done'?'完成的事情，会留在这里':tasks.length?'这一栏暂时很清爽':'还没有待办，也没有压力'));
      empty.append(node('p','',filter==='done'?'完成一件，勾掉一件。':tasks.length?'去做点喜欢的事吧。':'粘贴一条通知，或点“实验作业”试试看。'));
      list.append(empty);return;
    }
    visible.forEach(task=>{
      const card=node('article','task'+(task.done?' completed':''));card.dataset.id=task.id;
      const toggle=node('button','task-toggle',task.done?'✓':'');toggle.setAttribute('aria-label',(task.done?'恢复待办：':'标记完成：')+task.title);toggle.setAttribute('aria-pressed',String(task.done));
      toggle.onclick=()=>{if(persist(tasks.map(t=>t.id===task.id?{...t,done:!t.done}:t)))toast(task.done?'已恢复到待完成':'又完成了一件事 ✓');};
      const body=node('div','task-body');body.append(node('h3','task-title',task.title));
      const meta=node('div','task-meta');meta.append(node('span','tag'+(task.category==='考试'?' exam':task.category==='活动'?' event':''),task.category));
      meta.append(node('span','due'+(!task.done && task.date && task.date<dateKey(new Date())?' late':''),dueText(task)));body.append(meta);
      if(task.notes)body.append(node('p','task-notes',task.notes));
      const controls=node('div','task-controls');
      const edit=node('button','','编辑');edit.onclick=()=>showDraft({...task,warnings:[],evidence:''},task.id);
      const remove=node('button','','删除');remove.onclick=()=>{const previous=tasks.slice();if(persist(tasks.filter(t=>t.id!==task.id))){undo=previous;toast('已删除这条待办',true);}};
      controls.append(edit);
      if(task.date){const cal=node('button','','导出日历');cal.onclick=()=>downloadCalendar([task]);controls.append(cal);}
      controls.append(remove);body.append(controls);
      if(task.source){const details=node('details');details.append(node('summary','','查看原通知'),node('p','',task.source));body.append(details);}
      card.append(toggle,body);list.append(card);
    });
  }
  function showDraft(value,id=null) {
    setView('compose');
    draft=value;editingId=id;
    $('draftHeading').textContent=id?'修改这条待办':'核对一下，再收好';
    $('saveBtn').textContent=id?'保存修改':'确认，加入待办';
    $('taskTitle').value=value.title;$('taskDate').value=value.date;$('taskTime').value=value.time;$('taskCategory').value=value.category;$('taskNotes').value=value.notes;
    $('dateEvidence').textContent=value.evidence?'日期依据：'+value.evidence+'（以通知发送日期为基准）':'';
    $('warnings').replaceChildren();
    if(value.warnings.length){const ul=node('ul');value.warnings.forEach(w=>ul.append(node('li','',w)));$('warnings').append(ul);}
    $('warnings').classList.toggle('hidden',!value.warnings.length);$('draftForm').classList.remove('hidden');
    $('taskTitle').focus({preventScroll:true});$('draftForm').scrollIntoView({behavior:matchMedia('(prefers-reduced-motion: reduce)').matches?'auto':'smooth',block:'nearest'});
  }
  function closeDraft(){draft=null;editingId=null;$('draftForm').classList.add('hidden');}
  function download(text,filename,type) {
    const url=URL.createObjectURL(new Blob([text],{type}));const a=node('a');a.href=url;a.download=filename;document.body.append(a);a.click();a.remove();setTimeout(()=>URL.revokeObjectURL(url),10000);
  }
  function downloadCalendar(items) {
    const dated=items.filter(t=>t.date);if(!dated.length){toast('请先为待办设置日期');return;}
    download(makeCalendar(dated),'课间待办.ics','text/calendar;charset=utf-8');
    const undated=items.length-dated.length;
    toast(`已导出 ${dated.length} 条日历事项${undated?`，跳过 ${undated} 条未定日期事项`:''}；提醒请在日历中设置。`);
  }
  $('reference').value=dateKey(new Date());
  $('notice').placeholder='把通知粘贴在这里，例如：\n下周三晚上八点前提交实验报告，PDF 格式，文件名为“学号＋姓名”。';
  const examples={homework:'【实验课通知】请于下周三晚上八点前提交实验报告。格式为 PDF，文件名为“学号＋姓名”。提交到课程平台的实验二作业区。',event:'【校园活动】明天下午六点前完成摄影比赛报名。请填写报名表，作品命名为“专业＋姓名＋作品名”。',exam:'【考试安排】本周五上午九点参加高等数学测验。地点：教学楼 A203。请携带学生证、黑色签字笔。'};
  document.querySelectorAll('[data-example]').forEach(b=>b.onclick=()=>{$('notice').value=examples[b.dataset.example];$('reference').value=dateKey(new Date());closeDraft();$('notice').focus();});
  $('extractBtn').onclick=()=>{
    if(!$('notice').value.trim()){toast('先粘贴一条通知，或点击一个示例');$('notice').focus();return;}
    if(editingId && !confirm('正在编辑已有待办，继续整理会放弃未保存的修改。继续吗？'))return;
    try{showDraft(extract($('notice').value,$('reference').value));}catch(e){toast(e.message);$('reference').focus();}
  };
  $('cancelDraft').onclick=closeDraft;
  $('draftForm').onsubmit=e=>{
    e.preventDefault();if(!draft)return;
    const title=$('taskTitle').value.trim(),date=$('taskDate').value,time=$('taskTime').value;
    if(!title){toast('请写下要做的事情');return;}
    if(date && !parseDate(date)){toast('请填写有效的截止日期');return;}
    if(time && !date){toast('填写了时间后，也需要选择日期');$('taskDate').focus();return;}
    const existing=editingId?tasks.find(t=>t.id===editingId):null;
    const item={id:existing?.id||uid(),title,date,time,category:$('taskCategory').value,notes:$('taskNotes').value.trim(),source:draft.source,done:existing?.done||false,createdAt:existing?.createdAt||new Date().toISOString()};
    const next=existing?tasks.map(t=>t.id===existing.id?item:t):[...tasks,item];
    if(persist(next)){const wasEdit=!!existing;undo=null;closeDraft();if(!wasEdit)$('notice').value='';filter='pending';render();setView('tasks',true);toast(wasEdit?'修改已保存':'已收好，待办保存在这个浏览器里');}
  };
  document.querySelectorAll('[data-filter]').forEach(b=>b.onclick=()=>{filter=b.dataset.filter;render();});
  $('exportCalendar').onclick=()=>downloadCalendar(tasks.filter(t=>!t.done));
  $('backupBtn').textContent='导出数据';$('restoreBtn').textContent='导入数据';
  $('backupBtn').onclick=()=>{download(JSON.stringify({app:'kejian',version:1,exportedAt:new Date().toISOString(),tasks},null,2),`课间备份-${dateKey(new Date())}.json`,'application/json');toast('已导出。把文件传到另一台设备，再点“导入数据”');};
  $('restoreBtn').onclick=()=>$('restoreInput').click();
  $('restoreInput').onchange=async e=>{
    const file=e.target.files[0];e.target.value='';if(!file)return;
    if(file.size>10*1024*1024){toast('备份文件过大，请选择 10 MB 以内的文件');return;}
    try{const backup=JSON.parse(await file.text());if(backup.app!=='kejian'||backup.version!==1||!validTasks(backup.tasks))throw new Error('invalid');
      pendingImport=backup.tasks;
      $('importSummary').textContent=`文件中有 ${pendingImport.length} 条待办，本机有 ${tasks.length} 条。请选择如何导入。`;
      document.querySelector('[name="importMode"][value="merge"]').checked=true;
      $('importDialog').showModal();
    }catch(e){toast('这不是有效的课间备份，现有记录未改变');}
  };
  $('confirmImport').onclick=()=>{
    if(!pendingImport)return;
    const replace=document.querySelector('[name="importMode"]:checked').value==='replace';
    if(replace && tasks.length && !confirm(`将用文件里的 ${pendingImport.length} 条待办替换本机全部 ${tasks.length} 条记录。确定吗？`))return;
    const next=replace?pendingImport:Array.from(new Map([...tasks,...pendingImport].map(t=>[t.id,t])).values());
    if(!validTasks(next)){toast('合并后超过 5000 条记录，请减少记录或选择替换');return;}
    if(persist(next,true)){undo=null;pendingImport=null;closeDraft();$('importDialog').close();filter='pending';render();setView('tasks',true);toast('导入完成，数据已保存在本机');}
  };
  $('importDialog').addEventListener('close',()=>{pendingImport=null;});
  $('moreBtn').onclick=()=>$('transferDialog').showModal();
  $('transferExport').onclick=()=>{if(!tasks.length){toast('当前还没有待办，请先保存一条');return;}$('backupBtn').click();};
  $('transferImport').onclick=()=>{$('transferDialog').close();$('restoreInput').click();};
  $('moreFeedback').onclick=()=>{$('transferDialog').close();$('feedbackDialog').showModal();};
  $('moreHelp').onclick=()=>{$('transferDialog').close();$('helpDialog').showModal();};
  $('undoBtn').onclick=()=>{if(undo){const previous=undo;if(persist(previous)){undo=null;toast('已撤销删除');}}};
  $('helpBtn').onclick=()=>$('helpDialog').showModal();$('feedbackBtn').onclick=()=>$('feedbackDialog').showModal();
  document.querySelectorAll('[data-close]').forEach(b=>b.onclick=()=>$(b.dataset.close).close());
  $('copyFeedback').onclick=async()=>{
    const message=$('feedbackText').value.trim();if(!message){toast('先写一句你的使用感受');return;}
    const text='【课间 v0.2.1 试用反馈】\n'+message;
    try{if(!navigator.clipboard?.writeText)throw new Error('no clipboard');await navigator.clipboard.writeText(text);toast('已复制，请粘贴到原发布帖的评论区');}
    catch(e){download(text,'课间试用反馈.txt','text/plain;charset=utf-8');toast('浏览器未允许复制，已导出反馈文件');}
  };
  window.addEventListener('storage',e=>{if(e.key!==KEY)return;try{const value=e.newValue?JSON.parse(e.newValue):[];if(validTasks(value)){tasks=value;render();toast('已同步这个浏览器其他窗口的修改');}}catch(_) {}});
  render();
})();

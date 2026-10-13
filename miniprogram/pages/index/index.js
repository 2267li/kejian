'use strict';
const core=require('../../utils/core');
const model=require('../../utils/tasks');
const EXAMPLES={
  homework:'【实验课通知】请于下周三晚上八点前提交实验报告。格式为 PDF，文件名为“学号＋姓名”。提交到课程平台的实验二作业区。',
  event:'【校园活动】明天下午六点前完成摄影比赛报名。请填写报名表，作品命名为“专业＋姓名＋作品名”。',
  exam:'【考试安排】本周五上午九点参加高等数学测验。地点：教学楼 A203。请携带学生证、黑色签字笔。'
};
const uid=()=>`task-${Date.now()}-${Math.random().toString(36).slice(2)}`;
const cancelled=err=>/cancel/i.test(err&&err.errMsg||'');
Page({
  data:{view:'compose',notice:'',reference:'',draft:null,editingId:'',categories:model.CATEGORIES,categoryIndex:0,pendingCount:0,totalCount:0,visibleTasks:[],filter:'pending',hasMore:false,hasPrevious:false,pageNumber:1,expandedId:'',storageError:'',status:'',importOpen:false,importCount:0,importMode:'merge',pasteOpen:false,pasteText:'',helpSection:'',version:'0.1.0'},
  onLoad(){
    this.tasks=[];this.pendingImport=null;this.pageIndex=0;
    this.setData({reference:core.dateKey(new Date())});
    this.loadTasks();
    if(wx.showShareMenu)wx.showShareMenu({menus:['shareAppMessage']});
  },
  onShow(){if(this.tasks)this.renderTasks();},
  onShareAppMessage(){return {title:'课间：把群通知整理成待办',path:'/pages/index/index'};},
  notify(message){this.setData({status:message});wx.showToast({title:message.length>18?'请查看页面提示':message,icon:'none'});},
  loadTasks(){
    try{this.tasks=model.readTasks(wx);this.setData({storageError:''});}
    catch(_){this.tasks=[];this.setData({storageError:'本地记录无法读取。为保护原数据，已暂停保存；请用有效备份选择“替换”恢复。'});}
    this.renderTasks();
  },
  persist(next,recover=false){
    if(this.data.storageError&&!recover){this.notify(this.data.storageError);return false;}
    try{const saved=model.writeTasks(wx,next);this.tasks=saved;this.setData({storageError:''});this.renderTasks();return true;}
    catch(e){this.notify(e.message&&/空间|格式|5000/.test(e.message)?e.message:'没有保存成功，可能是本地空间不足。现有记录未改变，请先导出备份。');return false;}
  },
  renderTasks(){
    const today=core.dateKey(new Date());
    const visible=this.tasks.filter(t=>this.data.filter==='all'||(this.data.filter==='done'?t.done:!t.done)).sort((a,b)=>Number(a.done)-Number(b.done)||((a.date||'9999')+(a.time||'23:59')).localeCompare((b.date||'9999')+(b.time||'23:59')));
    this.pageIndex=Math.min(this.pageIndex,Math.max(0,Math.ceil(visible.length/30)-1));
    this.setData({pendingCount:this.tasks.filter(t=>!t.done).length,totalCount:this.tasks.length,hasMore:visible.length>(this.pageIndex+1)*30,hasPrevious:this.pageIndex>0,pageNumber:this.pageIndex+1,visibleTasks:visible.slice(this.pageIndex*30,(this.pageIndex+1)*30).map(t=>({id:t.id,title:t.title,date:t.date,done:t.done,category:t.category,notes:t.notes.slice(0,350),hasSource:!!t.source,source:t.id===this.data.expandedId?t.source:'',due:model.dueText(t,today),late:!t.done&&t.date&&t.date<today}))});
  },
  changeView(e){this.setData({view:e.currentTarget.dataset.view,status:''});if(wx.pageScrollTo)wx.pageScrollTo({scrollTop:0,duration:0});},
  inputNotice(e){this.setData({notice:e.detail.value});},
  changeReference(e){this.setData({reference:e.detail.value});},
  async allowDiscard(){
    if(!this.data.draft)return true;
    return new Promise(resolve=>wx.showModal({title:'放弃当前草稿？',content:'尚未保存的核对内容会被替换。',confirmText:'放弃草稿',success:r=>resolve(r.confirm),fail:()=>resolve(false)}));
  },
  async useExample(e){if(!(await this.allowDiscard()))return;this.setData({notice:EXAMPLES[e.currentTarget.dataset.example]||'',reference:core.dateKey(new Date()),draft:null,editingId:'',status:''});},
  async extractNotice(){
    if(!this.data.notice.trim()){this.notify('请先粘贴通知，或试一个示例');return;}
    if(!(await this.allowDiscard()))return;
    try{const draft=core.extract(this.data.notice,this.data.reference);this.openDraft(draft,'');}
    catch(e){this.notify(e.message);}
  },
  openDraft(draft,id){this.setData({view:'compose',draft,editingId:id,categoryIndex:model.CATEGORIES.indexOf(draft.category),status:''});},
  inputDraft(e){const field=e.currentTarget.dataset.field;if(['title','notes'].includes(field)&&this.data.draft)this.setData({['draft.'+field]:e.detail.value});},
  changeDate(e){this.setData({'draft.date':e.detail.value});},
  clearDate(){this.setData({'draft.date':'','draft.time':''});},
  changeTime(e){if(!this.data.draft.date){this.notify('请先选择截止日期');return;}this.setData({'draft.time':e.detail.value});},
  clearTime(){this.setData({'draft.time':''});},
  changeCategory(e){const index=Number(e.detail.value);this.setData({categoryIndex:index,'draft.category':model.CATEGORIES[index]});},
  async cancelDraft(){if(await this.allowDiscard())this.setData({draft:null,editingId:''});},
  saveDraft(){
    const d=this.data.draft;if(!d)return;
    const old=this.tasks.find(t=>t.id===this.data.editingId);
    const item={id:old?old.id:uid(),title:d.title.trim(),date:d.date,time:d.time,category:d.category,notes:d.notes.trim(),source:d.source,done:old?old.done:false,createdAt:old?old.createdAt:new Date().toISOString()};
    if(!item.title){this.notify('请填写待办标题');return;}
    if(!model.validTasks([item])){this.notify('请检查标题、日期和时间，填写时间时需同时选择日期');return;}
    const next=old?this.tasks.map(t=>t.id===old.id?item:t):[...this.tasks,item];
    if(this.persist(next)){this.setData({draft:null,editingId:'',notice:old?this.data.notice:'',view:'tasks',filter:old&&old.done?'done':'pending'});this.renderTasks();this.notify(old?'修改已保存':'已保存到这台设备');}
  },
  setFilter(e){this.pageIndex=0;this.setData({filter:e.currentTarget.dataset.filter,expandedId:''});this.renderTasks();},
  loadMore(){this.pageIndex+=1;this.setData({expandedId:''});this.renderTasks();},
  previousPage(){this.pageIndex=Math.max(0,this.pageIndex-1);this.setData({expandedId:''});this.renderTasks();},
  toggleDone(e){const id=e.currentTarget.dataset.id;if(this.persist(this.tasks.map(t=>t.id===id?{...t,done:!t.done}:t)))this.notify('待办状态已更新');},
  async editTask(e){const task=this.tasks.find(t=>t.id===e.currentTarget.dataset.id);if(task&&await this.allowDiscard())this.openDraft({...task,warnings:[],evidence:''},task.id);},
  removeTask(e){
    const id=e.currentTarget.dataset.id;
    wx.showModal({title:'删除这条待办？',content:'删除后无法撤销，请确认不再需要。',confirmText:'删除',confirmColor:'#b04444',success:r=>{if(r.confirm&&this.persist(this.tasks.filter(t=>t.id!==id))){if(this.data.editingId===id)this.setData({draft:null,editingId:''});this.notify('已删除');}}});
  },
  toggleSource(e){const id=e.currentTarget.dataset.id;this.setData({expandedId:this.data.expandedId===id?'':id});this.renderTasks();},
  copyBackup(){if(!this.tasks.length){this.notify('当前没有待办');return;}this.copyText(model.makeBackup(this.tasks),'备份已复制，请妥善保存');},
  copyText(text,message){wx.setClipboardData({data:text,success:()=>this.notify(message),fail:()=>this.notify('复制失败，请重试或使用文件导出')});},
  shareTextFile(text,fileName){
    if(typeof wx.shareFileMessage!=='function'){
      wx.showModal({title:'当前微信不支持转发文件',content:'可以先复制内容，粘贴到另一台设备保存。恢复待办时，请展开“也可以复制、粘贴备份”。',confirmText:'复制内容',success:r=>{if(r.confirm)this.copyText(text,'已复制文件内容');}});return;
    }
    const filePath=wx.env.USER_DATA_PATH+'/'+fileName;
    wx.getFileSystemManager().writeFile({filePath,data:text,encoding:'utf8',success:()=>wx.shareFileMessage({filePath,fileName,success:()=>this.notify('已转发，请在接收端妥善保存'),fail:e=>{if(!cancelled(e))this.notify('转发失败，可使用复制备份，或更新微信后重试');}}),fail:()=>this.notify('文件生成失败，请检查空间，或使用复制备份')});
  },
  exportBackup(){if(!this.tasks.length){this.notify('当前没有待办');return;}this.shareTextFile(model.makeBackup(this.tasks),'kejian-backup.json');},
  exportCalendar(){
    const pending=this.tasks.filter(t=>!t.done),dated=pending.filter(t=>t.date);
    if(!dated.length){this.notify('请先为待办设置日期');return;}
    this.setData({status:`日历文件包含 ${dated.length} 条待办，跳过 ${pending.length-dated.length} 条未定日期的待办。请在日历应用中打开文件，再设置提醒。`});
    this.shareTextFile(core.makeCalendar(dated),'kejian-tasks.ics');
  },
  chooseBackup(){
    if(!wx.chooseMessageFile){this.notify('当前微信不支持选文件，请使用粘贴备份');return;}
    wx.chooseMessageFile({count:1,type:'file',extension:['json'],success:res=>{
      const file=res.tempFiles&&res.tempFiles[0];if(!file)return;
      if(file.size>10*1024*1024){this.notify('请选择 10 MB 以内的课间备份');return;}
      wx.getFileSystemManager().readFile({filePath:file.path,encoding:'utf8',success:r=>this.prepareImport(r.data),fail:()=>this.notify('无法读取文件，请重新选择')});
    },fail:e=>{if(!cancelled(e))this.notify('未能选择文件，请重试或粘贴备份');}});
  },
  toggleHelp(e){const section=e.currentTarget.dataset.section;if(['transfer','calendar','privacy'].includes(section))this.setData({helpSection:this.data.helpSection===section?'':section});},
  togglePaste(){this.setData({pasteOpen:!this.data.pasteOpen});},
  inputPaste(e){this.setData({pasteText:e.detail.value});},
  importPaste(){this.prepareImport(this.data.pasteText);},
  prepareImport(text){
    try{this.pendingImport=model.parseBackup(text);this.setData({view:'help',importOpen:true,importCount:this.pendingImport.length,importMode:'merge',status:''});}
    catch(_){this.pendingImport=null;this.setData({importOpen:false});this.notify('无法读取这份备份，请使用课间保存的完整备份。现有待办未改变。');}
  },
  changeImportMode(e){this.setData({importMode:e.detail.value});},
  cancelImport(){this.pendingImport=null;this.setData({importOpen:false});},
  async confirmImport(){
    if(!this.pendingImport)return;
    const replace=this.data.importMode==='replace';
    if(this.data.storageError&&!replace){this.notify('原记录读取异常，请先选择“替换”并确认恢复');return;}
    if(replace){const accepted=await new Promise(resolve=>wx.showModal({title:'替换本机全部记录？',content:`文件含 ${this.pendingImport.length} 条待办，本机 ${this.tasks.length} 条。替换后无法撤销。${this.data.storageError?'原有异常记录也会被覆盖。':''}`,confirmText:'确认替换',success:r=>resolve(r.confirm),fail:()=>resolve(false)}));if(!accepted)return;}
    if(!(await this.allowDiscard()))return;
    try{const next=replace?this.pendingImport:model.mergeTasks(this.tasks,this.pendingImport);if(this.persist(next,replace)){this.pendingImport=null;this.setData({importOpen:false,pasteOpen:false,pasteText:'',draft:null,editingId:'',view:'tasks',filter:'pending'});this.renderTasks();this.notify('待办已恢复到这台设备');}}
    catch(e){this.notify(e.message);}
  }
});

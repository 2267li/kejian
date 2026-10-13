(function(){
  'use strict';
  const $=id=>document.getElementById(id);
  $('installBtn').textContent='数据与帮助';
  $('installBtn').onclick=()=>$('transferDialog').showModal();
  const folder=document.createElement('button');folder.className='textbtn';folder.textContent='打开数据文件夹';folder.onclick=()=>KejianDesktop.showDataFolder();
  $('transferDialog').append(folder);
  $('backupBtn').textContent='保存备份';$('restoreBtn').textContent='恢复待办';
  $('appStatus').textContent='桌面版 · 本机保存 · 离线可用';
  document.title='课间 · 通知转待办';
})();

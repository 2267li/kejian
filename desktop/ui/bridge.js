(function(){
  'use strict';
  let sequence=0;const pending=new Map();
  window.chrome.webview.addEventListener('message',event=>{
    const result=event.data;if(result.type!=='save-result'||!pending.has(result.id))return;
    const done=pending.get(result.id);pending.delete(result.id);
    if(result.error){const toast=document.querySelector('#toast');toast.querySelector('span').textContent=result.error;toast.classList.remove('hidden');}
    done(Boolean(result.saved));
  });
  window.KejianDesktop=Object.freeze({
    saveFile(text,name){return new Promise(resolve=>{const id=String(++sequence);pending.set(id,resolve);window.chrome.webview.postMessage({command:'save-file',id,text,name});});},
    showDataFolder(){window.chrome.webview.postMessage({command:'show-data-folder',id:String(++sequence)});}
  });
})();

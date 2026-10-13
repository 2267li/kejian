(function () {
  'use strict';
  const $ = id => document.getElementById(id);
  let promptEvent = null;
  const installed = () => matchMedia('(display-mode: standalone)').matches || navigator.standalone;
  function installLabel() { $('installBtn').textContent = installed() ? '已添加到桌面' : '添加到桌面'; }
  installLabel();
  window.addEventListener('beforeinstallprompt', event => { event.preventDefault(); promptEvent = event; });
  window.addEventListener('appinstalled', () => { promptEvent = null; installLabel(); });
  $('installBtn').onclick = async () => {
    if (promptEvent) { const event = promptEvent; promptEvent = null; await event.prompt(); await event.userChoice; }
    else $('installDialog').showModal();
  };
  let offlineReady = false;
  function status() {
    $('appStatus').textContent = offlineReady ? (navigator.onLine ? '已就绪 · 断网也能用' : '离线中 · 可以继续使用') : '数据只存在本机 · 记得导出备份';
  }
  window.addEventListener('online', status); window.addEventListener('offline', status); status();
  if (!/^https?:$/.test(location.protocol) || !window.isSecureContext || !('serviceWorker' in navigator)) return;
  navigator.serviceWorker.register('./sw.js', { updateViaCache: 'none' }).then(registration => {
    function offerUpdate() { if (registration.waiting && navigator.serviceWorker.controller) $('updateBar').classList.remove('hidden'); }
    offerUpdate();
    registration.addEventListener('updatefound', () => {
      const worker = registration.installing;
      worker?.addEventListener('statechange', () => { if (worker.state === 'installed') offerUpdate(); });
    });
    let updateRequested = false;
    $('updateBtn').onclick = () => {
      if (!registration.waiting) return;
      if (!confirm('更新会重新载入页面。请先保存正在填写的通知或待办，已保存的数据会保留。现在更新吗？')) return;
      updateRequested = true;
      registration.waiting.postMessage('ACTIVATE_UPDATE');
    };
    navigator.serviceWorker.addEventListener('controllerchange', () => {
      // Another tab accepting an update must not discard this tab's draft.
      if (updateRequested) location.reload();
    });
    navigator.serviceWorker.ready.then(() => { offlineReady = true; status(); });
  }).catch(() => { $('appStatus').textContent = '在线可用 · 离线缓存未就绪'; });
})();

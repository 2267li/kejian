(function () {
  'use strict';
  let sequence = 0;
  const pending = new Map();
  const webview = window.chrome?.webview;

  webview?.addEventListener('message', event => {
    const result = event.data;
    if (!result || result.type !== 'save-result' || !pending.has(result.id)) return;
    const request = pending.get(result.id);
    pending.delete(result.id);
    if (result.error) request.reject(new Error(String(result.error)));
    else request.resolve(result.saved === true);
  });

  function postMessage(message) {
    if (!webview) throw new Error('文件保存功能暂时不可用，请重新打开课间。');
    webview.postMessage(message);
  }

  window.KejianDesktop = Object.freeze({
    saveFile(text, name) {
      return new Promise((resolve, reject) => {
        const id = String(++sequence);
        pending.set(id, { resolve, reject });
        try {
          postMessage({ command: 'save-file', id, text, name });
        } catch (error) {
          pending.delete(id);
          reject(error);
        }
      });
    },
    showDataFolder() {
      postMessage({ command: 'show-data-folder', id: String(++sequence) });
    }
  });
})();

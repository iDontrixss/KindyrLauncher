const { ipcRenderer } = require('electron')

window.addEventListener('DOMContentLoaded', () => {
  ipcRenderer.on('update-status', (_e, msg) => {
    const el = document.getElementById('splash-status')
    if (el) el.textContent = msg
  })
})
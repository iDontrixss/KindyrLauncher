const { contextBridge, ipcRenderer } = require('electron')

const ALLOWED_SEND = new Set(['minimize', 'maximize', 'close'])
const ALLOWED_INVOKE = new Set(['finish-onboarding', 'get-onboarding-settings', 'ms-login'])

contextBridge.exposeInMainWorld('electronAPI', {
  send: (channel, data) => {
    if (!ALLOWED_SEND.has(channel)) throw new Error(`IPC send not allowed: ${channel}`)
    return ipcRenderer.send(channel, data)
  },
  invoke: (channel, data) => {
    if (!ALLOWED_INVOKE.has(channel)) throw new Error(`IPC invoke not allowed: ${channel}`)
    return ipcRenderer.invoke(channel, data)
  }
})
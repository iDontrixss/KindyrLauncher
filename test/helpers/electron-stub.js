// Kindyr Launcher - Copyright (C) 2026 iDontrixss
// SPDX-License-Identifier: GPL-3.0-or-later

// Stub mínimo del módulo 'electron' para cargar módulos de main/ en tests de
// Node (sin abrir la app). app.getPath('appData') apunta a una carpeta
// temporal, así que nada toca los datos reales del usuario. Registra los
// handlers IPC para poder invocarlos desde el test.
const Module = require('module')
const fs = require('fs')
const os = require('os')
const path = require('path')

function installElectronStub() {
  const appData = fs.mkdtempSync(path.join(os.tmpdir(), 'kindyr-appdata-'))
  const handlers = new Map()
  const listeners = new Map()
  const dialogResponses = []
  const exposed = {}
  const rendererCalls = []
  const stub = {
    app: {
      isPackaged: false,
      getPath: (name) => (name === 'appData' || name === 'userData' ? appData : os.tmpdir()),
      getVersion: () => '0.0.0-test'
    },
    ipcMain: {
      handle: (channel, fn) => handlers.set(channel, fn),
      on: (channel, fn) => listeners.set(channel, fn)
    },
    dialog: {
      showMessageBox: async () => ({ response: dialogResponses.length ? dialogResponses.shift() : 0 }),
      showOpenDialog: async () => ({ canceled: true, filePaths: [] })
    },
    shell: { openPath: async () => '', openExternal: async () => {} },
    BrowserWindow: class { static fromWebContents() { return {} } },
    safeStorage: { isEncryptionAvailable: () => false },
    session: {},
    contextBridge: { exposeInMainWorld: (key, api) => { exposed[key] = api } },
    ipcRenderer: {
      invoke: async (channel, ...args) => { rendererCalls.push({ channel, args }); return { ok: true } },
      send: (channel, ...args) => rendererCalls.push({ channel, args }),
      on: () => {},
      removeListener: () => {},
      removeAllListeners: () => {}
    },
    nativeImage: { createFromPath: () => ({ isEmpty: () => true }) }
  }
  const originalLoad = Module._load
  Module._load = function (request, parent, isMain) {
    if (request === 'electron') return stub
    return originalLoad.apply(this, arguments)
  }
  // Un sender "propio" que pasa la guardia IPC (file:// dentro de la app).
  const appRoot = path.resolve(__dirname, '..', '..')
  const trustedEvent = { senderFrame: { url: require('url').pathToFileURL(path.join(appRoot, 'index.html')).href }, sender: {} }
  return {
    stub,
    appData,
    handlers,
    listeners,
    dialogResponses,
    exposed,
    rendererCalls,
    trustedEvent,
    invoke: (channel, ...args) => handlers.get(channel)(trustedEvent, ...args),
    restore: () => {
      Module._load = originalLoad
      try { fs.rmSync(appData, { recursive: true, force: true }) } catch {}
    }
  }
}

module.exports = { installElectronStub }

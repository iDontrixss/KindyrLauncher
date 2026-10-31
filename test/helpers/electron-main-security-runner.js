// Kindyr Launcher - Copyright (C) 2026 iDontrixss
// SPDX-License-Identifier: GPL-3.0-or-later

// Proceso main de Electron para test/file-protocol.test.js: registra los
// módulos REALES main/file-protocol.js y main/session-security.js con un
// APP_ROOT y dataRoot temporales, y mide desde un renderer sandbox qué
// file:// puede leer y qué permisos web obtiene.
// Uso: electron electron-main-security-runner.js <workdir> <out.json>
const { app, BrowserWindow, net, protocol, session } = require('electron')
const fs = require('fs')
const path = require('path')
const { pathToFileURL } = require('url')

const root = path.resolve(__dirname, '..', '..')
const [workdir, outFile] = process.argv.slice(-2)

app.whenReady().then(async () => {
  const result = {}
  try {
    const appRoot = path.join(workdir, 'app')
    const dataRoot = path.join(workdir, 'data')
    const fileProtocol = require(path.join(root, 'main', 'file-protocol.js'))
    fileProtocol.registerRestrictedFileProtocol({ protocol, net, appRoot, getDataRoot: () => dataRoot })
    // session-security importa 'electron' (disponible aquí).
    require(path.join(root, 'main', 'session-security.js')).hardenDefaultSession(session.defaultSession)

    const win = new BrowserWindow({ show: false, webPreferences: { contextIsolation: true, sandbox: true } })
    await win.loadURL(pathToFileURL(path.join(appRoot, 'page.html')).href + '?v=1')
    const probe = (url) => win.webContents.executeJavaScript(`fetch(${JSON.stringify(url)}).then(r => r.ok ? r.text() : 'HTTP ' + r.status).catch(e => 'ERR')`)
    const urls = {
      appFile: pathToFileURL(path.join(appRoot, 'inside.txt')).href,
      relative: 'inside.txt',
      outside: pathToFileURL(path.join(workdir, 'outside.txt')).href,
      traversal: '../outside.txt',
      encodedTraversal: pathToFileURL(appRoot).href + '/%2e%2e/outside.txt',
      background: pathToFileURL(path.join(dataRoot, 'background.png')).href,
      instanceIcon: pathToFileURL(path.join(dataRoot, 'instances', 'demo', 'icon.png')).href,
      settingsJson: pathToFileURL(path.join(dataRoot, 'settings.json')).href,
      instanceFile: pathToFileURL(path.join(dataRoot, 'instances', 'demo', 'instance.json')).href
    }
    for (const [key, url] of Object.entries(urls)) result[key] = await probe(url)
    result.notification = await win.webContents.executeJavaScript('Notification.requestPermission()')
    result.geolocation = await win.webContents.executeJavaScript(`navigator.permissions.query({ name: 'geolocation' }).then(s => s.state).catch(() => 'error')`)
    result.media = await win.webContents.executeJavaScript(`navigator.mediaDevices.getUserMedia({ audio: true }).then(() => 'granted').catch(e => 'denied:' + e.name)`)
  } catch (error) {
    result.error = String(error && error.stack || error)
  }
  fs.writeFileSync(outFile, JSON.stringify(result))
  app.quit()
})

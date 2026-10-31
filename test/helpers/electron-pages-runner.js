// Kindyr Launcher - Copyright (C) 2026 iDontrixss
// SPDX-License-Identifier: GPL-3.0-or-later

// Proceso main de Electron para test/csp-pages.test.js: carga las ventanas
// secundarias REALES con su preload y su CSP, y reporta violaciones de CSP y
// si su script inline se ejecutó.
// Uso: electron electron-pages-runner.js <out.json>
const { app, BrowserWindow } = require('electron')
const fs = require('fs')
const path = require('path')

const root = path.resolve(__dirname, '..', '..')
const outFile = process.argv.at(-1)

async function loadPage(file, preload, query, probe) {
  const win = new BrowserWindow({ show: false, webPreferences: { preload: path.join(root, preload), contextIsolation: true, sandbox: true } })
  const violations = []
  win.webContents.on('console-message', (event) => {
    const message = String((event && event.message) || '')
    if (/Content Security Policy|Refused to/i.test(message)) violations.push(message.slice(0, 300))
  })
  await win.loadFile(path.join(root, file), { query })
  await new Promise(r => setTimeout(r, 300))
  const probed = await win.webContents.executeJavaScript(probe)
  // close() y esperar 'closed': destroy() aborta la carga de la ventana
  // siguiente cuando Chromium reutiliza el mismo proceso de renderer.
  await new Promise(r => { win.once('closed', r); win.close() })
  return { violations, probed }
}

app.whenReady().then(async () => {
  const result = {}
  try {
    result.splash = await loadPage('splash.html', 'preload-splash.js', { v: '9.9.9' }, `Boolean(window.splashAPI) && document.readyState === 'complete'`)
    result.onboarding = await loadPage('onboarding.html', 'preload-onboarding.js', {}, `(() => {
      document.getElementById('opt-en').click()
      return document.getElementById('opt-en').classList.contains('selected') && !document.getElementById('opt-es').classList.contains('selected')
    })()`)
    result.fatal = await loadPage('fatal-dialog.html', 'preload-fatal.js', { title: 'TITULO-PRUEBA', message: 'm', detail: 'd', mode: 'game' }, `document.getElementById('fatal-title').textContent`)
    result.update = await loadPage('update-confirmation.html', 'preload.js', { title: 'T', message: 'MENSAJE-PRUEBA', acceptText: 'A', cancelText: 'C', version: '9.9.9' }, `document.getElementById('message').textContent`)
  } catch (error) {
    result.error = String(error && error.stack || error)
  }
  fs.writeFileSync(outFile, JSON.stringify(result))
  app.quit()
})

// Kindyr Launcher - Copyright (C) 2026 iDontrixss
// SPDX-License-Identifier: GPL-3.0-or-later

// Proceso main de Electron para test/ui-actions.test.js: carga ui-actions.js
// REAL bajo la CSP REAL de index.html y comprueba el despachador (orden,
// stopPropagation, tokens, lista blanca) y que un onclick inyectado no corre.
// Uso: electron electron-ui-actions-runner.js <out.json>
const { app, BrowserWindow } = require('electron')
const fs = require('fs')
const os = require('os')
const path = require('path')
const { pathToFileURL } = require('url')

const root = path.resolve(__dirname, '..', '..')
const outFile = process.argv.at(-1)

const FIXTURE = `
<div id="card" data-click="testRecord" data-args='["card"]'>
  <button id="inner" data-click="testRecord" data-args='["inner","$this"]'>x</button>
  <button id="stopper" data-click="testRecord" data-args='["stopper"]' data-stop>y</button>
  <span id="only-stop" data-stop>z</span>
</div>
<input id="field" value="hola" data-input="testRecord" data-args='["input","$value"]'>
<input id="enter" data-keydown="testRecord" data-args='["enter"]' data-key="Enter">
<button id="evil" data-click="alert" data-args='["no"]'>e</button>
<button id="byid" data-click="testRecord" data-args='["byid","$id:field","$data:name"]' data-name="dato">b</button>
<div id="sink"></div>`

const PAGE_JS = `
window.__log = []
function escapeHtml(v) { return String(v) }
function testRecord(...args) { window.__log.push(args.map(a => a && a.nodeType ? '#' + a.id : a)) }
`

app.whenReady().then(async () => {
  const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'kindyr-uiactions-'))
  let result = {}
  try {
    const csp = fs.readFileSync(path.join(root, 'index.html'), 'utf8').match(/Content-Security-Policy" content="([^"]+)"/)[1]
    let actions = fs.readFileSync(path.join(root, 'ui-actions.js'), 'utf8')
    // La fixture usa su propia acción de prueba; se agrega a la lista blanca.
    actions = actions.replace('const UI_ACTIONS = new Set([', "const UI_ACTIONS = new Set([\n  'testRecord',")
    fs.writeFileSync(path.join(tmp, 'page.js'), PAGE_JS)
    fs.writeFileSync(path.join(tmp, 'ui-actions.js'), actions)
    fs.writeFileSync(path.join(tmp, 'page.html'), `<!doctype html><meta http-equiv="Content-Security-Policy" content="${csp}"><script src="page.js"></script><script src="ui-actions.js"></script><body>${FIXTURE}</body>`)
    const win = new BrowserWindow({ show: false, webPreferences: { contextIsolation: true, sandbox: true } })
    const violations = []
    win.webContents.on('console-message', (e) => { if (/Content Security Policy|Refused/i.test(String(e.message))) violations.push(String(e.message).slice(0, 200)) })
    await win.loadURL(pathToFileURL(path.join(tmp, 'page.html')).href)
    result = await win.webContents.executeJavaScript(`(async () => {
      const out = {}
      let cardListener = 0
      document.getElementById('card').addEventListener('click', () => { cardListener++ })
      const take = () => { const l = window.__log; window.__log = []; return l }
      document.getElementById('inner').click(); out.inner = take(); out.cardListenerAfterInner = cardListener
      document.getElementById('stopper').click(); out.stopper = take(); out.cardListenerAfterStop = cardListener
      document.getElementById('only-stop').click(); out.onlyStop = take()
      const field = document.getElementById('field'); field.dispatchEvent(new Event('input', { bubbles: true })); out.input = take()
      const enter = document.getElementById('enter')
      enter.dispatchEvent(new KeyboardEvent('keydown', { key: 'a', bubbles: true })); enter.dispatchEvent(new KeyboardEvent('keydown', { key: 'Enter', bubbles: true })); out.enter = take()
      window.__alerted = false; window.alert = () => { window.__alerted = true }
      document.getElementById('evil').click(); out.evilCalled = window.__alerted
      document.getElementById('byid').click(); out.byid = take()
      window.__pwn = 0
      document.getElementById('sink').innerHTML = '<img src="x" onerror="window.__pwn=1"><button id="inj" onclick="window.__pwn=2">i</button>'
      await new Promise(r => setTimeout(r, 300))
      document.getElementById('inj').click()
      out.injectedPwn = window.__pwn
      return out
    })()`)
    result.violations = violations
    await new Promise(r => { win.once('closed', r); win.close() })
  } catch (error) {
    result = { error: String(error && error.stack || error) }
  }
  fs.writeFileSync(outFile, JSON.stringify(result))
  fs.rmSync(tmp, { recursive: true, force: true })
  app.quit()
})

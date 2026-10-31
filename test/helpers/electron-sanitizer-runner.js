// Kindyr Launcher - Copyright (C) 2026 iDontrixss
// SPDX-License-Identifier: GPL-3.0-or-later

// Proceso main de Electron para test/html-sanitizer.test.js: ejecuta el
// saneador REAL (html-sanitizer.js) en un renderer con la CSP de index.html,
// inserta la salida en el DOM y reporta si algún payload llegó a ejecutarse.
// Uso: electron electron-sanitizer-runner.js <cases.json> <out.json>
const { app, BrowserWindow } = require('electron')
const fs = require('fs')
const os = require('os')
const path = require('path')
const { pathToFileURL } = require('url')

const root = path.resolve(__dirname, '..', '..')
const [casesFile, outFile] = process.argv.slice(-2)

app.whenReady().then(async () => {
  let result
  const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'kindyr-sanitizer-'))
  try {
    const cases = JSON.parse(fs.readFileSync(casesFile, 'utf8'))
    const csp = fs.readFileSync(path.join(root, 'index.html'), 'utf8').match(/Content-Security-Policy" content="([^"]+)"/)[1]
    const page = path.join(tmp, 'page.html')
    fs.writeFileSync(page, `<!doctype html><meta http-equiv="Content-Security-Policy" content="${csp}"><div id="box"></div>`)
    const win = new BrowserWindow({ show: false, webPreferences: { contextIsolation: true, sandbox: true } })
    await win.loadURL(pathToFileURL(page).href)
    const sanitizer = fs.readFileSync(path.join(root, 'html-sanitizer.js'), 'utf8')
    result = await win.webContents.executeJavaScript(`(async () => {
      ${sanitizer}
      const cases = ${JSON.stringify(cases)}
      const out = []
      for (const c of cases) {
        window.__pwn = 0
        const frag = sanitizeProviderHtml(c.html, c.base || 'https://modrinth.com')
        const box = document.getElementById('box')
        box.replaceChildren(frag)
        await new Promise(r => setTimeout(r, 150))
        out.push({ html: box.innerHTML, pwn: window.__pwn, hasContent: providerHtmlHasContent(sanitizeProviderHtml(c.html, c.base)) })
      }
      return out
    })()`)
  } catch (error) {
    result = { error: String(error && error.stack || error) }
  }
  fs.writeFileSync(outFile, JSON.stringify(result))
  try { fs.rmSync(tmp, { recursive: true, force: true }) } catch {}
  app.quit()
})

// Kindyr Launcher - Copyright (C) 2026 iDontrixss
// SPDX-License-Identifier: GPL-3.0-or-later

// Las fuentes de la interfaz viajan con la app: sin esto cada ventana cae a
// Segoe UI/Consolas salvo que el usuario las tenga instaladas en el sistema.
const test = require('node:test')
const assert = require('node:assert/strict')
const fs = require('fs')
const path = require('path')

const root = path.resolve(__dirname, '..')
const read = (f) => fs.readFileSync(path.join(root, f), 'utf8')
const FONTS_CSS = 'assets/fonts/fonts.css'
const WINDOWS = ['index.html', 'splash.html', 'onboarding.html', 'fatal-dialog.html', 'update-confirmation.html']

test('cada ventana enlaza la hoja de fuentes local', () => {
  for (const page of WINDOWS) {
    assert.ok(read(page).includes(`<link rel="stylesheet" href="${FONTS_CSS}">`), `${page} no enlaza ${FONTS_CSS}`)
  }
})

test('la hoja declara las dos familias con archivos locales que existen', () => {
  const css = read(FONTS_CSS)
  for (const family of ['Space Grotesk', 'JetBrains Mono']) {
    assert.match(css, new RegExp(`font-family: '${family}'`))
  }
  const urls = [...css.matchAll(/url\(['"]?([^'")]+)['"]?\)/g)].map(m => m[1])
  assert.equal(urls.length, 4)
  for (const url of urls) {
    assert.doesNotMatch(url, /^(https?:|\/\/|\/)/, `${url} debe ser relativa: la CSP solo admite font-src 'self'`)
    const file = path.join(root, 'assets/fonts', url)
    assert.ok(fs.existsSync(file), `falta ${url}`)
    assert.equal(fs.readFileSync(file).subarray(0, 4).toString('latin1'), 'wOF2', `${url} no es woff2`)
  }
})

test('las licencias OFL viajan junto a las fuentes', () => {
  for (const license of ['OFL-SpaceGrotesk.txt', 'OFL-JetBrainsMono.txt']) {
    assert.match(read('assets/fonts/' + license), /SIL OPEN FONT LICENSE/i)
  }
})

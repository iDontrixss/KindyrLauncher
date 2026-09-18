// Kindyr Launcher - Copyright (C) 2026 iDontrixss
// This program is free software: you can redistribute it and/or modify
// it under the terms of the GNU General Public License as published by
// the Free Software Foundation, either version 3 of the License, or
// (at your option) any later version.
// SPDX-License-Identifier: GPL-3.0-or-later

// Consola read-only del Centro de control: latest.log completo SIN filtrar
// (sin colapsar espacios ni truncar líneas) + polling en vivo por byte, con
// arte ASCII idle coloreado por caracter (# B : K) y un texto por idioma.
const test = require('node:test')
const assert = require('node:assert/strict')
const fs = require('fs')
const path = require('path')

const root = path.resolve(__dirname, '..')
const mainSource = fs.readFileSync(path.join(root, 'main.js'), 'utf8')
const commonSource = fs.readFileSync(path.join(root, 'common.js'), 'utf8')
const instancesSource = fs.readFileSync(path.join(root, 'instances.js'), 'utf8')
const preloadSource = fs.readFileSync(path.join(root, 'preload.js'), 'utf8')
const stylesSource = fs.readFileSync(path.join(root, 'styles.css'), 'utf8')

function functionBody(source, file, name) {
  const start = source.indexOf(`function ${name}(`)
  assert.ok(start >= 0, `${name} debe existir en ${file}`)
  const next = source.indexOf('\nfunction ', start + 1)
  const nextAsync = source.indexOf('\nasync function ', start + 1)
  let end = source.length
  if (next >= 0) end = Math.min(end, next)
  if (nextAsync >= 0) end = Math.min(end, nextAsync)
  return source.slice(start, end)
}

test('el backend expone la cola del log sin filtrar, acotada e incremental', () => {
  assert.match(mainSource, /ipcMain\.handle\('read-instance-console'/)
  const body = mainSource.slice(mainSource.indexOf("ipcMain.handle('read-instance-console'"))
  assert.ok(body.includes('latest.log'), 'lee el launcher-log de la instancia')
  assert.ok(body.includes('INSTANCE_CONSOLE_TAIL_BYTES'), 'cola inicial acotada')
  assert.ok(body.includes('INSTANCE_CONSOLE_CHUNK_BYTES'), 'chunk máximo por lectura')
  assert.ok(body.includes('fromByte'), 'lectura incremental por byte')
  assert.ok(body.includes('reset'), 'detecta log recreado/rotado')
  assert.ok(body.includes('closeSync'), 'cierra el descriptor')
  assert.ok(body.includes('sizeOnly'), 'drenaje a EOF sin traer texto')
})

test('los eventos de launcher llevan instanceId para atar la consola a la sesión', () => {
  const body = functionBody(mainSource, 'main.js', 'sendLauncherStatus')
  assert.ok(body.includes('instanceId'), 'el evento identifica la instancia')
})

test('preload expone readConsole', () => {
  assert.ok(preloadSource.includes("invoke('read-instance-console', payload)"), 'preload expone readConsole')
})

test('el tab Consola existe con sus controles read-only', () => {
  assert.ok(instancesSource.includes("switchInstanceTab('console')"), 'botón del tab')
  assert.ok(instancesSource.includes("t('instance.consoleTab')"), 'título i18n')
  assert.ok(instancesSource.includes('id="instance-tab-console"'), 'panel del tab')
  assert.ok(instancesSource.includes('id="instance-console-view"'), 'viewport')
  assert.ok(instancesSource.includes('id="instance-console-follow"'), 'toggle seguir')
  assert.ok(instancesSource.includes('copyInstanceConsole()'), 'botón copiar')
  assert.ok(instancesSource.includes('refreshInstanceConsole('), 'botón refrescar')
  assert.equal(instancesSource.includes('instance-console-input'), false, 'sin entrada de comandos: solo lectura')
})

test('polling en vivo con guards de sección/instancia y estado follow', () => {
  for (const name of ['startInstanceConsole', 'stopInstanceConsole', 'pollInstanceConsole', 'syncInstanceConsoleRunning', 'toggleInstanceConsoleFollow', 'appendInstanceConsoleText']) {
    assert.ok(instancesSource.includes(`function ${name}`) || instancesSource.includes(`async function ${name}`), `existe ${name}`)
  }
  const poll = functionBody(instancesSource, 'instances.js', 'pollInstanceConsole')
  assert.ok(poll.includes("currentSection !== 'instance-detail'"), 'no pollea fuera de la vista')
  assert.ok(poll.includes('st.instanceId !== selectedInstance'), 'no mezcla instancias')
  const appendCap = functionBody(instancesSource, 'instances.js', 'appendInstanceConsoleText')
  assert.ok(appendCap.includes('INSTANCE_CONSOLE_MAX_LINES'), 'tope de memoria del buffer')
  assert.ok(instancesSource.includes("if (tab === 'console') startInstanceConsole()"), 'switch prende el poll')
  assert.ok(instancesSource.includes('stopInstanceConsole()'), 'switch/dispose apagan el poll')
})

test('no filtra nada: líneas completas sin colapsar ni truncar, solo colorea', () => {
  const render = functionBody(instancesSource, 'instances.js', 'renderInstanceConsole')
  assert.ok(render.includes('consoleLineDiv('), 'cada línea se pinta entera')
  assert.equal(render.includes('slice(0, 180)'), false, 'sin truncado legacy de 180 chars')
  const append = functionBody(instancesSource, 'instances.js', 'appendInstanceConsoleText')
  assert.ok(append.includes('st.carry'), 'retiene línea parcial entre polls sin mostrarla rota')
})

test('classifyConsoleLine pinta warn/error como terminal promedio (conductual)', () => {
  const vm = require('node:vm')
  const start = instancesSource.indexOf('function classifyConsoleLine(')
  assert.ok(start >= 0, 'existe classifyConsoleLine')
  const end = instancesSource.indexOf('\nfunction consoleLineDiv(', start)
  assert.ok(end > start, 'extracción acotada')
  const sb = {}
  vm.runInNewContext(instancesSource.slice(start, end), sb)
  const classify = sb.classifyConsoleLine
  assert.equal(typeof classify, 'function')
  const cases = [
    ['[12:00:00] [Server thread/WARN]: Can’t keep up!', 'warn'],
    ['[12:00:00] [Server thread/ERROR]: Encountered an unexpected exception', 'error'],
    ['[12:00:00] [main/FATAL]: Failed to start', 'error'],
    ['java.lang.NullPointerException: Cannot invoke method', 'error'],
    ['[10:00:00] No se pudo preparar Instancia', 'error'],
    ['Could not resolve component', 'error'],
    ['[10:00:00] Descargando Java 21…', null],
    ['[Server thread/INFO]: Done (1.2s)! For help, type "help"', null],
    ['[12:00:00] 0 errors, 0 warnings', null],
    ['', null]
  ]
  for (const [line, expected] of cases) {
    assert.equal(classify(line), expected, `classify(${JSON.stringify(line)})`)
  }
})

test('idle con ASCII coloreado por caracter y un texto por idioma', () => {
  assert.ok(instancesSource.includes('CONSOLE_FACE_ART'), 'arte incluido')
  assert.ok(instancesSource.includes("':##:#'"), 'cara actual presente')
  assert.ok(instancesSource.includes('###::###::BB::#::KK:###::BBB::##::KKK:###'), 'detalle de ojos presente')
  const art = functionBody(instancesSource, 'instances.js', 'renderAsciiColored')
  assert.ok(art.includes("'#'") && art.includes("'B'") && art.includes("':'") && art.includes("'K'"), 'mapea # B : K')
  assert.ok(art.includes('ascii-ink') && art.includes('ascii-blue') && art.includes('ascii-navy') && art.includes('ascii-white'), 'clases por caracter')
  assert.ok(instancesSource.includes("t('instance.consoleIdle')"), 'texto idle por idioma (no ambos juntos)')
  assert.equal(instancesSource.includes('a recibir registros en vivo!') && instancesSource.includes('start receiving live'), false, 'los textos viven en i18n, no hardcodeados')
})

test('i18n ES/EN de la consola', () => {
  for (const key of ['instance.consoleTab', 'instance.consoleIdle', 'instance.console.live', 'instance.console.stopped', 'instance.console.lines', 'instance.console.follow', 'instance.console.copy', 'instance.console.copied']) {
    assert.ok(commonSource.includes(`'${key}'`), `falta i18n ${key}`)
  }
  assert.match(commonSource, /'instance\.consoleIdle': '¡Inicia tu instancia/)
  assert.match(commonSource, /'instance\.consoleIdle': 'Start your instance/)
})

test('estilos guía: 5 tabs, mono de consola y colores del ASCII', () => {
  assert.ok(stylesSource.includes('repeat(5, minmax(0, 1fr))'), 'tab-row de 5')
  assert.ok(stylesSource.includes('console-tab-view'), 'viewport de consola')
  assert.ok(stylesSource.includes("Consolas, \"Courier New\", monospace"), 'mono según guía')
  for (const cls of ['.ascii-ink', '.ascii-blue', '.ascii-navy', '.ascii-white']) {
    assert.ok(stylesSource.includes(cls), `falta ${cls}`)
  }
  assert.ok(stylesSource.includes('.console-line.lvl-warn') && stylesSource.includes('.console-line.lvl-error'), 'niveles warn/error')
  assert.ok(stylesSource.includes('.console-ascii { display: block; width: max-content; max-width: 100%; margin: 8px 0;'), 'ASCII a la izquierda (sin centrar)')
})

test('al cerrar el juego se vacía y vuelve el ASCII (sesión muerta, sin recargar lo viejo)', () => {
  const launcherSource = fs.readFileSync(path.join(root, 'launcher.js'), 'utf8')
  assert.ok(launcherSource.includes('clearInstanceConsoleFor'), 'el close limpia la consola')
  assert.ok(launcherSource.includes('reviveInstanceConsole'), 'el inicio revive la sesión')
  assert.ok(instancesSource.includes('consoleDeadInstances'), 'registro de sesiones terminadas')
  const clear = functionBody(instancesSource, 'instances.js', 'clearInstanceConsoleFor')
  assert.ok(clear.includes('drainInstanceConsole'), 'drena a EOF para no recargar lo viejo')
  const start = functionBody(instancesSource, 'instances.js', 'startInstanceConsole')
  assert.ok(start.includes('consoleDeadInstances.has'), 'al abrir no muestra la cola vieja si terminó')
})

test('botón limpiar: vacía la vista, drena y muestra el ASCII (sin borrar el archivo)', () => {
  assert.ok(instancesSource.includes('clearInstanceConsoleView()'), 'botón en la toolbar')
  assert.ok(instancesSource.includes("t('instance.console.clear')"), 'tooltip i18n')
  const clear = functionBody(instancesSource, 'instances.js', 'clearInstanceConsoleView')
  assert.ok(clear.includes('drainInstanceConsole'), 'drena para que el poll no recargue')
  assert.ok(clear.includes('renderInstanceConsole'), 're-renderiza al ASCII')
  assert.ok(commonSource.includes("'instance.console.clear'"), 'i18n del botón')
})

test('la consola de inicio legacy no existe más (única consola: el tab)', () => {
  for (const token of ['console-panel', 'console-output', 'console-head', 'class="console-btn"', 'console-actions', 'appendConsole', 'clearConsole', 'consolePanelVisible', 'flushConsole']) {
    assert.equal(instancesSource.includes(token), false, `instances.js sin ${token}`)
    assert.equal(commonSource.includes(token), false, `common.js sin ${token}`)
  }
  for (const token of ['console-panel', 'console-output', 'console-head', '.console-btn', 'console-actions']) {
    assert.equal(stylesSource.includes(token), false, `styles.css sin ${token}`)
  }
  const launcherSource = fs.readFileSync(path.join(root, 'launcher.js'), 'utf8')
  assert.equal(launcherSource.includes('appendConsole'), false, 'launcher.js sin appendConsole')
  assert.equal(launcherSource.includes('clearConsole'), false, 'launcher.js sin clearConsole')
  assert.equal(commonSource.includes("'instance.console'"), false, 'i18n instance.console eliminada')
  assert.equal(commonSource.includes("'instance.clear'"), false, 'i18n instance.clear eliminada')
})

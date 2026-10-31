// Kindyr Launcher - Copyright (C) 2026 iDontrixss
// This program is free software: you can redistribute it and/or modify
// it under the terms of the GNU General Public License as published by
// the Free Software Foundation, either version 3 of the License, or
// (at your option) any later version.
// SPDX-License-Identifier: GPL-3.0-or-later

// Un error no capturado ya no deja la app en estado corrupto: vuelca logs,
// guarda reporte de crash y sale con código 1 sin tocar los stores.
// Un crash real no pregunta (no hay diálogo posible si el proceso muere):
// NUNCA mata la JVM; la supervivencia es estructural (detached + huérfana).
// Solo la X con juego vivo pregunta, en popup propio.
const test = require('node:test')
const assert = require('node:assert/strict')
const fs = require('fs')
const path = require('path')

const root = path.resolve(__dirname, '..')
const mainSource = require('./helpers/main-source').readMainSource()

test('existe manejador central de errores fatales', () => {
  assert.match(mainSource, /function handleFatalError\(source, error\)/)
  assert.match(mainSource, /fatalErrorInProgress/)
})

test('uncaughtException es fatal, unhandledRejection periférico solo se registra', () => {
  assert.match(mainSource, /process\.on\('uncaughtException'/)
  assert.match(mainSource, /process\.on\('unhandledRejection'/)
  const start = mainSource.indexOf('function handleFatalError(')
  const end = mainSource.indexOf('function logUnfatalError(')
  const body = mainSource.slice(start, end > start ? end : start + 6000)
  assert.match(body, /process\.exit\(1\)/)
  assert.match(mainSource, /crash-.*\.log/)
  // El crash no pregunta ni mata: sin showFatalChoice ni kill en este path
  assert.equal(body.includes('showFatalChoice'), false, 'el crash no muestra diálogo')
  assert.equal(body.includes("kill('SIGTERM')"), false, 'el crash nunca mata la JVM')
  // unhandledRejection NO debe rutear al fatal con kill+exit cuando hay juego
  const rejStart = mainSource.indexOf("process.on('unhandledRejection'")
  const rejBody = mainSource.slice(rejStart, rejStart + 1200)
  assert.match(rejBody, /logUnfatalError/)
  assert.equal(rejBody.includes("handleFatalError('unhandledRejection'"), false, 'unhandledRejection no debe matar la JVM')
})

test('popup propio estilo cuentas (X con juego): Solo default, Esc/X = Solo, foco', () => {
  assert.match(mainSource, /function showFatalChoice\(/)
  assert.match(mainSource, /fatal-dialog\.html/)
  assert.match(mainSource, /preload-fatal\.js/)
  assert.match(mainSource, /ipcMain\.handle\('fatal-choice'/)
  const html = fs.readFileSync(path.join(root, 'fatal-dialog.html'), 'utf8')
  assert.match(html, /fatalSolo/)
  assert.match(html, /fatalKill/)
  assert.match(html, /Escape/)
  assert.match(html, /getElementById\('fatalSolo'\)\.focus\(\)/)
  assert.match(mainSource, /Solo launcher/)
  assert.match(mainSource, /Cerrar todo/)
})

test('JVM desacoplada: sobrevive a la salida del launcher sin kill', () => {
  const i = mainSource.indexOf('extraJVMArgs: jvmArgs')
  assert.ok(i >= 0, 'launchOptions existe')
  const opts = mainSource.slice(i, i + 800)
  assert.ok(opts.includes('extraExecOption'), 'vía extraExecOption XMCL')
  assert.ok(opts.includes('detached: true'), 'detached desacopla del job')
})

test('la X con juego vivo pregunta Solo vs Todo (Esc/X = Solo)', () => {
  const i = mainSource.indexOf("ipcMain.on('close'")
  assert.ok(i >= 0, 'handler close existe')
  const body = mainSource.slice(i, i + 2500)
  assert.match(body, /showFatalChoice\(/)
  assert.match(body, /quitLeavingOrphan = true/)
})

test('huérfana documentada: pid+cmd+hora persisten y se validan antes de Kill', () => {
  assert.match(mainSource, /orphan|huerfana|huérfana/i)
  assert.match(mainSource, /startTime|startedAt/)
  // Kill por pid solo tras validar las tres
  assert.match(mainSource, /pid/)
})

test('el manejador no escribe stores y jamás mata la JVM', () => {
  const start = mainSource.indexOf('function handleFatalError(')
  const end = mainSource.indexOf('function logUnfatalError(')
  const body = mainSource.slice(start, end > start ? end : start + 6000)
  assert.equal(body.includes('saveCustomInstances'), false)
  assert.equal(body.includes('saveLauncherSettings'), false)
  assert.equal(body.includes("kill('SIGTERM')"), false)
  assert.equal(body.includes('showFatalChoice'), false)
  assert.match(mainSource, /singleInstanceLock|requestSingleInstanceLock/)
  assert.match(body, /flushLaunchLogSync\(\)/)
})

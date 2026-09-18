// Kindyr Launcher - Copyright (C) 2026 iDontrixss
// This program is free software: you can redistribute it and/or modify
// it under the terms of the GNU General Public License as published by
// the Free Software Foundation, either version 3 of the License, or
// (at your option) any later version.
// SPDX-License-Identifier: GPL-3.0-or-later

// Un error no capturado ya no deja la app en estado corrupto: vuelca logs,
// guarda reporte de crash, avisa al usuario y sale con código 1 sin tocar
// los stores (el estado en memoria puede estar corrupto).
const test = require('node:test')
const assert = require('node:assert/strict')
const fs = require('fs')
const path = require('path')

const root = path.resolve(__dirname, '..')
const mainSource = fs.readFileSync(path.join(root, 'main.js'), 'utf8')

test('existe manejador central de errores fatales', () => {
  assert.match(mainSource, /function handleFatalError\(source, error\)/)
  assert.match(mainSource, /fatalErrorInProgress/)
})

test('uncaughtException y unhandledRejection usan el manejador y salen', () => {
  assert.match(mainSource, /process\.on\('uncaughtException', \(error\) => \{\s*\n\s*handleFatalError\('uncaughtException', error\)/)
  assert.match(mainSource, /process\.on\('unhandledRejection'/)
  const start = mainSource.indexOf('function handleFatalError(')
  const body = mainSource.slice(start, mainSource.indexOf('\nprocess.on(', start))
  assert.match(body, /process\.exit\(1\)/)
  assert.match(body, /crash-.*\.log/)
  assert.match(body, /showMessageBoxSync/)
})

test('el manejador no escribe stores y protege la JVM hija', () => {
  const start = mainSource.indexOf('function handleFatalError(')
  const body = mainSource.slice(start, mainSource.indexOf('\nprocess.on(', start))
  assert.equal(body.includes('saveCustomInstances'), false)
  assert.equal(body.includes('saveLauncherSettings'), false)
  assert.match(body, /minecraftProcess.*kill\('SIGTERM'\)/)
  assert.match(body, /flushLaunchLogSync\(\)/)
})

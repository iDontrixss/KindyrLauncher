// Kindyr Launcher - Copyright (C) 2026 iDontrixss
// This program is free software: you can redistribute it and/or modify
// it under the terms of the GNU General Public License as published by
// the Free Software Foundation, either version 3 of the License, or
// (at your option) any later version.
// SPDX-License-Identifier: GPL-3.0-or-later

// Cerrar el launcher con Minecraft en marcha o instalando no debe dejar
// JVM huérfana ni tareas colgadas: before-quit retrasa la salida hasta
// apagar el juego (TERM + KILL de respaldo) y volcar logs.
const test = require('node:test')
const assert = require('node:assert/strict')
const fs = require('fs')
const path = require('path')

const root = path.resolve(__dirname, '..')
const mainSource = fs.readFileSync(path.join(root, 'main.js'), 'utf8')

test('before-quit retrasa la salida si hay juego o instalación en curso', () => {
  assert.match(mainSource, /app\.on\('before-quit', \(event\) =>/)
  assert.match(mainSource, /event\.preventDefault\(\)/)
  assert.match(mainSource, /shutdownForAppQuit\(\)/)
  assert.match(mainSource, /appQuitAfterShutdown = true/)
})

test('existe apagado ordenado compartido que nunca deja huérfanos', () => {
  assert.match(mainSource, /function requestMinecraftStop\(\)/)
  assert.match(mainSource, /async function shutdownForAppQuit\(\)/)
  assert.match(mainSource, /stopped\.kill\('SIGKILL'\)/)
  assert.match(mainSource, /function flushLaunchLogSync\(\)/)
  assert.match(mainSource, /fs\.appendFileSync\(currentLogFile, chunk\)/)
})

test('kill-minecraft reutiliza el apagado compartido sin cambiar su contrato', () => {
  const start = mainSource.indexOf("ipcMain.handle('kill-minecraft'")
  assert.ok(start >= 0)
  const body = mainSource.slice(start, mainSource.indexOf('})', start) + 2)
  assert.match(body, /requestMinecraftStop\(\)/)
  assert.match(body, /return \{ ok: true \}/)
})

// Kindyr Launcher - Copyright (C) 2026 iDontrixss
// SPDX-License-Identifier: GPL-3.0-or-later

// KL-13: "matar huérfano" solo si el PID sigue siendo nuestra JVM. Se valida
// contra un proceso hijo REAL (node con un --gameDir falso en sus argumentos),
// consultando al SO su línea de comandos y su hora de inicio.
const test = require('node:test')
const assert = require('node:assert/strict')
const os = require('os')
const path = require('path')
const { spawn } = require('child_process')
const { installElectronStub } = require('./helpers/electron-stub')

const env = installElectronStub()
test.after(() => env.restore())
const { validateOrphanProcess, getProcessInfo } = require('../main/orphan')

const gameDir = path.join(os.tmpdir(), 'kindyr-orphan-test', 'instances', 'demo', 'minecraft')

function spawnFakeJvm() {
  const child = spawn(process.execPath, ['-e', 'setInterval(() => {}, 1000)', '--', '--gameDir', gameDir], { stdio: 'ignore', windowsHide: true })
  return child
}

test('KL-13: valida la JVM correcta y rechaza PID reutilizado, otra carpeta o registros viejos', async (t) => {
  const child = spawnFakeJvm()
  const startedAt = Date.now()
  t.after(() => { try { child.kill() } catch {} })
  await new Promise(r => setTimeout(r, 500))
  const info = await getProcessInfo(child.pid, 15_000)
  if (!info) return t.skip('el SO no expone la información del proceso en este entorno')
  assert.match(info.commandLine.replace(/\\/g, '/').toLowerCase(), /kindyr-orphan-test/)

  const ok = await validateOrphanProcess({ pid: child.pid, gameDir, startedAt }, 15_000)
  assert.deepEqual(ok, { alive: true, validated: true })

  const other = await validateOrphanProcess({ pid: child.pid, gameDir: path.join(os.tmpdir(), 'otra-instancia'), startedAt }, 15_000)
  assert.equal(other.validated, false)
  assert.equal(other.reason, 'cmd-mismatch')

  const reused = await validateOrphanProcess({ pid: child.pid, gameDir, startedAt: startedAt + 3_600_000 }, 15_000)
  assert.equal(reused.validated, false)
  assert.equal(reused.reason, 'pid-reused')

  const legacy = await validateOrphanProcess({ pid: child.pid, cmd: 'minecraft:demo:1.21', startTime: startedAt }, 15_000)
  assert.equal(legacy.validated, false)
  assert.equal(legacy.reason, 'legacy-record')
})

test('KL-13: sin información del SO no se valida (fail-closed)', async () => {
  const r = await validateOrphanProcess({ pid: process.pid, gameDir, startedAt: Date.now() }, 1000, { getInfo: async () => null })
  assert.equal(r.validated, false)
  const dead = await validateOrphanProcess({ pid: 2 ** 22 + 7, gameDir, startedAt: Date.now() })
  assert.equal(dead.alive, false)
})

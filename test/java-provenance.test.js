// Kindyr Launcher - Copyright (C) 2026 iDontrixss
// SPDX-License-Identifier: GPL-3.0-or-later

// KL-05: la ruta GLOBAL de Java (Ajustes) debe exigir la misma procedencia que
// el javaHome por instancia. Se ejercita el handler IPC real con un stub de
// electron (appData temporal) y un JDK falso; el diálogo nativo se simula.
const test = require('node:test')
const assert = require('node:assert/strict')
const fs = require('fs')
const os = require('os')
const path = require('path')
const { installElectronStub } = require('./helpers/electron-stub')

const env = installElectronStub()
test.after(() => env.restore())

function makeFakeJdk() {
  const home = fs.mkdtempSync(path.join(os.tmpdir(), 'kindyr-fake-jdk-'))
  fs.mkdirSync(path.join(home, 'bin'))
  const exe = path.join(home, 'bin', process.platform === 'win32' ? 'javaw.exe' : 'java')
  fs.writeFileSync(exe, '')
  return { home, exe }
}

require('../main/ipc/settings')
const java = require('../main/java')
const { loadLauncherSettings } = require('../main/settings')

test('KL-05: una ruta global no aprobada se rechaza si el usuario no la autoriza', async () => {
  const { home } = makeFakeJdk()
  env.dialogResponses.push(0) // Cancelar
  const result = await env.invoke('settings-set-java-path', { major: 21, path: home })
  assert.equal(result.ok, false)
  assert.equal(result.cancelled, true)
  assert.equal(loadLauncherSettings().javaInstalls['21'], '')
  assert.equal(java.getConfiguredJavaHome(21), '')
})

test('KL-05: autorizada en el diálogo nativo queda aprobada y se usa', async () => {
  const { home, exe } = makeFakeJdk()
  env.dialogResponses.push(1) // Autorizar
  const result = await env.invoke('settings-set-java-path', { major: 17, path: home })
  assert.equal(result.ok, true)
  assert.equal(java.isTrustedJavaBinary(exe).trusted, true)
  assert.equal(path.resolve(java.getConfiguredJavaHome(17)), path.resolve(home))
})

test('KL-05: una ruta global guardada sin aprobación (versiones previas) no se ejecuta', () => {
  const { home } = makeFakeJdk()
  const { saveLauncherSettings } = require('../main/settings')
  const settings = loadLauncherSettings()
  settings.javaInstalls['8'] = home
  saveLauncherSettings(settings)
  assert.equal(java.getConfiguredJavaHome(8), '', 'sin aprobación debe caer al runtime gestionado')
})

test('KL-05/KL-07: rutas UNC y de dispositivo se rechazan sin tocarlas', async () => {
  let asked = false
  for (const bad of ['\\\\attacker\\share\\jdk', '//attacker/share/jdk', '\\\\?\\C:\\jdk', 'relative\\jdk']) {
    const r = await java.authorizeJavaHome(bad, { confirm: async () => { asked = true; return true } })
    assert.equal(r.ok, false, bad)
    assert.throws(() => java.resolveJavaPath(bad), /disco local/)
  }
  assert.equal(asked, false, 'no debe preguntar por rutas inválidas')
})

test('KL-05: el renderer no puede saltarse la confirmación con un payload', async () => {
  const { home } = makeFakeJdk()
  env.dialogResponses.push(0)
  const r = await env.invoke('settings-set-java-path', { major: 25, path: home, approved: true, trusted: true })
  assert.equal(r.ok, false)
})

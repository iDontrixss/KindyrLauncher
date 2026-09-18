// Kindyr Launcher - Copyright (C) 2026 iDontrixss
// This program is free software: you can redistribute it and/or modify
// it under the terms of the GNU General Public License as published by
// the Free Software Foundation, either version 3 of the License, or
// (at your option) any later version.
// SPDX-License-Identifier: GPL-3.0-or-later

// Preparación eager graduada: ON por defecto, sin marca beta, con preparación
// REAL en todos los caminos que crean instancia (crear, modpack por modal
// Modrinth/CurseForge, importar .mrpack) y texto "Instalando..." en modpacks.
const test = require('node:test')
const assert = require('node:assert/strict')
const fs = require('fs')
const path = require('path')

const root = path.resolve(__dirname, '..')
const mainSource = fs.readFileSync(path.join(root, 'main.js'), 'utf8')
const commonSource = fs.readFileSync(path.join(root, 'common.js'), 'utf8')
const instancesSource = fs.readFileSync(path.join(root, 'instances.js'), 'utf8')
const modrinthSource = fs.readFileSync(path.join(root, 'modrinth.js'), 'utf8')
const curseforgeSource = fs.readFileSync(path.join(root, 'curseforge.js'), 'utf8')
const ajustesSource = fs.readFileSync(path.join(root, 'sections', 'ajustes.html'), 'utf8')
const instSectionSource = fs.readFileSync(path.join(root, 'sections', 'instancias.html'), 'utf8')

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

test('la opción viene activada por defecto (perfiles nuevos)', () => {
  const matches = commonSource.match(/eagerPrepareOnCreate: true/g) || []
  assert.ok(matches.length >= 2, 'default true en init y en load de settings')
  assert.equal(commonSource.includes('eagerPrepareOnCreate: false'), false, 'no debe quedar default false')
})

test('ya no es beta: sin llaves settings.beta ni badge experimental', () => {
  for (const key of ['settings.beta.title', 'settings.beta.desc', 'settings.beta.eager', 'settings.beta.enabled', 'settings.beta.preparing', 'settings.beta.prepared', 'settings.beta.failed']) {
    assert.equal(commonSource.includes(`'${key}'`), false, `llave beta eliminada: ${key}`)
  }
  assert.equal(ajustesSource.includes('beta-eager'), false, 'sin ids beta-eager en Ajustes')
  assert.equal(ajustesSource.includes('beta-badge'), false, 'sin badge BETA de la feature')
  assert.equal(ajustesSource.includes('Experimental'), false, 'sin marca experimental')
  for (const key of ['settings.prepare.title', 'settings.prepare.desc', 'settings.prepare.on', 'settings.prepare.off', 'settings.prepare.preparing', 'settings.prepare.prepared', 'settings.prepare.failed']) {
    assert.ok(commonSource.includes(`'${key}'`), `falta i18n graduada ${key}`)
  }
  assert.ok(ajustesSource.includes('id="prepare-on"') && ajustesSource.includes('id="prepare-off"'), 'toggle en Ajustes')
})

test('helper compartido runEagerPrepare con estados ready/failed/off', () => {
  const body = functionBody(instancesSource, 'instances.js', 'runEagerPrepare')
  assert.ok(body.includes('settings.eagerPrepareOnCreate'), 'respeta el ajuste')
  assert.ok(body.includes('instances.prepare'), 'llama al IPC de preparación real')
  assert.ok(body.includes("'ready'") && body.includes("'failed'") && body.includes("'off'"), 'tres estados')
  assert.ok(body.includes('prepareStatus'), 'espera el fin en segundo plano')
})

test('crear instancia usa el helper (sin bloque duplicado)', () => {
  const body = functionBody(instancesSource, 'instances.js', 'createSelectedInstance')
  assert.ok(body.includes('runEagerPrepare'), 'crear delega en el helper')
  assert.equal(body.includes('settings.beta.preparing'), false, 'sin restos beta')
})

test('modpacks por modal (Modrinth/CurseForge) preparan de verdad + texto Instalando', () => {
  for (const [src, file] of [[modrinthSource, 'modrinth.js'], [curseforgeSource, 'curseforge.js']]) {
    assert.ok(src.includes('runEagerPrepare'), `${file} prepara modpacks nuevos`)
    assert.ok(src.includes("setInstallNote(t('install.installing'))"), `${file} dice Instalando`)
  }
  assert.equal(modrinthSource.includes("install.working"), false, 'fuera el Trabajando en modrinth')
  assert.equal(curseforgeSource.includes("install.working"), false, 'fuera el Trabajando en curseforge')
  assert.equal(commonSource.includes("'install.working'"), false, 'llave install.working eliminada')
})

test('importar .mrpack devuelve instanceId y prepara en ambos lados', () => {
  assert.ok(mainSource.includes('instanceId }'), 'import-mrpack expone instanceId')
  assert.ok(instancesSource.includes('afterModpackImport'), 'helper post-import existe')
  assert.ok(instancesSource.includes('await afterModpackImport(result)'), 'create lo usa')
  assert.ok(instSectionSource.includes('afterModpackImport'), 'la sección lo usa')
})

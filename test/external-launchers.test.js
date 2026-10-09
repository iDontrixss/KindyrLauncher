// Kindyr Launcher - Copyright (C) 2026 iDontrixss
// This program is free software: you can redistribute it and/or modify
// it under the terms of the GNU General Public License as published by
// the Free Software Foundation, either version 3 of the License, or
// (at your option) any later version.
// SPDX-License-Identifier: GPL-3.0-or-later

// Fase 1: adaptadores "Importar desde otro launcher".
// Todos los datos son FIXTURES SINTÉTICOS (test/fixtures/external-launchers,
// marcados con "_synthetic": true). Ninguna prueba toca instalaciones reales.

const test = require('node:test')
const assert = require('node:assert/strict')
const fs = require('fs')
const path = require('path')

const shared = require('../external-launchers/shared')
const prism = require('../external-launchers/prism')
const curseforge = require('../external-launchers/curseforge')
const modrinth = require('../external-launchers/modrinth')
const sklauncher = require('../external-launchers/sklauncher')
const official = require('../external-launchers/official')

const fixtures = path.join(__dirname, 'fixtures', 'external-launchers')

test('fixtures sintéticos están marcados como tales', () => {
  for (const file of [
    'SYNTHETIC.json',
    'prism/instances/SyntheticAlpha/mmc-pack.json',
    'curseforge/Instances/SyntheticPack/minecraftinstance.json',
    'sk/instances.json',
    'official/launcher_profiles.json'
  ]) {
    const json = JSON.parse(fs.readFileSync(path.join(fixtures, file), 'utf8'))
    assert.equal(json._synthetic, true, `${file} debe marcarse _synthetic`)
  }
})

test('shared: loader desconocido es null y tamaño excluye logs sin cargar memoria', () => {
  assert.equal(shared.normalizeLoaderName('fabuloso-loader-9000'), null)
  assert.equal(shared.normalizeLoaderName('NeoForge 21.1'), 'neoforge')
  assert.equal(shared.normalizeLoaderName('vanilla'), 'vanilla')
  // Sin efectos laterales: sonda en tmp, nunca dentro de fixtures.
  const os = require('os')
  const probe = fs.mkdtempSync(path.join(os.tmpdir(), 'kindyr-size-'))
  try {
    fs.writeFileSync(path.join(probe, 'options.txt'), 'x'.repeat(100))
    fs.mkdirSync(path.join(probe, 'logs'), { recursive: true })
    fs.writeFileSync(path.join(probe, 'logs', 'big.log'), 'x'.repeat(1000))
    const { bytes } = shared.walkSizeBytes(probe)
    assert.ok(bytes < 1000, 'logs/ debe excluirse del tamaño')
  } finally {
    fs.rmSync(probe, { recursive: true, force: true })
  }
})

test('prism: lista instancia sintética y marca la rota como no compatible', () => {
  const root = path.join(fixtures, 'prism')
  assert.equal(prism.parseInstanceDirOverride('InstanceDir=instances\n', root), path.join(root, 'instances'))
  const result = prism.listInstances(root)
  assert.equal(result.ok, true)
  const alpha = result.instances.find(i => i.id === 'SyntheticAlpha')
  assert.ok(alpha, 'debe listar SyntheticAlpha')
  assert.equal(alpha.supported, true)
  assert.equal(alpha.name, 'Synthetic Alpha')
  assert.equal(alpha.minecraftVersion, '1.20.1')
  assert.equal(alpha.loader, 'fabric')
  assert.equal(alpha.loaderVersion, '0.16.9')
  assert.ok(alpha.gameDir.endsWith(path.join('SyntheticAlpha', 'minecraft')), 'carpeta de juego minecraft/ (formato real)')
  assert.ok(typeof alpha.sizeBytes === 'number')
  const broken = result.instances.find(i => i.id === 'SyntheticBroken')
  assert.ok(broken && broken.supported === false, 'sin metadatos => no compatible')
  assert.match(broken.reason, /metadatos/)
})

test('prism: loader indeterminado nunca se elige a ciegas', () => {
  const parsed = prism.parseMmcPack({ components: [{ uid: 'net.minecraft', version: '1.21.1' }] })
  assert.equal(parsed.minecraftVersion, '1.21.1')
  assert.equal(parsed.loader, null)
  // Formato real: `name=` minúscula; `Name=` se tolera.
  assert.equal(prism.parseInstanceCfg('[General]\nname=Real').name, 'Real')
  const tolerated = prism.parseInstanceCfg('[General]\nName=Tolerado')
  assert.equal(tolerated.Name, 'Tolerado')
})

test('curseforge: parsea instancia sintética y rechaza lo indeterminado', () => {
  const parsed = curseforge.parseMinecraftInstance({ name: 'X', gameVersion: '1.20.1', modLoader: 'forge-47.4.16' })
  assert.equal(parsed.minecraftVersion, '1.20.1')
  assert.equal(parsed.loader, 'forge')
  // Formato real: baseModLoader + isVanilla.
  const real = curseforge.parseMinecraftInstance({
    name: 'R', gameVersion: '26.3', isVanilla: false,
    baseModLoader: { name: 'fabric-0.19.5-26.3', type: 4, forgeVersion: '0.19.5', minecraftVersion: '26.3' }
  })
  assert.equal(real.minecraftVersion, '26.3')
  assert.equal(real.loader, 'fabric')
  assert.equal(real.loaderVersion, '0.19.5')
  const vanilla = curseforge.parseMinecraftInstance({ name: 'V', gameVersion: '1.21.1', isVanilla: true })
  assert.equal(vanilla.loader, 'vanilla')
  const unknown = curseforge.parseMinecraftInstance({ name: 'Y' })
  assert.equal(unknown.loader, null)
  assert.equal(unknown.minecraftVersion, null)
  const result = curseforge.listInstances(path.join(fixtures, 'curseforge', 'Instances'))
  assert.equal(result.ok, true)
  const pack = result.instances.find(i => i.id === 'SyntheticPack')
  assert.ok(pack && pack.supported === true, 'pack sintético soportado')
  assert.equal(pack.loader, 'fabric')
  assert.equal(pack.loaderVersion, '0.16.9')
  assert.equal(pack.minecraftVersion, '1.20.1')
  const empty = result.instances.find(i => i.id === 'SyntheticEmpty')
  assert.ok(empty && empty.supported === false, 'sin json => no compatible')
})

test('modrinth: parsea filas sintéticas de app.db y nunca toca tablas de credenciales', () => {
  const profilesDir = path.join(fixtures, 'prism', 'instances', 'SyntheticAlpha')
  const rows = modrinth.parseDbRows({
    instanceRows: [
      { id: 'synthetic:1', name: 'Synthetic One', path: 'minecraft' },
      { id: 'synthetic:2', name: 'Synthetic NoLoader', path: 'minecraft' },
      { id: 'synthetic:3', name: 'Synthetic Missing', path: 'no-existe' }
    ],
    contentSets: [
      { instance_id: 'synthetic:1', game_version: '1.21.11', loader: 'fabric', loader_version: '0.18.4' },
      { instance_id: 'synthetic:2', game_version: '1.21.11', loader: 'misterioso', loader_version: null }
    ],
    profilesDir
  })
  assert.equal(rows[0].supported, true)
  assert.equal(rows[0].loader, 'fabric')
  assert.equal(rows[0].minecraftVersion, '1.21.11')
  assert.equal(rows[1].supported, false, 'loader desconocido => no compatible')
  assert.match(rows[1].reason, /Loader indeterminado/)
  assert.equal(rows[2].supported, false, 'carpeta ausente => no compatible')
  // Auditoría: el lector SQL solo nombra tablas permitidas en FROM.
  const source = fs.readFileSync(path.join(__dirname, '..', 'external-launchers', 'modrinth.js'), 'utf8')
  const froms = [...source.matchAll(/FROM\s+([a-z_]+)/gi)].map(m => m[1].toLowerCase())
  assert.ok(froms.length > 0, 'debe haber SELECTs')
  for (const table of froms) {
    assert.ok(!modrinth.NEVER_TABLES.includes(table), `tabla prohibida en FROM: ${table}`)
  }
})

test('sklauncher: distingue instancia con versión de placeholder latest-release', () => {
  const dataRoot = path.join(fixtures, 'sk')
  const json = JSON.parse(fs.readFileSync(path.join(dataRoot, 'instances.json'), 'utf8'))
  const entries = sklauncher.parseSkInstances(json, dataRoot)
  const selve = entries.find(e => e.id === 'synthetic-selve')
  assert.ok(selve && selve.supported === true, 'selve sintético soportado')
  assert.equal(selve.loader, 'neoforge')
  assert.equal(selve.minecraftVersion, '1.21.1')
  assert.equal(selve.loaderVersion, '21.1.247')
  const latest = entries.find(e => e.id === 'synthetic-latest')
  assert.ok(latest && latest.supported === false, 'latest-release => versión indeterminada')
  assert.match(latest.reason, /indeterminada/)
  const parsed = sklauncher.parseVersionId('1.21.1-neoforge-21.1.247')
  assert.equal(parsed.mc, '1.21.1')
  assert.equal(parsed.loader, 'neoforge')
})

test('official: perfiles compartidos se marcan shared y neoforge sin MC no es compatible', () => {
  const root = path.join(fixtures, 'official')
  const raw = fs.readFileSync(path.join(root, 'launcher_profiles.json'), 'utf8')
    .split('$FIXTURE').join(root.split(path.sep).join('/'))
  const entries = official.parseLauncherProfiles(JSON.parse(raw), root)
  const sharedProfile = entries.find(e => e.id === 'synthetic-shared-vanilla')
  assert.ok(sharedProfile, 'perfil compartido listado')
  assert.equal(sharedProfile.shared, true)
  assert.equal(sharedProfile.loader, 'vanilla')
  assert.equal(sharedProfile.supported, true)
  const forge = entries.find(e => e.id === 'synthetic-custom-forge')
  assert.ok(forge && forge.shared === false, 'gameDir propio => no compartido')
  assert.equal(forge.loader, 'forge')
  assert.equal(forge.minecraftVersion, '1.20.1')
  const neo = entries.find(e => e.id === 'synthetic-neoforge-nomc')
  assert.ok(neo && neo.supported === false, 'neoforge sin MC => no compatible')
  assert.equal(official.parseLastVersionId('fabric-loader-0.17.2-1.20.1').loader, 'fabric')
  assert.equal(official.parseLastVersionId('latest-release').minecraftVersion, null)
})

test('candidateRoots no toca el sistema cuando se inyecta env', () => {
  const fakeEnv = { APPDATA: 'C:/synthetic-noexiste-xyz/AppData', HOME: 'C:/synthetic-noexiste-xyz/home', USERPROFILE: 'C:/synthetic-noexiste-xyz/home' }
  for (const adapter of [prism, curseforge, modrinth, sklauncher, official]) {
    const roots = adapter.candidateRoots({ platform: 'win32', env: fakeEnv })
    assert.ok(Array.isArray(roots) && roots.length > 0, `${adapter.id} propone raíces`)
    for (const root of roots) {
      const normalized = root.split(path.sep).join('/')
      assert.ok(normalized.startsWith('C:/synthetic-noexiste-xyz'), `${adapter.id}: debe usar el env inyectado, no el real`)
    }
    const detected = adapter.detect({ platform: 'win32', env: fakeEnv })
    assert.ok(detected.every(d => d.source === 'default'))
    const manual = adapter.detect({ overrideRoot: path.join(fixtures, 'prism') })
    assert.equal(manual[0].source, 'manual')
  }
})

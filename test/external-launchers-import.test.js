// Kindyr Launcher - Copyright (C) 2026 iDontrixss
// This program is free software: you can redistribute it and/or modify
// it under the terms of the GNU General Public License as published by
// the Free Software Foundation, either version 3 of the License, or
// (at your option) any later version.
// SPDX-License-Identifier: GPL-3.0-or-later

// P2/P3/P4/P8/P9: motor de copia, WAL, whitelist y purga.
// Orígenes sintéticos en tmp (mkdtemp). Ninguna prueba toca instalaciones reales.

const test = require('node:test')
const assert = require('node:assert/strict')
const crypto = require('crypto')
const fs = require('fs')
const os = require('os')
const path = require('path')

const shared = require('../external-launchers/shared')
const prism = require('../external-launchers/prism')
const curseforge = require('../external-launchers/curseforge')
const modrinth = require('../external-launchers/modrinth')
const sklauncher = require('../external-launchers/sklauncher')
const official = require('../external-launchers/official')
const importer = require('../external-launchers/importer')

function mkTmp(prefix) {
  return fs.mkdtempSync(path.join(os.tmpdir(), prefix))
}

function writeFile(file, content) {
  fs.mkdirSync(path.dirname(file), { recursive: true })
  fs.writeFileSync(file, content)
}

// Foto de carpeta: nombre + tamaño + mtime. Para demostrar origen intacto.
function snapshotDir(dir) {
  const out = []
  const stack = [dir]
  while (stack.length) {
    const current = stack.pop()
    for (const entry of fs.readdirSync(current, { withFileTypes: true })) {
      const full = path.join(current, entry.name)
      if (entry.isDirectory()) {
        stack.push(full)
      } else {
        const stat = fs.statSync(full)
        out.push({ rel: path.relative(dir, full), size: stat.size, mtimeMs: stat.mtimeMs })
      }
    }
  }
  return out.sort((a, b) => (a.rel < b.rel ? -1 : 1))
}

test('P2: app.db en WAL se lee sobre copia temporal y el origen queda intacto', () => {
  const { DatabaseSync } = require('node:sqlite')
  const origin = mkTmp('kindyr-test-wal-origin-')
  try {
    const dbPath = path.join(origin, 'app.db')
    const writer = new DatabaseSync(dbPath)
    try {
      writer.exec('PRAGMA journal_mode=WAL')
      writer.exec('CREATE TABLE instances (id TEXT, name TEXT, path TEXT)')
      writer.exec(`CREATE TABLE instance_content_sets (instance_id TEXT, game_version TEXT, loader TEXT, loader_version TEXT)`)
      writer.exec(`INSERT INTO instances VALUES ('synthetic:1', 'Synthetic WAL', 'profile-one')`)
      writer.exec(`INSERT INTO instance_content_sets VALUES ('synthetic:1', '1.21.11', 'fabric', '0.18.4')`)
      // writer abierto => frames sin checkpoint => app.db-wal presente.
      assert.ok(fs.existsSync(dbPath + '-wal'), 'el fixture debe estar en WAL con -wal presente')
      const before = snapshotDir(origin)
      const read = modrinth.readAppDb(dbPath)
      const after = snapshotDir(origin)
      assert.deepEqual(after, before, 'la carpeta de origen no debe cambiar (ni tamaños ni fechas)')
      assert.equal(read.ok, true)
      assert.equal(read.instanceRows.length, 1)
      assert.equal(read.contentSets[0].loader, 'fabric')
    } finally {
      writer.close()
    }
  } finally {
    fs.rmSync(origin, { recursive: true, force: true })
  }
})

test('P3: campos fuera de whitelist (tokens falsos) nunca salen del adaptador', () => {
  const skRoot = mkTmp('kindyr-test-sk-')
  const ofRoot = mkTmp('kindyr-test-of-')
  const prismRoot = mkTmp('kindyr-test-prism-')
  try {
    fs.mkdirSync(path.join(skRoot, 'instances', 'x'), { recursive: true })
    writeFile(path.join(skRoot, 'instances', 'x', 'options.txt'), 'synthetic')
    const skEntries = sklauncher.parseSkInstances({
      instances: [{ id: 'x', name: 'X', gameType: 'forge', minecraftVersion: '1.20.1', loaderVersion: '47.4.0', accessToken: 'FAKE-TOKEN-SK-123', refreshToken: 'FAKE-SECRET-SK' }]
    }, skRoot)

    writeFile(path.join(ofRoot, 'options.txt'), 'synthetic')
    const ofEntries = official.parseLauncherProfiles({
      profiles: { p1: { name: 'A', lastVersionId: '1.21.1', clientToken: 'FAKE-TOKEN-OF-456', auth: { access: 'FAKE' } } }
    }, ofRoot)

    const mrEntries = modrinth.parseDbRows({
      instanceRows: [{ id: 'm:1', name: 'M', path: 'p', access_token: 'FAKE-TOKEN-MR-789' }],
      contentSets: [{ instance_id: 'm:1', game_version: '1.21.11', loader: 'fabric', loader_version: '0.18.4' }],
      profilesDir: skRoot
    })

    const cfParsed = curseforge.parseMinecraftInstance({ name: 'C', gameVersion: '1.20.1', modLoader: 'forge-1', apiKey: 'FAKE-TOKEN-CF-000' })

    const instDir = path.join(prismRoot, 'instances', 'P')
    writeFile(path.join(instDir, 'instance.cfg'), 'Name=Synthetic P\nSecret=FAKE-TOKEN-PRISM-111\n')
    writeFile(path.join(instDir, 'mmc-pack.json'), JSON.stringify({ _synthetic: true, token: 'FAKE-TOKEN-PRISM-222', components: [{ uid: 'net.minecraft', version: '1.20.1' }] }))
    const prismResult = prism.listInstances(prismRoot)

    const dump = JSON.stringify({ skEntries, ofEntries, mrEntries, cfParsed, prismResult })
    for (const token of ['FAKE-TOKEN-SK', 'FAKE-SECRET-SK', 'FAKE-TOKEN-OF', 'FAKE-TOKEN-MR', 'FAKE-TOKEN-CF', 'FAKE-TOKEN-PRISM']) {
      assert.ok(!dump.includes(token), `fuga de ${token} en salida de adaptador`)
    }
    assert.equal(skEntries[0].supported, true, 'el parse válido sigue funcionando')
  } finally {
    for (const dir of [skRoot, ofRoot, prismRoot]) fs.rmSync(dir, { recursive: true, force: true })
  }
})

test('P3: los adaptadores y el importer no escriben en logs', () => {
  for (const file of ['shared.js', 'prism.js', 'curseforge.js', 'modrinth.js', 'sklauncher.js', 'official.js', 'importer.js']) {
    const source = fs.readFileSync(path.join(__dirname, '..', 'external-launchers', file), 'utf8')
    assert.ok(!/console\.(log|info|debug|warn|error)/.test(source), `${file} no debe loguear (origen no confiable)`)
  }
})

function makeGameSource(root) {
  writeFile(path.join(root, 'mods', 'a.jar'), 'synthetic-mod-content')
  writeFile(path.join(root, 'config', 'c.cfg'), 'synthetic-config')
  writeFile(path.join(root, 'saves', 'world', 'level.dat'), 'synthetic-save')
  writeFile(path.join(root, 'resourcepacks', 'r.zip'), 'synthetic-rp')
  writeFile(path.join(root, 'shaderpacks', 's.zip'), 'synthetic-shader')
  writeFile(path.join(root, 'options.txt'), 'synthetic-options')
  writeFile(path.join(root, 'servers.dat'), 'synthetic-servers')
  writeFile(path.join(root, 'logs', 'latest.log'), 'synthetic-log-excluido')
  writeFile(path.join(root, 'crash-reports', 'c.txt'), 'synthetic-crash-excluido')
  writeFile(path.join(root, 'cache', 'c.bin'), 'synthetic-cache-excluida')
  return root
}

test('P8: importación real estilo Modrinth respeta allowlist y registra', async () => {
  const origin = mkTmp('kindyr-test-src-mr-')
  const dataRoot = mkTmp('kindyr-test-data-')
  try {
    makeGameSource(path.join(origin, 'profiles', 'Synthetic One'))
    const before = snapshotDir(origin)
    const result = await importer.copyExternalInstance({
      gameDir: path.join(origin, 'profiles', 'Synthetic One'),
      name: 'Synthetic Import',
      minecraftVersion: '1.21.11',
      loader: 'fabric',
      loaderVersion: '0.18.4',
      source: 'modrinth'
    }, { dataRoot })
    assert.equal(result.ok, true)
    const mc = result.minecraftRoot
    assert.equal(fs.readFileSync(path.join(mc, 'mods', 'a.jar'), 'utf8'), 'synthetic-mod-content')
    assert.equal(fs.readFileSync(path.join(mc, 'options.txt'), 'utf8'), 'synthetic-options')
    assert.ok(fs.existsSync(path.join(mc, 'servers.dat')), 'servers.dat se copia')
    assert.ok(!fs.existsSync(path.join(mc, 'logs')), 'logs excluido')
    assert.ok(!fs.existsSync(path.join(mc, 'crash-reports')), 'crash-reports excluido')
    assert.ok(!fs.existsSync(path.join(mc, 'cache')), 'caché excluida')
    const instance = JSON.parse(fs.readFileSync(path.join(result.destDir, 'instance.json'), 'utf8'))
    assert.equal(instance.loader, 'fabric')
    assert.equal(instance.source, 'external:modrinth')
    const registry = JSON.parse(fs.readFileSync(path.join(dataRoot, 'instances.json'), 'utf8'))
    assert.ok(registry.some(item => item.id === result.instanceId), 'registrada en instances.json')
    assert.deepEqual(snapshotDir(origin), before, 'origen intacto tras importar')
  } finally {
    fs.rmSync(origin, { recursive: true, force: true })
    fs.rmSync(dataRoot, { recursive: true, force: true })
  }
})

test('P8: importación real estilo SKLauncher con selección parcial y sufijo por duplicado', async () => {
  const origin = mkTmp('kindyr-test-src-sk-')
  const dataRoot = mkTmp('kindyr-test-data-')
  try {
    makeGameSource(path.join(origin, 'instances', 'synthetic-selve'))
    importer.saveRegistry(dataRoot, [{ id: 'otra', name: 'Selve' }])
    const result = await importer.copyExternalInstance({
      gameDir: path.join(origin, 'instances', 'synthetic-selve'),
      name: 'Selve',
      minecraftVersion: '1.21.1',
      loader: 'neoforge',
      loaderVersion: '21.1.247',
      source: 'sklauncher'
    }, { dataRoot, selection: { ...importer.DEFAULT_SELECTION, shaderpacks: false } })
    assert.equal(result.ok, true)
    assert.equal(result.name, 'Selve (2)', 'nombre duplicado => sufijo, sin sobrescribir')
    assert.ok(fs.existsSync(path.join(result.minecraftRoot, 'saves', 'world', 'level.dat')), 'saves se copia')
    assert.ok(!fs.existsSync(path.join(result.minecraftRoot, 'shaderpacks')), 'selección parcial: shaderpacks no')
  } finally {
    fs.rmSync(origin, { recursive: true, force: true })
    fs.rmSync(dataRoot, { recursive: true, force: true })
  }
})

test('P4: cancelación a mitad de copia limpia el staging y no registra', async () => {
  const origin = mkTmp('kindyr-test-src-cancel-')
  const dataRoot = mkTmp('kindyr-test-data-')
  try {
    const gameDir = path.join(origin, 'game')
    for (let i = 0; i < 8; i++) {
      writeFile(path.join(gameDir, 'mods', `big-${i}.jar`), crypto.randomBytes(512 * 1024))
    }
    writeFile(path.join(gameDir, 'options.txt'), 'x')
    const controller = new AbortController()
    let calls = 0
    const result = await importer.copyExternalInstance({
      gameDir, name: 'Cancelada', minecraftVersion: '1.20.1', loader: 'vanilla', loaderVersion: '', source: 'prism'
    }, {
      dataRoot,
      signal: controller.signal,
      onProgress: () => {
        calls++
        if (calls === 1) controller.abort()
      }
    })
    assert.equal(result.cancelled, true)
    assert.equal(result.ok, false)
    const leftovers = fs.readdirSync(dataRoot).filter(name => name.startsWith(importer.STAGING_PREFIX))
    assert.deepEqual(leftovers, [], 'sin staging tras cancelar')
    assert.ok(!fs.existsSync(path.join(dataRoot, 'instances.json')), 'cancelada => sin registro')
    const instances = fs.existsSync(path.join(dataRoot, 'instances')) ? fs.readdirSync(path.join(dataRoot, 'instances')) : []
    assert.deepEqual(instances, [], 'cancelada => sin destino')
  } finally {
    fs.rmSync(origin, { recursive: true, force: true })
    fs.rmSync(dataRoot, { recursive: true, force: true })
  }
})

test('P4: la purga solo toca staging con prefijo propio, nunca instances/', () => {
  const dataRoot = mkTmp('kindyr-test-data-')
  const tmpRoot = mkTmp('kindyr-test-tmp-')
  try {
    fs.mkdirSync(path.join(dataRoot, importer.STAGING_PREFIX + 'zzz'), { recursive: true })
    fs.mkdirSync(path.join(dataRoot, 'instances', 'keepme'), { recursive: true })
    writeFile(path.join(dataRoot, 'instances', 'keepme', 'instance.json'), '{}')
    fs.mkdirSync(path.join(dataRoot, 'otherdir'), { recursive: true })
    fs.mkdirSync(path.join(tmpRoot, 'kindyr-modrinth-db-zzz'), { recursive: true })
    fs.mkdirSync(path.join(tmpRoot, 'otro'), { recursive: true })
    const { removed } = importer.purgeStaleTempDirs(dataRoot, tmpRoot)
    assert.ok(removed.some(name => name.includes('zzz')), 'purga staging propio')
    assert.ok(fs.existsSync(path.join(dataRoot, 'instances', 'keepme', 'instance.json')), 'instances/ intacto')
    assert.ok(fs.existsSync(path.join(dataRoot, 'otherdir')), 'resto intacto')
    assert.ok(fs.existsSync(path.join(tmpRoot, 'otro')), 'tmp ajeno intacto')
  } finally {
    fs.rmSync(dataRoot, { recursive: true, force: true })
    fs.rmSync(tmpRoot, { recursive: true, force: true })
  }
})

test('P7/P9: macOS no propone raíces; carpetas compartidas se resumen con total', () => {
  assert.ok(shared.platformNote('darwin'), 'darwin => no soportado')
  assert.equal(shared.platformNote('win32'), null)
  assert.equal(shared.platformNote('linux'), null)
  for (const adapter of [prism, curseforge, modrinth, sklauncher, official]) {
    assert.deepEqual(
      adapter.candidateRoots({ platform: 'darwin', env: { APPDATA: 'C:/x', HOME: 'C:/x', USERPROFILE: 'C:/x' } }),
      [],
      `${adapter.id} sin raíces en macOS`
    )
  }
  const summary = shared.summarizeGameDirs([
    { id: 'a', name: 'A', gameDir: 'C:/shared/.minecraft', sizeBytes: 100 },
    { id: 'b', name: 'B', gameDir: 'C:/shared/.minecraft', sizeBytes: 50 },
    { id: 'c', name: 'C', gameDir: 'C:/otro', sizeBytes: null }
  ])
  assert.equal(summary.totalBytes, 150)
  assert.equal(summary.unknownSize, true)
  const dup = summary.groups.find(group => group.names.length === 2)
  assert.ok(dup && dup.shared === true, 'misma carpeta dos veces => shared para avisar en Fase 3')
})

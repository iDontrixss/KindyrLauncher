// Kindyr Launcher - Copyright (C) 2026 iDontrixss
// This program is free software: you can redistribute it and/or modify
// it under the terms of the GNU General Public License as published by
// the Free Software Foundation, either version 3 of the License, or
// (at your option) any later version.
// SPDX-License-Identifier: GPL-3.0-or-later

const test = require('node:test')
const assert = require('node:assert/strict')
const fs = require('fs')
const path = require('path')

const {
  resolveCurseForgeModLoaderId,
  curseForgeHashesToMap,
  parseCurseForgeManifest,
  mapCurseForgeOverrideEntry
} = require('../curseforge-modpack')

const root = path.resolve(__dirname, '..')
const mainSource = fs.readFileSync(path.join(root, 'main.js'), 'utf8')

test('resolves curseforge modloader ids like modrinth loaders', () => {
  assert.deepEqual(resolveCurseForgeModLoaderId('forge-47.2.0'), { loader: 'forge', loaderVersion: '47.2.0' })
  assert.deepEqual(resolveCurseForgeModLoaderId('fabric-0.16.9'), { loader: 'fabric', loaderVersion: '0.16.9' })
  assert.deepEqual(resolveCurseForgeModLoaderId('neoforge-21.1.2'), { loader: 'neoforge', loaderVersion: '21.1.2' })
  assert.deepEqual(resolveCurseForgeModLoaderId('quilt-8.2.0'), { loader: 'quilt', loaderVersion: '8.2.0' })
  assert.deepEqual(resolveCurseForgeModLoaderId('any'), { loader: 'vanilla', loaderVersion: '' })
  assert.deepEqual(resolveCurseForgeModLoaderId('desconocido-1.0'), { loader: 'vanilla', loaderVersion: '' })
})

test('maps curseforge hashes by length for later verification', () => {
  const sha1 = 'a'.repeat(40)
  const sha512 = 'b'.repeat(128)
  assert.deepEqual(curseForgeHashesToMap([{ value: sha1, algo: 1 }]), { sha1 })
  assert.deepEqual(curseForgeHashesToMap([{ value: sha512, algo: 2 }]), { sha512 })
  assert.deepEqual(curseForgeHashesToMap([{ value: 'c'.repeat(32), algo: 3 }]), {})
  assert.deepEqual(curseForgeHashesToMap([]), {})
})

test('parses a curseforge manifest and rejects hostile entries', () => {
  const parsed = parseCurseForgeManifest({
    manifestType: 'minecraftModpack',
    name: 'Pack de prueba',
    minecraft: { version: '1.20.1', modLoaders: [{ id: 'forge-47.2.0', primary: true }] },
    overrides: 'overrides',
    files: [{ projectID: 123, fileID: 456, required: true }]
  })
  assert.equal(parsed.name, 'Pack de prueba')
  assert.equal(parsed.minecraftVersion, '1.20.1')
  assert.equal(parsed.loader, 'forge')
  assert.equal(parsed.loaderVersion, '47.2.0')
  assert.equal(parsed.files.length, 1)
  assert.throws(() => parseCurseForgeManifest({ manifestType: 'otro' }), /modpack/)
  assert.throws(() => parseCurseForgeManifest({
    manifestType: 'minecraftModpack',
    minecraft: { version: '1.20.1', modLoaders: [] },
    files: [{ projectID: 'x', fileID: 1 }]
  }), /inválida/)
})

test('only maps overrides entries, never escapes the instance', () => {
  assert.equal(mapCurseForgeOverrideEntry('overrides/config/opciones.txt'), 'config/opciones.txt')
  assert.equal(mapCurseForgeOverrideEntry('mods/algo.jar'), null)
  assert.equal(mapCurseForgeOverrideEntry('overrides/../evil.jar'), null)
})

test('curseforge modpacks install as instances like modrinth mrpacks', () => {
  assert.match(mainSource, /parseCurseForgeManifest/)
  assert.match(mainSource, /function installCurseForgeModpackInstance\(file, project\)/)
  assert.match(mainSource, /installCurseForgeModpackInstance\(file, project\)/)
  assert.match(mainSource, /downloadCurseForgeModpackEntry[\s\S]*verifyMrpackFile/)
})

// Kindyr Launcher - Copyright (C) 2026 iDontrixss
// This program is free software: you can redistribute it and/or modify
// it under the terms of the GNU General Public License as published by
// the Free Software Foundation, either version 3 of the License, or
// (at your option) any later version.
// SPDX-License-Identifier: GPL-3.0-or-later

// Detección de tipo por contenido (no por extensión) para subidas: .jar con
// descriptor de mod reconocido, .zip modpack/resourcepack/shader/datapack.
// Fixtures ZIP reales construidos con writeZip; sin dependencias nuevas.
const test = require('node:test')
const assert = require('node:assert/strict')
const fs = require('fs')
const os = require('os')
const path = require('path')
const { writeZip } = require('../archive-utils')
const { MAX_UPLOAD_BLOB_BYTES, classifyJarContent, classifyZipContent, writeStagedBlob } = require('../content-sniff')

async function withTemporaryDirectory(callback) {
  const directory = await fs.promises.mkdtemp(path.join(os.tmpdir(), 'kindyr-sniff-'))
  try {
    await callback(directory)
  } finally {
    await fs.promises.rm(directory, { recursive: true, force: true })
  }
}

async function makeZip(directory, name, entries) {
  const archive = path.join(directory, name)
  await writeZip(archive, zip => {
    for (const [data, entryName] of entries) zip.addBuffer(Buffer.from(data), entryName)
  })
  return archive
}

test('reconoce mods Forge, NeoForge, Fabric, Quilt y legacy por descriptor', async () => {
  await withTemporaryDirectory(async directory => {
    assert.deepEqual(await classifyJarContent(await makeZip(directory, 'forge.jar', [['t', 'META-INF/mods.toml']])), { kind: 'mod', loader: 'forge' })
    assert.deepEqual(await classifyJarContent(await makeZip(directory, 'neo.jar', [['t', 'META-INF/neoforge.mods.toml']])), { kind: 'mod', loader: 'neoforge' })
    assert.deepEqual(await classifyJarContent(await makeZip(directory, 'fabric.jar', [['{}', 'fabric.mod.json']])), { kind: 'mod', loader: 'fabric' })
    assert.deepEqual(await classifyJarContent(await makeZip(directory, 'quilt.jar', [['{}', 'quilt.mod.json']])), { kind: 'mod', loader: 'quilt' })
    assert.deepEqual(await classifyJarContent(await makeZip(directory, 'legacy.jar', [['[]', 'mcmod.info']])), { kind: 'mod', loader: 'forge-legacy' })
  })
})

test('jar multi-loader sigue siendo mod; jar sin descriptor es unknown', async () => {
  await withTemporaryDirectory(async directory => {
    const multi = await makeZip(directory, 'multi.jar', [['{}', 'fabric.mod.json'], ['t', 'META-INF/mods.toml']])
    assert.equal((await classifyJarContent(multi)).kind, 'mod')
    const plain = await makeZip(directory, 'plain.jar', [['x', 'foo.txt']])
    assert.deepEqual(await classifyJarContent(plain), { kind: 'unknown' })
  })
})

test('zip con índice de modpack se detecta antes que cualquier otra cosa', async () => {
  await withTemporaryDirectory(async directory => {
    const mrpack = await makeZip(directory, 'pack.zip', [['{}', 'modrinth.index.json'], ['{}', 'pack.mcmeta']])
    assert.deepEqual(await classifyZipContent(mrpack), { kind: 'modpack' })
    const cfpack = await makeZip(directory, 'cf.zip', [['{}', 'manifest.json']])
    assert.deepEqual(await classifyZipContent(cfpack), { kind: 'modpack' })
    // Un .mrpack es un zip: el contenido manda, no la extensión.
    const mrpackExt = await makeZip(directory, 'pack.mrpack', [['{}', 'modrinth.index.json']])
    assert.deepEqual(await classifyZipContent(mrpackExt), { kind: 'modpack' })
  })
})

test('pack.mcmeta válido decide resourcepack vs datapack por árbol', async () => {
  await withTemporaryDirectory(async directory => {
    const meta = JSON.stringify({ pack: { pack_format: 15, description: 'x' } })
    const rp = await makeZip(directory, 'rp.zip', [[meta, 'pack.mcmeta'], ['x', 'assets/minecraft/x.png']])
    assert.deepEqual(await classifyZipContent(rp), { kind: 'resourcepack' })
    const dp = await makeZip(directory, 'dp.zip', [[meta, 'pack.mcmeta'], ['x', 'data/minecraft/x.json']])
    assert.deepEqual(await classifyZipContent(dp), { kind: 'datapack' })
  })
})

test('shaders/ en raíz es shader; resto es unknown', async () => {
  await withTemporaryDirectory(async directory => {
    const sh = await makeZip(directory, 'sh.zip', [['x', 'shaders/gbuffers.txt']])
    assert.deepEqual(await classifyZipContent(sh), { kind: 'shader' })
    const garbage = await makeZip(directory, 'g.zip', [['x', 'readme.txt']])
    assert.deepEqual(await classifyZipContent(garbage), { kind: 'unknown' })
    const badMeta = await makeZip(directory, 'b.zip', [['no-json', 'pack.mcmeta']])
    assert.deepEqual(await classifyZipContent(badMeta), { kind: 'unknown' })
  })
})

test('archivo que no es ZIP lanza (el llamador lo marca unreadable)', async () => {
  await withTemporaryDirectory(async directory => {
    const fake = path.join(directory, 'fake.jar')
    await fs.promises.writeFile(fake, 'esto no es un zip')
    await assert.rejects(() => classifyJarContent(fake))
  })
})

test('writeStagedBlob escribe bytes con escritura exclusiva y cotas', async () => {
  assert.equal(MAX_UPLOAD_BLOB_BYTES, 256 * 1024 * 1024)
  await withTemporaryDirectory(async directory => {
    const staging = path.join(directory, 'staging')
    const dest = writeStagedBlob(staging, 'mod.jar', new Uint8Array([80, 75, 3, 4]))
    assert.equal(await fs.promises.readFile(dest, 'utf8'), 'PK\u0003\u0004')
    assert.throws(() => writeStagedBlob(staging, 'mod.jar', Buffer.from('x')), /EEXIST/)
    assert.throws(() => writeStagedBlob(staging, '', Buffer.from('x')), /inválido/)
    assert.throws(() => writeStagedBlob(staging, '..', Buffer.from('x')), /inválido/)
  })
})

// Kindyr Launcher - Copyright (C) 2026 iDontrixss
// This program is free software: you can redistribute it and/or modify
// it under the terms of the GNU General Public License as published by
// the Free Software Foundation, either version 3 of the License, or
// (at your option) any later version.
// SPDX-License-Identifier: GPL-3.0-or-later

const test = require('node:test')
const assert = require('node:assert/strict')
const crypto = require('crypto')
const fs = require('fs')
const os = require('os')
const path = require('path')
const {
  getClientMrpackFiles,
  normalizeMrpackPath,
  verifyMrpackFile
} = require('../mrpack-utils')

test('selects client files from a Modrinth pack and preserves fallback downloads', () => {
  const result = getClientMrpackFiles({ files: [
    { path: 'mods/example.jar', downloads: ['https://cdn.modrinth.com/example.jar'], hashes: { sha1: 'abc' } },
    { path: 'server-only.jar', downloads: ['https://cdn.modrinth.com/server.jar'], env: { client: 'unsupported' } },
    { path: '../outside.jar', downloads: ['https://example.com/outside.jar'] },
    { path: 'mods/insecure.jar', downloads: ['http://example.com/insecure.jar'] }
  ] })

  assert.equal(result.accepted.length, 1)
  assert.equal(result.accepted[0].path, 'mods/example.jar')
  assert.equal(result.unsupported, 1)
  assert.equal(result.rejected.length, 2)
})

test('rejects unsafe mrpack paths', () => {
  assert.throws(() => normalizeMrpackPath('../outside'), /insegura/)
  assert.throws(() => normalizeMrpackPath('/absolute'), /insegura/)
  assert.equal(normalizeMrpackPath('./mods/example.jar'), 'mods/example.jar')
  // P0-2: alineado con SafeRelativeUtf8UnixPathBuf
  assert.throws(() => normalizeMrpackPath('mods\\example.jar'), /insegura/)
  assert.throws(() => normalizeMrpackPath('CON.txt'), /insegura/)
  assert.throws(() => normalizeMrpackPath('mods/CON.jar'), /insegura/)
  assert.throws(() => normalizeMrpackPath('NUL'), /insegura/)
  assert.throws(() => normalizeMrpackPath('mods/COM1.jar'), /insegura/)
  assert.throws(() => normalizeMrpackPath('mods/CON.txt:ads'), /insegura/)
  assert.throws(() => normalizeMrpackPath('mods//example.jar'), /insegura/)
  assert.throws(() => normalizeMrpackPath('mods/example\0.jar'), /insegura/)
  // Permitido: '.' es current y se normaliza
  assert.equal(normalizeMrpackPath('mods/./example.jar'), 'mods/example.jar')
})

test('rejects mrpack files without verifiable hash', () => {
  const result = getClientMrpackFiles({ files: [
    { path: 'mods/nohash.jar', downloads: ['https://cdn.modrinth.com/nohash.jar'], hashes: {} },
    { path: 'mods/emptyhash.jar', downloads: ['https://cdn.modrinth.com/empty.jar'], hashes: { sha1: '' } },
    { path: 'mods/good.jar', downloads: ['https://cdn.modrinth.com/good.jar'], hashes: { sha1: 'abc' } }
  ]})
  assert.equal(result.accepted.length, 1)
  assert.equal(result.accepted[0].path, 'mods/good.jar')
  assert.equal(result.rejected.length, 2)
})

test('verifies downloaded files with SHA-1 preferred (Modrinth canonical), SHA-512 fallback', async () => {
  const directory = fs.mkdtempSync(path.join(os.tmpdir(), 'kindyr-mrpack-'))
  const file = path.join(directory, 'mod.jar')
  try {
    fs.writeFileSync(file, 'mod content')
    const sha1 = crypto.createHash('sha1').update('mod content').digest('hex')
    const sha512 = crypto.createHash('sha512').update('mod content').digest('hex')
    // SHA-1 correcto + SHA-512 incorrecto => true (usa SHA-1)
    assert.equal(await verifyMrpackFile(file, { sha1, sha512: 'wrong' }), true)
    // SHA-1 incorrecto + SHA-512 correcto => false (prioriza SHA-1, falla)
    assert.equal(await verifyMrpackFile(file, { sha1: 'wrong', sha512 }), false)
    // Solo SHA-512 correcto (fallback) => true
    assert.equal(await verifyMrpackFile(file, { sha512 }), true)
    assert.equal(await verifyMrpackFile(file, { sha512: 'wrong' }), false)
    // Sin hash verificable => false (P0-4, no aceptar sin hash)
    assert.equal(await verifyMrpackFile(file, {}), false)
    assert.equal(await verifyMrpackFile(file, { sha1: '' }), false)
  } finally {
    fs.rmSync(directory, { recursive: true, force: true })
  }
})

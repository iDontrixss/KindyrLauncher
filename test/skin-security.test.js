// Kindyr Launcher - Copyright (C) 2026 iDontrixss
// This program is free software: you can redistribute it and/or modify
// it under the terms of the GNU General Public License as published by
// the Free Software Foundation, either version 3 of the License, or
// (at your option) any later version.
// SPDX-License-Identifier: GPL-3.0-or-later

const test = require('node:test')
const assert = require('node:assert/strict')
const {
  MAX_SKIN_BYTES,
  sanitizeSkinName,
  validateSkinPng,
  validateSkinSourceUrl
} = require('../skin-security')

function fakePng(width = 64, height = 64) {
  const bytes = Buffer.alloc(24)
  Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]).copy(bytes)
  bytes.writeUInt32BE(width, 16)
  bytes.writeUInt32BE(height, 20)
  return bytes
}

test('accepts supported Minecraft skin dimensions', () => {
  assert.equal(validateSkinPng(fakePng(64, 64)).length, 24)
  assert.equal(validateSkinPng(fakePng(64, 32)).length, 24)
})

test('rejects oversized, malformed and unsupported images', () => {
  assert.throws(() => validateSkinPng(Buffer.alloc(MAX_SKIN_BYTES + 1)), /5 MiB/)
  assert.throws(() => validateSkinPng(Buffer.from('not png')), /PNG/)
  assert.throws(() => validateSkinPng(fakePng(128, 128)), /64×64/)
})

test('only permits HTTPS skin downloads from the expected provider', () => {
  assert.equal(validateSkinSourceUrl('https://mc-heads.net/skin/uuid').hostname, 'mc-heads.net')
  assert.throws(() => validateSkinSourceUrl('http://mc-heads.net/skin/uuid'), /no está permitida/)
  assert.throws(() => validateSkinSourceUrl('https://127.0.0.1/secret'), /no está permitida/)
})

test('creates safe local filenames', () => {
  assert.equal(sanitizeSkinName('../../Mi skin ñ'), 'Mi-skin-n')
  assert.equal(sanitizeSkinName(''), 'skin')
})

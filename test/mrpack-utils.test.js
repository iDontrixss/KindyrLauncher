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
})

test('verifies downloaded files with the strongest supplied hash', async () => {
  const directory = fs.mkdtempSync(path.join(os.tmpdir(), 'kindyr-mrpack-'))
  const file = path.join(directory, 'mod.jar')
  try {
    fs.writeFileSync(file, 'mod content')
    const sha512 = crypto.createHash('sha512').update('mod content').digest('hex')
    assert.equal(await verifyMrpackFile(file, { sha512, sha1: 'wrong' }), true)
    assert.equal(await verifyMrpackFile(file, { sha512: 'wrong' }), false)
  } finally {
    fs.rmSync(directory, { recursive: true, force: true })
  }
})

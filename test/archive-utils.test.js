const test = require('node:test')
const assert = require('node:assert/strict')
const fs = require('fs')
const os = require('os')
const path = require('path')
const {
  extractZipEntries,
  normalizeZipPath,
  readZipEntryBuffer,
  writeZip
} = require('../archive-utils')

async function withTemporaryDirectory(callback) {
  const directory = await fs.promises.mkdtemp(path.join(os.tmpdir(), 'kindyr-archive-'))
  try {
    await callback(directory)
  } finally {
    await fs.promises.rm(directory, { recursive: true, force: true })
  }
}

test('rejects traversal and absolute ZIP paths', () => {
  assert.throws(() => normalizeZipPath('../outside'), /insegura/)
  assert.throws(() => normalizeZipPath('/absolute'), /insegura/)
  assert.throws(() => normalizeZipPath('C:\\absolute'), /insegura/)
  assert.equal(normalizeZipPath('./overrides/config.txt'), 'overrides/config.txt')
  // P0-2: alineado con path-util
  assert.throws(() => normalizeZipPath('mods\\example.jar'), /insegura/)
  assert.throws(() => normalizeZipPath('CON.txt'), /insegura/)
  assert.throws(() => normalizeZipPath('mods/COM1.jar'), /insegura/)
  assert.throws(() => normalizeZipPath('mods//example.jar'), /insegura/)
})

test('writes, reads and extracts a ZIP without buffering whole files', async () => {
  await withTemporaryDirectory(async directory => {
    const archive = path.join(directory, 'sample.zip')
    const output = path.join(directory, 'output')
    await writeZip(archive, zip => {
      zip.addBuffer(Buffer.from('index'), 'modrinth.index.json')
      zip.addBuffer(Buffer.from('setting=true'), 'overrides/config/example.properties')
    })

    assert.equal((await readZipEntryBuffer(archive, 'modrinth.index.json')).toString(), 'index')
    const extracted = await extractZipEntries(archive, output, {
      mapEntry: name => name.startsWith('overrides/') ? name.slice('overrides/'.length) : null
    })
    assert.equal(extracted.totalBytes, Buffer.byteLength('setting=true'))
    assert.equal(await fs.promises.readFile(path.join(output, 'config/example.properties'), 'utf8'), 'setting=true')
  })
})

test('enforces entry and total uncompressed-size limits', async () => {
  await withTemporaryDirectory(async directory => {
    const archive = path.join(directory, 'bounded.zip')
    await writeZip(archive, zip => zip.addBuffer(Buffer.alloc(64), 'large.bin'))
    await assert.rejects(readZipEntryBuffer(archive, 'large.bin', 16), /límite/)
    await assert.rejects(
      extractZipEntries(archive, path.join(directory, 'output'), { maxEntryBytes: 16 }),
      /límite/
    )
  })
})

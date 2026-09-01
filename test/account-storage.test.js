const test = require('node:test')
const assert = require('node:assert/strict')
const fs = require('fs')
const os = require('os')
const path = require('path')
const {
  ACCOUNT_STORE_VERSION,
  createMicrosoftAccountStore,
  sanitizeMicrosoftAccount
} = require('../account-storage')

function fakeSafeStorage(backend = 'gnome_libsecret') {
  return {
    isEncryptionAvailable: () => true,
    getSelectedStorageBackend: () => backend,
    encryptString: value => Buffer.from(`encrypted:${value}`, 'utf8'),
    decryptString: value => value.toString('utf8').replace(/^encrypted:/, '')
  }
}

function withTemporaryStore(callback, backend) {
  const directory = fs.mkdtempSync(path.join(os.tmpdir(), 'kindyr-accounts-'))
  const filePath = path.join(directory, 'ms-accounts.json')
  const store = createMicrosoftAccountStore({
    fs,
    path,
    safeStorage: fakeSafeStorage(backend),
    filePath
  })
  try {
    callback({ directory, filePath, store })
  } finally {
    fs.rmSync(directory, { recursive: true, force: true })
  }
}

test('encrypts account tokens at rest and restores them for the main process', () => {
  withTemporaryStore(({ filePath, store }) => {
    const accounts = [{
      id: 'uuid',
      name: 'Player',
      access_token: 'secret-access-token',
      refresh_token: 'secret-refresh-token',
      active: true,
      type: 'microsoft'
    }]
    store.save(accounts)
    const raw = fs.readFileSync(filePath, 'utf8')
    assert.equal(raw.includes('secret-access-token'), false)
    assert.equal(raw.includes('secret-refresh-token'), false)
    assert.equal(JSON.parse(raw).version, ACCOUNT_STORE_VERSION)
    assert.deepEqual(store.load(), accounts)
    assert.equal(fs.statSync(filePath).mode & 0o777, 0o600)
  })
})

test('migrates the legacy plaintext array without losing accounts', () => {
  withTemporaryStore(({ filePath, store }) => {
    const accounts = [{ id: 'legacy', name: 'Legacy', access_token: 'legacy-secret', active: true }]
    fs.writeFileSync(filePath, JSON.stringify(accounts))
    assert.deepEqual(store.load(), accounts)
    assert.equal(fs.readFileSync(filePath, 'utf8').includes('legacy-secret'), false)
  })
})

test('refuses the insecure basic_text backend and preserves the legacy file', () => {
  withTemporaryStore(({ filePath, store }) => {
    const raw = JSON.stringify([{ id: 'legacy', access_token: 'keep-me' }])
    fs.writeFileSync(filePath, raw)
    assert.throws(() => store.load(), /llavero seguro/)
    assert.equal(fs.readFileSync(filePath, 'utf8'), raw)
  }, 'basic_text')
})

test('sanitizes Microsoft accounts before exposing them to the renderer', () => {
  const publicAccount = sanitizeMicrosoftAccount({
    id: 'uuid',
    name: 'Player',
    uuid: 'uuid',
    xuid: 'xuid',
    access_token: 'secret',
    refresh_token: 'secret-refresh',
    client_token: 'secret-client',
    expires_at: Date.now() + 60_000,
    active: true
  })
  assert.deepEqual(publicAccount, {
    id: 'uuid',
    name: 'Player',
    uuid: 'uuid',
    xuid: 'xuid',
    active: true,
    type: 'microsoft'
  })
  assert.equal('access_token' in publicAccount, false)
  assert.equal('refresh_token' in publicAccount, false)
  assert.equal('expires_at' in publicAccount, false)
})

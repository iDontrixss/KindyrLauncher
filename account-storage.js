const ACCOUNT_STORE_VERSION = 2

function assertSecureStorage(safeStorage) {
  if (!safeStorage || !safeStorage.isEncryptionAvailable()) {
    throw new Error('El almacenamiento seguro del sistema no está disponible.')
  }
  const backend = typeof safeStorage.getSelectedStorageBackend === 'function'
    ? safeStorage.getSelectedStorageBackend()
    : ''
  if (backend === 'basic_text') {
    throw new Error('El llavero seguro del sistema no está disponible; no se guardaron credenciales.')
  }
}

function sanitizeMicrosoftAccount(account = {}) {
  return {
    id: String(account.id || ''),
    name: String(account.name || ''),
    uuid: String(account.uuid || account.id || ''),
    xuid: String(account.xuid || ''),
    active: account.active === true,
    type: 'microsoft'
  }
}

function createMicrosoftAccountStore({ fs, path, safeStorage, filePath }) {
  if (!fs || !path || !filePath) throw new TypeError('Configuración de cuentas incompleta.')

  function save(accounts) {
    if (!Array.isArray(accounts)) throw new TypeError('La lista de cuentas no es válida.')
    assertSecureStorage(safeStorage)
    const encrypted = safeStorage.encryptString(JSON.stringify(accounts)).toString('base64')
    const payload = JSON.stringify({
      version: ACCOUNT_STORE_VERSION,
      encrypted
    }, null, 2)
    const directory = path.dirname(filePath)
    const temporaryPath = `${filePath}.tmp-${process.pid}-${Date.now()}`
    fs.mkdirSync(directory, { recursive: true, mode: 0o700 })
    try {
      fs.writeFileSync(temporaryPath, payload, { mode: 0o600, flag: 'wx' })
      fs.renameSync(temporaryPath, filePath)
      fs.chmodSync(filePath, 0o600)
    } finally {
      try {
        if (fs.existsSync(temporaryPath)) fs.unlinkSync(temporaryPath)
      } catch {}
    }
  }

  function load() {
    if (!fs.existsSync(filePath)) return []
    const parsed = JSON.parse(fs.readFileSync(filePath, 'utf8'))
    if (Array.isArray(parsed)) {
      save(parsed)
      return parsed
    }
    if (parsed?.version !== ACCOUNT_STORE_VERSION || typeof parsed.encrypted !== 'string') {
      throw new Error('El archivo de cuentas tiene un formato desconocido.')
    }
    assertSecureStorage(safeStorage)
    const plaintext = safeStorage.decryptString(Buffer.from(parsed.encrypted, 'base64'))
    const accounts = JSON.parse(plaintext)
    if (!Array.isArray(accounts)) throw new Error('El archivo de cuentas cifrado no contiene una lista válida.')
    try { fs.chmodSync(filePath, 0o600) } catch {}
    return accounts
  }

  return { load, save }
}

module.exports = {
  ACCOUNT_STORE_VERSION,
  createMicrosoftAccountStore,
  sanitizeMicrosoftAccount
}

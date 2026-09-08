// Kindyr Launcher - Copyright (C) 2026 iDontrixss
// This program is free software: you can redistribute it and/or modify
// it under the terms of the GNU General Public License as published by
// the Free Software Foundation, either version 3 of the License, or
// (at your option) any later version.
// SPDX-License-Identifier: GPL-3.0-or-later

const CURSEFORGE_STORE_VERSION = 1

function assertSecureStorage(safeStorage) {
  if (!safeStorage || !safeStorage.isEncryptionAvailable()) {
    throw new Error('El almacenamiento seguro del sistema no está disponible.')
  }
  const backend = typeof safeStorage.getSelectedStorageBackend === 'function'
    ? safeStorage.getSelectedStorageBackend()
    : ''
  if (backend === 'basic_text') {
    throw new Error('El llavero seguro del sistema no está disponible; no se guardó la API key.')
  }
}

function createCurseForgeStore({ fs, path, safeStorage, filePath }) {
  if (!fs || !path || !filePath) throw new TypeError('Configuración CurseForge incompleta.')

  function save(apiKey) {
    const key = String(apiKey || '').trim()
    if (!key) throw new TypeError('La API key de CurseForge no es válida.')
    assertSecureStorage(safeStorage)
    const encrypted = safeStorage.encryptString(key).toString('base64')
    const payload = JSON.stringify({ version: CURSEFORGE_STORE_VERSION, encrypted }, null, 2)
    const directory = path.dirname(filePath)
    const tmp = `${filePath}.tmp-${process.pid}-${Date.now()}`
    fs.mkdirSync(directory, { recursive: true, mode: 0o700 })
    try {
      fs.writeFileSync(tmp, payload, { mode: 0o600, flag: 'wx' })
      fs.renameSync(tmp, filePath)
      fs.chmodSync(filePath, 0o600)
    } finally {
      try { if (fs.existsSync(tmp)) fs.unlinkSync(tmp) } catch {}
    }
  }

  function load() {
    if (!fs.existsSync(filePath)) return ''
    const parsed = JSON.parse(fs.readFileSync(filePath, 'utf8'))
    if (typeof parsed === 'string') {
      // migración texto plano legacy -> cifrar
      try { save(parsed); return parsed } catch { return '' }
    }
    if (parsed?.version !== CURSEFORGE_STORE_VERSION || typeof parsed.encrypted !== 'string') {
      throw new Error('El archivo de CurseForge tiene un formato desconocido.')
    }
    assertSecureStorage(safeStorage)
    const plaintext = safeStorage.decryptString(Buffer.from(parsed.encrypted, 'base64'))
    try { fs.chmodSync(filePath, 0o600) } catch {}
    return String(plaintext || '').trim()
  }

  function clear() {
    try { if (fs.existsSync(filePath)) fs.unlinkSync(filePath) } catch {}
  }

  function hasKey() {
    try { return Boolean(load()) } catch { return false }
  }

  return { save, load, clear, hasKey }
}

module.exports = { CURSEFORGE_STORE_VERSION, createCurseForgeStore }

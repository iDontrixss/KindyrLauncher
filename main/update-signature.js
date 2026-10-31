// Kindyr Launcher - Copyright (C) 2026 iDontrixss
// This program is free software: you can redistribute it and/or modify
// it under the terms of the GNU General Public License as published by
// the Free Software Foundation, either version 3 of the License, or
// (at your option) any later version.
// SPDX-License-Identifier: GPL-3.0-or-later

// Verificación de actualizaciones firmadas.
//
// Cadena de confianza:
//   clave privada Ed25519 (offline, solo en la máquina del autor)
//     └─ firma update-manifest.json (tag, versión y sha512 de cada instalador)
//          └─ el launcher verifica la firma con la clave pública embebida
//               └─ el sha512 que informa electron-updater (latest.yml) debe
//                  coincidir con el del manifiesto firmado
//                    └─ electron-updater verifica el archivo descargado contra latest.yml
//
// Quien suba o reemplace una release en GitHub (instalador, latest.yml o
// cualquier otro archivo) no puede fabricar un manifiesto válido sin la clave
// privada. Un manifiesto firmado antiguo tampoco sirve para forzar un
// downgrade: se exige versión estrictamente mayor que la instalada.

const crypto = require('crypto')
const semver = require('semver')

const MANIFEST_SCHEMA = 1
const MANIFEST_ASSET_NAME = 'update-manifest.json'
const SIGNATURE_ASSET_NAME = 'update-manifest.json.sig'
const MAX_MANIFEST_BYTES = 64 * 1024
const MAX_SIGNATURE_BYTES = 1024
const MAX_MANIFEST_FILES = 8
const SHA512_BASE64_RE = /^[A-Za-z0-9+/]{86}==$/

function toPublicKeyObjects(publicKeys) {
  const keys = []
  for (const entry of Array.isArray(publicKeys) ? publicKeys : []) {
    try { keys.push(crypto.createPublicKey(entry)) } catch {}
  }
  return keys
}

// ¿La firma (base64 de Ed25519) corresponde a estos bytes para alguna clave de confianza?
function verifyManifestSignature(manifestBytes, signatureBase64, publicKeys) {
  const keys = toPublicKeyObjects(publicKeys)
  if (!keys.length) return false
  const bytes = Buffer.isBuffer(manifestBytes) ? manifestBytes : Buffer.from(manifestBytes)
  if (!bytes.length || bytes.length > MAX_MANIFEST_BYTES) return false
  const text = String(signatureBase64 || '').trim()
  if (!/^[A-Za-z0-9+/]+={0,2}$/.test(text)) return false
  const signature = Buffer.from(text, 'base64')
  if (signature.length !== 64) return false
  return keys.some(key => {
    try { return crypto.verify(null, bytes, key, signature) } catch { return false }
  })
}

// Valida la forma del manifiesto (ya verificada su firma) y lo normaliza.
function parseManifest(manifestBytes) {
  let manifest
  try { manifest = JSON.parse(Buffer.from(manifestBytes).toString('utf8')) } catch { throw new Error('Manifiesto de actualización ilegible.') }
  if (!manifest || typeof manifest !== 'object' || manifest.schema !== MANIFEST_SCHEMA) throw new Error('Esquema de manifiesto no soportado.')
  const tag = String(manifest.tag || '')
  const version = String(manifest.version || '')
  if (!/^v\d[\w.+-]*$/.test(tag) || semver.valid(version) !== version || tag !== `v${version}`) {
    throw new Error('Tag o versión del manifiesto inválidos.')
  }
  if (!Array.isArray(manifest.files) || manifest.files.length < 1 || manifest.files.length > MAX_MANIFEST_FILES) {
    throw new Error('Lista de archivos del manifiesto inválida.')
  }
  const files = manifest.files.map(file => {
    const name = String(file && file.name || '')
    const sha512 = String(file && file.sha512 || '')
    const size = Number(file && file.size)
    if (!name || /[\\/\0]/.test(name) || name.length > 200) throw new Error('Nombre de archivo del manifiesto inválido.')
    if (!SHA512_BASE64_RE.test(sha512)) throw new Error('sha512 del manifiesto inválido.')
    if (!Number.isSafeInteger(size) || size <= 0) throw new Error('Tamaño del manifiesto inválido.')
    return { name, sha512, size }
  })
  return { schema: MANIFEST_SCHEMA, tag, version, files, signedAt: String(manifest.signedAt || '') }
}

// Verifica firma + forma + coherencia con la release y con la versión instalada.
// Lanza Error si algo no cuadra; devuelve el manifiesto normalizado si es válido.
function verifySignedManifest({ manifestBytes, signature, publicKeys, releaseTag, currentVersion }) {
  if (!toPublicKeyObjects(publicKeys).length) throw new Error('El launcher no tiene claves públicas de actualización.')
  if (!verifyManifestSignature(manifestBytes, signature, publicKeys)) throw new Error('Firma del manifiesto inválida.')
  const manifest = parseManifest(manifestBytes)
  if (releaseTag != null && manifest.tag !== String(releaseTag)) throw new Error('El manifiesto firmado no corresponde al tag de la release.')
  const current = semver.valid(String(currentVersion || '').replace(/^[vV]/, ''), { loose: true })
  if (!current || !semver.gt(manifest.version, current)) throw new Error('El manifiesto firmado no es una versión más nueva que la instalada.')
  return manifest
}

// Cruza lo que informa electron-updater (latest.yml) con el manifiesto firmado.
// Todo archivo que electron-updater podría descargar debe estar firmado.
function verifyUpdateInfoAgainstManifest(updateInfo, manifest) {
  if (!updateInfo || !manifest) throw new Error('Falta información de actualización.')
  if (String(updateInfo.version || '') !== manifest.version) throw new Error('La versión de latest.yml no coincide con el manifiesto firmado.')
  const signed = new Set(manifest.files.map(file => file.sha512))
  const entries = Array.isArray(updateInfo.files) ? updateInfo.files : []
  const hashes = entries.map(entry => String(entry && entry.sha512 || ''))
  if (!hashes.length) throw new Error('latest.yml no lista archivos.')
  for (const hash of hashes) {
    if (!signed.has(hash)) throw new Error('Un archivo de latest.yml no está en el manifiesto firmado.')
  }
  if (updateInfo.sha512 && !signed.has(String(updateInfo.sha512))) throw new Error('El sha512 principal de latest.yml no está firmado.')
  return true
}

module.exports = {
  MANIFEST_SCHEMA,
  MANIFEST_ASSET_NAME,
  SIGNATURE_ASSET_NAME,
  MAX_MANIFEST_BYTES,
  MAX_SIGNATURE_BYTES,
  parseManifest,
  verifyManifestSignature,
  verifySignedManifest,
  verifyUpdateInfoAgainstManifest
}

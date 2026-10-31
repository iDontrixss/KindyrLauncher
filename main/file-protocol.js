// Kindyr Launcher - Copyright (C) 2026 iDontrixss
// This program is free software: you can redistribute it and/or modify
// it under the terms of the GNU General Public License as published by
// the Free Software Foundation, either version 3 of the License, or
// (at your option) any later version.
// SPDX-License-Identifier: GPL-3.0-or-later

// KL-02: Electron deja que una página file:// lea CUALQUIER file:// con fetch().
// Toda la UI se sirve desde file://, así que un script en el renderer podía leer
// archivos arbitrarios del usuario. Este módulo intercepta el esquema file
// para todas las sesiones y solo sirve:
//   - el árbol de la app (APP_ROOT; dentro del ASAR al empaquetar), y
//   - los archivos de datos que la UI muestra: el fondo personalizado
//     (<dataRoot>/background.<ext>) y los iconos de instancia
//     (<dataRoot>/instances/<id>/icon.<ext>).
// Todo lo demás responde 403. Las rutas se normalizan (decodificación,
// `..`, mayúsculas en Windows) y los archivos de datos se resuelven con
// realpath para que un enlace no apunte fuera.
const APP_ROOT = require('path').resolve(__dirname, '../')
const fs = require('fs')
const path = require('path')
const { fileURLToPath, pathToFileURL } = require('url')

const BACKGROUND_RE = /^background\.(png|jpe?g|webp|gif|mp4|webm|ogg)$/i
const INSTANCE_ICON_RE = /^icon\.(png|jpe?g|webp|gif)$/i

function normalizeForCompare(p) {
  const resolved = path.resolve(p)
  return process.platform === 'win32' ? resolved.toLowerCase() : resolved
}

function isInside(child, parent) {
  const c = normalizeForCompare(child)
  const p = normalizeForCompare(parent)
  return c === p || c.startsWith(p + path.sep)
}

function isAllowedDataFile(filePath, dataRoot) {
  const rel = path.relative(path.resolve(dataRoot), path.resolve(filePath))
  if (!rel || rel.startsWith('..') || path.isAbsolute(rel)) return false
  const parts = rel.split(path.sep)
  if (parts.length === 1) return BACKGROUND_RE.test(parts[0])
  return parts.length === 3 && parts[0].toLowerCase() === 'instances' && parts[1] !== '' && parts[1] !== '.' && parts[1] !== '..' && INSTANCE_ICON_RE.test(parts[2])
}

// Decide si una URL file:// puede servirse. Devuelve la ruta a servir o ''.
function resolveAllowedFileUrl(url, { appRoot = APP_ROOT, dataRoot, realpath = fs.realpathSync } = {}) {
  let filePath
  try {
    const parsed = new URL(String(url || ''))
    if (parsed.protocol !== 'file:') return ''
    // UNC (file://host/share) nunca: además de leer fuera, dispara autenticación SMB.
    if (parsed.hostname && parsed.hostname.toLowerCase() !== 'localhost') return ''
    filePath = path.resolve(fileURLToPath(parsed))
  } catch { return '' }
  if (filePath.startsWith('\\\\')) return ''
  if (isInside(filePath, appRoot)) return filePath
  if (!dataRoot || !isAllowedDataFile(filePath, dataRoot)) return ''
  let real
  try { real = realpath(filePath) } catch { return '' }
  let realRoot
  try { realRoot = realpath(dataRoot) } catch { realRoot = dataRoot }
  return isAllowedDataFile(real, realRoot) ? real : ''
}

// KL-10: una ventana propia solo puede navegar a páginas de la propia app
// (nunca a otro file:// del disco ni a la web).
function isAppNavigationUrl(url, appRoot = APP_ROOT) {
  const target = resolveAllowedFileUrl(url, { appRoot })
  return Boolean(target) && isInside(target, appRoot)
}

function registerRestrictedFileProtocol({ protocol, net, getDataRoot, appRoot = APP_ROOT }) {
  protocol.handle('file', (request) => {
    const target = resolveAllowedFileUrl(request.url, { appRoot, dataRoot: getDataRoot() })
    if (!target) return new Response('Forbidden', { status: 403 })
    const forwarded = pathToFileURL(target)
    const original = new URL(request.url)
    forwarded.search = original.search
    return net.fetch(forwarded.href, {
      method: request.method,
      headers: request.headers,
      bypassCustomProtocolHandlers: true
    })
  })
}

module.exports = {
  isAllowedDataFile,
  isAppNavigationUrl,
  registerRestrictedFileProtocol,
  resolveAllowedFileUrl
}

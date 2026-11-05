// Kindyr Launcher - Copyright (C) 2026 iDontrixss
// This program is free software: you can redistribute it and/or modify
// it under the terms of the GNU General Public License as published by
// the Free Software Foundation, either version 3 of the License, or
// (at your option) any later version.
// SPDX-License-Identifier: GPL-3.0-or-later

const fs = require('fs')
const path = require('path')

// Dependencias que no deben empaquetarse (se reemplazaron por otras).
const FORBIDDEN_PACKAGES = ['minecraft-launcher-core', 'adm-zip', 'form-data']
// Archivos propios del repo que no deben viajar en la app (fuera de node_modules).
const FORBIDDEN_ASAR_PATTERNS = [
  'test/',
  'docs/performance',
  'tools/performance',
  'audit-',
  '.backup',
  'knip.json',
  'scripts/install-electron'
]

const REQUIRED_ASAR_FILES = [
  'account-storage.js',
  'archive-utils.js',
  'mrpack-utils.js',
  'content-sniff.js',
  'curseforge-modpack.js',
  'stores/atomic-store.js',
  'external-launchers/shared.js',
  'external-launchers/importer.js',
  'skin-security.js',
  'main.js',
  'html-sanitizer.js',
  'main/file-protocol.js',
  'main/session-security.js',
  'main/state.js',
  'main/ipc-guard.js',
  'main/launch/engine.js',
  'main/ipc/launch.js',
  'preload.js',
  'preload-fatal.js',
  'fatal-dialog.html',
  'assets/fonts/fonts.css',
  'curseforge-embedded.json',
  'LICENSE',
  'THIRD_PARTY_NOTICES.md',
  'THIRD_PARTY_NOTICES.es.md'
]

// El paquete `asar` no es dependencia del proyecto: antes la verificación
// profunda se saltaba siempre en silencio. Se usa el @electron/asar que trae
// electron-builder (resuelto desde su propio árbol, compatible con pnpm).
function loadAsarModule(projectDir) {
  const builderDir = path.dirname(require.resolve('electron-builder/package.json', { paths: [projectDir] }))
  const libDir = path.dirname(require.resolve('app-builder-lib/package.json', { paths: [builderDir] }))
  return require(require.resolve('@electron/asar', { paths: [libDir] }))
}

function isInstallerBuild(context) {
  const targets = Array.isArray(context.targets) ? context.targets : []
  return targets.some(target => target && target.name && target.name !== 'dir')
}

// KL-04: sin clave pública el actualizador es fail-closed y una release así
// dejaría a los usuarios sin actualizaciones para siempre. Los instaladores
// exigen al menos una clave válida; `--dir` (pruebas locales) no. Para builds
// de CI que no se publican: KINDYR_ALLOW_NO_UPDATE_KEYS=1.
function assertUpdateKeys(context) {
  const keys = require(path.join(context.packager.projectDir, 'main', 'update-public-keys.js'))
  const valid = (Array.isArray(keys) ? keys : []).filter(key => {
    try { return require('crypto').createPublicKey(key).asymmetricKeyType === 'ed25519' } catch { return false }
  })
  if (valid.length) return
  if (!isInstallerBuild(context)) {
    console.warn('[Kindyr afterPack] Sin claves de actualización (build --dir de prueba: permitido).')
    return
  }
  if (process.env.KINDYR_ALLOW_NO_UPDATE_KEYS === '1') {
    console.warn('[Kindyr afterPack] Sin claves de actualización: permitido por KINDYR_ALLOW_NO_UPDATE_KEYS=1. NO publicar este instalador.')
    return
  }
  throw new Error('[Kindyr afterPack] main/update-public-keys.js no tiene claves Ed25519 válidas. Ejecutá `pnpm release:keygen` antes de generar un instalador (ver docs/RELEASE_CHECKLIST.md).')
}

// KL-09: ffmpeg debe quedar fuera del ASAR para poder ejecutarse.
function assertFfmpegUnpacked(unpackedDir) {
  let bundled = ''
  try { bundled = require('ffmpeg-static') } catch {}
  if (!bundled) return
  const binary = path.join(unpackedDir, 'node_modules', 'ffmpeg-static', path.basename(bundled))
  if (!fs.existsSync(binary)) {
    throw new Error(`[Kindyr afterPack] ffmpeg no quedó desempaquetado (${binary}); revisar build.asarUnpack.`)
  }
}

module.exports = async function afterPack(context) {
  const appOutDir = context.appOutDir
  const asarPath = path.join(appOutDir, 'resources', 'app.asar')
  const unpackedDir = path.join(appOutDir, 'resources', 'app.asar.unpacked')

  console.log(`[Kindyr afterPack] Verifying ${asarPath}`)
  assertUpdateKeys(context)
  assertFfmpegUnpacked(unpackedDir)

  // 1. Check unpacked dir doesn't contain forbidden leftovers
  if (fs.existsSync(unpackedDir)) {
    const forbiddenFound = []
    function walk(dir) {
      for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
        const full = path.join(dir, entry.name)
        const rel = path.relative(appOutDir, full).replace(/\\/g, '/')
        for (const pat of FORBIDDEN_ASAR_PATTERNS) {
          if (rel.includes(pat) || entry.name.includes(pat)) {
            forbiddenFound.push(rel)
          }
        }
        if (entry.isDirectory()) walk(full)
      }
    }
    try { walk(unpackedDir) } catch {}
    if (forbiddenFound.length) {
      throw new Error(`[Kindyr afterPack] Forbidden files in unpacked ASAR: ${forbiddenFound.slice(0, 20).join(', ')}`)
    }
  }

  // 2. Try to inspect ASAR via asar package if available
  const asar = loadAsarModule(context.packager.projectDir)
  if (!fs.existsSync(asarPath)) throw new Error(`[Kindyr afterPack] No existe ${asarPath}`)
  const asarList = asar.listPackage(asarPath).map(entry => entry.replace(/\\/g, '/'))

  if (Array.isArray(asarList)) {
    const asarStr = asarList.join('\n')
    const missing = REQUIRED_ASAR_FILES.filter(f => !asarStr.includes(f))
    if (missing.length) {
      throw new Error(`[Kindyr afterPack] Missing required files in ASAR: ${missing.join(', ')}`)
    }
    const appEntries = asarList.filter(entry => !entry.includes('/node_modules/'))
    const forbiddenInAsar = [
      ...FORBIDDEN_ASAR_PATTERNS.filter(pat => appEntries.some(entry => entry.includes(pat))),
      ...FORBIDDEN_PACKAGES.filter(name => asarList.some(entry => entry.includes('/node_modules/' + name + '/')))
    ]
    if (forbiddenInAsar.length) {
      throw new Error(`[Kindyr afterPack] Forbidden patterns in ASAR: ${forbiddenInAsar.join(', ')}`)
    }
    // Anti-RE: curseforge-embedded.json debe estar DENTRO del ASAR, nunca como extraResources/unpacked
    if (asarStr.includes('curseforge-embedded.json')) {
      console.log('[Kindyr afterPack] CurseForge embedded OK inside ASAR (portable, no plaintext)')
    } else {
      throw new Error('[Kindyr afterPack] curseforge-embedded.json missing in ASAR — build no portable')
    }
    // Verificar que no haya leak plaintext de key en ASAR (heurística)
    try {
      const content = asar.extractFile(asarPath, 'curseforge-embedded.json').toString('utf8')
      if (content.includes('$2a$10$') || content.includes('FbSvMc')) {
        throw new Error('[Kindyr afterPack] Plaintext CurseForge key leaked in embedded json!')
      }
      const parsed = JSON.parse(content)
      if (!parsed.k || typeof parsed.k !== 'string' || parsed.k.length < 60) {
        throw new Error('[Kindyr afterPack] Embedded CurseForge json malformed')
      }
    } catch (e) {
      if (e.message.includes('Plaintext') || e.message.includes('malformed') || e.message.includes('missing in ASAR')) throw e
      console.log('[Kindyr afterPack] Embedded content check skipped (asar read not available)')
    }
    console.log(`[Kindyr afterPack] ASAR OK: ${asarList.length} files, required present`)
  }

  // 3. Verify no backup files in appOutDir
  function checkBackups(dir) {
    for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
      if (entry.name.endsWith('.backup')) {
        throw new Error(`[Kindyr afterPack] Backup file leaked to package: ${entry.name}`)
      }
      if (entry.isDirectory() && !entry.name.startsWith('.') && entry.name !== 'node_modules') {
        // shallow check only
      }
    }
  }
  try { checkBackups(appOutDir) } catch (e) { if (e.message.includes('Backup file')) throw e }

  console.log('[Kindyr afterPack] Verification passed')
}

module.exports.assertUpdateKeys = assertUpdateKeys
module.exports.assertFfmpegUnpacked = assertFfmpegUnpacked

// Kindyr Launcher - Copyright (C) 2026 iDontrixss
// This program is free software: you can redistribute it and/or modify
// it under the terms of the GNU General Public License as published by
// the Free Software Foundation, either version 3 of the License, or
// (at your option) any later version.
// SPDX-License-Identifier: GPL-3.0-or-later

const fs = require('fs')
const path = require('path')
const crypto = require('crypto')
const { readZipEntryBuffer } = require('../../archive-utils')
const state = require('../state')
const { MODRINTH_USER_AGENT } = require('../constants')
const { downloadToFile } = require('../download')
const { logOnly, sendLauncherStatus, writeLaunchLog } = require('./log')
const { getXmclCore } = require('../lazy-deps')
const { hasValidXmclGeneratedArtifacts, resolveXmclMavenCoordinate } = require('./xmcl-tasks')
const { fetchWithTimeout } = require('../http')

function getExpectedXmclLoaderVersionIds(instance) {
  if (instance.loader === 'forge') {
    const mc = String(instance.version || '')
    const { core, versions } = getForgeInstallerCandidates(mc, instance.loaderVersion)
    const ids = [`${mc}-forge-${core}`]
    // IDs reales de instaladores legacy: `<mc>-forge<artefacto>` (ej.
    // `1.8.9-forge1.8.9-11.15.1.2318-1.8.9`, sin guion tras "forge").
    for (const artifact of versions) {
      const legacyId = `${mc}-forge${artifact}`
      if (!ids.includes(legacyId)) ids.push(legacyId)
    }
    return ids.filter(Boolean)
  }
  if (instance.loader === 'neoforge') return [`neoforge-${instance.loaderVersion}`]
  if (instance.loader === 'fabric') return [`${instance.version}-fabric${instance.loaderVersion}`]
  if (instance.loader === 'quilt') return [`${instance.version}-quilt${instance.loaderVersion}`]
  return []
}

// Forge antiguo (<=1.12, incl. 1.8.x) publica el instalador como
// `<mc>-<forge>-<mc>` (doble sufijo, ej. 1.8.9-11.15.1.2318-1.8.9),
// mientras que el moderno usa `<mc>-<forge>`. El loaderVersion guardado
// puede venir pelado ("11.15.1.2318") o completo, asi que se prueban
// ambas variantes antes de rendirse con 404.
function getForgeInstallerCandidates(minecraftVersion, loaderVersionRaw) {
  const mc = String(minecraftVersion || '').trim()
  const raw = String(loaderVersionRaw || '').trim()
  const ordered = []
  const push = (value) => { if (value && !ordered.includes(value)) ordered.push(value) }
  if (mc && raw.startsWith(mc + '-')) push(raw)
  let core = raw
  if (mc && core.startsWith(mc + '-')) core = core.slice(mc.length + 1)
  if (mc && core.endsWith('-' + mc)) core = core.slice(0, -(mc.length + 1))
  if (!mc || !core) return { core: core || raw, versions: ordered.length ? ordered : (raw ? [raw] : []) }
  const single = `${mc}-${core}`
  const double = `${mc}-${core}-${mc}`
  // Era del doble sufijo: 1.7.x - 1.12.x. Fuera de ahi, el simple primero.
  if (/^1\.(7|8|9|10|11|12)(\.|$)/.test(mc)) { push(double); push(single) } else { push(single); push(double) }
  return { core, versions: ordered }
}

function buildForgeInstallerUrls(artifactVersion) {
  const artifactName = `forge-${artifactVersion}-installer.jar`
  const suffix = `net/minecraftforge/forge/${artifactVersion}/${artifactName}`
  return [
    `https://maven.minecraftforge.net/${suffix}`,
    `https://files.minecraftforge.net/maven/${suffix}`
  ]
}

function isHttp404Error(error) {
  return /HTTP 404\b/.test(String(error && error.message || error || ''))
}

// Verificación del instalador de Forge ANTES de ejecutarlo con spawn().
// 1) Si el repo Maven publica sidecar `.sha1` (estándar Maven), se exige
//    coincidencia exacta del sha1 del jar descargado; ante mismatch se borra
//    y se aborta. 2) Sin sidecar (Forge no siempre lo publica), validación
//    estructural obligatoria: ZIP legible con `version.json` (moderno) o
//    `install_profile.json` parseable (legacy). Nada se ejecuta sin pasar
//    por aquí, incluido el instalador reutilizado de caché.
function sha1OfFile(filePath) {
  return new Promise((resolve, reject) => {
    const hash = crypto.createHash('sha1')
    const stream = fs.createReadStream(filePath)
    stream.on('data', chunk => hash.update(chunk))
    stream.on('end', () => resolve(hash.digest('hex')))
    stream.on('error', reject)
  })
}

async function fetchMavenSha1Hex(artifactUrl) {
  try {
    const res = await fetchWithTimeout(String(artifactUrl) + '.sha1', {
      headers: { 'User-Agent': MODRINTH_USER_AGENT, Accept: 'text/plain' }
    })
    if (!res.ok) return ''
    const token = String(await res.text()).trim().split(/\s+/)[0] || ''
    return /^[a-f0-9]{40}$/i.test(token) ? token.toLowerCase() : ''
  } catch {
    return ''
  }
}

async function inspectForgeInstaller(installerPath) {
  const [modernJson, legacyProfile] = await Promise.all([
    readZipEntryBuffer(installerPath, 'version.json').catch(() => null),
    readZipEntryBuffer(installerPath, 'install_profile.json').catch(() => null)
  ])
  if (modernJson) return { kind: 'modern' }
  if (legacyProfile) {
    try {
      const profile = JSON.parse(legacyProfile.toString('utf8'))
      if (profile && profile.versionInfo && Array.isArray(profile.versionInfo.libraries)) {
        return { kind: 'legacy' }
      }
    } catch {}
  }
  return { kind: 'invalid' }
}

async function verifyForgeInstallerFile(installerPath, installerUrl) {
  let stat = null
  try {
    stat = await fs.promises.stat(installerPath)
  } catch {
    throw new Error('El instalador de Forge no se descargó correctamente (archivo ausente).')
  }
  if (!stat.isFile() || stat.size === 0) {
    await fs.promises.rm(installerPath, { force: true }).catch(() => {})
    throw new Error('El instalador de Forge descargado está vacío o no es un archivo válido.')
  }
  const expected = installerUrl ? await fetchMavenSha1Hex(installerUrl) : ''
  if (expected) {
    const actual = await sha1OfFile(installerPath)
    if (actual !== expected) {
      await fs.promises.rm(installerPath, { force: true }).catch(() => {})
      await fs.promises.rm(`${installerPath}.part`, { force: true }).catch(() => {})
      throw new Error('El instalador de Forge no coincide con el sha1 publicado por el repositorio Maven. Archivo eliminado, no se ejecutó nada.')
    }
    writeLaunchLog('Instalador de Forge verificado contra sha1 del repositorio Maven.')
  } else {
    writeLaunchLog('El repositorio Maven no publicó sha1 para el instalador de Forge; se aplica validación estructural.')
  }
  const inspected = await inspectForgeInstaller(installerPath)
  if (inspected.kind === 'invalid') {
    await fs.promises.rm(installerPath, { force: true }).catch(() => {})
    throw new Error('El instalador de Forge descargado no es un instalador válido (ZIP sin version.json ni install_profile.json usable). Archivo eliminado, no se ejecutó nada.')
  }
  return inspected.kind
}

// Instaladores Forge viejos (era 1.7-1.12, ej. 1.8.9-11.15.1.2318) no traen
// `version.json` ni aceptan `--installClient` (solo GUI o --installServer).
// En ese caso se instala de forma nativa: el `install_profile.json` ya trae
// el `versionInfo` completo y el universal.jar va como libreria Forge.
// Equivale a lo que hace XMCL (installLegacyForgeFromZip) sin ejecutar el jar.
async function installLegacyForgeFromInstaller(installerPath, minecraftRoot, forgeVersion) {
  const profileBuf = await readZipEntryBuffer(installerPath, 'install_profile.json')
  if (!profileBuf) throw new Error('El instalador de Forge no trae install_profile.json.')
  let profile = null
  try {
    profile = JSON.parse(profileBuf.toString('utf8'))
  } catch {
    throw new Error('El install_profile.json del instalador de Forge esta corrupto.')
  }
  const versionJson = profile.versionInfo
  const versionId = String(versionJson?.id || '').trim()
  if (!versionId || !Array.isArray(versionJson.libraries)) {
    throw new Error('El instalador de Forge no trae versionInfo usable (formato legacy desconocido).')
  }
  const inheritsFrom = String(versionJson.inheritsFrom || '').trim()
  if (inheritsFrom) {
    const vanillaJson = path.join(minecraftRoot, 'versions', inheritsFrom, inheritsFrom + '.json')
    if (!fs.existsSync(vanillaJson)) {
      throw new Error(`Falta la base vanilla ${inheritsFrom} para instalar Forge ${forgeVersion}.`)
    }
  }
  const universalName = String(profile.install?.filePath || '').split('/').pop()
  if (!universalName || !/^forge-.*-universal\.jar$/.test(universalName)) {
    throw new Error('El instalador de Forge no declara su universal.jar (formato legacy desconocido).')
  }
  const universalBuf = await readZipEntryBuffer(installerPath, universalName, 128 * 1024 * 1024)
  if (!universalBuf || !universalBuf.length) {
    throw new Error(`El instalador de Forge no trae ${universalName}.`)
  }
  const forgeLib = versionJson.libraries.find(item => {
    const name = String(item?.name || '')
    return name.startsWith('net.minecraftforge:forge:') || name.startsWith('net.minecraftforge:minecraftforge:')
  })
  if (!forgeLib) throw new Error('El versionInfo del instalador no declara la libreria Forge.')
  const libRelative = resolveXmclMavenCoordinate(forgeLib.name)
  if (!libRelative) throw new Error(`Coordenada Maven de Forge invalida: ${forgeLib.name}`)
  const versionRoot = path.join(minecraftRoot, 'versions', versionId)
  fs.mkdirSync(versionRoot, { recursive: true })
  await fs.promises.writeFile(path.join(versionRoot, versionId + '.json'), JSON.stringify(versionJson, null, 2))
  const libDest = path.join(minecraftRoot, 'libraries', ...libRelative.split('/'))
  fs.mkdirSync(path.dirname(libDest), { recursive: true })
  await fs.promises.writeFile(libDest, universalBuf)
  logOnly('debug', `Forge legacy instalado nativo: ${versionId}`)
  return versionId
}

async function installForgeWithOfficialInstaller(instance, minecraftRoot, javaPath) {
  const mcVersion = String(instance.version || '').trim()
  const { core: forgeVersion, versions: artifactCandidates } = getForgeInstallerCandidates(mcVersion, instance.loaderVersion)
  if (!mcVersion || !forgeVersion || !artifactCandidates.length) {
    throw new Error(`Versión de Forge inválida para Minecraft ${mcVersion || 'desconocido'}.`)
  }

  let installerPath = null
  let artifactVersion = ''
  let installerKind = ''
  // Reutilizar instalador ya descargado de cualquiera de las variantes, pero
  // NUNCA a ciegas: se valida estructura antes de ejecutar (antes bastaba size>0).
  for (const candidate of artifactCandidates) {
    const candidatePath = path.join(minecraftRoot, 'libraries', 'net', 'minecraftforge', 'forge', candidate, `forge-${candidate}-installer.jar`)
    const stat = await fs.promises.stat(candidatePath).catch(() => null)
    if (stat && stat.size > 0) {
      try {
        const inspected = await inspectForgeInstaller(candidatePath)
        if (inspected.kind === 'invalid') {
          await fs.promises.rm(candidatePath, { force: true }).catch(() => {})
          continue
        }
        installerPath = candidatePath
        artifactVersion = candidate
        installerKind = inspected.kind
      } catch {
        await fs.promises.rm(candidatePath, { force: true }).catch(() => {})
      }
      if (installerPath) break
    }
  }

  if (!installerPath) {
    sendLauncherStatus('progress', `Descargando instalador de Forge ${forgeVersion}...`)
    let lastError = null
    let downloaded = false
    for (const candidate of artifactCandidates) {
      const candidatePath = path.join(minecraftRoot, 'libraries', 'net', 'minecraftforge', 'forge', candidate, `forge-${candidate}-installer.jar`)
      for (const installerUrl of buildForgeInstallerUrls(candidate)) {
        try {
          await downloadToFile(installerUrl, candidatePath)
          // Verificación obligatoria pre-ejecución: sha1 del repo si existe,
          // más validación estructural. Borra y aborta ante mismatch.
          installerKind = await verifyForgeInstallerFile(candidatePath, installerUrl)
          installerPath = candidatePath
          artifactVersion = candidate
          downloaded = true
          break
        } catch (error) {
          lastError = error
          await fs.promises.rm(candidatePath, { force: true }).catch(() => {})
          await fs.promises.rm(`${candidatePath}.part`, { force: true }).catch(() => {})
          if (/sha1|no es un instalador válido|vacío/i.test(String(error && error.message || ''))) break
          // Solo tiene sentido probar la siguiente URL/variante ante un 404.
          // Un error de red real se reintenta a nivel de runXmclTaskWithRetry.
          if (!isHttp404Error(error)) break
        }
      }
      if (downloaded) break
      // Si el fallo no fue 404 (red, disco...) ni verificación, no seguir probando variantes.
      if (lastError && !isHttp404Error(lastError) && !/sha1|no es un instalador válido|vacío/i.test(String(lastError && lastError.message || ''))) break
    }
    if (!downloaded) {
      if (lastError && !isHttp404Error(lastError)) throw lastError
      const tried = artifactCandidates.join(' / ')
      // Caso tipico: pack de PvP que pide Forge de 1.8.9 sobre Minecraft 1.8.
      // Forge 11.15.x no existe para 1.8 (ahi lo ultimo es 11.14.4.1577).
      const hint = (mcVersion === '1.8' && /^11\.15\./.test(forgeVersion))
        ? ` Forge ${forgeVersion} es de Minecraft 1.8.9, no existe para Minecraft 1.8 (ahi lo ultimo es 11.14.4.1577): cambia la instancia a 1.8.9 o usa Forge 11.14.4.1577.`
        : ' Verifica que esa combinacion exista en files.minecraftforge.net.'
      throw new Error(`No se encontro el instalador de Forge ${forgeVersion} para Minecraft ${mcVersion} (HTTP 404, se probo: ${tried}).${hint}`)
    }
  }

  // Los instaladores viejos no soportan --installClient (mueren con
  // "UnrecognizedOptionException"). Se detectan por ausencia de version.json
  // + presencia de install_profile.json (ya validado en verifyForgeInstallerFile
  // o en la reutilización de caché) y se instalan de forma nativa.
  if (!installerKind) {
    const inspected = await inspectForgeInstaller(installerPath)
    if (inspected.kind === 'invalid') {
      await fs.promises.rm(installerPath, { force: true }).catch(() => {})
      throw new Error('El instalador de Forge no es un instalador válido (ZIP sin version.json ni install_profile.json usable). Archivo eliminado, no se ejecutó nada.')
    }
    installerKind = inspected.kind
  }

  if (installerKind === 'legacy') {
    sendLauncherStatus('progress', `Instalando Forge ${forgeVersion}...`)
    const legacyVersionId = await installLegacyForgeFromInstaller(installerPath, minecraftRoot, forgeVersion)
    const xmclCore = await getXmclCore()
    const resolvedVersion = await xmclCore.Version.parse(minecraftRoot, legacyVersionId)
    if (!await hasValidXmclGeneratedArtifacts(minecraftRoot, resolvedVersion)) {
      throw new Error(`Forge termino sin generar todos los artefactos requeridos (${legacyVersionId}).`)
    }
    return legacyVersionId
  }

  const launcherProfilesPath = path.join(minecraftRoot, 'launcher_profiles.json')
  if (!fs.existsSync(launcherProfilesPath)) {
    await fs.promises.writeFile(launcherProfilesPath, JSON.stringify({ profiles: {}, settings: {} }))
  }

  sendLauncherStatus('progress', `Procesando Forge ${forgeVersion}...`)
  const { spawn } = require('child_process')
  const FORGE_INSTALL_TIMEOUT_MS = 10 * 60 * 1000
  let outputTail = ''
  const appendOutput = (data) => {
    outputTail = (outputTail + data.toString()).slice(-65536)
  }
  const persistForgeLog = async () => {
    try {
      await fs.promises.writeFile(path.join(minecraftRoot, 'forge-installer.log'), outputTail)
    } catch {}
  }
  const exitCode = await new Promise((resolve, reject) => {
    let settled = false
    let killTimer = null
    const cleanup = (child) => {
      try { clearTimeout(timer) } catch {}
      try { clearTimeout(killTimer) } catch {}
      try { child.stdout.removeListener('data', appendOutput) } catch {}
      try { child.stderr.removeListener('data', appendOutput) } catch {}
      try { child.removeAllListeners('error') } catch {}
      try { child.removeAllListeners('close') } catch {}
    }
    const child = spawn(javaPath, ['-jar', installerPath, '--installClient', minecraftRoot], {
      cwd: minecraftRoot,
      stdio: ['ignore', 'pipe', 'pipe']
    })
    const timer = setTimeout(() => {
      if (settled) return
      try { child.kill('SIGTERM') } catch {}
      killTimer = setTimeout(() => {
        if (settled) return
        try { child.kill('SIGKILL') } catch {}
      }, 5000)
      if (killTimer && typeof killTimer.unref === 'function') {
        try { killTimer.unref() } catch {}
      }
    }, FORGE_INSTALL_TIMEOUT_MS)
    if (timer && typeof timer.unref === 'function') {
      try { timer.unref() } catch {}
    }
    child.stdout.on('data', appendOutput)
    child.stderr.on('data', appendOutput)
    child.once('error', (error) => {
      if (settled) return
      settled = true
      cleanup(child)
      reject(error)
    })
    child.once('close', (code, signal) => {
      if (settled) return
      settled = true
      cleanup(child)
      if (signal || (state.inicioCancelado || state.xmclCancellationRequested)) {
        reject(new Error('Instalación de Forge cancelada.'))
        return
      }
      if (code === null) {
        reject(new Error(`El instalador oficial de Forge no terminó (timeout ${Math.round(FORGE_INSTALL_TIMEOUT_MS / 60000)}min).`))
        return
      }
      resolve(code)
    })
  }).catch(async (error) => {
    await persistForgeLog()
    throw error
  })
  if (exitCode !== 0) {
    const usefulTail = outputTail.split(/\r?\n/).filter(Boolean).slice(-20).join('\n')
    // Guardar salida completa para diagnostico (la consola solo muestra un resumen).
    await persistForgeLog()
    throw new Error(`El instalador oficial de Forge termino con codigo ${exitCode} (ver forge-installer.log en la instancia).\n${usefulTail}`)
  }
  await persistForgeLog()

  let launcherProfiles = null
  try {
    launcherProfiles = JSON.parse(await fs.promises.readFile(launcherProfilesPath, 'utf8'))
  } catch (error) {
    try {
      await fs.promises.copyFile(launcherProfilesPath, `${launcherProfilesPath}.corrupt-${Date.now()}.bak`)
    } catch {}
    throw new Error(`launcher_profiles.json corrupto tras instalar Forge (${instance.version}-forge-${forgeVersion}): se guardó backup .corrupt-*.bak. Reintentá reparar la instalación.`)
  }
  const versionId = launcherProfiles?.profiles?.forge?.lastVersionId || `${instance.version}-forge-${forgeVersion}`
  const xmclCore = await getXmclCore()
  const resolvedVersion = await xmclCore.Version.parse(minecraftRoot, versionId)
  if (!await hasValidXmclGeneratedArtifacts(minecraftRoot, resolvedVersion)) {
    throw new Error(`Forge termino sin generar todos los artefactos requeridos (${versionId}).`)
  }
  return versionId
}

module.exports = {
  getExpectedXmclLoaderVersionIds,
  installForgeWithOfficialInstaller
}

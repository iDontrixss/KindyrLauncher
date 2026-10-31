// Kindyr Launcher - Copyright (C) 2026 iDontrixss
// This program is free software: you can redistribute it and/or modify
// it under the terms of the GNU General Public License as published by
// the Free Software Foundation, either version 3 of the License, or
// (at your option) any later version.
// SPDX-License-Identifier: GPL-3.0-or-later

const fs = require('fs')
const path = require('path')
const { extractZipEntries } = require('../archive-utils')
const { MODRINTH_USER_AGENT } = require('./constants')
const { downloadToFile } = require('./download')
const { logAndSend, writeLaunchLog } = require('./launch/log')
const { getKindyrDataRoot } = require('./paths')
const { MAX_APPROVED_JAVA_BINARIES, loadLauncherSettings, sanitizeApprovedJavaBinaries, saveLauncherSettings } = require('./settings')
const { getDirSizeBytes } = require('./storage')
const { isLocalAbsolutePath, sha256OfFile, yieldToEventLoop } = require('./util')

function getCurrentJavaPlatform() {
  if (process.platform === 'win32') return 'windows'
  if (process.platform === 'darwin') return 'mac'
  if (process.platform === 'linux') return 'linux'
  throw new Error(`Sistema operativo no soportado para el runtime Java: ${process.platform}`)
}

function getCurrentJavaArch() {
  const architectures = { x64: 'x64', arm64: 'aarch64', ia32: 'x32', arm: 'arm' }
  const arch = architectures[process.arch]
  if (!arch) throw new Error(`Arquitectura no soportada para el runtime Java: ${process.arch}`)
  return arch
}

function normalizeJavaPlatform(value) {
  const clean = String(value || '').toLowerCase()
  if (clean.includes('windows')) return 'win32'
  if (clean.includes('linux')) return 'linux'
  if (clean.includes('mac') || clean.includes('darwin') || clean.includes('os x')) return 'darwin'
  return ''
}

function normalizeJavaArch(value) {
  const clean = String(value || '').toLowerCase()
  if (['x86_64', 'amd64', 'x64'].includes(clean)) return 'x64'
  if (['aarch64', 'arm64'].includes(clean)) return 'arm64'
  if (['x86', 'i386', 'i486', 'i586', 'i686'].includes(clean)) return 'ia32'
  return ''
}

function readJavaReleaseMetadata(homeDir) {
  const releaseFile = path.join(homeDir, 'release')
  if (!fs.existsSync(releaseFile)) return {}
  const metadata = {}
  for (const line of fs.readFileSync(releaseFile, 'utf8').split(/\r?\n/)) {
    const match = line.match(/^([A-Z0-9_]+)="?(.*?)"?$/)
    if (match) metadata[match[1]] = match[2]
  }
  return metadata
}

function detectJavaBinaryPlatform(javaBinary) {
  try {
    const fd = fs.openSync(javaBinary, 'r')
    const header = Buffer.alloc(4)
    fs.readSync(fd, header, 0, header.length, 0)
    fs.closeSync(fd)
    if (header[0] === 0x7f && header.toString('ascii', 1, 4) === 'ELF') return 'linux'
    const magic = header.readUInt32BE(0)
    if ([0xfeedface, 0xfeedfacf, 0xcafebabe, 0xcefaedfe, 0xcffaedfe].includes(magic)) return 'darwin'
    if (header[0] === 0x4d && header[1] === 0x5a) return 'win32'
  } catch { }
  return ''
}

function inspectJavaHome(homeDir) {
  const metadata = readJavaReleaseMetadata(homeDir)
  const unixJava = path.join(homeDir, 'bin', 'java')
  const windowsJava = path.join(homeDir, 'bin', 'java.exe')
  const windowsJavaw = path.join(homeDir, 'bin', 'javaw.exe')
  let platform = normalizeJavaPlatform(metadata.OS_NAME)
  if (!platform) {
    if (fs.existsSync(windowsJava) || fs.existsSync(windowsJavaw)) platform = 'win32'
    else if (fs.existsSync(unixJava)) platform = detectJavaBinaryPlatform(unixJava)
  }
  return {
    metadata,
    platform,
    arch: normalizeJavaArch(metadata.OS_ARCH),
    unixJava,
    windowsJava,
    windowsJavaw
  }
}

function assertJavaHomeCompatible(homeDir) {
  const info = inspectJavaHome(homeDir)
  if (info.platform && info.platform !== process.platform) {
    throw new Error(`El runtime Java de ${homeDir} es para ${info.platform}, no para ${process.platform}.`)
  }
  if (info.arch && info.arch !== process.arch) {
    throw new Error(`El runtime Java de ${homeDir} es para ${info.arch}, no para ${process.arch}.`)
  }
  return info
}

function resolveJavaPath(javaPath) {
  if (!javaPath) return ''

  const cleanPath = javaPath.trim().replace(/^"|"$/g, '')
  if (!cleanPath) return ''
  // KL-05/KL-07: nunca tocar rutas UNC/de dispositivo (ni siquiera existsSync).
  if (!isLocalAbsolutePath(cleanPath)) throw new Error(`La ruta de Java debe ser absoluta y estar en un disco local: ${cleanPath}`)

  if (!fs.existsSync(cleanPath)) {
    throw new Error(`No existe la ruta de Java: ${cleanPath}`)
  }

  const stat = fs.statSync(cleanPath)
  if (!stat.isDirectory()) {
    const allowed = process.platform === 'win32' ? ['javaw.exe', 'java.exe'] : ['java']
    if (!allowed.includes(path.basename(cleanPath).toLowerCase())) {
      throw new Error(`El ejecutable de Java no es valido para ${process.platform}: ${cleanPath}`)
    }
    const homeDir = path.basename(path.dirname(cleanPath)).toLowerCase() === 'bin'
      ? path.dirname(path.dirname(cleanPath))
      : path.dirname(cleanPath)
    assertJavaHomeCompatible(homeDir)
    return cleanPath
  }

  const homeDir = path.basename(cleanPath).toLowerCase() === 'bin' ? path.dirname(cleanPath) : cleanPath
  const info = assertJavaHomeCompatible(homeDir)
  const candidates = process.platform === 'win32'
    ? [info.windowsJavaw, info.windowsJava]
    : [info.unixJava]
  const found = candidates.find(candidate => fs.existsSync(candidate))
  if (!found) {
    const expected = process.platform === 'win32' ? 'bin/javaw.exe o bin/java.exe' : 'bin/java'
    throw new Error(`La carpeta de Java no contiene ${expected} para ${process.platform}: ${homeDir}`)
  }

  return found
}

function getManagedRuntimeDir(javaMajor) {
  return path.join(getKindyrDataRoot(), 'runtime', `java-${javaMajor}-${process.platform}-${process.arch}`)
}

function getLegacyManagedRuntimeDir(javaMajor) {
  return path.join(getKindyrDataRoot(), 'runtime', `java-${javaMajor}`)
}

function getManagedJavaMarker(javaMajor) {
  return path.join(getManagedRuntimeDir(javaMajor), '.java-home')
}

function readManagedJavaHome(javaMajor) {
  const runtimeDirs = [getManagedRuntimeDir(javaMajor), getLegacyManagedRuntimeDir(javaMajor)]
  for (const runtimeDir of runtimeDirs) {
    const marker = path.join(runtimeDir, '.java-home')
    if (!fs.existsSync(marker)) continue
    try {
      const raw = fs.readFileSync(marker, 'utf8').trim()
      let home = raw
      try {
        const data = JSON.parse(raw)
        home = String(data.home || '')
        if (data.platform && data.platform !== process.platform) continue
        if (data.arch && data.arch !== process.arch) continue
      } catch { }
      const check = validateJavaHome(home)
      if (check.valid) return check.home
    } catch { }
  }
  return ''
}

function writeManagedJavaHome(javaMajor, homeDir) {
  const runtimeDir = getManagedRuntimeDir(javaMajor)
  fs.mkdirSync(runtimeDir, { recursive: true })
  fs.writeFileSync(getManagedJavaMarker(javaMajor), JSON.stringify({
    home: homeDir,
    platform: process.platform,
    arch: process.arch
  }, null, 2))
}

async function findExtractedJdkRoot(extractDir) {
  const candidates = [extractDir]
  const maxDepth = 3
  async function collect(dir, depth) {
    if (depth > maxDepth) return
    let entries = []
    try { entries = await fs.promises.readdir(dir, { withFileTypes: true }) } catch { return }
    for (const entry of entries) {
      if (!entry.isDirectory()) continue
      const full = path.join(dir, entry.name)
      candidates.push(full)
      if (entry.name === 'Contents') {
        const home = path.join(full, 'Home')
        try { await fs.promises.access(home); candidates.push(home) } catch {}
      }
      await collect(full, depth + 1)
    }
    await yieldToEventLoop()
  }
  await collect(extractDir, 1)
  let lastError = null
  for (const candidate of candidates) {
    try {
      const executable = resolveJavaPath(candidate)
      return path.dirname(path.dirname(executable))
    } catch (error) {
      lastError = error
    }
  }
  for (const candidate of candidates) {
    try {
      const binJava = process.platform === 'win32' ? path.join(candidate, 'bin', 'javaw.exe') : path.join(candidate, 'bin', 'java')
      const binJavaAlt = path.join(candidate, 'bin', 'java')
      let found = null
      for (const p of [binJava, binJavaAlt]) {
        try { await fs.promises.access(p); found = p; break } catch {}
      }
      if (found) {
        const home = path.dirname(path.dirname(found))
        const check = validateJavaHome(home)
        if (check.valid) return check.home
      }
    } catch {}
  }
  throw new Error(`No se encontro un runtime Java compatible despues de extraerlo: ${lastError?.message || 'estructura invalida'}`)
}

function getRequiredJavaMajor(mcVersion) {
  const version = String(mcVersion || '').trim()
  const parts = version.split('.').map(part => parseInt(part, 10) || 0)
  const head = parts[0]

  if (head >= 26) return 25

  if (head === 1) {
    const minor = parts[1] || 0
    const patch = parts[2] || 0
    if (minor < 17) return 8
    if (minor < 20) return 17
    if (minor === 20 && patch < 5) return 17
    return 21
  }

  return 21
}

function getAdoptiumDownloadUrl(javaMajor) {
  return `https://api.adoptium.net/v3/binary/latest/${javaMajor}/ga/${getCurrentJavaPlatform()}/${getCurrentJavaArch()}/jre/hotspot/normal/eclipse?project=jdk`
}

const MAX_JRE_EXTRACTED_BYTES = 2 * 1024 * 1024 * 1024

// Metadatos del JRE desde la API de Adoptium (misma plataforma/arch que el
// binario): checksum sha256 y tamaño exacto para verificar antes de extraer.
async function getAdoptiumJreAsset(javaMajor) {
  const url = `https://api.adoptium.net/v3/assets/latest/${encodeURIComponent(String(javaMajor))}/hotspot`
    + `?os=${encodeURIComponent(getCurrentJavaPlatform())}`
    + `&architecture=${encodeURIComponent(getCurrentJavaArch())}`
    + '&image_type=jre'
  const controller = new AbortController()
  const timer = setTimeout(() => {
    try { controller.abort(new Error('Timeout consultando metadatos del JRE en Adoptium.')) } catch {}
  }, 15000)
  if (timer && typeof timer.unref === 'function') {
    try { timer.unref() } catch {}
  }
  try {
    const response = await fetch(url, {
      headers: { 'User-Agent': MODRINTH_USER_AGENT, Accept: 'application/json' },
      signal: controller.signal
    })
    const body = await response.json().catch(() => ([]))
    if (!response.ok) throw new Error('Adoptium no devolvió metadatos del JRE: HTTP ' + response.status)
    const entry = Array.isArray(body) ? body[0] : null
    const binaries = entry ? (entry.binaries || (entry.binary ? [entry.binary] : [])) : []
    const pkg = binaries.map(item => item && item.package).find(item => item && item.checksum && item.size)
    if (!pkg) throw new Error('Adoptium no informó checksum del JRE.')
    const checksum = String(pkg.checksum).trim().toLowerCase()
    if (!/^[a-f0-9]{64}$/.test(checksum)) throw new Error('Checksum del JRE con formato inválido.')
    return { sha256: checksum, size: Number(pkg.size) >>> 0 }
  } finally {
    try { clearTimeout(timer) } catch {}
  }
}

// Filtro anti-tar-slip para el JRE: sin absolutos, sin `..`, sin symlinks ni
// hardlinks (defensa en profundidad; strict:true ya rechaza parte de esto).
function isSafeTarEntry(entryPath, entry) {
  const raw = String(entryPath || '')
  if (!raw || path.isAbsolute(raw)) return false
  if (raw.split(/[\\/]/).includes('..')) return false
  const type = entry && entry.header && entry.header.type
  if (type === 'SymbolicLink' || type === 'Link') return false
  return true
}

const JAVA_MAJORS = [25, 21, 17, 8]

function javaHomeFromCandidate(candidate) {
  if (!isLocalAbsolutePath(candidate) || !fs.existsSync(candidate)) return ''
  try {
    const resolved = resolveJavaPath(candidate)
    return path.dirname(path.dirname(resolved))
  } catch {
    return ''
  }
}

function validateJavaHome(homeDir) {
  if (!homeDir) return { valid: false, path: '', home: '' }
  try {
    const javaExecutable = resolveJavaPath(homeDir)
    return { valid: true, path: javaExecutable, home: path.dirname(path.dirname(javaExecutable)) }
  } catch {
    return { valid: false, path: '', home: homeDir }
  }
}

// Ruta canónica del binario (resuelve symlinks): es lo que se compara y lo
// que se ejecuta, para que un enlace no oculte el destino real.
function canonicalJavaBinary(javaPath) {
  const clean = String(javaPath || '').trim().replace(/^"|"$/g, '')
  if (!clean) return ''
  try {
    return fs.realpathSync(clean)
  } catch {
    return path.resolve(clean)
  }
}

function isManagedJavaBinary(canonicalPath) {
  if (!canonicalPath) return false
  const runtimeRoot = path.resolve(path.join(getKindyrDataRoot(), 'runtime')) + path.sep
  return String(canonicalPath).startsWith(runtimeRoot)
}

function isTrustedJavaBinary(javaPath) {
  const canonical = canonicalJavaBinary(javaPath)
  if (!canonical) return { trusted: false, canonical: '' }
  if (isManagedJavaBinary(canonical)) return { trusted: true, canonical }
  // Las entradas que ya no existen no son confiables: evita que una ruta
  // aprobada y luego recreada por terceros herede la autorización, y obliga
  // a re-elegir tras desinstalar un JDK.
  try {
    if (!fs.existsSync(canonical)) return { trusted: false, canonical }
  } catch {
    return { trusted: false, canonical }
  }
  const approved = loadLauncherSettings().approvedJavaBinaries || []
  if (approved.includes(canonical)) return { trusted: true, canonical }
  return { trusted: false, canonical }
}

function approveJavaBinary(javaPath) {
  const canonical = canonicalJavaBinary(javaPath)
  if (!canonical) return ''
  const settings = loadLauncherSettings()
  const rest = (settings.approvedJavaBinaries || []).filter(item => item !== canonical)
  // Evicción por antigüedad: si la lista está llena sale la más vieja, nunca
  // se descarta en silencio la aprobación recién otorgada.
  const next = sanitizeApprovedJavaBinaries([...rest.slice(-(MAX_APPROVED_JAVA_BINARIES - 1)), canonical])
  settings.approvedJavaBinaries = next
  saveLauncherSettings(settings)
  return canonical
}

// KL-05: la ruta global solo se acepta con procedencia confiable (runtime
// gestionado, carpeta elegida en el diálogo nativo, Java detectado por main o
// confirmado por el usuario en un diálogo nativo). `confirm(javaPath)` lo
// aporta el llamador (main/ipc/settings.js) para poder probarlo sin UI.
async function authorizeJavaHome(candidate, { confirm } = {}) {
  const clean = String(candidate || '').trim()
  if (!isLocalAbsolutePath(clean)) return { ok: false, error: 'La ruta de Java debe estar en un disco local.' }
  const check = validateJavaHome(clean)
  if (!check.valid || !check.path) return { ok: false, error: 'La ruta no contiene un Java valido.' }
  if (!isTrustedJavaBinary(check.path).trusted) {
    const accepted = typeof confirm === 'function' ? await confirm(check.path) : false
    if (!accepted) return { ok: false, cancelled: true, error: 'Ruta de Java no autorizada.' }
    approveJavaBinary(check.path)
  }
  return { ok: true, home: check.home, path: check.path }
}

function getConfiguredJavaHome(javaMajor) {
  const settings = loadLauncherSettings()
  const custom = String(settings.javaInstalls[String(javaMajor)] || '').trim()
  if (custom) {
    const check = validateJavaHome(custom)
    // KL-05: antes se ejecutaba sin comprobar procedencia. Una ruta global no
    // aprobada (p. ej. guardada por versiones anteriores) se ignora y se usa
    // el runtime gestionado; el usuario puede re-autorizarla en Ajustes.
    if (check.valid && isTrustedJavaBinary(check.path).trusted) return check.home
    if (check.valid) writeLaunchLog(`Java ${javaMajor} configurado sin autorizar (${check.path}); se usa el runtime gestionado. Autorizalo de nuevo en Ajustes.`)
  }
  return readManagedJavaHome(javaMajor)
}

function detectJavaInstallation(javaMajor) {
  const managed = readManagedJavaHome(javaMajor)
  if (managed) return { ok: true, path: managed, source: 'managed' }

  const settings = loadLauncherSettings()
  const custom = String(settings.javaInstalls[String(javaMajor)] || '').trim()
  if (custom) {
    const check = validateJavaHome(custom)
    if (check.valid) return { ok: true, path: check.home, source: 'custom' }
  }

  const candidates = [process.env.JAVA_HOME].filter(Boolean)
  const parents = process.platform === 'win32'
    ? [
      ...[process.env.ProgramFiles, process.env['ProgramFiles(x86)']]
        .filter(Boolean)
        .flatMap(base => ['Eclipse Adoptium', 'Java', 'Microsoft', 'Zulu'].map(folder => path.join(base, folder))),
      process.env.LOCALAPPDATA ? path.join(process.env.LOCALAPPDATA, 'Programs') : ''
    ].filter(Boolean)
    : process.platform === 'darwin'
      ? ['/Library/Java/JavaVirtualMachines', path.join(process.env.HOME || '', 'Library', 'Java', 'JavaVirtualMachines')]
      : ['/usr/lib/jvm', '/usr/java', '/opt/java']

  for (const parent of parents) {
    if (!fs.existsSync(parent)) continue
    try {
      for (const entry of fs.readdirSync(parent, { withFileTypes: true })) {
        if (!entry.isDirectory() || !entry.name.includes(String(javaMajor))) continue
        const base = path.join(parent, entry.name)
        candidates.push(process.platform === 'darwin' ? path.join(base, 'Contents', 'Home') : base)
      }
    } catch { }
  }

  for (const candidate of candidates) {
    const home = javaHomeFromCandidate(candidate)
    if (home) return { ok: true, path: home, source: 'detected' }
  }

  return { ok: false, error: `No se encontro Java ${javaMajor} en el sistema.` }
}

async function downloadManagedJava(javaMajor, progressFn) {
  const runtimeDir = getManagedRuntimeDir(javaMajor)
  const archiveExtension = process.platform === 'win32' ? '.zip' : '.tar.gz'
  const archivePath = path.join(runtimeDir, `download${archiveExtension}`)
  const extractDir = path.join(runtimeDir, '_extract')
  const stagingDir = path.join(runtimeDir, `_extract.staging-${process.pid}-${Date.now()}`)
  const report = (type, message) => {
    if (progressFn) progressFn(type, message)
    else logAndSend(type, message)
  }

  await fs.promises.mkdir(runtimeDir, { recursive: true })
  await fs.promises.mkdir(stagingDir, { recursive: true })

  const url = getAdoptiumDownloadUrl(javaMajor)
  report('progress', `Descargando Java ${javaMajor} (Eclipse Temurin)...`)
  writeLaunchLog(`Descargando runtime Java ${javaMajor} para ${process.platform}/${process.arch} desde Adoptium`)

  let backupDir = ''
  try {
    await downloadToFile(url, archivePath)
    // Verificación obligatoria pre-extracción: sha256 de la API de Adoptium
    // (misma plataforma/arch). Sin checksum no se extrae a ciegas.
    let asset = null
    try {
      asset = await getAdoptiumJreAsset(javaMajor)
    } catch (error) {
      await fs.promises.rm(archivePath, { force: true }).catch(() => {})
      throw new Error(`No se pudo verificar el JRE de Adoptium (${error.message || String(error)}). Archivo eliminado, no se instaló nada.`)
    }
    const archiveStat = await fs.promises.stat(archivePath).catch(() => null)
    if (!archiveStat || !archiveStat.isFile() || archiveStat.size === 0) {
      await fs.promises.rm(archivePath, { force: true }).catch(() => {})
      throw new Error('El JRE descargado está vacío o no es un archivo válido.')
    }
    if (asset.size && archiveStat.size !== asset.size) {
      await fs.promises.rm(archivePath, { force: true }).catch(() => {})
      throw new Error(`El JRE descargado no coincide en tamaño con el publicado por Adoptium (${archiveStat.size} vs ${asset.size} bytes). Archivo eliminado.`)
    }
    const actualSha256 = await sha256OfFile(archivePath)
    if (actualSha256 !== asset.sha256) {
      await fs.promises.rm(archivePath, { force: true }).catch(() => {})
      throw new Error('El JRE descargado no coincide con el sha256 publicado por Adoptium. Archivo eliminado, no se instaló nada.')
    }
    writeLaunchLog(`JRE ${javaMajor} verificado contra sha256 de Adoptium.`)
    await yieldToEventLoop()
    report('progress', `Extrayendo Java ${javaMajor}...`)

    if (archiveExtension === '.zip') {
      await extractZipEntries(archivePath, stagingDir, {
        maxEntries: 200000,
        maxEntryBytes: 1024 * 1024 * 1024,
        maxTotalBytes: 4 * 1024 * 1024 * 1024
      })
    } else {
      const tar = require('tar')
      await tar.x({
        file: archivePath,
        cwd: stagingDir,
        strict: true,
        preservePaths: false,
        filter: (entryPath, entry) => isSafeTarEntry(entryPath, entry)
      })
    }
    // Techo anti gzip-bomb: un JRE ocupa cientos de MB; si lo extraído supera
    // el límite se descarta todo antes de buscar el binario java.
    const extractedBytes = await getDirSizeBytes(stagingDir)
    if (extractedBytes > MAX_JRE_EXTRACTED_BYTES) {
      throw new Error('El JRE extraído supera el tamaño máximo permitido; archivo descartado.')
    }
    await yieldToEventLoop()

    const stagedHome = await findExtractedJdkRoot(stagingDir)
    const relativeHome = path.relative(stagingDir, stagedHome)
    try { await fs.promises.access(extractDir) } catch { /* ok */ }
    if (await fs.promises.access(extractDir).then(() => true).catch(() => false)) {
      backupDir = path.join(runtimeDir, `_extract.previous-${Date.now()}`)
      await fs.promises.rename(extractDir, backupDir)
    }
    await fs.promises.rename(stagingDir, extractDir)
    const homeDir = path.join(extractDir, relativeHome)
    const javaExecutable = resolveJavaPath(homeDir)
    writeManagedJavaHome(javaMajor, homeDir)

    const settings = loadLauncherSettings()
    const configured = String(settings.javaInstalls[String(javaMajor)] || '').trim()
    const runtimeRoot = path.resolve(getKindyrDataRoot(), 'runtime') + path.sep
    if (configured && path.resolve(configured).startsWith(runtimeRoot)) {
      settings.javaInstalls[String(javaMajor)] = ''
      saveLauncherSettings(settings)
    }

    return javaExecutable
  } catch (err) {
    try { await fs.promises.rm(stagingDir, { recursive: true, force: true }) } catch {}
    if (backupDir) {
      const extractExists = await fs.promises.access(extractDir).then(() => true).catch(() => false)
      const backupExists = await fs.promises.access(backupDir).then(() => true).catch(() => false)
      if (!extractExists && backupExists) {
        await fs.promises.rename(backupDir, extractDir)
      }
    }
    throw err
  } finally {
    try { await fs.promises.unlink(archivePath) } catch {}
  }
}

async function ensureManagedJava(mcVersion) {
  const javaMajor = getRequiredJavaMajor(mcVersion)
  const configured = getConfiguredJavaHome(javaMajor)
  if (configured) {
    return resolveJavaPath(configured)
  }

  try {
    return await downloadManagedJava(javaMajor)
  } catch (error) {
    throw new Error(
      `No se pudo instalar Java ${javaMajor} automaticamente: ${error.message || String(error)}`
    )
  }
}

async function resolveLaunchJavaPath(mcVersion) {
  return ensureManagedJava(mcVersion)
}

function ensureJavaExecutableForLaunch(javaPath) {
  const executable = resolveJavaPath(javaPath)
  if (!fs.existsSync(executable) || !fs.statSync(executable).isFile()) {
    throw new Error(`El ejecutable de Java no existe o no es un archivo: ${executable}`)
  }
  if (process.platform === 'linux') {
    if (/\.exe$/i.test(executable)) {
      throw new Error(`No se puede ejecutar un binario .exe de Windows en Linux: ${executable}`)
    }
    try {
      fs.accessSync(executable, fs.constants.X_OK)
    } catch {
      try {
        fs.chmodSync(executable, 0o755)
        fs.accessSync(executable, fs.constants.X_OK)
      } catch (error) {
        throw new Error(`Java no tiene permisos de ejecucion y no se pudieron corregir: ${executable}. ${error.message || String(error)}`)
      }
    }
  }
  return executable
}

module.exports = {
  JAVA_MAJORS,
  approveJavaBinary,
  authorizeJavaHome,
  detectJavaInstallation,
  downloadManagedJava,
  ensureJavaExecutableForLaunch,
  ensureManagedJava,
  getConfiguredJavaHome,
  getRequiredJavaMajor,
  isTrustedJavaBinary,
  javaHomeFromCandidate,
  readManagedJavaHome,
  resolveJavaPath,
  resolveLaunchJavaPath,
  validateJavaHome
}

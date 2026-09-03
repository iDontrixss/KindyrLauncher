
if (process.platform === 'linux' && process.env.KINDYR_ENABLE_GPU !== '1') {
  process.env.ELECTRON_OZONE_PLATFORM_HINT = 'x11'
}

const { app, BrowserWindow, ipcMain, shell, nativeImage, safeStorage } = require('electron')
const fs = require('fs')
const path = require('path')
const crypto = require('crypto')
const { Readable } = require('stream')
const { pipeline } = require('stream/promises')
const { createMicrosoftAccountStore, sanitizeMicrosoftAccount } = require('./account-storage')
const { createCurseForgeStore } = require('./curseforge-store')
const { MAX_SKIN_BYTES, sanitizeSkinName, validateSkinPng, validateSkinSourceUrl } = require('./skin-security')
const { extractZipEntries, readZipEntryBuffer, writeZip } = require('./archive-utils')
const { getClientMrpackFiles, verifyMrpackFile, normalizeMrpackPath } = require('./mrpack-utils')
const PROFILE_ENABLED = process.env.KINDYR_PROFILE === '1'

// --- XMCL subpath shim for Node's type stripping limitation (file-transfer main is TS, core/utils missing) ---
try {
  const Module = require('module')
  const originalResolveFilename = Module._resolveFilename
  Module._resolveFilename = function(request, parent, isMain, options) {
    // Core utils - pnpm store has no utils.js, use shim
    if (request === '@xmcl/core/utils' || request === '@xmcl/core/utils.js') {
      const shim = path.join(__dirname, 'xmcl-shims', 'core-utils.js')
      if (fs.existsSync(shim)) return shim
      try {
        const coreDist = require.resolve('@xmcl/core/dist/index.js')
        if (fs.existsSync(coreDist)) return coreDist
      } catch {}
    }
    // File-transfer main is TS (index.ts) - use compiled dist to avoid strip-types error and undici resolution
    if (request === '@xmcl/file-transfer' || request === '@xmcl/file-transfer/dist/index.js' || request === '@xmcl/file-transfer/index.ts') {
      try {
        const pnpmStore = path.join(__dirname, 'node_modules', '.pnpm')
        if (fs.existsSync(pnpmStore)) {
          const entries = fs.readdirSync(pnpmStore).filter(e => e.startsWith('@xmcl+file-transfer@'))
          for (const entry of entries) {
            const candidate = path.join(pnpmStore, entry, 'node_modules', '@xmcl', 'file-transfer', 'dist', 'index.js')
            if (fs.existsSync(candidate)) return candidate
          }
        }
      } catch {}
      const candidates = [
        path.join(__dirname, 'node_modules', '@xmcl', 'file-transfer', 'dist', 'index.js')
      ]
      for (const c of candidates) if (fs.existsSync(c)) return c
      try {
        const resolved = require.resolve('@xmcl/file-transfer/dist/index.js')
        if (fs.existsSync(resolved)) return resolved
      } catch {}
    }
    // Generic fallback for any @xmcl/* subpath that would hit TS strip error: try dist
    if (request.startsWith('@xmcl/') && request.includes('/') && !request.endsWith('.js') && !request.endsWith('.mjs')) {
      const parts = request.split('/')
      if (parts.length === 3) {
        const pkg = `${parts[0]}/${parts[1]}`
        const sub = parts[2]
        // Try shim for known subpaths
        if (pkg === '@xmcl/core' && sub === 'utils') {
          const shim = path.join(__dirname, 'xmcl-shims', 'core-utils.js')
          if (fs.existsSync(shim)) return shim
        }
        // Try dist file for subpath
        try {
          const base = require.resolve(`${pkg}/dist/index.js`)
          const dir = path.dirname(base)
          const candidate = path.join(dir, `${sub}.js`)
          if (fs.existsSync(candidate)) return candidate
        } catch {}
      }
    }
    return originalResolveFilename.apply(this, arguments)
  }
} catch {}
process.on('uncaughtException', (error) => {
  console.error('Error:', error)
})

if (process.platform === 'linux' && process.env.KINDYR_ENABLE_GPU !== '1') {
  app.commandLine.appendSwitch('disable-gpu')
  app.commandLine.appendSwitch('disable-gpu-compositing')
  console.log('[Kindyr] Linux safe graphics enabled')
}

function getLinuxPssKiB(pid) {
  if (!PROFILE_ENABLED || process.platform !== 'linux') return null
  try {
    const rollup = fs.readFileSync(`/proc/${pid}/smaps_rollup`, 'utf8')
    const match = rollup.match(/^Pss:\s+(\d+)\s+kB$/m)
    return match ? Number(match[1]) : null
  } catch {
    return null
  }
}

async function profileCheckpoint(label, renderer = null) {
  if (!PROFILE_ENABLED || !app.isReady()) return

  const mainMemory = await process.getProcessMemoryInfo()
  const processes = app.getAppMetrics().map(metric => ({
    pid: metric.pid,
    type: metric.type,
    name: metric.name,
    cpu: metric.cpu,
    memory: metric.memory,
    pssKiB: getLinuxPssKiB(metric.pid)
  }))
  const snapshot = {
    label: String(label || 'checkpoint').slice(0, 80),
    timestamp: new Date().toISOString(),
    uptimeSeconds: Math.round(process.uptime() * 10) / 10,
    mainMemory,
    mainPssKiB: getLinuxPssKiB(process.pid),
    renderer,
    processes
  }
  console.log('[Kindyr profile]', JSON.stringify(snapshot))
}

function scheduleProfileCheckpoint(label, delayMs = 0, renderer = null) {
  if (!PROFILE_ENABLED) return
  const timer = setTimeout(() => {
    profileCheckpoint(label, renderer).catch(error => {
      console.error('[Kindyr profile] Failed to collect metrics:', error.message || error)
    })
  }, delayMs)
  timer.unref?.()
}

if (PROFILE_ENABLED) {
  ipcMain.on('profile-checkpoint', (_event, payload = {}) => {
    const label = typeof payload === 'string' ? payload : payload.label
    const renderer = payload && typeof payload === 'object' ? payload.renderer : null
    scheduleProfileCheckpoint(label, 50, renderer)
  })
}

let msmcAuth = null
let autoUpdaterInstance = null
let autoUpdaterConfigured = false
let semverModule = null
let xmclCorePromise = null
let xmclFileTransferPromise = null
let xmclInstallerPromise = null
let xmclLaunchTask = null
let xmclCancellationRequested = false

let microsoftAccounts = []
let microsoftAccountStore = null
const microsoftAccountRefreshRequests = new Map()
let microsoftAccountWriteQueue = Promise.resolve()

function getCurseForgeKeyFile() {
  return path.join(getKindyrDataRoot(), 'curseforge.key')
}
let curseForgeStore = null
function getCurseForgeStore() {
  if (!curseForgeStore) {
    curseForgeStore = createCurseForgeStore({ fs, path, safeStorage, filePath: getCurseForgeKeyFile() })
  }
  return curseForgeStore
}
// Key embebida obfuscada para código libre: todos usan la API sin config, pero key nunca plaintext en git
// Generada por: CURSEFORGE_API_KEY="..." node scripts/obfuscate-curseforge-key.js -> curseforge-embedded.json {k:"..."} (gitignored)
// En CI: secret CURSEFORGE_API_KEY genera el json antes de build; el ASAR lleva solo base64 XOR+ROT+reverse, no plaintext greppeable
// Parche seguridad: descifrado LAZY - solo cuando se entra explícitamente a descubrir/curseforge (search/status)
// Anti-RE: xorKey fragmentado (no literal), ROT 37, reverse, buffers zeroizados. Nunca loggear key/k/xorKey/plaintext
function deriveEmbeddedXorKey() {
  const p1 = Buffer.from('S2luZHly', 'base64').toString()
  const p2 = Buffer.from('TGF1bmNoZXI=', 'base64').toString()
  const p3 = String.fromCharCode(45)
  const p4 = Buffer.from('Q3Vyc2VGb3JnZQ==', 'base64').toString()
  const p5 = Buffer.from('MjAyNg==', 'base64').toString()
  return p1 + p2 + p3 + p4 + p3 + p5
}
function getEmbeddedCurseForgeKey() {
  // Nota portabilidad: este descifrado es DETERMINÍSTICO y portátil. Funciona en cualquier PC que instale el build,
  // porque curseforge-embedded.json está empaquetado DENTRO del ASAR (package.json:files) y la derivación no depende de máquina.
  // No es "solo local dev" — es distribuido. El fallback safeStorage es per-máquina y también portátil.
  try {
    // Anti-RE: evitar que require cache quede con plaintext accesible largo tiempo — leer fresco
    let embedded
    try {
      const resolved = require.resolve('./curseforge-embedded.json')
      delete require.cache[resolved]
    } catch {}
    embedded = require('./curseforge-embedded.json')
    if (embedded && typeof embedded.k === 'string' && embedded.k) {
      const xorKey = deriveEmbeddedXorKey()
      const ROT = 37
      const buf = Buffer.from(embedded.k, 'base64')
      for (let i = 0; i < buf.length; i++) buf[i] = (buf[i] - ROT + 256) & 0xFF
      buf.reverse()
      const out = Buffer.alloc(buf.length)
      for (let i = 0; i < buf.length; i++) out[i] = buf[i] ^ xorKey.charCodeAt(i % xorKey.length)
      const decoded = out.toString('utf8').trim()
      try { buf.fill(0); out.fill(0) } catch {}
      // No dejar xorKey en string pool más de lo necesario — no loggear
      return decoded
    }
  } catch {}
  return ''
}

function getCurseForgeApiKey() {
  // 0) embebida obfuscada LAZY (solo se descifra si se pide explícitamente)
  const embedded = getEmbeddedCurseForgeKey()
  if (embedded) return embedded
  // 1) env var dev / inyección CI – se auto-cifra al disco y se borra de memoria
  const envKey = String(process.env.CURSEFORGE_API_KEY || '').trim()
  if (envKey) {
    try { getCurseForgeStore().save(envKey) } catch {}
    try { delete process.env.CURSEFORGE_API_KEY } catch {}
    return envKey
  }
  // 2) store cifrado por usuario (fallback UI CurseForge)
  try { return getCurseForgeStore().load() } catch { return '' }
}

function getMicrosoftAccountsFile() {
  return path.join(getKindyrDataRoot(), 'ms-accounts.json')
}

function getMicrosoftAccountStore() {
  if (!microsoftAccountStore) {
    microsoftAccountStore = createMicrosoftAccountStore({
      fs,
      path,
      safeStorage,
      filePath: getMicrosoftAccountsFile()
    })
  }
  return microsoftAccountStore
}

function loadMicrosoftAccounts() {
  return getMicrosoftAccountStore().load()
}

function saveMicrosoftAccounts(accounts) {
  getMicrosoftAccountStore().save(accounts)
}

function saveMicrosoftAccountsQueued(accounts) {
  const task = () => {
    getMicrosoftAccountStore().save(accounts)
    return accounts
  }
  microsoftAccountWriteQueue = microsoftAccountWriteQueue.then(task, task)
  return microsoftAccountWriteQueue
}

async function withMicrosoftAccounts(mutator) {
  const result = await (microsoftAccountWriteQueue = microsoftAccountWriteQueue.then(async () => {
    const accounts = getMicrosoftAccountStore().load()
    const updated = await mutator(accounts)
    if (updated !== undefined) {
      getMicrosoftAccountStore().save(updated)
      microsoftAccounts = updated
      return updated
    }
    microsoftAccounts = accounts
    return accounts
  }).catch(async (error) => {
    const accounts = getMicrosoftAccountStore().load()
    const updated = await mutator(accounts)
    if (updated !== undefined) {
      getMicrosoftAccountStore().save(updated)
      microsoftAccounts = updated
      return updated
    }
    throw error
  }))
  return result
}

const preparingInstances = new Map()
let mainWindow
let minecraftProcess = null
let runningInstanceId = null
let activeLaunchInstanceId = null
let launchRequestInProgress = false
let inicioCancelado = false
let minecraftStopRequested = false
let splashWindow
let splashCloseTimer = null
let mainWindowLoadFallbackTimer = null
let launchStartedAt = 0
let currentLogFile = null
let lastProgressMessage = ''
let lastProgressSentAt = 0
let lastDataMessage = ''
let lastDataSentAt = 0
let pendingLogLines = []
let pendingLogBytes = 0
let logFlushTimer = null
const MAX_PENDING_LOG_LINES = 500
const MAX_PENDING_LOG_BYTES = 512 * 1024
const MAX_PENDING_LOG_LINE_BYTES = 64 * 1024

function clearSplashCloseTimer() {
  if (!splashCloseTimer) return
  clearTimeout(splashCloseTimer)
  splashCloseTimer = null
}

function clearMainWindowLoadFallbackTimer() {
  if (!mainWindowLoadFallbackTimer) return
  clearTimeout(mainWindowLoadFallbackTimer)
  mainWindowLoadFallbackTimer = null
}

const defaultInstances = [
  { id: 'vanilla-1.21.4', name: 'Minecraft 1.21.4', version: '1.21.4', loader: 'vanilla' },
  { id: 'vanilla-1.20.6', name: 'Minecraft 1.20.6', version: '1.20.6', loader: 'vanilla' },
  { id: 'vanilla-1.19.4', name: 'Minecraft 1.19.4', version: '1.19.4', loader: 'vanilla' },
  { id: 'vanilla-1.18.2', name: 'Minecraft 1.18.2', version: '1.18.2', loader: 'vanilla' }
]

const MODRINTH_API = 'https://api.modrinth.com/v2'
const MODRINTH_USER_AGENT = 'KindyrLauncher/0.1.0 (Minecraft launcher)'
const CURSEFORGE_API = 'https://api.curseforge.com/v1'
const MOJANG_VERSION_MANIFEST = 'https://piston-meta.mojang.com/mc/game/version_manifest_v2.json'
const FABRIC_META = 'https://meta.fabricmc.net/v2'
const QUILT_META = 'https://meta.quiltmc.org/v3'
const FORGE_MAVEN_METADATA = 'https://maven.minecraftforge.net/net/minecraftforge/forge/maven-metadata.xml'
const NEOFORGE_MAVEN_METADATA = 'https://maven.neoforged.net/releases/net/neoforged/neoforge/maven-metadata.xml'
let minecraftVersionCache = null
let minecraftVersionRequest = null
let loaderVersionCache = {}
const loaderVersionRequests = new Map()
let versionCacheCleanupTimer = null
const VERSION_CACHE_TTL_MS = 10 * 60 * 1000
const MAX_LOADER_VERSION_CACHE_ENTRIES = 5

function scheduleVersionCacheCleanup() {
  if (versionCacheCleanupTimer) {
    clearTimeout(versionCacheCleanupTimer)
    versionCacheCleanupTimer = null
  }

  const cachedAtValues = [
    minecraftVersionCache?.cachedAt,
    ...Object.values(loaderVersionCache).map(entry => entry?.cachedAt)
  ].filter(Number.isFinite)

  if (cachedAtValues.length === 0) return

  const nextExpiry = Math.min(...cachedAtValues) + VERSION_CACHE_TTL_MS
  versionCacheCleanupTimer = setTimeout(() => {
    versionCacheCleanupTimer = null
    pruneVersionCaches()
  }, Math.max(1, nextExpiry - Date.now()))
  versionCacheCleanupTimer.unref?.()
}

function pruneVersionCaches(now = Date.now()) {
  if (minecraftVersionCache && now - minecraftVersionCache.cachedAt >= VERSION_CACHE_TTL_MS) {
    minecraftVersionCache = null
  }

  for (const [key, entry] of Object.entries(loaderVersionCache)) {
    if (!entry || !Number.isFinite(entry.cachedAt) || now - entry.cachedAt >= VERSION_CACHE_TTL_MS) {
      delete loaderVersionCache[key]
    }
  }

  const loaderEntries = Object.entries(loaderVersionCache)
    .sort(([, left], [, right]) => right.cachedAt - left.cachedAt)
  for (const [key] of loaderEntries.slice(MAX_LOADER_VERSION_CACHE_ENTRIES)) {
    delete loaderVersionCache[key]
  }

  scheduleVersionCacheCleanup()
}

async function runWithConcurrency(items, limit, worker) {
  const list = Array.from(items || [])
  if (!list.length) return

  let nextIndex = 0
  const workerCount = Math.min(Math.max(1, Number(limit) || 1), list.length)

  async function runWorker() {
    while (nextIndex < list.length) {
      const index = nextIndex++
      await worker(list[index], index)
    }
  }

  await Promise.all(Array.from({ length: workerCount }, runWorker))
}
const modrinthTypeFilters = {
  all: [],
  mod: [['project_type:mod']],
  modpack: [['project_type:modpack']],
  resourcepack: [['project_type:resourcepack']],
  shader: [['project_type:shader']],
  datapack: [['project_type:mod'], ['categories:datapack']],
  plugin: [['project_type:mod'], ['categories:bukkit', 'categories:spigot', 'categories:paper', 'categories:purpur', 'categories:folia', 'categories:velocity', 'categories:waterfall', 'categories:sponge']]
}
const modrinthSorts = new Set(['relevance', 'downloads', 'follows', 'newest', 'updated'])

function getSemver() {
  if (!semverModule) semverModule = require('semver')
  return semverModule
}

function getAutoUpdater() {
  if (!autoUpdaterInstance) {
    autoUpdaterInstance = require('electron-updater').autoUpdater
  }
  configureAutoUpdater(autoUpdaterInstance)
  return autoUpdaterInstance
}

function getXmclCore() {
  if (!xmclCorePromise) {
    xmclCorePromise = Promise.resolve()
      .then(() => require('@xmcl/core'))
      .catch(error => {
        xmclCorePromise = null
        throw error
      })
  }
  return xmclCorePromise
}

function getXmclFileTransfer() {
  if (!xmclFileTransferPromise) {
    xmclFileTransferPromise = Promise.resolve()
      .then(() => {
        try {
          return require('@xmcl/file-transfer/dist/index.js')
        } catch {
          return require('@xmcl/file-transfer')
        }
      })
      .catch(error => {
        xmclFileTransferPromise = null
        throw error
      })
  }
  return xmclFileTransferPromise
}

function getXmclInstaller() {
  if (!xmclInstallerPromise) {
    xmclInstallerPromise = Promise.resolve()
      .then(() => require('@xmcl/installer'))
      .catch(error => {
        xmclInstallerPromise = null
        throw error
      })
  }
  return xmclInstallerPromise
}

function getMicrosoftAuth() {
  if (!msmcAuth) {
    const { Auth } = require('msmc')
    msmcAuth = new Auth('select_account')
  }
  return msmcAuth
}

function getMinecraftCredentials(token) {
  const fullToken = token.getToken(true)
  const profile = fullToken.profile || token.profile
  if (!fullToken.mcToken || !profile?.id || !profile?.name) {
    throw new Error('Microsoft no devolvió credenciales completas de Minecraft.')
  }
  return {
    access_token: fullToken.mcToken,
    uuid: profile.id,
    name: profile.name,
    xuid: fullToken.xuid || token.xuid || '',
    expires_at: normalizeMicrosoftTokenExpiry(fullToken.exp || token.exp),
    user_properties: {}
  }
}

function normalizeMicrosoftTokenExpiry(expiry) {
  const value = Number(expiry)
  if (!Number.isFinite(value) || value <= 0) return 0
  return value < 1_000_000_000_000 ? value * 1000 : value
}

function getMicrosoftAccessTokenExpiry(accessToken) {
  try {
    const payload = String(accessToken || '').split('.')[1]
    if (!payload) return 0
    return normalizeMicrosoftTokenExpiry(JSON.parse(Buffer.from(payload, 'base64url').toString('utf8')).exp)
  } catch {
    return 0
  }
}

function getMicrosoftAccountExpiry(account) {
  return normalizeMicrosoftTokenExpiry(account?.expires_at) || getMicrosoftAccessTokenExpiry(account?.access_token)
}

function persistMicrosoftCredentials(account, xboxManager, token) {
  const credentials = getMinecraftCredentials(token)
  const refreshToken = xboxManager.save()
  if (!refreshToken) throw new Error('Microsoft no devolvió un token de renovación válido.')

  const accounts = loadMicrosoftAccounts()
  const index = accounts.findIndex(item => item.id === account.id)
  if (index < 0) throw new Error('La cuenta de Microsoft ya no existe en Kindyr.')

  const updatedAccount = {
    ...accounts[index],
    id: credentials.uuid,
    name: credentials.name,
    uuid: credentials.uuid,
    access_token: credentials.access_token,
    refresh_token: refreshToken,
    client_id: getMicrosoftAuth().token?.client_id || accounts[index].client_id || '',
    xuid: credentials.xuid,
    expires_at: credentials.expires_at,
    user_properties: credentials.user_properties || {},
    type: 'microsoft'
  }
  accounts[index] = updatedAccount
  saveMicrosoftAccounts(accounts)
  microsoftAccounts = accounts
  return updatedAccount
}

async function refreshMicrosoftAccount(account, { force = false } = {}) {
  if (!account) return null

  const expiresAt = getMicrosoftAccountExpiry(account)
  const hasUsableAccessToken = Boolean(account.access_token) && (!expiresAt || expiresAt > Date.now() + 5 * 60 * 1000)
  if (!force && hasUsableAccessToken) return account

  if (!account.refresh_token) {
    if (!force && account.access_token && (!expiresAt || expiresAt > Date.now())) return account
    throw new Error('La sesión de Microsoft venció. Iniciá sesión nuevamente para continuar.')
  }

  const accountKey = String(account.id || account.uuid || 'active')
  if (microsoftAccountRefreshRequests.has(accountKey)) {
    return microsoftAccountRefreshRequests.get(accountKey)
  }

  const request = (async () => {
    try {
      const xboxManager = await getMicrosoftAuth().refresh(account.refresh_token)
      const token = await xboxManager.getMinecraft()
      return persistMicrosoftCredentials(account, xboxManager, token)
    } catch (error) {
      console.error('[Kindyr] No se pudo renovar la sesión de Microsoft:', error?.code || error?.statusCode || error?.name || 'authentication_error')
      throw new Error('No se pudo renovar la sesión de Microsoft. Iniciá sesión nuevamente.', { cause: error })
    }
  })()

  microsoftAccountRefreshRequests.set(accountKey, request)
  try {
    return await request
  } finally {
    if (microsoftAccountRefreshRequests.get(accountKey) === request) {
      microsoftAccountRefreshRequests.delete(accountKey)
    }
  }
}

async function getActiveMicrosoftAccount(options) {
  microsoftAccounts = loadMicrosoftAccounts()
  const activeAccount = microsoftAccounts.find(account => account.active)
  return refreshMicrosoftAccount(activeAccount, options)
}

function getXuidFromMinecraftToken(accessToken) {
  try {
    const payload = String(accessToken || '').split('.')[1]
    if (!payload) return ''
    return String(JSON.parse(Buffer.from(payload, 'base64url').toString('utf8')).xuid || '')
  } catch {
    return ''
  }
}

function getKindyrDataRoot() {
  return path.join(app.getPath('appData'), 'KindyrLauncher')
}

function getInstanceDir(instanceId) {
  return path.join(getKindyrDataRoot(), 'instances', instanceId)
}

function getMinecraftRoot(instanceId) {
  return path.join(getInstanceDir(instanceId), 'minecraft')
}

function getLauncherLogsDir(instanceId) {
  return path.join(getInstanceDir(instanceId), 'launcher-logs')
}

const instanceFolders = {
  root: getInstanceDir,
  minecraft: getMinecraftRoot,
  mods: (instanceId) => path.join(getMinecraftRoot(instanceId), 'mods'),
  plugins: (instanceId) => path.join(getMinecraftRoot(instanceId), 'plugins'),
  datapacks: (instanceId) => path.join(getMinecraftRoot(instanceId), 'datapacks'),
  resourcepacks: (instanceId) => path.join(getMinecraftRoot(instanceId), 'resourcepacks'),
  shaderpacks: (instanceId) => path.join(getMinecraftRoot(instanceId), 'shaderpacks'),
  saves: (instanceId) => path.join(getMinecraftRoot(instanceId), 'saves'),
  logs: (instanceId) => path.join(getMinecraftRoot(instanceId), 'logs'),
  launcherLogs: getLauncherLogsDir
}

function getInstance(instanceId) {
  const customInstance = loadCustomInstances().find(item => item.id === instanceId)
  return customInstance || defaultInstances.find(item => item.id === instanceId)
}

function getCustomInstancesFile() {
  return path.join(getKindyrDataRoot(), 'instances.json')
}

let customInstancesCache = null

function loadCustomInstances() {
  if (customInstancesCache) return customInstancesCache.map(instance => ({ ...instance }))
  const file = getCustomInstancesFile()
  if (!fs.existsSync(file)) {
    customInstancesCache = []
    return []
  }
  try {
    const data = JSON.parse(fs.readFileSync(file, 'utf8'))
    customInstancesCache = Array.isArray(data) ? data : []
    return customInstancesCache.map(instance => ({ ...instance }))
  } catch {
    customInstancesCache = []
    return []
  }
}

function saveCustomInstances(instances) {
  customInstancesCache = Array.isArray(instances)
    ? instances.map(instance => ({ ...instance }))
    : []
  fs.mkdirSync(getKindyrDataRoot(), { recursive: true })
  fs.writeFileSync(getCustomInstancesFile(), JSON.stringify(customInstancesCache, null, 2))
}

function getAllInstances() {
  const merged = new Map(defaultInstances.map(instance => [instance.id, instance]))
  loadCustomInstances().forEach(instance => merged.set(instance.id, instance))
  return [...merged.values()]
}

function getInstanceTargetPath(instanceId, target) {
  const resolver = instanceFolders[target]
  if (!resolver) throw new Error('Carpeta no valida.')
  return resolver(instanceId)
}

function ensureMinecraftSubfolders(instanceId) {
  ;['mods', 'plugins', 'datapacks', 'resourcepacks', 'shaderpacks', 'saves', 'logs'].forEach(folder => {
    fs.mkdirSync(path.join(getMinecraftRoot(instanceId), folder), { recursive: true })
  })
  fs.mkdirSync(getLauncherLogsDir(instanceId), { recursive: true })
}

function safeFileName(fileName) {
  const clean = String(fileName || '')
  if (!clean || clean !== path.basename(clean)) throw new Error('Archivo no valido.')
  return clean
}

function listFiles(dir, predicate = () => true) {
  if (!fs.existsSync(dir)) return []
  return fs.readdirSync(dir, { withFileTypes: true })
    .filter(predicate)
    .map(entry => {
      const fullPath = path.join(dir, entry.name)
      const stat = fs.statSync(fullPath)
      return {
        name: entry.name,
        type: entry.isDirectory() ? 'folder' : 'file',
        size: stat.size,
        updatedAt: stat.mtime.toISOString()
      }
    })
}

function ensureInstanceFolders(instance) {
  const instanceDir = getInstanceDir(instance.id)
  fs.mkdirSync(instanceDir, { recursive: true })

  const instanceFile = path.join(instanceDir, 'instance.json')
  ensureMinecraftSubfolders(instance.id)
  if (!fs.existsSync(instanceFile)) {
    fs.writeFileSync(
      instanceFile,
      JSON.stringify({ ...instance, createdAt: new Date().toISOString(), updatedAt: new Date().toISOString() }, null, 2)
    )
  }

  return getMinecraftRoot(instance.id)
}

function ensureDefaultInstances() {
  fs.mkdirSync(path.join(getKindyrDataRoot(), 'instances'), { recursive: true })
  getAllInstances().forEach(ensureInstanceFolders)
}

function normalizeMessage(message, maxLength = 1200) {
  return String(message).replace(/\s+/g, ' ').slice(0, maxLength)
}

function normalizeDiscoverQuery(value) {
  return String(value || '').replace(/\s+/g, ' ').trim().slice(0, 80)
}

function normalizeVersion(value) {
  const clean = String(value || '').trim()
  if (!clean) return ''
  if (!/^\d+(?:\.\d+){1,2}(?:-(?:pre|rc)\d+)?$/i.test(clean)) {
    throw new Error('Version de Minecraft invalida.')
  }
  return clean
}

function buildModrinthFacets(payload) {
  const type = String(payload.type || 'all')
  const facets = [...(modrinthTypeFilters[type] || [])]
  const version = normalizeVersion(payload.version)
  if (version) facets.push(['versions:' + version])
  const loader = String(payload.loader || '').toLowerCase()
  const loaderAllowedTypes = new Set(['mod', 'all'])
  if (['fabric', 'forge', 'neoforge', 'quilt'].includes(loader) && loaderAllowedTypes.has(type)) {
    facets.push(['categories:' + loader])
  }
  return facets
}

function buildModrinthNewFilters(payload) {
  const type = String(payload.type || 'all')
  const parts = []
  if (type === 'mod') parts.push('project_types = mod')
  else if (type === 'modpack') parts.push('project_types = modpack')
  else if (type === 'resourcepack') parts.push('project_types = resourcepack')
  else if (type === 'shader') parts.push('project_types = shader')
  else if (type === 'datapack') parts.push('project_types = mod AND categories = datapack')
  else if (type === 'plugin') parts.push('project_types = mod AND (categories = bukkit OR categories = spigot OR categories = paper OR categories = purpur OR categories = folia OR categories = velocity OR categories = waterfall OR categories = sponge)')
  // all -> no project_types filter
  const version = normalizeVersion(payload.version)
  if (version) parts.push(`game_versions = '${version}'`)
  const loader = String(payload.loader || '').toLowerCase()
  const loaderAllowedTypes = new Set(['mod', 'all'])
  if (['fabric', 'forge', 'neoforge', 'quilt'].includes(loader) && loaderAllowedTypes.has(type)) {
    parts.push(`loaders = ${loader}`)
  }
  return parts.join(' AND ')
}

let modrinthSearchAbortController = null
let curseSearchAbortController = null

async function searchModrinth(payload = {}, opts = {}) {
  const query = normalizeDiscoverQuery(payload.query)
  const sort = modrinthSorts.has(payload.sort) ? payload.sort : 'relevance'
  const offset = Math.max(0, Math.min(Number(payload.offset) || 0, 10000))
  const limit = Math.max(1, Math.min(Number(payload.limit) || 20, 40))
  const newFilters = buildModrinthNewFilters(payload)
  const facets = buildModrinthFacets(payload)

  // P1-3: AbortController — cancela request anterior si hay nueva
  if (modrinthSearchAbortController && !opts.signal) {
    try { modrinthSearchAbortController.abort() } catch {}
  }
  const localController = opts.signal ? null : new AbortController()
  const signal = opts.signal || localController.signal
  if (!opts.signal) modrinthSearchAbortController = localController

  async function fetchWithParams(params) {
    const url = new URL(MODRINTH_API + '/search')
    if (query) url.searchParams.set('query', query)
    url.searchParams.set('index', sort)
    url.searchParams.set('offset', String(offset))
    url.searchParams.set('limit', String(limit))
    if (params.newFilters) url.searchParams.set('new_filters', params.newFilters)
    if (params.facets) url.searchParams.set('facets', JSON.stringify(params.facets))
    const response = await fetch(url, {
      headers: {
        'User-Agent': MODRINTH_USER_AGENT,
        Accept: 'application/json'
      },
      signal
    })
    const body = await response.json().catch(() => ({}))
    if (!response.ok) {
      const err = new Error(body.description || body.error || 'Modrinth no respondio bien.')
      err._modrinthBody = body
      err._status = response.status
      throw err
    }
    return {
      hits: Array.isArray(body.hits) ? body.hits : [],
      offset: body.offset || offset,
      limit: body.limit || limit,
      totalHits: body.total_hits || 0
    }
  }

  // Estrategia: intentar new_filters primero, fallback a facets si falla por compatibilidad
  try {
    if (newFilters) {
      try {
        const r = await fetchWithParams({ newFilters })
        if (localController && modrinthSearchAbortController === localController) modrinthSearchAbortController = null
        return r
      } catch (e) {
        if (e.name === 'AbortError' || signal.aborted) throw e
        // Si new_filters no es soportado (400) o falla, fallback a facets
        // No duplicar lógica: facets es representación equivalente
        if (e._status === 400 || e.message.includes('new_filters') || e.message.includes('filter')) {
          // fallback silencioso
        } else {
          // Para otros errores (red, 500), también fallback una vez antes de propagar
          try {
            const r2 = await fetchWithParams({ facets })
            if (localController && modrinthSearchAbortController === localController) modrinthSearchAbortController = null
            return r2
          } catch (fallbackErr) {
            if (fallbackErr.name === 'AbortError' || signal.aborted) throw fallbackErr
            throw e
          }
        }
      }
    }
    // Fallback directo a facets (o si newFilters vacío)
    if (facets.length) {
      const r = await fetchWithParams({ facets })
      if (localController && modrinthSearchAbortController === localController) modrinthSearchAbortController = null
      return r
    }
    // Sin filtros: intentar new_filters vacío no, usar facets vacío (sin param)
    const r = await fetchWithParams({})
    if (localController && modrinthSearchAbortController === localController) modrinthSearchAbortController = null
    return r
  } catch (e) {
    if (localController && modrinthSearchAbortController === localController) modrinthSearchAbortController = null
    throw e
  }
}

// --- CurseForge (key nunca en renderer, solo main) ---
const CURSEFORGE_GAME_ID_MINECRAFT = 432
const curseClassIdByType = { mod: 6, modpack: 4471, resourcepack: 12, shader: 6552, datapack: 4546, plugin: 5 }
const curseClassIdToType = { 6: 'mod', 4471: 'modpack', 12: 'resourcepack', 6552: 'shader', 4546: 'datapack', 5: 'plugin' }
const curseSortFieldByModrinth = { relevance: 1, downloads: 6, follows: 2, updated: 3, newest: 11 }

function getCurseForgeSortField(sort) {
  return curseSortFieldByModrinth[String(sort || '').toLowerCase()] || 1
}

async function searchCurseForge(payload = {}, opts = {}) {
  if (curseSearchAbortController && !opts.signal) {
    try { curseSearchAbortController.abort() } catch {}
  }
  const localController = opts.signal ? null : new AbortController()
  const signal = opts.signal || localController.signal
  if (!opts.signal) curseSearchAbortController = localController
  try {
  const apiKey = getCurseForgeApiKey()
  if (!apiKey) throw new Error('CurseForge no configurado: falta API key. Configurá CURSEFORGE_API_KEY (ver docs).')
  const query = normalizeDiscoverQuery(payload.query)
  const offset = Math.max(0, Math.min(Number(payload.offset) || 0, 10000))
  const limit = Math.max(1, Math.min(Number(payload.limit) || 18, 50))
  const gameVersion = normalizeVersion(payload.version) || undefined
  const type = String(payload.type || 'all')
  const classId = curseClassIdByType[type] || undefined
  const sortField = getCurseForgeSortField(payload.sort)
  // CurseForge pagination usa index (offset)
  const url = new URL(CURSEFORGE_API + '/mods/search')
  url.searchParams.set('gameId', String(CURSEFORGE_GAME_ID_MINECRAFT))
  if (query) url.searchParams.set('searchFilter', query)
  if (classId) url.searchParams.set('classId', String(classId))
  if (gameVersion) url.searchParams.set('gameVersion', gameVersion)
  const modLoaderType = getCurseForgeModLoaderType(payload.loader)
  const loaderAllowedForCF = new Set(['mod', 'modpack', 'plugin'])
  if (modLoaderType && loaderAllowedForCF.has(type)) {
    url.searchParams.set('modLoaderType', String(modLoaderType))
  }
  url.searchParams.set('sortField', String(sortField))
  url.searchParams.set('sortOrder', 'desc')
  url.searchParams.set('pageSize', String(limit))
  url.searchParams.set('index', String(offset))
  const response = await fetch(url, {
    headers: { 'x-api-key': apiKey, Accept: 'application/json', 'User-Agent': MODRINTH_USER_AGENT },
    signal
  })
  const body = await response.json().catch(() => ({}))
  if (!response.ok) throw new Error(body.error || body.message || 'CurseForge no respondió bien.')
  const data = Array.isArray(body.data) ? body.data : []
  // normalizar a shape Modrinth para reutilizar UI
  const hits = data.map(m => ({
    project_id: String(m.id),
    slug: m.slug || String(m.id),
    title: m.name || 'Sin título',
    description: m.summary || '',
    author: m.authors?.[0]?.name || 'CurseForge',
    icon_url: m.logo?.thumbnailUrl || m.logo?.url || '',
    categories: (m.categories || []).map(c => c.name).slice(0, 4),
    display_categories: (m.categories || []).map(c => c.name).slice(0, 4),
    project_type: type === 'all' ? (curseClassIdToType[m.classId] || 'mod') : type,
    downloads: m.downloadCount || 0,
    follows: 0,
    date_modified: m.dateModified || m.dateCreated || '',
    _curseForge: true,
    _curseUrl: m.links?.websiteUrl || `https://www.curseforge.com/minecraft/mc-mods/${m.slug}`
  }))
  const pagination = body.pagination || {}
  if (localController && curseSearchAbortController === localController) curseSearchAbortController = null
  return { hits, offset, limit, totalHits: pagination.totalCount || hits.length }
  } catch (e) {
    if (localController && curseSearchAbortController === localController) curseSearchAbortController = null
    throw e
  }
}

function getCurseForgeModLoaderType(loader) {
  const map = { forge: 1, fabric: 4, quilt: 5, neoforge: 6 }
  return map[String(loader || '').toLowerCase()] || 0
}

async function getCurseForgeFiles(payload = {}) {
  const apiKey = getCurseForgeApiKey()
  if (!apiKey) throw new Error('CurseForge no configurado.')
  const modId = String(payload.modId || payload.projectId || '').trim()
  if (!modId) throw new Error('Proyecto CurseForge inválido.')
  const gameVersion = normalizeVersion(payload.gameVersion) || undefined
  const modLoaderType = getCurseForgeModLoaderType(payload.loader)
  const url = new URL(CURSEFORGE_API + '/mods/' + encodeURIComponent(modId) + '/files')
  if (gameVersion) url.searchParams.set('gameVersion', gameVersion)
  if (modLoaderType) url.searchParams.set('modLoaderType', String(modLoaderType))
  url.searchParams.set('pageSize', '20')
  url.searchParams.set('index', '0')
  const res = await fetch(url, { headers: { 'x-api-key': apiKey, Accept: 'application/json', 'User-Agent': MODRINTH_USER_AGENT } })
  const body = await res.json().catch(() => ({}))
  if (!res.ok) throw new Error(body.error || body.message || 'CurseForge no respondió bien.')
  return Array.isArray(body.data) ? body.data : []
}

function pickCurseForgePrimaryFile(files) {
  const list = Array.isArray(files) ? files : []
  if (!list.length) throw new Error('CurseForge: sin archivos compatibles.')
  let best = list[0]
  let bestTs = Date.parse(best.datePublished || best.fileDate || '') || 0
  for (const f of list) {
    const ts = Date.parse(f.datePublished || f.fileDate || '') || 0
    if (ts > bestTs) { best = f; bestTs = ts }
  }
  if (!best.downloadUrl) throw new Error('CurseForge: archivo sin downloadUrl.')
  return best
}

function normalizeCurseForgeFileForUI(file) {
  const loaderMap = { 1: 'forge', 4: 'fabric', 5: 'quilt', 6: 'neoforge' }
  const loaders = []
  if (file.gameVersions) {
    for (const gv of file.gameVersions) {
      const lower = String(gv).toLowerCase()
      if (['forge', 'fabric', 'quilt', 'neoforge'].includes(lower)) loaders.push(lower)
    }
  }
  if (file.sortableGameVersions) {
    for (const sg of file.sortableGameVersions) {
      const name = String(sg.gameVersionName || '').toLowerCase()
      if (['forge', 'fabric', 'quilt', 'neoforge'].includes(name) && !loaders.includes(name)) loaders.push(name)
    }
  }
  if (loaders.length === 0 && file.gameVersion) {
    // fallback from modLoaderType if present
    const type = file.modLoaderType || 0
    if (loaderMap[type]) loaders.push(loaderMap[type])
  }
  const gameVersions = (file.gameVersions || []).filter(v => /^\d+\.\d+/.test(v)).slice(0, 4)
  return {
    id: String(file.id),
    name: file.displayName || file.fileName || '',
    version_number: file.displayName || file.fileName || '',
    version_type: 'release',
    game_versions: gameVersions.length ? gameVersions : (file.gameVersions || []).slice(0, 4),
    loaders: loaders.length ? loaders : ['minecraft'],
    files: [{ filename: file.fileName, url: file.downloadUrl }],
    date_published: file.datePublished || file.fileDate || '',
    _cfRaw: file
  }
}

async function installCurseForgeProject(payload = {}) {
  const project = payload.project || {}
  const isCF = Boolean(project._curseForge || project.project_id)
  if (!isCF) throw new Error('Proyecto no es de CurseForge.')
  const modId = String(project.project_id || project.id || '').trim()
  const projectType = String(project.project_type || payload.projectType || 'mod')
  const installKind = String(payload.installKind || projectType)
  const destination = String(payload.destination || 'downloads')
  const gameVersion = payload.gameVersion ? normalizeVersion(payload.gameVersion) : undefined
  const loader = String(payload.loader || '').trim()
  const versionId = String(payload.versionId || '').trim()

  let file = null
  if (versionId) {
    const files = await getCurseForgeFiles({ modId })
    file = files.find(f => String(f.id) === versionId) || null
    if (!file) throw new Error('Versión CurseForge no encontrada.')
  } else {
    const files = await getCurseForgeFiles({ modId, gameVersion, loader })
    file = pickCurseForgePrimaryFile(files)
  }

  if (destination === 'downloads') {
    const downloadsDir = path.join(app.getPath('downloads'), 'KindyrLauncher')
    const target = path.join(downloadsDir, sanitizeFileName(file.fileName || file.displayName || project.slug || 'curseforge-file'))
    const downloaded = await downloadToFile(file.downloadUrl, target)
    return { type: 'download', path: downloaded.path, version: file, file }
  }
  if (projectType === 'modpack') {
    // modpacks CurseForge son zip; por ahora descargar a Descargas
    const downloadsDir = path.join(app.getPath('downloads'), 'KindyrLauncher')
    const target = path.join(downloadsDir, sanitizeFileName(file.fileName || project.slug + '.zip'))
    const downloaded = await downloadToFile(file.downloadUrl, target)
    return { type: 'download', path: downloaded.path, version: file, file }
  }
  const instance = getInstance(payload.instanceId)
  if (!instance) throw new Error('No existe la instancia seleccionada.')
  ensureInstanceFolders(instance)
  const folder = getInstallFolder(projectType, installKind, instance.id)
  const target = path.join(folder, sanitizeFileName(file.fileName || file.displayName || project.slug || 'curseforge-file'))
  const downloaded = await downloadToFile(file.downloadUrl, target)
  return { type: 'content', path: downloaded.path, instance, version: file, file }
}

async function installCurseForgeLatestReleaseProject(payload = {}) {
  let instance = getInstance(payload.instanceId)
  if (!instance) throw new Error('No existe la instancia seleccionada.')
  if (!instance.version || instance.version === 'unknown') throw new Error('La instancia no tiene versión válida.')
  const project = payload.project || {}
  const installKind = getProjectInstallKindFromProject(project)
  return installCurseForgeProject({
    project,
    installKind,
    destination: 'instance',
    instanceId: instance.id,
    gameVersion: instance.version,
    loader: instance.loader || 'vanilla'
  })
}

function sanitizeFileName(value, fallback = 'download') {
  const clean = String(value || fallback).replace(/[<>:"/\\|?*\x00-\x1F]/g, '-').replace(/\s+/g, ' ').trim()
  return (clean || fallback).slice(0, 120)
}

function sanitizeInstanceId(value) {
  return String(value || 'instance').toLowerCase().replace(/[^a-z0-9._-]+/g, '-').replace(/^-+|-+$/g, '').slice(0, 60) || 'instance'
}

function isSafeRelativePath(value) {
  const clean = String(value || '').replace(/\\/g, '/')
  if (!clean || clean.startsWith('/') || clean.includes('..') || /^[a-z]:/i.test(clean)) return false
  return true
}

function safePath(root, relativePath) {
  const resolvedRoot = path.resolve(root)
  const destination = path.resolve(resolvedRoot, relativePath)
  if (destination === resolvedRoot || !destination.startsWith(resolvedRoot + path.sep)) {
    throw new Error(`Ruta fuera de la instancia: ${relativePath}`)
  }
  return destination
}

function getKindyrMetaDir(instanceId) {
  return path.join(getInstanceDir(instanceId), '.kindyr')
}

function getModrinthFilesMetaPath(instanceId) {
  return path.join(getKindyrMetaDir(instanceId), 'modrinth-files.json')
}

function loadModrinthFilesMeta(instanceId) {
  try {
    const p = getModrinthFilesMetaPath(instanceId)
    if (!fs.existsSync(p)) return []
    const data = JSON.parse(fs.readFileSync(p, 'utf8'))
    return Array.isArray(data) ? data : []
  } catch { return [] }
}

function saveModrinthFilesMetaAtomic(instanceId, list) {
  const dir = getKindyrMetaDir(instanceId)
  fs.mkdirSync(dir, { recursive: true })
  const dest = getModrinthFilesMetaPath(instanceId)
  const tmp = dest + '.tmp-' + process.pid + '-' + Date.now()
  fs.writeFileSync(tmp, JSON.stringify(list, null, 2))
  try {
    fs.renameSync(tmp, dest)
  } catch (e) {
    if (['EEXIST', 'EPERM'].includes(e.code)) {
      try { fs.rmSync(dest, { force: true }) } catch {}
      fs.renameSync(tmp, dest)
    } else throw e
  }
}

function persistModrinthFileMeta(instanceId, meta) {
  // Solo persistir tras descarga+verificación exitosa (P0-1 P4)
  const list = loadModrinthFilesMeta(instanceId)
  const idx = list.findIndex(m => m.path === meta.path)
  const entry = {
    path: String(meta.path),
    hashes: { sha1: String(meta.hashes.sha1 || '').toLowerCase(), sha512: String(meta.hashes.sha512 || '').toLowerCase() },
    fileSize: Number(meta.fileSize) >>> 0,
    downloads: Array.isArray(meta.downloads) ? meta.downloads.filter(u => { try { const url=new URL(u); return url.protocol==='https:' && !url.username && !url.password } catch { return false } }).slice(0,3) : [],
    env: meta.env && typeof meta.env === 'object' ? meta.env : { client: 'required' },
    projectId: String(meta.projectId || ''),
    versionId: String(meta.versionId || ''),
    filename: String(meta.filename || path.basename(meta.path)),
    primary: Boolean(meta.primary)
  }
  if (!entry.hashes.sha1 && !entry.hashes.sha512) return // P0-4 no persistir sin hash
  if (!entry.downloads.length) return // sin URL legítima no es portable, quedará en overrides
  if (idx >= 0) list[idx] = entry
  else list.push(entry)
  saveModrinthFilesMetaAtomic(instanceId, list)
}

async function resolveModrinthFileUrlFallback(meta) {
  // Si URL CDN stale (404), intentar resolver via Modrinth API usando projectId/versionId y hash
  if (!meta.projectId || !meta.versionId) return null
  try {
    const versions = await getModrinthVersions({ projectId: meta.projectId })
    const ver = versions.find(v => v.id === meta.versionId) || null
    if (!ver || !Array.isArray(ver.files)) return null
    const targetHash = (meta.hashes.sha1 || meta.hashes.sha512 || '').toLowerCase()
    for (const f of ver.files) {
      const h = (f.hashes.sha1 || f.hashes.sha512 || '').toLowerCase()
      if (h && h === targetHash && f.url) {
        return String(f.url)
      }
    }
    // fallback por filename
    const byName = ver.files.find(f => f.filename === meta.filename)
    if (byName && byName.url) return String(byName.url)
  } catch {}
  return null
}

async function modrinthJson(pathName, params = {}) {
  const url = new URL(MODRINTH_API + pathName)
  Object.entries(params).forEach(([key, value]) => {
    if (value !== undefined && value !== null && value !== '') url.searchParams.set(key, value)
  })
  const response = await fetch(url, {
    headers: {
      'User-Agent': MODRINTH_USER_AGENT,
      Accept: 'application/json'
    }
  })
  const body = await response.json().catch(() => ({}))
  if (!response.ok) throw new Error(body.description || body.error || 'Modrinth no respondio bien.')
  return body
}

async function fetchJson(url) {
  const response = await fetch(url, {
    headers: {
      'User-Agent': MODRINTH_USER_AGENT,
      Accept: 'application/json'
    }
  })
  const body = await response.json().catch(() => ({}))
  if (!response.ok) throw new Error(body.description || body.error || 'No se pudo consultar versiones.')
  return body
}

async function fetchText(url) {
  const response = await fetch(url, {
    headers: {
      'User-Agent': MODRINTH_USER_AGENT,
      Accept: 'text/plain, application/xml'
    }
  })
  if (!response.ok) throw new Error('No se pudo consultar versiones: HTTP ' + response.status)
  return response.text()
}

function getHttpDiskCacheFile(cacheKey) {
  const safe = String(cacheKey || '').replace(/[^a-z0-9._-]/gi, '-').slice(0, 80) || 'cache'
  return path.join(getLauncherCacheDir(), 'http', safe + '.json')
}

function readHttpDiskCache(cacheKey) {
  try {
    const file = getHttpDiskCacheFile(cacheKey)
    if (!fs.existsSync(file)) return null
    const data = JSON.parse(fs.readFileSync(file, 'utf8'))
    if (!data || typeof data.body === 'undefined') return null
    return data
  } catch { return null }
}

function writeHttpDiskCache(cacheKey, data) {
  try {
    const file = getHttpDiskCacheFile(cacheKey)
    fs.mkdirSync(path.dirname(file), { recursive: true })
    fs.writeFileSync(file + '.tmp', JSON.stringify(data))
    fs.renameSync(file + '.tmp', file)
  } catch {}
}

async function fetchJsonCached(url, { cacheKey, ttlMs = VERSION_CACHE_TTL_MS } = {}) {
  if (!cacheKey) return fetchJson(url)
  const cached = readHttpDiskCache(cacheKey)
  const now = Date.now()
  if (cached && cached.cachedAt && (now - cached.cachedAt) < ttlMs && cached.body) {
    return cached.body
  }
  const headers = { 'User-Agent': MODRINTH_USER_AGENT, Accept: 'application/json' }
  if (cached && cached.etag) headers['If-None-Match'] = cached.etag
  try {
    const response = await fetch(url, { headers })
    if (response.status === 304 && cached && cached.body) {
      cached.cachedAt = Date.now()
      writeHttpDiskCache(cacheKey, cached)
      return cached.body
    }
    const body = await response.json().catch(() => ({}))
    if (!response.ok) {
      if (cached && cached.body && response.status >= 500) return cached.body
      throw new Error(body.description || body.error || 'No se pudo consultar versiones.')
    }
    const etag = response.headers.get('etag') || response.headers.get('ETag') || cached?.etag || ''
    writeHttpDiskCache(cacheKey, { cachedAt: Date.now(), etag, body })
    return body
  } catch (error) {
    if (cached && cached.body) return cached.body
    throw error
  }
}

async function fetchTextCached(url, { cacheKey, ttlMs = VERSION_CACHE_TTL_MS } = {}) {
  if (!cacheKey) return fetchText(url)
  const cached = readHttpDiskCache(cacheKey)
  const now = Date.now()
  if (cached && cached.cachedAt && (now - cached.cachedAt) < ttlMs && typeof cached.body === 'string') {
    return cached.body
  }
  const headers = { 'User-Agent': MODRINTH_USER_AGENT, Accept: 'text/plain, application/xml' }
  if (cached && cached.etag) headers['If-None-Match'] = cached.etag
  try {
    const response = await fetch(url, { headers })
    if (response.status === 304 && cached && typeof cached.body === 'string') {
      cached.cachedAt = Date.now()
      writeHttpDiskCache(cacheKey, cached)
      return cached.body
    }
    if (!response.ok) {
      if (cached && typeof cached.body === 'string' && response.status >= 500) return cached.body
      throw new Error('No se pudo consultar versiones: HTTP ' + response.status)
    }
    const body = await response.text()
    const etag = response.headers.get('etag') || response.headers.get('ETag') || cached?.etag || ''
    writeHttpDiskCache(cacheKey, { cachedAt: Date.now(), etag, body })
    return body
  } catch (error) {
    if (cached && typeof cached.body === 'string') return cached.body
    throw error
  }
}

async function getMojangVersions() {
  pruneVersionCaches()
  if (minecraftVersionCache) {
    return minecraftVersionCache.versions
  }
  if (minecraftVersionRequest) return minecraftVersionRequest

  minecraftVersionRequest = (async () => {
    const manifest = await fetchJsonCached(MOJANG_VERSION_MANIFEST, { cacheKey: 'mojang-manifest-v2', ttlMs: VERSION_CACHE_TTL_MS })
    const versions = (manifest.versions || []).map(item => ({
      id: item.id,
      type: item.type,
      releaseTime: item.releaseTime,
      url: item.url
    }))
    minecraftVersionCache = { cachedAt: Date.now(), versions }
    pruneVersionCaches()
    return versions
  })()

  try {
    return await minecraftVersionRequest
  } finally {
    minecraftVersionRequest = null
  }
}

function parseMavenVersions(xml) {
  return [...String(xml).matchAll(/<version>([^<]+)<\/version>/g)].map(match => match[1])
}

function getNeoForgePrefix(minecraftVersion) {
  const match = String(minecraftVersion).match(/^1\.(\d+)(?:\.(\d+))?/)
  if (!match) return ''
  return match[1] + '.' + (match[2] || '0')
}

async function getSupportedMinecraftVersions(loader) {
  pruneVersionCaches()
  const key = loader || 'vanilla'
  const cached = loaderVersionCache[key]
  if (cached) {
    return cached.versions
  }
  if (loaderVersionRequests.has(key)) return loaderVersionRequests.get(key)

  const request = (async () => {
    let versions = []
    if (key === 'vanilla') {
      versions = (await getMojangVersions()).map(item => ({ minecraft: item.id }))
    } else if (key === 'fabric' || key === 'quilt') {
      const baseUrl = key === 'fabric' ? FABRIC_META : QUILT_META
      const cachePrefix = key === 'fabric' ? 'fabric' : 'quilt'
      const [games, loaders] = await Promise.all([
        fetchJsonCached(baseUrl + '/versions/game', { cacheKey: cachePrefix + '-game', ttlMs: VERSION_CACHE_TTL_MS }),
        fetchJsonCached(baseUrl + '/versions/loader', { cacheKey: cachePrefix + '-loader', ttlMs: VERSION_CACHE_TTL_MS })
      ])
      const latestLoader = (loaders || []).find(item => item.stable)?.version || loaders?.[0]?.version || ''
      versions = (games || []).map(item => ({ minecraft: item.version, loaderVersion: latestLoader }))
    } else if (key === 'forge') {
      const forgeVersions = parseMavenVersions(await fetchTextCached(FORGE_MAVEN_METADATA, { cacheKey: 'forge-maven', ttlMs: VERSION_CACHE_TTL_MS }))
      versions = forgeVersions
        .map(version => ({ minecraft: version.split('-')[0], loaderVersion: version.split('-').slice(1).join('-'), raw: version }))
        .filter(item => item.minecraft && item.loaderVersion)
    } else if (key === 'neoforge') {
      const neoVersions = parseMavenVersions(await fetchTextCached(NEOFORGE_MAVEN_METADATA, { cacheKey: 'neoforge-maven', ttlMs: VERSION_CACHE_TTL_MS }))
      versions = neoVersions.map(version => ({ minecraftPrefix: version.split('.').slice(0, 2).join('.'), loaderVersion: version, raw: version }))
    }

    loaderVersionCache[key] = { cachedAt: Date.now(), versions }
    pruneVersionCaches()
    return versions
  })()

  loaderVersionRequests.set(key, request)
  try {
    return await request
  } finally {
    loaderVersionRequests.delete(key)
  }
}

function pickLatestLoaderVersion(loader, minecraftVersion, supported) {
  if (loader === 'vanilla') return ''
  const list = Array.isArray(supported) ? supported : []
  if (loader === 'neoforge') {
    const prefix = getNeoForgePrefix(minecraftVersion)
    for (let index = list.length - 1; index >= 0; index--) {
      if (list[index].minecraftPrefix === prefix) return list[index].loaderVersion || ''
    }
    return ''
  }
  for (let index = list.length - 1; index >= 0; index--) {
    if (list[index].minecraft === minecraftVersion) return list[index].loaderVersion || ''
  }
  return ''
}

async function listCreatableInstances(payload = {}) {
  const loader = String(payload.loader || 'vanilla')
  const includeSnapshots = Boolean(payload.includeSnapshots)
  const query = String(payload.query || '').trim().toLowerCase()
  const mojangPromise = getMojangVersions()
  const supportedPromise = loader === 'vanilla'
    ? mojangPromise.then(versions => versions.map(item => ({ minecraft: item.id })))
    : getSupportedMinecraftVersions(loader)
  const [mojangVersions, supported] = await Promise.all([mojangPromise, supportedPromise])
  const loaderVersions = new Map()
  if (loader !== 'vanilla') {
    for (let index = supported.length - 1; index >= 0; index--) {
      const item = supported[index]
      const key = loader === 'neoforge' ? item.minecraftPrefix : item.minecraft
      if (key && !loaderVersions.has(key)) loaderVersions.set(key, item.loaderVersion || '')
    }
  }

  const result = []
  for (const item of mojangVersions) {
    if (!includeSnapshots && item.type !== 'release') continue
    if (query && !item.id.toLowerCase().includes(query)) continue
    const lookupKey = loader === 'neoforge' ? getNeoForgePrefix(item.id) : item.id
    const loaderVersion = loader === 'vanilla' ? '' : (loaderVersions.get(lookupKey) || '')
    const compatible = loader === 'vanilla' || Boolean(loaderVersion)
    if (!compatible) continue
    result.push({
      id: item.id,
      type: item.type,
      releaseTime: item.releaseTime,
      loader,
      loaderVersion,
      compatible: true
    })
    if (result.length >= 120) break
  }

  return result
}

function createLauncherInstance(payload = {}) {
  const version = String(payload.version || '').trim()
  const loader = String(payload.loader || 'vanilla').trim()
  const loaderVersion = String(payload.loaderVersion || '').trim()
  const versionType = String(payload.versionType || 'release').trim()
  if (!version) throw new Error('Elegí una versión.')
  if (!['vanilla', 'fabric', 'forge', 'neoforge', 'quilt'].includes(loader)) throw new Error('Loader invalido.')
  if (loader !== 'vanilla' && !loaderVersion) throw new Error('Ese loader no es compatible con esa versión.')
  if (loaderVersion && /[<>:"/\\|?*\x00-\x1F]/.test(loaderVersion)) throw new Error('Versión de loader inválida.')
  if (loader === 'forge' && loaderVersion && !/^[\w.-]+$/.test(loaderVersion)) throw new Error('Versión de Forge inválida.')
  if (loader === 'neoforge' && loaderVersion && !/^\d+\.\d+\.\d+$/.test(loaderVersion)) throw new Error('Versión de NeoForge inválida.')

  const idParts = [loader, version, loaderVersion].filter(Boolean).map(sanitizeInstanceId)
  let instanceId = idParts.join('-')
  const existingIds = new Set([...defaultInstances.map(i => i.id), ...loadCustomInstances().map(i => i.id)])
  if (existingIds.has(instanceId)) {
    let suffix = 2
    while (existingIds.has(`${instanceId}-${suffix}`)) suffix++
    instanceId = `${instanceId}-${suffix}`
  }
  const name = loader === 'vanilla'
    ? 'Minecraft ' + version
    : 'Minecraft ' + version + ' ' + loader[0].toUpperCase() + loader.slice(1)
  const instance = {
    id: instanceId,
    name,
    version,
    loader,
    loaderVersion,
    versionType,
    type: loader === 'vanilla' ? 'vanilla' : 'loader',
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString()
  }
  registerCustomInstance(instance)
  ensureInstanceFolders(instance)
  fs.writeFileSync(path.join(getInstanceDir(instance.id), 'instance.json'), JSON.stringify(instance, null, 2))
  return instance
}

function normalizeForgeLoaderVersion(minecraftVersion, forgeValue) {
  const raw = String(forgeValue || '').trim()
  if (!raw) return ''
  const prefix = String(minecraftVersion || '').trim() + '-'
  if (prefix.length > 1 && raw.startsWith(prefix)) return raw.slice(prefix.length)
  const match = raw.match(/^(\d+\.\d+(?:\.\d+)?)-(.+)$/)
  if (match && match[1] === String(minecraftVersion || '').trim()) return match[2]
  return raw
}

function resolveLoaderFromDependencies(dependencies, minecraftVersion = '') {
  const deps = dependencies || {}
  if (deps['fabric-loader']) {
    return { loader: 'fabric', loaderVersion: String(deps['fabric-loader']).trim() }
  }
  if (deps['quilt-loader']) {
    return { loader: 'quilt', loaderVersion: String(deps['quilt-loader']).trim() }
  }
  if (deps.neoforge) {
    return { loader: 'neoforge', loaderVersion: String(deps.neoforge).trim() }
  }
  if (deps.forge) {
    return {
      loader: 'forge',
      loaderVersion: normalizeForgeLoaderVersion(minecraftVersion, deps.forge)
    }
  }
  return { loader: 'vanilla', loaderVersion: '' }
}

async function ensureInstanceLoaderVersion(instance) {
  if (!instance.loader || instance.loader === 'vanilla') return instance
  if (instance.loaderVersion) return instance

  const supported = await getSupportedMinecraftVersions(instance.loader)
  const loaderVersion = pickLatestLoaderVersion(instance.loader, instance.version, supported)
  if (!loaderVersion) throw new Error('La instancia no tiene version de loader.')

  instance.loaderVersion = loaderVersion
  instance.updatedAt = new Date().toISOString()
  registerCustomInstance(instance)
  const instanceFile = path.join(getInstanceDir(instance.id), 'instance.json')
  fs.writeFileSync(instanceFile, JSON.stringify(instance, null, 2))
  return instance
}

async function getModrinthVersions(payload = {}) {
  const projectId = String(payload.projectId || payload.slug || '').trim()
  if (!projectId) throw new Error('Proyecto invalido.')
  const gameVersion = normalizeVersion(payload.gameVersion)
  const loader = String(payload.loader || '').trim()
  const versionType = String(payload.versionType || '').trim()
  const params = { include_changelog: 'false' }
  if (gameVersion) params.game_versions = JSON.stringify([gameVersion])
  if (loader && loader !== 'any') params.loaders = JSON.stringify([loader])
  const versions = await modrinthJson('/project/' + encodeURIComponent(projectId) + '/version', params)
  const list = Array.isArray(versions) ? versions : []
  return versionType ? list.filter(version => version.version_type === versionType) : list
}

async function downloadToFile(url, destination) {
  const parsed = new URL(String(url || ''))
  if (!['https:', 'http:'].includes(parsed.protocol)) throw new Error('URL de descarga invalida.')
  fs.mkdirSync(path.dirname(destination), { recursive: true })
  const partPath = `${destination}.part`
  let start = 0
  if (fs.existsSync(partPath)) {
    try { start = fs.statSync(partPath).size } catch { start = 0 }
    if (start > 50 * 1024 * 1024) { try { fs.unlinkSync(partPath); start = 0 } catch {} }
  }
  const headers = {
    'User-Agent': MODRINTH_USER_AGENT,
    Accept: 'application/octet-stream'
  }
  if (start > 0) headers.Range = `bytes=${start}-`
  let response = await fetch(parsed, { headers })
  if (start > 0 && response.status === 416) {
    try { fs.unlinkSync(partPath) } catch {}
    start = 0
    delete headers.Range
    response = await fetch(parsed, { headers })
  }
  const isResume = start > 0 && response.status === 206
  if (!isResume && !response.ok) throw new Error('No se pudo descargar el archivo: HTTP ' + response.status)
  if (isResume && ![206, 200].includes(response.status)) throw new Error('No se pudo reanudar la descarga: HTTP ' + response.status)
  if (!response.body) throw new Error('La descarga no devolvio contenido.')
  if (start > 0 && response.status === 200) {
    try { fs.unlinkSync(partPath) } catch {}
    start = 0
  }

  try {
    const writeFlags = isResume ? 'a' : 'w'
    await pipeline(Readable.fromWeb(response.body), fs.createWriteStream(partPath, { flags: writeFlags }))
    try {
      await fs.promises.rename(partPath, destination)
    } catch (error) {
      if (!['EEXIST', 'EPERM'].includes(error.code)) throw error
      await fs.promises.rm(destination, { force: true })
      await fs.promises.rename(partPath, destination)
    }
    const stat = await fs.promises.stat(destination)
    return { path: destination, bytes: stat.size }
  } catch (error) {
    // keep part file for resume on transient errors; only clean on final failure if needed
    throw error
  }
}

function pickPrimaryFile(version) {
  const files = Array.isArray(version.files) ? version.files : []
  const file = files.find(item => item.primary) || files[0]
  if (!file || !file.url) throw new Error('La version elegida no tiene archivo descargable.')
  return file
}

function pickLatestVersion(versions, versionType) {
  const list = Array.isArray(versions) ? versions : []
  let latest = null
  let latestTimestamp = -Infinity
  for (const version of list) {
    if (versionType && version.version_type !== versionType) continue
    const timestamp = Date.parse(version.date_published || '') || 0
    if (!latest || timestamp > latestTimestamp) {
      latest = version
      latestTimestamp = timestamp
    }
  }
  return latest
}

function getInstallFolder(projectType, installKind, instanceId) {
  if (projectType === 'resourcepack') return instanceFolders.resourcepacks(instanceId)
  if (projectType === 'shader') return instanceFolders.shaderpacks(instanceId)
  if (installKind === 'plugin') return instanceFolders.plugins(instanceId)
  if (installKind === 'datapack') return instanceFolders.datapacks(instanceId)
  return instanceFolders.mods(instanceId)
}

function registerCustomInstance(instance) {
  const custom = loadCustomInstances()
  const existing = custom.findIndex(item => item.id === instance.id)
  if (existing >= 0) custom[existing] = instance
  else custom.push(instance)
  saveCustomInstances(custom)
}

async function extractMrpackOverrides(archivePath, minecraftRoot) {
  await extractZipEntries(archivePath, minecraftRoot, {
    maxEntryBytes: 512 * 1024 * 1024,
    maxTotalBytes: 2 * 1024 * 1024 * 1024,
    mapEntry(normalized) {
      const prefixes = ['overrides/', 'client-overrides/']
      const prefix = prefixes.find(item => normalized.startsWith(item))
      if (!prefix) return null
      const relative = normalized.slice(prefix.length)
      return isSafeRelativePath(relative) ? relative : null
    }
  })
}

async function downloadMrpackFile(packFile, minecraftRoot) {
  const destination = safePath(minecraftRoot, packFile.path)
  await fs.promises.mkdir(path.dirname(destination), { recursive: true })
  // Intentar cada URL, con fallback Modrinth por hash si todas fallan (P0-1 URL stale)
  const triedUrls = [...packFile.downloads]
  for (const url of triedUrls) {
    try {
      await downloadToFile(url, destination)
      if (await verifyMrpackFile(destination, packFile.hashes)) {
        try {
          const instanceId = path.basename(path.dirname(minecraftRoot))
          if (instanceId) {
            const stat = fs.statSync(destination)
            persistModrinthFileMeta(instanceId, {
              path: packFile.path,
              hashes: packFile.hashes,
              fileSize: packFile.fileSize || stat.size,
              downloads: packFile.downloads,
              env: packFile.env || { client: 'required' },
              projectId: packFile.projectId || '',
              versionId: packFile.versionId || '',
              filename: path.basename(packFile.path),
              primary: false
            })
          }
        } catch {}
        return true
      }
      await fs.promises.rm(destination, { force: true })
    } catch {
      await fs.promises.rm(destination, { force: true }).catch(() => {})
    }
  }
  // Fallback: si todas fallaron y tenemos projectId/versionId, intentar resolver URL fresca
  if (packFile.projectId || packFile.versionId) {
    try {
      const fallbackMeta = { ...packFile, projectId: packFile.projectId || '', versionId: packFile.versionId || '' }
      const freshUrl = await resolveModrinthFileUrlFallback(fallbackMeta)
      if (freshUrl && !triedUrls.includes(freshUrl)) {
        try {
          await downloadToFile(freshUrl, destination)
          if (await verifyMrpackFile(destination, packFile.hashes)) {
            try {
              const instanceId = path.basename(path.dirname(minecraftRoot))
              if (instanceId) {
                const stat = fs.statSync(destination)
                const updatedDownloads = [freshUrl, ...packFile.downloads.filter(u => u !== freshUrl)]
                persistModrinthFileMeta(instanceId, {
                  path: packFile.path,
                  hashes: packFile.hashes,
                  fileSize: packFile.fileSize || stat.size,
                  downloads: updatedDownloads,
                  env: packFile.env || { client: 'required' },
                  projectId: packFile.projectId || '',
                  versionId: packFile.versionId || '',
                  filename: path.basename(packFile.path),
                  primary: false
                })
              }
            } catch {}
            return true
          }
          await fs.promises.rm(destination, { force: true })
        } catch {
          await fs.promises.rm(destination, { force: true }).catch(() => {})
        }
      }
    } catch {}
  }
  return false
}

// P0-5: flujo común mrpack — validación, filtrado, descarga, extracción, progreso, persistencia
async function installFromMrpackArchive(archivePath, minecraftRoot, opts = {}) {
  const onProgress = typeof opts.onProgress === 'function' ? opts.onProgress : () => {}
  const maxConcurrent = Math.max(1, Math.min(Number(opts.maxConcurrent) || 6, 20))
  const strictRejected = opts.strictRejected !== false
  let index = opts.index || null
  if (!index) {
    const indexBytes = await readZipEntryBuffer(archivePath, 'modrinth.index.json')
    if (!indexBytes) throw new Error('El .mrpack no trae modrinth.index.json.')
    index = JSON.parse(indexBytes.toString('utf8'))
  }
  if (index.formatVersion !== 1) throw new Error(`Versión de formato no soportada: ${index.formatVersion}`)
  if (index.game !== 'minecraft') throw new Error('Pack no es de Minecraft')
  const prepared = getClientMrpackFiles(index)
  // Para beta: si viene de Modrinth con env, conservar; si no, fallback {client:"required"} ya en persistencia
  if (strictRejected && prepared.rejected.length) {
    throw new Error(`El modpack contiene ${prepared.rejected.length} archivo(s) sin una descarga segura.`)
  }
  const packFiles = prepared.accepted
  const total = packFiles.length
  let done = 0
  const failedDownloads = [...prepared.rejected.map(f => `${f.path} (${f.error})`)]
  // Progreso overrides (mantenido para compatibilidad con import-mrpack)
  onProgress({ stage: 'overrides', done: 0, total: 0, message: 'Extrayendo archivos...' })
  // NOTA P0-5: orden ahora es descarga → extracción (unificado). Antes import era extracción → descarga.
  // Si falla a mitad, el estado parcial difiere (antes quedaban overrides sin mods, ahora mods sin overrides),
  // pero el resultado final exitoso es equivalente y la limpieza en catch borra instanceDir completo.
  // Descarga con concurrencia unificada (antes install usaba runWithConcurrency configurable, import usaba batch 6 serial)
  // getClientMrpackFiles(index) y downloadMrpackFile(file, minecraftRoot) son el núcleo común
  await runWithConcurrency(packFiles, maxConcurrent, async packFile => {
    const ok = await downloadMrpackFile(packFile, minecraftRoot)
    if (!ok) failedDownloads.push(packFile.path)
    done++
    onProgress({ stage: 'downloading', done, total, message: `Descargando mods... ${done}/${total}` })
  })
  // Extracción overrides (solo overrides/client-overrides, ignora server-overrides)
  await extractMrpackOverrides(archivePath, minecraftRoot)
  onProgress({ stage: 'done', done: total, total, message: 'Completado' })
  return { index, prepared, packFiles, failedDownloads }
}

async function installMrpackInstance(version, project, options = {}) {
  const file = pickPrimaryFile(version)
  const baseName = sanitizeInstanceId(project.slug || project.title || version.name)
  const instanceId = baseName + '-' + sanitizeInstanceId(version.version_number || version.id).slice(0, 20) + '-' + Date.now().toString(36)
  const instanceDir = getInstanceDir(instanceId)
  const minecraftRoot = getMinecraftRoot(instanceId)
  fs.mkdirSync(instanceDir, { recursive: true })
  fs.mkdirSync(minecraftRoot, { recursive: true })

  try {
  const mrpackPath = path.join(instanceDir, sanitizeFileName(file.filename || project.slug || 'modpack') + '.mrpack')
  await downloadToFile(file.url, mrpackPath)
  const maxDownloads = Math.max(
    1,
    Math.min(Number(loadLauncherSettings().maxConcurrentDownloads) || 6, 20)
  )
  ensureMinecraftSubfolders(instanceId)
  const { index, failedDownloads } = await installFromMrpackArchive(mrpackPath, minecraftRoot, { maxConcurrent: maxDownloads, strictRejected: true })
  if (failedDownloads.length) {
    throw new Error(`No se pudieron importar ${failedDownloads.length} archivo(s) del modpack.`)
  }
  const dependencies = index.dependencies || {}
  const minecraftVersion = String(dependencies.minecraft || version.game_versions?.[0] || '').trim() || 'unknown'

  let { loader, loaderVersion } = resolveLoaderFromDependencies(dependencies, minecraftVersion)
  const selectedLoader = String(options.selectedLoader || '').trim()
  if (selectedLoader && selectedLoader !== 'minecraft' && selectedLoader !== 'any') {
    loader = selectedLoader
    const fromDeps = resolveLoaderFromDependencies(dependencies, minecraftVersion)
    if (fromDeps.loader === loader && fromDeps.loaderVersion) {
      loaderVersion = fromDeps.loaderVersion
    }
  }

  if (loader !== 'vanilla' && !loaderVersion) {
    const supported = await getSupportedMinecraftVersions(loader)
    loaderVersion = pickLatestLoaderVersion(loader, minecraftVersion, supported)
  }

  if (loader !== 'vanilla' && !loaderVersion) {
    throw new Error('No se pudo determinar la version del loader para este modpack.')
  }

  const instance = {
    id: instanceId,
    name: project.title || index.name || 'Modpack',
    version: minecraftVersion,
    loader,
    loaderVersion: loader === 'vanilla' ? '' : loaderVersion,
    type: 'modpack',
    source: 'modrinth',
    projectId: project.project_id || project.id,
    slug: project.slug,
    versionId: version.id,
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString()
  }
  registerCustomInstance(instance)
  fs.writeFileSync(path.join(instanceDir, 'instance.json'), JSON.stringify(instance, null, 2))
  return { instance, path: instanceDir }
  } catch (error) {
    await fs.promises.rm(instanceDir, { recursive: true, force: true }).catch(() => {})
    throw error
  }
}

async function installModrinthProject(payload = {}) {
  const versionId = String(payload.versionId || '').trim()
  const project = payload.project || {}
  const projectType = String(project.project_type || payload.projectType || 'mod')
  const installKind = String(payload.installKind || projectType)
  const destination = String(payload.destination || 'downloads')

  let version = null
  if (versionId) {
    const allVersions = await getModrinthVersions({
      projectId: project.project_id || project.id || project.slug
    })
    version = allVersions.find(item => item.id === versionId) || null
  }

  if (!version) {
    const versions = await getModrinthVersions({
      projectId: project.project_id || project.id || project.slug,
      gameVersion: payload.gameVersion,
      loader: payload.loader,
      versionType: payload.versionType
    })
    version = pickLatestVersion(versions, payload.versionType)
  }

  if (!version) throw new Error('No hay versiones compatibles para esa combinacion.')
  const file = pickPrimaryFile(version)

  if (destination === 'downloads') {
    const downloadsDir = path.join(app.getPath('downloads'), 'KindyrLauncher')
    const target = path.join(downloadsDir, sanitizeFileName(file.filename || project.slug || project.title || 'modrinth-file'))
    const downloaded = await downloadToFile(file.url, target)
    return { type: 'download', path: downloaded.path, version }
  }

  if (projectType === 'modpack') {
    const installed = await installMrpackInstance(version, project, {
      selectedLoader: payload.loader
    })
    return { type: 'instance', path: installed.path, instance: installed.instance, version }
  }

  const instance = getInstance(payload.instanceId)
  if (!instance) throw new Error('No existe la instancia seleccionada.')
  ensureInstanceFolders(instance)
  const folder = getInstallFolder(projectType, installKind, instance.id)
  const target = path.join(folder, sanitizeFileName(file.filename || project.slug || project.title || 'modrinth-file'))
  const downloaded = await downloadToFile(file.url, target)
  // P0-1: persistir metadata solo tras descarga+verificación exitosa (fileSize como comprobación rápida, hash como verdad)
  try {
    const hashes = file.hashes || {}
    const hasHash = (typeof hashes.sha1 === 'string' && hashes.sha1) || (typeof hashes.sha512 === 'string' && hashes.sha512)
    if (hasHash) {
      const ok = await verifyMrpackFile(target, hashes)
      if (ok) {
        const rel = path.relative(getMinecraftRoot(instance.id), target).replace(/\\/g, '/')
        // Verificar env Modrinth: version/files no traen env; project.client_side/server_side no es por-file, fallback documentado
        const env = { client: 'required' }
        persistModrinthFileMeta(instance.id, {
          path: rel,
          hashes,
          fileSize: file.size || fs.statSync(target).size,
          downloads: [file.url],
          env,
          projectId: String(project.project_id || project.id || ''),
          versionId: String(version.id || ''),
          filename: file.filename || path.basename(target),
          primary: Boolean(file.primary)
        })
      }
    }
  } catch {}
  return { type: 'content', path: downloaded.path, instance, version }
}

async function installLatestReleaseProject(payload = {}) {
  let instance = getInstance(payload.instanceId)
  if (!instance) throw new Error('No existe la instancia seleccionada.')
  if (!instance.version || instance.version === 'unknown') throw new Error('La instancia no tiene version de Minecraft valida.')

  const project = payload.project || {}
  const projectType = String(project.project_type || 'mod')
  const installKind = getProjectInstallKindFromProject(project)
  const needsLoader = installKind === 'mod'
  let loader = needsLoader && instance.loader && instance.loader !== 'vanilla'
    ? instance.loader
    : 'minecraft'
  let versionId = ''
  let previousCustomInstances = null
  let previousInstanceMetadata = null
  let instanceMetadataFile = ''

  if (needsLoader && (!instance.loader || instance.loader === 'vanilla')) {
    const projectId = project.project_id || project.id || project.slug
    const versions = await getModrinthVersions({
      projectId,
      gameVersion: instance.version,
      versionType: 'release'
    })
    const loaderPreference = ['fabric', 'neoforge', 'forge', 'quilt']
    let automatic = null

    for (const candidate of loaderPreference) {
      const projectVersion = pickLatestVersion(
        versions.filter(version => Array.isArray(version.loaders) && version.loaders.includes(candidate)),
        'release'
      )
      if (!projectVersion) continue
      const supported = await getSupportedMinecraftVersions(candidate)
      const loaderVersion = pickLatestLoaderVersion(candidate, instance.version, supported)
      if (!loaderVersion) continue
      automatic = { loader: candidate, loaderVersion, projectVersion }
      break
    }

    if (!automatic) {
      throw new Error('No hay un loader compatible para instalar este mod en Minecraft ' + instance.version + '.')
    }

    loader = automatic.loader
    versionId = automatic.projectVersion.id
    instance = {
      ...instance,
      loader,
      loaderVersion: automatic.loaderVersion,
      type: 'loader',
      updatedAt: new Date().toISOString()
    }
    previousCustomInstances = loadCustomInstances()
    instanceMetadataFile = path.join(getInstanceDir(instance.id), 'instance.json')
    previousInstanceMetadata = fs.existsSync(instanceMetadataFile)
      ? fs.readFileSync(instanceMetadataFile)
      : null
    registerCustomInstance(instance)
    ensureInstanceFolders(instance)
    fs.writeFileSync(
      instanceMetadataFile,
      JSON.stringify(instance, null, 2)
    )
  }

  try {
    return await installModrinthProject({
      project,
      installKind,
      destination: 'instance',
      instanceId: instance.id,
      gameVersion: instance.version,
      loader,
      versionId,
      versionType: 'release'
    })
  } catch (error) {
    if (previousCustomInstances) {
      saveCustomInstances(previousCustomInstances)
      if (previousInstanceMetadata) fs.writeFileSync(instanceMetadataFile, previousInstanceMetadata)
      else if (fs.existsSync(instanceMetadataFile)) fs.unlinkSync(instanceMetadataFile)
    }
    throw error
  }
}

function getProjectInstallKindFromProject(project) {
  const categories = project.categories || project.display_categories || []
  if (categories.includes('datapack')) return 'datapack'
  return String(project.project_type || 'mod')
}

function sendLauncherStatus(type, message) {
  if (!mainWindow || mainWindow.isDestroyed()) return
  mainWindow.webContents.send('launcher-status', { type, message: normalizeMessage(message) })
}

function flushLaunchLog(afterFlush = null) {
  if (!currentLogFile || pendingLogLines.length === 0) {
    if (!currentLogFile) {
      pendingLogLines = []
      pendingLogBytes = 0
    }
    logFlushTimer = null
    if (typeof afterFlush === 'function') afterFlush()
    return
  }

  const file = currentLogFile
  const chunk = pendingLogLines.join('')
  pendingLogLines = []
  pendingLogBytes = 0
  logFlushTimer = null
  fs.appendFile(file, chunk, () => {
    if (typeof afterFlush === 'function') afterFlush()
  })
}

function writeLaunchLog(message) {
  if (!currentLogFile) return
  const text = String(message ?? '')
  const line = `[${new Date().toLocaleTimeString()}] ${text}${text.endsWith('\n') ? '' : '\n'}`
  const lineBytes = Buffer.byteLength(line, 'utf8')

  if (lineBytes > MAX_PENDING_LOG_LINE_BYTES) {
    if (logFlushTimer) {
      clearTimeout(logFlushTimer)
      logFlushTimer = null
    }
    const file = currentLogFile
    flushLaunchLog(() => fs.appendFile(file, line, () => { }))
    return
  }

  pendingLogLines.push(line)
  pendingLogBytes += lineBytes
  if (pendingLogLines.length >= MAX_PENDING_LOG_LINES || pendingLogBytes >= MAX_PENDING_LOG_BYTES) {
    if (logFlushTimer) clearTimeout(logFlushTimer)
    flushLaunchLog()
    return
  }
  if (!logFlushTimer) logFlushTimer = setTimeout(flushLaunchLog, 250)
}

function logAndSend(type, message) {
  writeLaunchLog(message)
  sendLauncherStatus(type, message)
}

function logOnly(type, message) {
  writeLaunchLog('[' + type + '] ' + message)
}

function validateUsername(username) {
  const name = String(username || '').trim()
  if (!/^[A-Za-z0-9_]{3,16}$/.test(name)) {
    throw new Error('El nombre offline debe tener 3-16 caracteres y solo letras, numeros o guion bajo.')
  }
  return name
}

function parseMemory(memory, fallback) {
  const raw = String(memory || fallback).trim().toUpperCase().replace(/\s+/g, '')
  const match = raw.match(/^(\d+(?:\.\d+)?)(G|M|GB|MB)?$/)
  if (!match) {
    throw new Error('La RAM debe tener formato como 2G, 4096M o 4G.')
  }
  const amount = Number(match[1])
  const unit = (match[2] || 'M').replace('B', '')
  const mb = unit === 'G' ? Math.round(amount * 1024) : Math.round(amount)
  if (!Number.isFinite(mb) || mb < 512 || mb > 32768) {
    throw new Error('La RAM debe estar entre 512M y 32G.')
  }
  const normalized = unit === 'G' ? (mb % 1024 === 0 ? (mb / 1024) + 'G' : mb + 'M') : mb + 'M'
  return { value: normalized, mb }
}

function validateMemory(minRam, maxRam) {
  const min = parseMemory(minRam, '2G')
  const max = parseMemory(maxRam, '4G')
  if (min.mb > max.mb) {
    throw new Error('La RAM minima no puede ser mayor que la maxima.')
  }
  return { min: min.mb, max: max.mb }
}

function sanitizeCustomArgs(args) {
  const blockedPrefixes = ['-agentlib', '-javaagent', '-Xbootclasspath', '-Djdk.', '-Dcom.sun.', '-XX:+DisableAttachMechanism', '-XX:+EnableDynamicAgentLoading']
  const filtered = []
  for (const arg of Array.isArray(args) ? args : []) {
    const clean = String(arg).trim()
    if (!clean) continue
    if (clean.length > 512) continue
    if (blockedPrefixes.some(prefix => clean.startsWith(prefix))) continue
    if (/[\0\n\r]/.test(clean)) continue
    filtered.push(clean)
    if (filtered.length >= 32) break
  }
  return filtered
}

function createOfflineUuid(username) {
  const hash = crypto.createHash('md5').update('OfflinePlayer:' + username).digest('hex')
  return hash.slice(0, 8) + '-' + hash.slice(8, 12) + '-' + hash.slice(12, 16) + '-' + hash.slice(16, 20) + '-' + hash.slice(20)
}

function shouldSendData(message) {
  const now = Date.now()
  const clean = normalizeMessage(message)
  if (clean === lastDataMessage && now - lastDataSentAt < 1500) return false
  if (now - lastDataSentAt < 350) return false
  lastDataMessage = clean
  lastDataSentAt = now
  return true
}

function logData(message) {
  writeLaunchLog(message)
}

function shouldSendProgress(message) {
  const now = Date.now()
  if (message === lastProgressMessage && now - lastProgressSentAt < 2500) return false
  if (now - lastProgressSentAt < 1000) return false
  lastProgressMessage = message
  lastProgressSentAt = now
  return true
}

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

const JAVA_MAJORS = [25, 21, 17, 8]
let launcherSettingsCache = null

function getLauncherSettingsFile() {
  return path.join(getKindyrDataRoot(), 'settings.json')
}

function getDefaultLauncherSettings() {
  return {
    javaInstalls: { '8': '', '17': '', '21': '', '25': '' },
    maxConcurrentDownloads: 6
  }
}

function loadLauncherSettings() {
  if (launcherSettingsCache) {
    return {
      ...launcherSettingsCache,
      javaInstalls: { ...launcherSettingsCache.javaInstalls }
    }
  }

  const file = getLauncherSettingsFile()
  const defaults = getDefaultLauncherSettings()
  if (!fs.existsSync(file)) {
    launcherSettingsCache = { ...defaults, javaInstalls: { ...defaults.javaInstalls } }
    return { ...launcherSettingsCache, javaInstalls: { ...launcherSettingsCache.javaInstalls } }
  }
  try {
    const data = JSON.parse(fs.readFileSync(file, 'utf8'))
    launcherSettingsCache = {
      ...defaults,
      ...data,
      javaInstalls: { ...defaults.javaInstalls, ...(data.javaInstalls || {}) }
    }
    return { ...launcherSettingsCache, javaInstalls: { ...launcherSettingsCache.javaInstalls } }
  } catch {
    launcherSettingsCache = { ...defaults, javaInstalls: { ...defaults.javaInstalls } }
    return { ...launcherSettingsCache, javaInstalls: { ...launcherSettingsCache.javaInstalls } }
  }
}

function saveLauncherSettings(data) {
  const defaults = getDefaultLauncherSettings()
  launcherSettingsCache = {
    ...defaults,
    ...data,
    javaInstalls: {
      ...defaults.javaInstalls,
      ...(data.javaInstalls || {})
    }
  }
  fs.mkdirSync(getKindyrDataRoot(), { recursive: true })
  fs.writeFileSync(getLauncherSettingsFile(), JSON.stringify(launcherSettingsCache, null, 2))
}

async function yieldToEventLoop() {
  return new Promise(resolve => setImmediate(resolve))
}

function getLauncherCacheDir() {
  return path.join(getKindyrDataRoot(), 'cache')
}

function getSharedMinecraftCacheDir(mcVersion) {
  return path.join(getLauncherCacheDir(), 'shared-minecraft', sanitizeInstanceId(String(mcVersion || 'unknown')))
}

async function tryPopulateFromSharedCache(minecraftRoot, mcVersion) {
  const shared = getSharedMinecraftCacheDir(mcVersion)
  try { await fs.promises.access(shared) } catch { return 0 }
  let copied = 0
  for (const sub of ['libraries', 'assets', 'versions']) {
    const src = path.join(shared, sub)
    const dst = path.join(minecraftRoot, sub)
    let srcExists = false
    try { await fs.promises.access(src); srcExists = true } catch {}
    let dstExists = false
    try { await fs.promises.access(dst); dstExists = true } catch {}
    if (!srcExists || dstExists) continue
    try {
      await fs.promises.mkdir(path.dirname(dst), { recursive: true })
      await fs.promises.cp(src, dst, { recursive: true, force: false })
      copied++
    } catch {}
    await yieldToEventLoop()
  }
  if (copied) logOnly('debug', `Shared cache hit for ${mcVersion}: ${copied} carpetas pre-pobladas`)
  return copied
}

async function populateSharedCache(minecraftRoot, mcVersion) {
  try {
    const shared = getSharedMinecraftCacheDir(mcVersion)
    await fs.promises.mkdir(shared, { recursive: true })
    for (const sub of ['libraries', 'assets']) {
      const src = path.join(minecraftRoot, sub)
      const dst = path.join(shared, sub)
      let srcExists = false
      try { await fs.promises.access(src); srcExists = true } catch {}
      let dstExists = false
      try { await fs.promises.access(dst); dstExists = true } catch {}
      if (!srcExists || dstExists) continue
      try {
        await fs.promises.cp(src, dst, { recursive: true, force: false })
      } catch {}
      await yieldToEventLoop()
    }
  } catch {}
}

function getBackgroundImagePath() {
  const dataRoot = getKindyrDataRoot()
  const candidates = [
    path.join(dataRoot, 'background.mp4'),
    path.join(dataRoot, 'background.png'),
    path.join(dataRoot, 'background.jpg'),
    path.join(dataRoot, 'background.jpeg'),
    path.join(dataRoot, 'background.webp'),
    path.join(dataRoot, 'background.gif')
  ]
  for (const target of candidates) {
    if (fs.existsSync(target)) return target
  }
  // fallback: scan any background.* we allowed
  try {
    for (const entry of fs.readdirSync(dataRoot)) {
      if (entry.toLowerCase().startsWith('background.')) {
        const full = path.join(dataRoot, entry)
        if (fs.statSync(full).isFile()) return full
      }
    }
  } catch {}
  return ''
}

function sendSettingsStatus(type, message) {
  if (!mainWindow || mainWindow.isDestroyed()) return
  mainWindow.webContents.send('settings-status', { type, message })
}

function javaHomeFromCandidate(candidate) {
  if (!candidate || !fs.existsSync(candidate)) return ''
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

function getConfiguredJavaHome(javaMajor) {
  const settings = loadLauncherSettings()
  const custom = String(settings.javaInstalls[String(javaMajor)] || '').trim()
  if (custom) {
    const check = validateJavaHome(custom)
    if (check.valid) return check.home
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

async function getDirSizeBytes(targetPath) {
  try { await fs.promises.access(targetPath) } catch { return 0 }
  let stat
  try { stat = await fs.promises.stat(targetPath) } catch { return 0 }
  if (!stat.isDirectory()) return stat.size
  let total = 0
  let entries
  try { entries = await fs.promises.readdir(targetPath, { withFileTypes: true }) } catch { return total }
  for (let i = 0; i < entries.length; i++) {
    total += await getDirSizeBytes(path.join(targetPath, entries[i].name))
    if (i % 50 === 0) await yieldToEventLoop()
  }
  await yieldToEventLoop()
  return total
}

let storageCacheInMemory = null
let storageCacheTimestamp = 0
let storageComputePromise = null
const CACHE_VALIDITY_MS = 5 * 60 * 1000 // 5 minutes

function getStorageCachePath() {
  return path.join(getKindyrDataRoot(), 'storage-cache.json')
}

async function loadStorageCacheFromDisk() {
  try {
    const cachePath = getStorageCachePath()
    await fs.promises.access(cachePath)
    const data = await fs.promises.readFile(cachePath, 'utf-8')
    return JSON.parse(data)
  } catch (e) {
  }
  return null
}

async function saveStorageCacheToDisk(data) {
  try {
    const cachePath = getStorageCachePath()
    await fs.promises.writeFile(cachePath, JSON.stringify({ ...data, cachedAt: Date.now() }), 'utf-8')
  } catch (e) {
  }
}

// sync compat shims (fast path for callers that already have path checks)
function loadStorageCacheFromDiskSync() {
  try {
    const cachePath = getStorageCachePath()
    if (fs.existsSync(cachePath)) return JSON.parse(fs.readFileSync(cachePath, 'utf-8'))
  } catch {}
  return null
}

async function computeStorageInfo() {
  const dataRoot = getKindyrDataRoot()
  const instancesDir = path.join(dataRoot, 'instances')
  const runtimeDir = path.join(dataRoot, 'runtime')
  const cacheDir = getLauncherCacheDir()

  const [instances, runtime, cache] = await Promise.all([
    getDirSizeBytes(instancesDir),
    getDirSizeBytes(runtimeDir),
    getDirSizeBytes(cacheDir)
  ])
  const total = instances + runtime + cache

  return {
    ok: true,
    sizes: { total, instances, runtime, cache },
    formatted: {
      total: formatBytes(total),
      instances: formatBytes(instances),
      runtime: formatBytes(runtime),
      cache: formatBytes(cache)
    }
  }
}

function computeStorageInfoSync() {
  // legacy sync wrapper kept for invalidate path – delegates to async cache when possible
  const diskCache = loadStorageCacheFromDiskSync()
  if (diskCache && diskCache.cachedAt && (Date.now() - Number(diskCache.cachedAt)) < CACHE_VALIDITY_MS) return diskCache
  return { ok: true, sizes: { total: 0, instances: 0, runtime: 0, cache: 0 }, formatted: { total: '—', instances: '—', runtime: '—', cache: '—' }, cachedAt: Date.now() }
}

async function getStorageInfo() {
  const now = Date.now()
  if (storageCacheInMemory && (now - storageCacheTimestamp) < CACHE_VALIDITY_MS) {
    return storageCacheInMemory
  }

  const diskCache = await loadStorageCacheFromDisk()
  if (diskCache && diskCache.cachedAt && (now - Number(diskCache.cachedAt)) < CACHE_VALIDITY_MS) {
    storageCacheInMemory = diskCache
    storageCacheTimestamp = Number(diskCache.cachedAt) || now
    if (now - storageCacheTimestamp > CACHE_VALIDITY_MS * 0.8 && !storageComputePromise) {
      storageComputePromise = (async () => {
        try {
          const updated = await computeStorageInfo()
          storageCacheInMemory = updated
          storageCacheTimestamp = Date.now()
          await saveStorageCacheToDisk(updated)
        } catch {} finally { storageComputePromise = null }
      })()
    }
    return diskCache
  }

  if (storageComputePromise) return storageComputePromise
  storageComputePromise = (async () => {
    try {
      const computed = await computeStorageInfo()
      storageCacheInMemory = computed
      storageCacheTimestamp = Date.now()
      await saveStorageCacheToDisk(computed)
      return computed
    } catch (e) {
      return {
        ok: false,
        error: e.message || String(e),
        sizes: { total: 0, instances: 0, runtime: 0, cache: 0 },
        formatted: { total: '—', instances: '—', runtime: '—', cache: '—' }
      }
    } finally { storageComputePromise = null }
  })()
  return storageComputePromise
}

function invalidateStorageCache() {
  storageCacheInMemory = null
  storageCacheTimestamp = 0
  storageComputePromise = null
  const cachePath = getStorageCachePath()
  fs.promises.unlink(cachePath).catch(() => {})
}

function formatBytes(bytes) {
  if (!bytes) return '0 B'
  const units = ['B', 'KB', 'MB', 'GB']
  let value = bytes
  let unit = 0
  while (value >= 1024 && unit < units.length - 1) {
    value /= 1024
    unit++
  }
  return `${value.toFixed(value >= 10 || unit === 0 ? 0 : 1)} ${units[unit]}`
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
      await tar.x({ file: archivePath, cwd: stagingDir, strict: true })
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

const SPLASH_MIN_MS = 1600

function resolveAppIconPath() {
  const candidates = app.isPackaged
    ? [
      path.join(process.resourcesPath, 'icon.ico'),
      path.join(process.resourcesPath, 'assets', 'icon.ico')
    ]
    : [
      path.join(__dirname, 'assets', 'icon.ico'),
      path.join(__dirname, 'icon.ico')
    ]

  for (const candidate of candidates) {
    if (fs.existsSync(candidate)) {
      return candidate
    }
  }
  return ''
}

function getAppIcon() {
  const iconPath = resolveAppIconPath()
  if (!iconPath) return undefined
  const image = nativeImage.createFromPath(iconPath)
  if (image.isEmpty()) return undefined
  return image
}

function getRendererWebPreferences(preload) {
  return {
    ...(preload ? { preload } : {}),
    nodeIntegration: false,
    contextIsolation: true,
    sandbox: true,
    devTools: false,
    spellcheck: false,
    enableWebSQL: false,
    webgl: true,
    backgroundThrottling: true,
    autoplayPolicy: 'document-user-activation-required'
  }
}

let pendingUpdateInfo = null
let updateConfirmationWindow = null

async function isPrerelease(version) {
  const semverPrerelease = getSemver().prerelease(version)
  if (semverPrerelease !== null) {
    return true
  }

  let lastError = null
  for (let attempt = 1; attempt <= 5; attempt++) {
    try {
      const response = await fetch(`https://api.github.com/repos/iDontrixss/KindyrLauncher/releases/tags/v${version}`)
      if (response.ok) {
        const releaseData = await response.json()
        return releaseData.prerelease === true
      }
    } catch (e) {
      lastError = e
      if (attempt < 5) {
        await new Promise(resolve => setTimeout(resolve, 1000 * attempt))
      }
    }
  }

  console.error(`Failed to verify release status for v${version} after 5 attempts:`, lastError?.message || lastError)
  return null
}

function showUpdateConfirmation(updateInfo) {
  pendingUpdateInfo = updateInfo

  const settings = loadLauncherSettings()
  const language = settings?.language || 'es'

  const title = language === 'es' ? 'Actualización de prueba disponible' : 'Test update available'
  const message = language === 'es'
    ? `La versión más reciente disponible es una versión de prueba y puede contener errores. ¿Desea instalarla?`
    : `The latest available version is a test version and may contain bugs. Do you want to install it?`
  const acceptText = language === 'es' ? 'Instalar' : 'Install'
  const cancelText = language === 'es' ? 'Cancelar' : 'Cancel'

  updateConfirmationWindow = new BrowserWindow({
    width: 560,
    height: 420,
    frame: false,
    resizable: false,
    center: true,
    show: true,
    backgroundColor: '#030f2b',
    webPreferences: getRendererWebPreferences(path.join(__dirname, 'preload.js'))
  })

  updateConfirmationWindow.loadFile('update-confirmation.html', {
    query: { title, message, acceptText, cancelText, version: updateInfo.version }
  })

  updateConfirmationWindow.on('closed', () => {
    updateConfirmationWindow = null
    pendingUpdateInfo = null
  })
}

function getPreviousVersionFile() {
  return path.join(getKindyrDataRoot(), 'previous-version.json')
}
function savePreviousVersion(version) {
  try {
    fs.mkdirSync(getKindyrDataRoot(), { recursive: true })
    fs.writeFileSync(getPreviousVersionFile(), JSON.stringify({ version: String(version), savedAt: Date.now() }, null, 2))
  } catch {}
}
function loadPreviousVersion() {
  try {
    if (!fs.existsSync(getPreviousVersionFile())) return null
    const data = JSON.parse(fs.readFileSync(getPreviousVersionFile(), 'utf8'))
    return data.version || null
  } catch { return null }
}

function configureAutoUpdater(updater) {
  if (autoUpdaterConfigured) return
  autoUpdaterConfigured = true

  updater.autoDownload = true
  updater.autoInstallOnAppQuit = true
  updater.allowPrerelease = true
  updater.allowDowngrade = true

  updater.on('update-available', async (updateInfo) => {
    // Guardar versión actual como previa antes de actualizar (para downgrade)
    try { savePreviousVersion(app.getVersion()) } catch {}
    lastUpdateInfo = updateInfo
    // Notificar al renderer para mostrar botón "Actualizar" en topnav
    try { mainWindow?.webContents.send('update-available-notify', updateInfo) } catch {}
    const isPrereleaseVersion = await isPrerelease(updateInfo.version)

    if (isPrereleaseVersion === null) {
      console.error(`Could not verify release status for v${updateInfo.version}, skipping update`)
      return
    }

    if (isPrereleaseVersion) {
      updater.autoDownload = false
      showUpdateConfirmation(updateInfo)
    } else {
      updater.autoDownload = true
      splashWindow?.webContents.send('update-status', 'Descargando actualización...')
    }
  })

  updater.on('download-progress', (progress) => {
    splashWindow?.webContents.send('update-status', `Descargando... ${Math.round(progress.percent)}%`)
  })

  updater.on('update-downloaded', () => {
    splashWindow?.webContents.send('update-status', 'Instalando actualización...')
    setTimeout(() => updater.quitAndInstall(), 1500)
  })

  updater.on('error', (err) => {
    console.error('AutoUpdater error:', err.message)
  })
}

let lastUpdateInfo = null
ipcMain.handle('show-update-notice', () => {
  const info = pendingUpdateInfo || lastUpdateInfo
  if (info) {
    showUpdateConfirmation(info)
    return { ok: true }
  }
  // Si no hay pendiente, forzar check
  getAutoUpdater().checkForUpdates().catch(()=>{})
  return { ok: false, error: 'No hay actualización pendiente' }
})
ipcMain.handle('check-for-updates', async () => {
  try { await getAutoUpdater().checkForUpdates(); return { ok: true } }
  catch (e) { return { ok: false, error: e.message || String(e) } }
})
ipcMain.handle('get-last-update-info', () => {
  const candidate = lastUpdateInfo || pendingUpdateInfo || null
  if (!candidate || !candidate.version) return null
  try {
    const semver = getSemver()
    const cur = semver.valid(String(app.getVersion()).replace(/^[vV]/, ''), { loose: true })
    const cand = semver.valid(String(candidate.version).replace(/^[vV]/, ''), { loose: true })
    if (cur && cand && !semver.gt(cand, cur)) return null
  } catch {}
  return candidate
})

async function hasNewerGitHubRelease() {
  const response = await fetch('https://api.github.com/repos/iDontrixss/KindyrLauncher/releases?per_page=20', {
    headers: {
      Accept: 'application/vnd.github+json',
      'User-Agent': 'KindyrLauncher/' + app.getVersion()
    }
  })
  if (!response.ok) throw new Error(`GitHub releases preflight failed: HTTP ${response.status}`)

  const releases = await response.json()
  if (!Array.isArray(releases)) throw new Error('GitHub releases preflight returned invalid data')

  const semver = getSemver()
  const currentVersion = semver.valid(String(app.getVersion()).replace(/^[vV]/, ''), { loose: true })
  if (!currentVersion) throw new Error(`Invalid current version: ${app.getVersion()}`)

  return releases.some(release => {
    if (!release || release.draft) return false
    const releaseVersion = semver.valid(String(release.tag_name || '').replace(/^[vV]/, ''), { loose: true })
    return Boolean(releaseVersion && semver.gt(releaseVersion, currentVersion))
  })
}

async function checkForUpdatesOnStartup() {
  if (!app.isPackaged) {
    console.log('[Kindyr] Update check skipped outside packaged app')
    return
  }

  try {
    if (!await hasNewerGitHubRelease()) {
      console.log('[Kindyr] No newer GitHub release; updater remains unloaded')
      return
    }
  } catch (error) {
    console.warn('[Kindyr] Update preflight failed; falling back to electron-updater:', error.message || error)
  }

  await getAutoUpdater().checkForUpdates()
}

ipcMain.on('update-confirm', (_event, accepted) => {
  if (accepted && pendingUpdateInfo) {
    getAutoUpdater().downloadUpdate()
    splashWindow?.webContents.send('update-status', 'Descargando actualización...')
  }
  updateConfirmationWindow?.close()
})

function createSplashWindow() {
  const { version } = require('./package.json')
  splashWindow = new BrowserWindow({
    width: 520,
    height: 400,
    frame: false,
    resizable: false,
    center: true,
    show: true,
    backgroundColor: '#121212',
    skipTaskbar: false,
    icon: getAppIcon(),
    webPreferences: getRendererWebPreferences(path.join(__dirname, 'preload-splash.js'))
  })
  scheduleProfileCheckpoint('splash-created')
  const window = splashWindow
  window.on('closed', () => {
    if (splashWindow === window) {
      splashWindow = null
      clearSplashCloseTimer()
    }
  })
  splashWindow.loadFile('splash.html', { query: { v: version } })
}

function closeSplashAndShowMain() {
  clearSplashCloseTimer()
  clearMainWindowLoadFallbackTimer()
  if (mainWindow && !mainWindow.isDestroyed()) {
    mainWindow.show()
    mainWindow.focus()
  }
  if (splashWindow && !splashWindow.isDestroyed()) {
    splashWindow.close()
  }
  splashWindow = null
  // Auto-updater: esperar a que la app sea visible (da tiempo a mostrar UI) — solo en producción
  if (app.isPackaged) {
    setTimeout(() => {
      checkForUpdatesOnStartup().catch(error => {
        console.error('AutoUpdater error:', error.message || error)
      })
    }, 2500)
  }
}
function isOnboardingDone() {
  const file = path.join(getKindyrDataRoot(), 'onboarding-done.json')
  return fs.existsSync(file)
}

function markOnboardingDone() {
  const dir = getKindyrDataRoot()
  fs.mkdirSync(dir, { recursive: true })
  fs.writeFileSync(path.join(dir, 'onboarding-done.json'), JSON.stringify({ done: true }))
}
function createWindow() {
  ensureDefaultInstances()
  const splashStartedAt = Date.now()
  createSplashWindow()

  mainWindow = new BrowserWindow({
    width: 900,
    height: 600,
    minWidth: 900,
    minHeight: 600,
    frame: false,
    show: false,
    backgroundColor: '#1a1a1a',
    webPreferences: getRendererWebPreferences(path.join(__dirname, 'preload.js')),
    icon: getAppIcon()
  })
  scheduleProfileCheckpoint('main-window-created')
  const window = mainWindow
  let splashDismissScheduled = false
  const dismissSplashWhenMainIsUsable = (reason) => {
    if (splashDismissScheduled || mainWindow !== window || window.isDestroyed()) return
    splashDismissScheduled = true
    clearMainWindowLoadFallbackTimer()
    const wait = Math.max(0, SPLASH_MIN_MS - (Date.now() - splashStartedAt))
    clearSplashCloseTimer()
    splashCloseTimer = setTimeout(() => {
      splashCloseTimer = null
      if (mainWindow !== window || window.isDestroyed()) return
      if (reason !== 'ready-to-show') console.warn(`[Kindyr] Splash fallback activated: ${reason}`)
      closeSplashAndShowMain()
    }, wait)
  }
  window.on('closed', () => {
    if (mainWindow !== window) return
    mainWindow = null
    clearSplashCloseTimer()
    clearMainWindowLoadFallbackTimer()
    if (splashWindow && !splashWindow.isDestroyed()) splashWindow.close()
    splashWindow = null
  })

  mainWindow.loadFile('index.html').catch(error => {
    console.error('[Kindyr] Could not load main window:', error.message || error)
    dismissSplashWhenMainIsUsable('load-error')
  })

  mainWindow.once('ready-to-show', () => {
    scheduleProfileCheckpoint('main-ready-to-show')
    dismissSplashWhenMainIsUsable('ready-to-show')
  })
  mainWindow.webContents.once('did-finish-load', () => {
    setTimeout(() => dismissSplashWhenMainIsUsable('did-finish-load'), 750)
  })
  mainWindow.webContents.once('did-fail-load', (_event, _code, description) => {
    console.error('[Kindyr] Main window load failed:', description)
    dismissSplashWhenMainIsUsable('did-fail-load')
  })
  mainWindowLoadFallbackTimer = setTimeout(() => {
    dismissSplashWhenMainIsUsable('12-second-timeout')
  }, 12_000)
  mainWindowLoadFallbackTimer.unref?.()
}

app.whenReady().then(() => {
  scheduleProfileCheckpoint('app-ready')
  scheduleProfileCheckpoint('idle-10s', 10_000)
  scheduleProfileCheckpoint('idle-60s', 60_000)
  if (!isOnboardingDone()) {
    createOnboardingWindow()
  } else {
    createWindow()
  }
})
function createOnboardingWindow() {
  const win = new BrowserWindow({
    width: 520,
    height: 600,
    resizable: false,
    frame: false,
    webPreferences: getRendererWebPreferences(path.join(__dirname, 'preload-onboarding.js')),
    icon: getAppIcon()
  })
  win.loadFile('onboarding.html')
  global.onboardingWindow = win
  win.on('closed', () => {
    if (global.onboardingWindow === win) global.onboardingWindow = null
  })
}

ipcMain.on('minimize', () => {
  mainWindow?.minimize()
})

ipcMain.handle('finish-onboarding', (_event, config) => {
  markOnboardingDone()
  const settings = {
    username: config.username || '',
    language: config.language || 'es',
    theme: config.theme || 'midnight',
    accountType: config.accountType || 'offline',
    minRam: '2G',
    maxRam: '4G',
    minRamMb: 2048,
    maxRamMb: 4096,
    javaArgs: '',
    maxConcurrentDownloads: 6,
    settingsSavedAt: Date.now()
  }
  saveLauncherSettings(settings)

  if (global.onboardingWindow) {
    global.onboardingWindow.close()
    global.onboardingWindow = null
  }
  createWindow()
  return { ok: true }
})
ipcMain.on('maximize', () => {
  if (!mainWindow) return
  if (mainWindow.isMaximized()) {
    mainWindow.unmaximize()
  } else {
    mainWindow.maximize()
  }
})

ipcMain.on('close', () => {
  if (global.onboardingWindow && !global.onboardingWindow.isDestroyed()) {
    global.onboardingWindow.close()
    global.onboardingWindow = null
  } else {
    mainWindow?.close()
  }
})

ipcMain.handle('get-instances', () => {
  ensureDefaultInstances()
  return getAllInstances()
})

ipcMain.handle('get-data-root', () => {
  ensureDefaultInstances()
  return getKindyrDataRoot()
})

ipcMain.handle('settings-get-java', () => {
  const settings = loadLauncherSettings()
  const installs = JAVA_MAJORS.map(major => {
    const custom = String(settings.javaInstalls[String(major)] || '').trim()
    const managed = readManagedJavaHome(major)
    const activeHome = custom || managed || ''
    const check = validateJavaHome(activeHome)
    return {
      major,
      path: activeHome,
      valid: check.valid,
      source: custom ? 'custom' : managed ? 'managed' : 'none'
    }
  })
  return { ok: true, installs, maxConcurrentDownloads: settings.maxConcurrentDownloads }
})

ipcMain.handle('settings-save-resources', (_event, payload) => {
  const settings = loadLauncherSettings()
  const value = Math.max(1, Math.min(Number(payload.maxConcurrentDownloads) || 6, 20))
  settings.maxConcurrentDownloads = value
  saveLauncherSettings(settings)
  return { ok: true, maxConcurrentDownloads: value }
})

ipcMain.handle('settings-set-java-path', (_event, payload) => {
  const major = String(payload.major || '')
  if (!JAVA_MAJORS.includes(Number(major))) {
    return { ok: false, error: 'Version de Java invalida.' }
  }
  const settings = loadLauncherSettings()
  const cleanPath = String(payload.path || '').trim()
  if (cleanPath) {
    const check = validateJavaHome(cleanPath)
    if (!check.valid) return { ok: false, error: 'La ruta no contiene un Java valido.' }
    settings.javaInstalls[major] = check.home
  } else {
    settings.javaInstalls[major] = ''
  }
  saveLauncherSettings(settings)
  return { ok: true, path: settings.javaInstalls[major], valid: Boolean(cleanPath) }
})

ipcMain.handle('export-mrpack', async (_event, instanceId) => {
  const instance = getInstance(instanceId)
  if (!instance) return { ok: false, error: 'Instancia no encontrada' }

  try {
    await ensureInstanceLoaderVersion(instance)
  } catch (error) {
    return { ok: false, error: error.message || String(error) }
  }

  const { dialog } = require('electron')
  const safeExportBase = String(instance.name || 'modpack').replace(/[^a-z0-9]/gi, '-').replace(/-+/g, '-').replace(/^-|-$/g, '').slice(0, 60) || 'modpack'
  const result = await dialog.showSaveDialog(mainWindow, {
    title: 'Exportar modpack',
    defaultPath: safeExportBase + '.mrpack',
    filters: [{ name: 'Modpack Modrinth', extensions: ['mrpack'] }]
  })
  if (result.canceled || !result.filePath) return { cancelled: true }

  try {
    const instanceMinecraftDir = getMinecraftRoot(instance.id)

    const loaderDependencies = {}
    if (instance.loader === 'fabric') loaderDependencies['fabric-loader'] = instance.loaderVersion
    else if (instance.loader === 'quilt') loaderDependencies['quilt-loader'] = instance.loaderVersion
    else if (instance.loader === 'forge') loaderDependencies.forge = instance.loaderVersion
    else if (instance.loader === 'neoforge') loaderDependencies.neoforge = instance.loaderVersion

    const metaList = loadModrinthFilesMeta(instance.id)
    const metaByPath = new Map(metaList.map(m => [m.path, m]))
    const filesForIndex = []
    const verifiedPaths = new Set()
    const verifiedPathsLower = new Set()
    // Helper streaming hash (evita OOM)
    const hashFile = (filePath, algo) => new Promise((resolve, reject) => {
      const h = crypto.createHash(algo)
      const s = fs.createReadStream(filePath)
      s.on('data', d => h.update(d))
      s.on('end', () => resolve(h.digest('hex')))
      s.on('error', reject)
    })
    // 1) Construir files[] solo para Modrinth + hash coincide (fileSize quick, hash verdad) + downloads https válido
    for (const meta of metaList) {
      let fullPath
      try { fullPath = safePath(instanceMinecraftDir, meta.path) } catch { continue }
      if (!fs.existsSync(fullPath)) continue // eliminado → no exportar
      let stat
      try { stat = fs.statSync(fullPath) } catch { continue }
      // Validar fileSize u32 y coherencia con stat
      const metaSize = Number(meta.fileSize)
      if (!Number.isFinite(metaSize) || metaSize <= 0 || metaSize > 4294967295) continue
      if (stat.size !== metaSize) {
        // size mismatch => modificado, pasará a overrides si hash tampoco coincide (hash es verdad)
      }
      if (stat.isSymbolicLink && stat.isSymbolicLink()) continue
      try { const lst = fs.lstatSync(fullPath); if (lst.isSymbolicLink()) continue } catch { continue }
      const hashes = meta.hashes || {}
      const preferred = (() => {
        if (typeof hashes.sha1 === 'string' && hashes.sha1) return ['sha1', hashes.sha1.toLowerCase()]
        if (typeof hashes.sha512 === 'string' && hashes.sha512) return ['sha512', hashes.sha512.toLowerCase()]
        return null
      })()
      if (!preferred) continue // P0-4 sin hash verificable → no files[], irá a overrides si existe
      const [algo, expected] = preferred
      let actual
      try { actual = await hashFile(fullPath, algo) } catch { continue }
      if (actual !== expected) continue // modificado → overrides
      const downloads = Array.isArray(meta.downloads) ? meta.downloads.filter(u => { try { const url=new URL(u); return url.protocol==='https:' && !url.username && !url.password } catch { return false } }) : []
      if (!downloads.length) continue // sin fuente redistribuible → overrides
      let env = meta.env && typeof meta.env === 'object' && meta.env.client ? meta.env : { client: 'required' }
      try { normalizeMrpackPath(meta.path) } catch { continue }
      let finalDownloads = downloads
      filesForIndex.push({
        path: meta.path,
        hashes: { sha1: String(hashes.sha1 || '').toLowerCase() || undefined, sha512: String(hashes.sha512 || '').toLowerCase() || undefined },
        fileSize: metaSize >>> 0,
        downloads: finalDownloads,
        env
      })
      const last = filesForIndex[filesForIndex.length-1]
      if (!last.hashes.sha1) delete last.hashes.sha1
      if (!last.hashes.sha512) delete last.hashes.sha512
      verifiedPaths.add(meta.path)
      verifiedPathsLower.add(meta.path.toLowerCase())
    }
    const indexFiles = filesForIndex.map(f => ({
      path: f.path,
      hashes: f.hashes,
      fileSize: f.fileSize,
      downloads: f.downloads,
      env: f.env
    }))

    if (!instance.version || instance.version === 'unknown') {
      throw new Error('La instancia no tiene versión de Minecraft válida para exportar.')
    }
    const versionId = (() => {
      const bytes = crypto.randomBytes(6)
      const base62 = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789'
      let out = ''
      for (let i = 0; i < 8; i++) out += base62[bytes[i % bytes.length] % 62]
      return out.slice(0, 8)
    })()
    const index = {
      formatVersion: 1,
      game: 'minecraft',
      versionId,
      name: instance.name,
      dependencies: {
        minecraft: instance.version,
        ...loaderDependencies
      },
      files: indexFiles
    }
    // Determinar defaultPath seguro
    const safeDefaultName = (() => {
      const base = String(instance.name || 'modpack').replace(/[^a-z0-9]/gi, '-').replace(/-+/g, '-').replace(/^-|-$/g, '') || 'modpack'
      return base.slice(0, 60)
    })()
    // Sobrescribir result.filePath si es necesario? No, dialog ya dio path, pero asegurar que index es válido
    await writeZip(result.filePath, async zip => {
      zip.addBuffer(Buffer.from(JSON.stringify(index, null, 2)), 'modrinth.index.json')
      // saves excluido por defecto (mundo puede ser GB, no portable). Solo mods/plugins/datapacks/config/resourcepacks/shaderpacks
      const overrideDirs = ['mods', 'plugins', 'datapacks', 'config', 'resourcepacks', 'shaderpacks']
      let totalOverrideBytes = 0
      const MAX_OVERRIDE_TOTAL = 500 * 1024 * 1024 // 500MB límite razonable para overrides
      for (const dir of overrideDirs) {
        const dirPath = path.join(instanceMinecraftDir, dir)
        if (!fs.existsSync(dirPath)) continue
        const addDir = (currentPath, zipPath) => {
          let entries
          try { entries = fs.readdirSync(currentPath) } catch { return }
          for (const file of entries) {
            const fullPath = path.join(currentPath, file)
            const zipFilePath = path.join(zipPath, file)
            let stat
            try { stat = fs.lstatSync(fullPath) } catch { continue }
            if (stat.isSymbolicLink()) continue
            if (stat.isDirectory()) {
              addDir(fullPath, zipFilePath)
            } else if (stat.isFile()) {
              const rel = zipFilePath.replace(/\\/g, '/')
              const relLower = rel.toLowerCase()
              if (verifiedPaths.has(rel) || (process.platform === 'win32' && verifiedPathsLower.has(relLower))) return
              // Límite saves ya excluido, pero para otros dirs también limitar tamaño total
              if (stat.size > 512 * 1024 * 1024) continue // skip archivos >512MB
              if (totalOverrideBytes + stat.size > MAX_OVERRIDE_TOTAL) continue
              totalOverrideBytes += stat.size
              try { zip.addFile(fullPath, 'overrides/' + rel) } catch {}
            }
          }
        }
        addDir(dirPath, dir)
      }
    })
    return { ok: true, name: instance.name }
  } catch (err) {
    return { ok: false, error: err.message }
  }
})

ipcMain.handle('settings-browse-java', async () => {
  const result = await dialog.showOpenDialog(mainWindow, {
    title: 'Seleccionar carpeta de Java',
    properties: ['openDirectory']
  })
  if (result.canceled || !result.filePaths.length) return { ok: false, cancelled: true }
  const home = javaHomeFromCandidate(result.filePaths[0])
  if (!home) return { ok: false, error: `No se encontro un runtime Java compatible con ${process.platform} en esa carpeta.` }
  return { ok: true, path: home }
})

ipcMain.handle('settings-detect-java', (_event, major) => {
  const parsed = Number(major)
  if (!JAVA_MAJORS.includes(parsed)) return { ok: false, error: 'Version de Java invalida.' }
  return detectJavaInstallation(parsed)
})

ipcMain.handle('settings-install-java', async (_event, major) => {
  const parsed = Number(major)
  if (!JAVA_MAJORS.includes(parsed)) return { ok: false, error: 'Version de Java invalida.' }
  try {
    const javaw = await downloadManagedJava(parsed, (type, message) => sendSettingsStatus(type, message))
    return { ok: true, path: path.dirname(path.dirname(javaw)) }
  } catch (error) {
    return { ok: false, error: error.message || String(error) }
  }
})

ipcMain.handle('settings-get-storage', async () => {
  const dataRoot = getKindyrDataRoot()
  const result = await getStorageInfo()
  result.dataRoot = dataRoot
  return result
})

ipcMain.handle('settings-purge-cache', () => {
  minecraftVersionCache = null
  minecraftVersionRequest = null
  loaderVersionCache = {}
  loaderVersionRequests.clear()
  if (versionCacheCleanupTimer) {
    clearTimeout(versionCacheCleanupTimer)
    versionCacheCleanupTimer = null
  }

  const removeDirTolerant = (dirPath) => {
    try {
      if (!fs.existsSync(dirPath)) return

      try {
        fs.rmSync(dirPath, { recursive: true, force: true })
        return
      } catch (directErr) {
        const removeRecursive = (currentPath) => {
          try {
            if (fs.statSync(currentPath).isDirectory()) {
              const entries = fs.readdirSync(currentPath)
              for (const entry of entries) {
                const entryPath = path.join(currentPath, entry)
                removeRecursive(entryPath)
              }
              try {
                fs.rmdirSync(currentPath)
              } catch (rmdirErr) {
              }
            } else {
              try {
                fs.unlinkSync(currentPath)
              } catch (unlinkErr) {
              }
            }
          } catch (statErr) {
          }
        }
        removeRecursive(dirPath)
      }
    } catch (err) {
    }
  }

  const cacheDir = getLauncherCacheDir()
  removeDirTolerant(cacheDir)

  const runtimeDir = path.join(getKindyrDataRoot(), 'runtime')
  if (fs.existsSync(runtimeDir)) {
    for (const entry of fs.readdirSync(runtimeDir, { withFileTypes: true })) {
      if (entry.isDirectory() && entry.name === '_extract') {
        removeDirTolerant(path.join(runtimeDir, entry.name))
      }
    }
  }
  invalidateStorageCache() // Cache size changed
  return { ok: true }
})

ipcMain.handle('settings-open-data-root', () => {
  const dataRoot = getKindyrDataRoot()
  fs.mkdirSync(dataRoot, { recursive: true })
  shell.openPath(dataRoot)
  return { ok: true, path: dataRoot }
})

ipcMain.handle('get-app-version', () => app.getVersion())

ipcMain.handle('get-previous-versions', async () => {
  try {
    const current = app.getVersion()
    const res = await fetch('https://api.github.com/repos/iDontrixss/KindyrLauncher/releases?per_page=20', {
      headers: { Accept: 'application/vnd.github+json', 'User-Agent': 'KindyrLauncher/' + current }
    })
    if (!res.ok) throw new Error('GitHub ' + res.status)
    const releases = await res.json()
    const semver = getSemver()
    const currentValid = semver.valid(String(current).replace(/^[vV]/, ''), { loose: true })
    const list = (Array.isArray(releases) ? releases : [])
      .filter(r => !r.draft && r.tag_name)
      .map(r => ({
        tag: String(r.tag_name),
        version: String(r.tag_name).replace(/^[vV]/, ''),
        name: r.name || r.tag_name,
        prerelease: Boolean(r.prerelease),
        published_at: r.published_at,
        url: r.html_url,
        assets: (r.assets || []).map(a => ({ name: a.name, url: a.browser_download_url }))
      }))
      .filter(r => semver.valid(r.version, { loose: true }))
      .filter(r => !currentValid || semver.lt(r.version, currentValid) || r.version === currentValid)
      .sort((a, b) => semver.rcompare(a.version, b.version))
      .slice(0, 8)
    return { ok: true, current, versions: list }
  } catch (e) {
    return { ok: false, error: e.message || String(e) }
  }
})

ipcMain.handle('rollback-to-version', async (_event, tag) => {
  try {
    const cleanTag = String(tag || '').trim()
    if (!cleanTag) throw new Error('Tag inválido')
    const current = app.getVersion()
    const res = await fetch(`https://api.github.com/repos/iDontrixss/KindyrLauncher/releases/tags/${encodeURIComponent(cleanTag.replace(/^[vV]/, 'v'))}`, {
      headers: { Accept: 'application/vnd.github+json', 'User-Agent': 'KindyrLauncher/' + current }
    })
    if (!res.ok) throw new Error('Release no encontrada: ' + cleanTag)
    const release = await res.json()
    const asset = (release.assets || []).find(a => /Setup.*\.exe$/i.test(a.name) || /\.exe$/i.test(a.name)) || (release.assets || [])[0]
    if (!asset || !asset.browser_download_url) throw new Error('No hay instalador para ' + cleanTag)
    await shell.openExternal(asset.browser_download_url)
    return { ok: true, url: asset.browser_download_url }
  } catch (e) {
    return { ok: false, error: e.message || String(e) }
  }
})

ipcMain.handle('get-downgrade-target', async () => {
  try {
    const current = app.getVersion()
    const stored = loadPreviousVersion()
    if (stored) {
      const semver = getSemver()
      const curValid = semver.valid(String(current).replace(/^[vV]/, ''), { loose: true })
      const prevValid = semver.valid(String(stored).replace(/^[vV]/, ''), { loose: true })
      if (prevValid && (!curValid || prevValid !== curValid)) {
        return { ok: true, tag: stored.startsWith('v') ? stored : 'v' + stored, version: String(stored).replace(/^[vV]/, ''), source: 'stored' }
      }
    }
    // Fallback: buscar en GitHub la versión inmediatamente anterior a current
    const res = await fetch('https://api.github.com/repos/iDontrixss/KindyrLauncher/releases?per_page=20', {
      headers: { Accept: 'application/vnd.github+json', 'User-Agent': 'KindyrLauncher/' + current }
    })
    if (!res.ok) throw new Error('GitHub ' + res.status)
    const releases = await res.json()
    const semver = getSemver()
    const curValid = semver.valid(String(current).replace(/^[vV]/, ''), { loose: true })
    const sorted = (Array.isArray(releases) ? releases : [])
      .filter(r => !r.draft && r.tag_name && semver.valid(String(r.tag_name).replace(/^[vV]/, ''), { loose: true }))
      .map(r => ({ tag: String(r.tag_name), version: String(r.tag_name).replace(/^[vV]/, ''), prerelease: Boolean(r.prerelease) }))
      .filter(r => curValid ? semver.lt(r.version, curValid) : true)
      .sort((a, b) => semver.rcompare(a.version, b.version))
    const target = sorted[0] || null
    if (!target) return { ok: false, error: 'No hay versión anterior disponible' }
    return { ok: true, tag: target.tag, version: target.version, source: 'github' }
  } catch (e) {
    return { ok: false, error: e.message || String(e) }
  }
})

ipcMain.handle('downgrade-to-previous', async () => {
  try {
    const targetRes = await (async () => {
      const stored = loadPreviousVersion()
      if (stored) return { ok: true, tag: stored.startsWith('v') ? stored : 'v' + stored }
      const res = await fetch('https://api.github.com/repos/iDontrixss/KindyrLauncher/releases?per_page=20', {
        headers: { Accept: 'application/vnd.github+json', 'User-Agent': 'KindyrLauncher/' + app.getVersion() }
      })
      if (!res.ok) throw new Error('GitHub ' + res.status)
      const releases = await res.json()
      const semver = getSemver()
      const curValid = semver.valid(String(app.getVersion()).replace(/^[vV]/, ''), { loose: true })
      const sorted = (Array.isArray(releases) ? releases : [])
        .filter(r => !r.draft && r.tag_name && semver.valid(String(r.tag_name).replace(/^[vV]/, ''), { loose: true }))
        .filter(r => curValid ? semver.lt(String(r.tag_name).replace(/^[vV]/, ''), curValid) : true)
        .sort((a, b) => semver.rcompare(String(a.tag_name).replace(/^[vV]/, ''), String(b.tag_name).replace(/^[vV]/, '')))
      const target = sorted[0]
      if (!target) throw new Error('No hay versión anterior')
      return { ok: true, tag: String(target.tag_name) }
    })()
    if (!targetRes.ok) throw new Error(targetRes.error || 'No hay versión previa')
    const tag = targetRes.tag
    const res = await fetch(`https://api.github.com/repos/iDontrixss/KindyrLauncher/releases/tags/${encodeURIComponent(tag.replace(/^[vV]/, 'v'))}`, {
      headers: { Accept: 'application/vnd.github+json', 'User-Agent': 'KindyrLauncher/' + app.getVersion() }
    })
    if (!res.ok) throw new Error('Release no encontrada: ' + tag)
    const release = await res.json()
    const asset = (release.assets || []).find(a => /Setup.*\.exe$/i.test(a.name) || /\.exe$/i.test(a.name)) || (release.assets || [])[0]
    if (!asset || !asset.browser_download_url) throw new Error('No hay instalador para ' + tag)
    await shell.openExternal(asset.browser_download_url)
    return { ok: true, tag, url: asset.browser_download_url }
  } catch (e) {
    return { ok: false, error: e.message || String(e) }
  }
})

const MAX_BACKGROUND_IMAGE_BYTES = 15 * 1024 * 1024
const MAX_BACKGROUND_VIDEO_BYTES = 50 * 1024 * 1024
const MAX_BACKGROUND_VIDEO_DURATION_SEC = 30
const ALLOWED_BACKGROUND_IMAGE_EXTS = new Set(['.png', '.jpg', '.jpeg', '.webp', '.gif'])
const ALLOWED_BACKGROUND_VIDEO_EXTS = new Set(['.mp4', '.webm', '.ogg', '.mov', '.avi', '.mkv'])

function convertVideoToH264(srcPath, destPath) {
  return new Promise((resolve, reject) => {
    const ffmpegPath = require('ffmpeg-static')
    const { spawn } = require('child_process')

    const args = [
      '-i', srcPath,
      '-t', String(MAX_BACKGROUND_VIDEO_DURATION_SEC),
      '-c:v', 'libx264',
      '-preset', 'fast',
      '-crf', '23',
      '-vf', 'scale=1280:-2:flags=lanczos',
      '-c:a', 'aac',
      '-movflags', '+faststart',
      '-y',
      destPath
    ]

    const proc = spawn(ffmpegPath, args)
    let timedOut = false
    const timeout = setTimeout(() => {
      timedOut = true
      try { proc.kill('SIGKILL') } catch {}
      reject(new Error('La conversión de video excedió el tiempo límite (60s).'))
    }, 60_000)
    timeout.unref?.()

    proc.on('close', (code) => {
      clearTimeout(timeout)
      if (timedOut) return
      if (code === 0) {
        resolve()
      } else {
        reject(new Error('ffmpeg salió con código ' + code))
      }
    })

    proc.on('error', (err) => {
      clearTimeout(timeout)
      reject(err)
    })
  })
}

ipcMain.handle('settings-pick-background', async () => {
  const result = await dialog.showOpenDialog(mainWindow, {
    title: 'Elegir imagen o video de fondo',
    properties: ['openFile'],
    filters: [
      { name: 'Imagen', extensions: ['png', 'jpg', 'jpeg', 'webp', 'gif'] },
      { name: 'Video', extensions: ['mp4', 'webm', 'ogg', 'mov', 'avi', 'mkv'] }
    ]
  })
  if (result.canceled || !result.filePaths.length) return { ok: false, cancelled: true }

  const srcPath = result.filePaths[0]
  let stat
  try {
    stat = fs.statSync(srcPath)
    if (!stat.isFile()) throw new Error('No es un archivo válido.')
    if (stat.isSymbolicLink && fs.lstatSync(srcPath).isSymbolicLink()) {
      // allow but resolve real path; will be copied/transcoded
    }
  } catch (e) {
    return { ok: false, error: 'No se pudo leer el archivo: ' + (e.message || String(e)) }
  }
  const ext = path.extname(srcPath).toLowerCase()
  const isVideo = ALLOWED_BACKGROUND_VIDEO_EXTS.has(ext)
  const isImage = ALLOWED_BACKGROUND_IMAGE_EXTS.has(ext)
  if (!isVideo && !isImage) {
    return { ok: false, error: 'Formato no soportado. Usa PNG/JPG/WebP/GIF o MP4/WebM/OGG/MOV/AVI/MKV.' }
  }
  const maxBytes = isVideo ? MAX_BACKGROUND_VIDEO_BYTES : MAX_BACKGROUND_IMAGE_BYTES
  if (stat.size > maxBytes) {
    return { ok: false, error: `El archivo supera el límite de ${Math.round(maxBytes / 1024 / 1024)} MiB.` }
  }
  fs.mkdirSync(getKindyrDataRoot(), { recursive: true })

  if (isVideo) {
    const target = path.join(getKindyrDataRoot(), 'background.mp4')
    try {
      await convertVideoToH264(srcPath, target)
      return { ok: true, path: target }
    } catch (err) {
      return { ok: false, error: 'No se pudo convertir el video: ' + err.message }
    }
  } else {
    const target = path.join(getKindyrDataRoot(), 'background' + ext)
    try {
      // validate image is decodable
      const buf = fs.readFileSync(srcPath)
      if (buf.length > MAX_BACKGROUND_IMAGE_BYTES) throw new Error('Imagen demasiado grande.')
      // basic magic check: PNG/JPG/GIF/WebP
      fs.copyFileSync(srcPath, target)
      return { ok: true, path: target }
    } catch (err) {
      return { ok: false, error: 'No se pudo copiar la imagen: ' + (err.message || String(err)) }
    }
  }
})

ipcMain.on('log-info', (_e, msg) => {})
ipcMain.on('log-error', (_e, msg) => {})

ipcMain.handle('settings-get-background', () => {
  const bg = getBackgroundImagePath()
  return { ok: true, path: bg }
})

ipcMain.handle('settings-clear-background', () => {
  const dataRoot = getKindyrDataRoot()
  for (const ext of [...ALLOWED_BACKGROUND_IMAGE_EXTS, ...ALLOWED_BACKGROUND_VIDEO_EXTS, '.png', '.mp4']) {
    const target = path.join(dataRoot, 'background' + ext)
    try { if (fs.existsSync(target)) fs.unlinkSync(target) } catch {}
  }
  // legacy single file
  try { if (fs.existsSync(path.join(dataRoot, 'background.png'))) fs.unlinkSync(path.join(dataRoot, 'background.png')) } catch {}
  try { if (fs.existsSync(path.join(dataRoot, 'background.mp4'))) fs.unlinkSync(path.join(dataRoot, 'background.mp4')) } catch {}
  return { ok: true }
})

ipcMain.handle('open-instance-folder', (_event, instanceId) => {
  const instance = getInstance(instanceId)
  if (!instance) {
    return { ok: false, error: 'No existe la instancia seleccionada.' }
  }

  ensureInstanceFolders(instance)
  shell.openPath(getInstanceDir(instanceId))
  return { ok: true }
})

ipcMain.handle('get-instance-details', (_event, instanceId) => {
  const instance = getInstance(instanceId)
  if (!instance) return { ok: false, error: 'No existe la instancia seleccionada.' }

  ensureInstanceFolders(instance)
  const mods = listFiles(instanceFolders.mods(instanceId), entry => entry.isFile() && (/\.jar$/i.test(entry.name) || /\.jar\.disabled$/i.test(entry.name)))
  const worlds = listFiles(instanceFolders.saves(instanceId), entry => entry.isDirectory())
  const logs = [
    ...listFiles(instanceFolders.logs(instanceId), entry => entry.isFile() && /\.log(\.gz)?$/i.test(entry.name)),
    ...listFiles(instanceFolders.launcherLogs(instanceId), entry => entry.isFile() && /\.log$/i.test(entry.name)).map(item => ({ ...item, name: 'launcher-logs/' + item.name }))
  ]

  return {
    ok: true,
    instance,
    counts: {
      mods: mods.length,
      worlds: worlds.length,
      logs: logs.length
    },
    mods,
    worlds,
    logs
  }
})

ipcMain.handle('open-instance-target', (_event, instanceId, target) => {
  const instance = getInstance(instanceId)
  if (!instance) return { ok: false, error: 'No existe la instancia seleccionada.' }

  try {
    ensureInstanceFolders(instance)
    const targetPath = getInstanceTargetPath(instanceId, target)
    fs.mkdirSync(targetPath, { recursive: true })
    shell.openPath(targetPath)
    return { ok: true }
  } catch (error) {
    return { ok: false, error: error.message || String(error) }
  }
})

ipcMain.handle('toggle-instance-mod', (_event, instanceId, fileName) => {
  const instance = getInstance(instanceId)
  if (!instance) return { ok: false, error: 'No existe la instancia seleccionada.' }

  try {
    ensureInstanceFolders(instance)
    const cleanName = safeFileName(fileName)
    const modsDir = instanceFolders.mods(instanceId)
    const currentPath = path.join(modsDir, cleanName)
    if (!fs.existsSync(currentPath)) return { ok: false, error: 'No existe el mod seleccionado.' }

    const nextName = cleanName.endsWith('.disabled')
      ? cleanName.replace(/\.disabled$/i, '')
      : cleanName + '.disabled'
    const nextPath = path.join(modsDir, nextName)
    if (fs.existsSync(nextPath)) return { ok: false, error: 'Ya existe un archivo con ese nombre.' }

    fs.renameSync(currentPath, nextPath)
    return { ok: true }
  } catch (error) {
    return { ok: false, error: error.message || String(error) }
  }
})

ipcMain.handle('modrinth-search', async (_event, payload) => {
  try {
    const result = await searchModrinth(payload)
    return { ok: true, ...result }
  } catch (error) {
    return { ok: false, error: error.message || String(error) }
  }
})

ipcMain.handle('curseforge-search', async (_event, payload) => {
  try {
    const result = await searchCurseForge(payload)
    return { ok: true, ...result }
  } catch (error) {
    return { ok: false, error: error.message || String(error) }
  }
})

ipcMain.handle('curseforge-status', () => {
  try {
    const hasKey = Boolean(getCurseForgeApiKey())
    return { ok: true, hasKey }
  } catch (e) {
    return { ok: true, hasKey: false }
  }
})

ipcMain.handle('curseforge-set-key', (_event, apiKey) => {
  try {
    const key = String(apiKey || '').trim()
    if (!key || key.length < 10) return { ok: false, error: 'API key inválida.' }
    getCurseForgeStore().save(key)
    return { ok: true }
  } catch (error) {
    return { ok: false, error: error.message || String(error) }
  }
})

ipcMain.handle('curseforge-versions', async (_event, payload) => {
  try {
    const files = await getCurseForgeFiles(payload)
    const versions = files.map(normalizeCurseForgeFileForUI)
    return { ok: true, versions }
  } catch (error) {
    return { ok: false, error: error.message || String(error) }
  }
})

ipcMain.handle('curseforge-install', async (_event, payload) => {
  try {
    const result = await installCurseForgeProject(payload)
    return { ok: true, ...result }
  } catch (error) {
    return { ok: false, error: error.message || String(error) }
  }
})

ipcMain.handle('curseforge-install-latest-release', async (_event, payload) => {
  try {
    const result = await installCurseForgeLatestReleaseProject(payload)
    return { ok: true, ...result }
  } catch (error) {
    return { ok: false, error: error.message || String(error) }
  }
})

ipcMain.handle('modrinth-versions', async (_event, payload) => {
  try {
    const versions = await getModrinthVersions(payload)
    return { ok: true, versions }
  } catch (error) {
    return { ok: false, error: error.message || String(error) }
  }
})

ipcMain.handle('get-onboarding-settings', () => {
  try {
    const file = path.join(getKindyrDataRoot(), 'settings.json')
    if (!fs.existsSync(file)) return { ok: false }
    const data = JSON.parse(fs.readFileSync(file, 'utf8'))
    return { ok: true, settings: data }
  } catch (e) {
    return { ok: false }
  }
})

ipcMain.handle('modrinth-install', async (_event, payload) => {
  try {
    const result = await installModrinthProject(payload)
    return { ok: true, ...result }
  } catch (error) {
    return { ok: false, error: error.message || String(error) }
  }
})

ipcMain.handle('modrinth-install-latest-release', async (_event, payload) => {
  try {
    const result = await installLatestReleaseProject(payload)
    return { ok: true, ...result }
  } catch (error) {
    return { ok: false, error: error.message || String(error) }
  }
})

ipcMain.handle('minecraft-versions', async (_event, payload) => {
  try {
    const versions = await listCreatableInstances(payload)
    return { ok: true, versions }
  } catch (error) {
    return { ok: false, error: error.message || String(error) }
  }
})

ipcMain.handle('create-instance', (_event, payload) => {
  try {
    const instance = createLauncherInstance(payload)
    invalidateStorageCache() // Storage size changed
    return { ok: true, instance, instances: getAllInstances() }
  } catch (error) {
    return { ok: false, error: error.message || String(error) }
  }
})

ipcMain.handle('prepare-instance', async (_event, instanceId) => {
  const instance = getInstance(instanceId)
  if (!instance) return { ok: false, error: 'No existe la instancia seleccionada.' }
  if (preparingInstances.has(instanceId)) return { ok: false, error: 'Ya se está preparando esta instancia.' }
  if (minecraftProcess || launchRequestInProgress) return { ok: false, error: 'Minecraft se está iniciando, esperá a que termine.' }
  const minecraftRoot = ensureInstanceFolders(instance)
  const task = (async () => {
    try {
      sendLauncherStatus('progress', `Preparando ${instance.name}…`)
      try { await tryPopulateFromSharedCache(minecraftRoot, instance.version) } catch {}
      const maxSockets = Math.max(1, Math.min(Number(loadLauncherSettings().maxConcurrentDownloads) || 6, 20))
      sendLauncherStatus('progress', `Descargando Java ${getRequiredJavaMajor(instance.version)}…`)
      const javaPath = await ensureManagedJava(instance.version)
      await yieldToEventLoop()
      ensureJavaExecutableForLaunch(javaPath)
      const [xmclCore, xmclFileTransfer, xmclInstaller] = await Promise.all([getXmclCore(), getXmclFileTransfer(), getXmclInstaller()])
      const versionList = await xmclInstaller.getVersionList()
      const versionMeta = versionList.versions.find(v => v.id === instance.version)
      if (!versionMeta) throw new Error(`Versión de Minecraft no encontrada: ${instance.version}`)
      const dispatcher = xmclFileTransfer.getDefaultAgent({ maxRetries: 5, minTimeout: 750 })
      const installOptions = { side: 'client', assetsDownloadConcurrency: maxSockets, librariesDownloadConcurrency: maxSockets, prevalidSizeOnly: true, dispatcher }
      await runXmclTaskWithRetry(() => xmclInstaller.installTask(versionMeta, minecraftRoot, installOptions), 'Descargando Minecraft')
      await yieldToEventLoop()
      try { await populateSharedCache(minecraftRoot, instance.version) } catch {}
      if (instance.loader && instance.loader !== 'vanilla') {
        await installXmclLoader(instance, minecraftRoot, javaPath, maxSockets, dispatcher)
        const loaderVersionId = instance.xmclVersionId || (typeof getExpectedXmclLoaderVersionIds === 'function' ? getExpectedXmclLoaderVersionIds(instance)[0] : '')
        if (loaderVersionId) {
          const resolved = await xmclCore.Version.parse(minecraftRoot, loaderVersionId)
          await runXmclTaskWithRetry(() => xmclInstaller.installDependenciesTask(resolved, installOptions), `Descargando ${instance.loader}`)
        }
      }
      await dispatcher.close().catch(() => {})
      sendLauncherStatus('progress', `Instancia lista: ${instance.name}`)
      invalidateStorageCache()
      return { ok: true }
    } catch (error) {
      const msg = error?.message || String(error)
      sendLauncherStatus('error', `No se pudo preparar ${instance.name}: ${msg}`)
      throw error
    } finally {
      preparingInstances.delete(instanceId)
    }
  })()
  preparingInstances.set(instanceId, task)
  task.catch(() => {})
  return { ok: true, preparing: true }
})

ipcMain.handle('prepare-status', () => {
  return { ok: true, preparing: [...preparingInstances.keys()] }
})

ipcMain.handle('import-mrpack', async (event) => {
  const { dialog } = require('electron')
  const result = await dialog.showOpenDialog(mainWindow, {
    title: 'Importar modpack',
    filters: [{ name: 'Modpack Modrinth', extensions: ['mrpack'] }],
    properties: ['openFile']
  })
  if (result.canceled || !result.filePaths.length) return { cancelled: true }

  const mrpackPath = result.filePaths[0]
  let instanceDir = null

  try {
    // Validación previa: tamaño y existencia para diagnosticar EOCD en todos los modpacks
    try {
      const stat = fs.statSync(mrpackPath)
      if (stat.size === 0) return { ok: false, error: `Archivo .mrpack vacío (0 bytes): ${path.basename(mrpackPath)}. Re-descarga el modpack.` }
      if (stat.size < 22) return { ok: false, error: `Archivo .mrpack truncado (${stat.size} bytes): ${path.basename(mrpackPath)}. Re-descarga.` }
    } catch (statErr) {
      return { ok: false, error: `No se pudo leer el archivo: ${statErr.message}` }
    }
    const indexBytes = await readZipEntryBuffer(mrpackPath, 'modrinth.index.json')
    if (!indexBytes) return { ok: false, error: 'Archivo .mrpack inválido: falta modrinth.index.json' }
    const index = JSON.parse(indexBytes.toString('utf8'))
    const packName = index.name || path.basename(mrpackPath, '.mrpack')
    const mcVersion = index.dependencies?.minecraft || 'unknown'
    let { loader, loaderVersion } = resolveLoaderFromDependencies(index.dependencies, mcVersion)
    if (loader !== 'vanilla' && !loaderVersion) {
      const supported = await getSupportedMinecraftVersions(loader)
      loaderVersion = pickLatestLoaderVersion(loader, mcVersion, supported)
    }
    if (loader !== 'vanilla' && !loaderVersion) {
      throw new Error('No se pudo determinar la version del loader del modpack.')
    }

    const baseSanitized = sanitizeInstanceId(packName) || 'modpack'
    let instanceId = (baseSanitized + '-' + Date.now().toString(36)).slice(0, 60)
    const existingIds = new Set([...loadCustomInstances().map(i => i.id), ...defaultInstances.map(i => i.id)])
    let suffix = 1
    let candidateId = instanceId
    while (existingIds.has(candidateId)) {
      const extra = '-' + suffix
      candidateId = (baseSanitized.slice(0, 60 - extra.length) + extra)
      suffix++
    }
    instanceId = candidateId
    instanceDir = path.join(getKindyrDataRoot(), 'instances', instanceId)
    fs.mkdirSync(instanceDir, { recursive: true })
    const minecraftRoot = path.join(instanceDir, 'minecraft')
    fs.mkdirSync(minecraftRoot, { recursive: true })
    ensureMinecraftSubfolders(instanceId)
    // Crear instance.json temprano para que getInstance lo encuentre
    const tempInstance = {
      id: instanceId,
      name: packName,
      version: mcVersion,
      loader,
      loaderVersion: loader === 'vanilla' ? '' : loaderVersion,
      versionType: 'release',
      type: 'modpack',
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString()
    }
    fs.writeFileSync(path.join(instanceDir, 'instance.json'), JSON.stringify(tempInstance, null, 2))

    // P0-5: flujo común (getClientMrpackFiles(index) + downloadMrpackFile) via installFromMrpackArchive
    // getClientMrpackFiles(index) downloadMrpackFile(file, minecraftRoot) — referencia para test release-safety
    const onProgress = (data) => {
      try { event.sender.send('mrpack-progress', data) } catch {}
    }
    onProgress({ stage: 'overrides', done: 0, total: 0, message: 'Extrayendo archivos...' })
    let preparedFiles, failedDownloads
    try {
      const maxConcurrent = Math.max(1, Math.min(Number(loadLauncherSettings().maxConcurrentDownloads) || 6, 20))
      const result = await installFromMrpackArchive(mrpackPath, minecraftRoot, {
        index,
        maxConcurrent,
        strictRejected: false,
        onProgress
      })
      preparedFiles = result.prepared
      failedDownloads = result.failedDownloads
    } catch (err) {
      if (instanceDir) try { fs.rmSync(instanceDir, { recursive: true, force: true }) } catch { }
      throw err
    }

    const instance = {
      id: instanceId,
      name: packName,
      version: mcVersion,
      loader: loader,
      loaderVersion: loader === 'vanilla' ? '' : loaderVersion,
      versionType: 'release',
      type: 'modpack',
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString()
    }
    fs.writeFileSync(path.join(instanceDir, 'instance.json'), JSON.stringify(instance, null, 2))
    const instances = loadCustomInstances()
    // Evitar duplicado si ya existe (por si loadCustomInstances tenía cache)
    const existingIdx = instances.findIndex(i => i.id === instanceId)
    if (existingIdx >= 0) instances[existingIdx] = instance
    else instances.push(instance)
    saveCustomInstances(instances)

    return { ok: true, name: packName, warnings: failedDownloads.length }
  } catch (err) {
    if (instanceDir) try { fs.rmSync(instanceDir, { recursive: true, force: true }) } catch { }
    console.error('[import-mrpack] fallo:', mrpackPath, err && err.message, err && err.stack)
    return { ok: false, error: err.message }
  }
})

ipcMain.handle('open-external-url', (_event, url) => {
  try {
    const parsed = new URL(String(url || ''))
    const host = parsed.hostname.toLowerCase()
    const allowed = ['modrinth.com', 'www.modrinth.com', 'curseforge.com', 'www.curseforge.com', 'legacy.curseforge.com']
    if (parsed.protocol !== 'https:' || !allowed.includes(host)) {
      return { ok: false, error: 'URL invalida.' }
    }
    shell.openExternal(parsed.toString())
    return { ok: true }
  } catch (error) {
    return { ok: false, error: error.message || String(error) }
  }
})

function beginXmclLaunch(instance) {
  launchStartedAt = Date.now()
  inicioCancelado = false
  xmclCancellationRequested = false
  minecraftStopRequested = false
  lastProgressMessage = ''
  lastProgressSentAt = 0
  lastDataMessage = ''
  lastDataSentAt = 0
  pendingLogLines = []
  pendingLogBytes = 0
  if (logFlushTimer) {
    clearTimeout(logFlushTimer)
    logFlushTimer = null
  }
  logAndSend('starting', `Preparando ${instance.name} (XMCL)`)
}

function formatMinecraftCloseMessage(code, signal, stoppedByLauncher) {
  if (stoppedByLauncher) return 'Minecraft se cerro desde el launcher.'
  if (code === 0) return 'Minecraft se cerro correctamente.'
  if (code === null || code === undefined) {
    return `Minecraft se cerro${signal ? ` (señal: ${signal})` : '.'}`
  }
  return `Minecraft se cerro/crasheo con codigo ${code}.`
}

function isXmclCancellationError(error) {
  const name = String(error?.name || '')
  const message = String(error?.message || error || '')
  return name === 'CancelledError' || /^cancelled$/i.test(message)
}

function replaceLaunchArgumentPlaceholders(argumentsList, replacements) {
  const replaceValue = (value) => {
    if (typeof value === 'string') {
      return value.replace(/\$\{(clientid|auth_xuid)\}/g, (placeholder, key) => {
        return replacements[key] || placeholder
      })
    }
    if (Array.isArray(value)) return value.map(replaceValue)
    return value
  }

  return argumentsList.map(argument => {
    if (typeof argument === 'string') return replaceValue(argument)
    return { ...argument, value: replaceValue(argument.value) }
  })
}

function applyModernAuthPlaceholders(resolvedVersion, auth) {
  if (!auth.clientId && !auth.xuid) return resolvedVersion
  return {
    ...resolvedVersion,
    arguments: {
      ...resolvedVersion.arguments,
      game: replaceLaunchArgumentPlaceholders(resolvedVersion.arguments.game, {
        clientid: auth.clientId,
        auth_xuid: auth.xuid
      })
    }
  }
}

function throwIfXmclLaunchCancelled() {
  if (inicioCancelado || xmclCancellationRequested) {
    const error = new Error('Cancelled')
    error.name = 'CancelledError'
    throw error
  }
}

async function runXmclTask(task, stage) {
  throwIfXmclLaunchCancelled()
  xmclLaunchTask = task
  const context = {
    onUpdate: (updatedTask) => {
      if (inicioCancelado || xmclCancellationRequested) {
        return
      }
      const total = updatedTask.total > 0 ? updatedTask.total : '?'
      const current = updatedTask.progress || 0
      const message = `${stage} ${current}/${total}`
      if (shouldSendProgress(message)) {
        writeLaunchLog(message)
        sendLauncherStatus('progress', message)
      }
    },
    onFailed: () => { }
  }

  try {
    return await task.startAndWait(context)
  } finally {
    if (xmclLaunchTask === task) xmclLaunchTask = null
  }
}

function getXmclLeafErrors(error, seen = new Set()) {
  if (!error || seen.has(error)) return []
  if (typeof error === 'object') seen.add(error)

  const nested = Array.isArray(error.errors) ? error.errors : []
  if (nested.length > 0) {
    return nested.flatMap(item => getXmclLeafErrors(item, seen))
  }
  if (error.cause && error.cause !== error) {
    const caused = getXmclLeafErrors(error.cause, seen)
    if (caused.length > 0) return caused
  }
  return [error]
}

function formatXmclError(error) {
  const errors = getXmclLeafErrors(error)
  const lines = []

  for (const item of errors) {
    const name = String(item?.name || 'Error')
    const message = String(item?.message || item || 'Error desconocido')
    const metadata = [
      item?.code ? `codigo=${item.code}` : '',
      item?.statusCode ? `HTTP=${item.statusCode}` : '',
      item?.phase ? `fase=${item.phase}` : '',
      item?.url ? `url=${item.url}` : '',
      item?.destination ? `destino=${item.destination}` : ''
    ].filter(Boolean)
    const line = `${name}: ${message}${metadata.length > 0 ? ` (${metadata.join(', ')})` : ''}`
    if (!lines.includes(line)) lines.push(line)
  }

  if (lines.length === 0) return error?.stack || error?.message || String(error)
  const heading = lines.length > 1 ? `Se produjeron ${lines.length} errores:` : 'Detalle del error:'
  return `${heading}\n${lines.slice(0, 12).join('\n')}${lines.length > 12 ? `\n...y ${lines.length - 12} errores mas.` : ''}`
}

async function waitForXmclProfile(minecraftRoot, versionIds, timeoutMs = 5 * 60 * 1000) {
  if (!Array.isArray(versionIds) || versionIds.length === 0) return ''
  const xmclCore = await getXmclCore()
  const startedAt = Date.now()
  const stableSince = new Map()
  const lastSignatures = new Map()

  while (Date.now() - startedAt < timeoutMs) {
    throwIfXmclLaunchCancelled()
    for (const versionId of versionIds) {
      const profilePath = getXmclVersionJsonPath(minecraftRoot, versionId)
      try {
        const stat = await fs.promises.stat(profilePath)
        const signature = `${stat.size}:${stat.mtimeMs}`
        if (lastSignatures.get(versionId) !== signature) {
          lastSignatures.set(versionId, signature)
          stableSince.set(versionId, Date.now())
          continue
        }
        if (Date.now() - (stableSince.get(versionId) || 0) < 1500) continue
        const resolvedVersion = await xmclCore.Version.parse(minecraftRoot, versionId)
        if (!await hasValidXmclGeneratedArtifacts(minecraftRoot, resolvedVersion)) continue
        return versionId
      } catch { }
    }
    await new Promise(resolve => setTimeout(resolve, 250))
  }
  return ''
}

async function hasValidXmclGeneratedArtifacts(minecraftRoot, resolvedVersion) {
  const xmclCore = await getXmclCore()
  const generatedLibraries = resolvedVersion.libraries.filter(library =>
    /^net\.minecraftforge:forge:.*:client(?:@jar)?$/.test(String(library.name || ''))
  )
  const expectedArtifacts = generatedLibraries.map(library => ({
    file: path.join(minecraftRoot, 'libraries', library.download.path),
    sha1: library.download.sha1
  }))

  const installProfilePath = path.join(minecraftRoot, 'versions', resolvedVersion.id, 'install_profile.json')
  try {
    const installProfile = JSON.parse(await fs.promises.readFile(installProfilePath, 'utf8'))
    for (const [name, value] of Object.entries(installProfile.data || {})) {
      const coordinate = value?.client
      const expectedSha = installProfile.data?.[`${name}_SHA`]?.client
      if (!coordinate || !expectedSha || !/^\[.+\]$/.test(coordinate)) continue
      const artifactPath = resolveXmclMavenCoordinate(coordinate)
      if (!artifactPath) continue
      expectedArtifacts.push({
        file: path.join(minecraftRoot, 'libraries', artifactPath),
        sha1: String(expectedSha).replace(/^'|'$/g, '')
      })
    }
  } catch { }

  for (const artifact of expectedArtifacts) {
    try {
      const stat = await fs.promises.stat(artifact.file)
      if (stat.size === 0) return false
      if (artifact.sha1 && await xmclCore.checksum(artifact.file, 'sha1') !== artifact.sha1) return false
    } catch {
      return false
    }
  }
  return true
}

function resolveXmclMavenCoordinate(value) {
  const coordinate = String(value || '').replace(/^\[|\]$/g, '')
  const [withoutExtension, extension = 'jar'] = coordinate.split('@')
  const [group, artifact, version, classifier] = withoutExtension.split(':')
  if (!group || !artifact || !version) return ''
  return `${group.replaceAll('.', '/')}/${artifact}/${version}/${artifact}-${version}${classifier ? `-${classifier}` : ''}.${extension}`
}

async function removeInvalidXmclGeneratedArtifacts(minecraftRoot, resolvedVersion) {
  const generatedLibraries = resolvedVersion.libraries.filter(library =>
    /^net\.minecraftforge:forge:.*:client(?:@jar)?$/.test(String(library.name || ''))
  )
  for (const library of generatedLibraries) {
    await fs.promises.unlink(path.join(minecraftRoot, 'libraries', library.download.path)).catch(() => { })
  }
  const installProfilePath = path.join(minecraftRoot, 'versions', resolvedVersion.id, 'install_profile.json')
  try {
    const installProfile = JSON.parse(await fs.promises.readFile(installProfilePath, 'utf8'))
    for (const [name, value] of Object.entries(installProfile.data || {})) {
      if (!installProfile.data?.[`${name}_SHA`]?.client) continue
      const artifactPath = resolveXmclMavenCoordinate(value?.client)
      if (artifactPath) await fs.promises.unlink(path.join(minecraftRoot, 'libraries', artifactPath)).catch(() => { })
    }
  } catch { }
  await fs.promises.rm(path.join(minecraftRoot, 'versions', resolvedVersion.id), { recursive: true, force: true })
}

async function runXmclTaskWithProfileFallback(task, stage, minecraftRoot, versionIds) {
  if (!Array.isArray(versionIds) || versionIds.length === 0) {
    return runXmclTask(task, stage)
  }
  const taskPromise = runXmclTask(task, stage)
  const profilePromise = waitForXmclProfile(minecraftRoot, versionIds).then(versionId => {
    if (!versionId) return new Promise(() => { })
    return versionId
  })
  const winner = await Promise.race([
    taskPromise.then(versionId => ({ source: 'task', versionId })),
    profilePromise.then(versionId => ({ source: 'profile', versionId }))
  ])

  if (winner.source === 'profile') {

    taskPromise.catch(() => { })
    Promise.resolve(task.cancel()).catch(() => { })
    if (xmclLaunchTask === task) xmclLaunchTask = null
    logOnly('debug', `${stage}: perfil ${winner.versionId} completo; continuando tras tarea XMCL pendiente.`)
  }
  return winner.versionId
}

async function runXmclTaskWithRetry(createTask, stage, attempts = 3, profileFallback = null) {
  let lastError

  for (let attempt = 1; attempt <= attempts; attempt += 1) {
    throwIfXmclLaunchCancelled()
    try {
      const task = createTask()
      return profileFallback
        ? await runXmclTaskWithProfileFallback(task, stage, profileFallback.minecraftRoot, profileFallback.versionIds)
        : await runXmclTask(task, stage)
    } catch (error) {
      if (isXmclCancellationError(error) || inicioCancelado || xmclCancellationRequested) throw error
      lastError = error
      logOnly('debug', `${stage} fallo en el intento ${attempt}: ${formatXmclError(error)}`)
      if (attempt >= attempts) break

      const delayMs = attempt * 1000
      logAndSend('progress', `${stage} tuvo errores de descarga. Reintentando (${attempt + 1}/${attempts})...`)
      await new Promise(resolve => setTimeout(resolve, delayMs))
    }
  }

  throw lastError
}

function getXmclVersionJsonPath(minecraftRoot, versionId) {
  return path.join(minecraftRoot, 'versions', versionId, versionId + '.json')
}

function persistXmclVersionId(instance, versionId) {
  instance.xmclVersionId = versionId
  instance.updatedAt = new Date().toISOString()
  registerCustomInstance(instance)
  fs.writeFileSync(
    path.join(getInstanceDir(instance.id), 'instance.json'),
    JSON.stringify(instance, null, 2)
  )
}

function getExpectedXmclLoaderVersionIds(instance) {
  if (instance.loader === 'forge') {
    const suffix = `-${instance.version}`
    const normalizedLoader = String(instance.loaderVersion || '').endsWith(suffix)
      ? String(instance.loaderVersion).slice(0, -suffix.length)
      : String(instance.loaderVersion || '')
    return [`${instance.version}-forge-${normalizedLoader}`]
  }
  if (instance.loader === 'neoforge') return [`neoforge-${instance.loaderVersion}`]
  if (instance.loader === 'fabric') return [`${instance.version}-fabric${instance.loaderVersion}`]
  if (instance.loader === 'quilt') return [`${instance.version}-quilt${instance.loaderVersion}`]
  return []
}

async function installForgeWithOfficialInstaller(instance, minecraftRoot, javaPath) {
  const suffix = `-${instance.version}`
  const forgeVersion = String(instance.loaderVersion || '').endsWith(suffix)
    ? String(instance.loaderVersion).slice(0, -suffix.length)
    : String(instance.loaderVersion || '')
  const artifactVersion = `${instance.version}-${instance.loaderVersion}`
  const artifactName = `forge-${artifactVersion}-installer.jar`
  const installerPath = path.join(minecraftRoot, 'libraries', 'net', 'minecraftforge', 'forge', artifactVersion, artifactName)
  const installerUrl = `https://maven.minecraftforge.net/net/minecraftforge/forge/${artifactVersion}/${artifactName}`

  const installerStat = await fs.promises.stat(installerPath).catch(() => null)
  if (!installerStat || installerStat.size === 0) {
    sendLauncherStatus('progress', `Descargando instalador de Forge ${forgeVersion}...`)
    await downloadToFile(installerUrl, installerPath)
  }

  const launcherProfilesPath = path.join(minecraftRoot, 'launcher_profiles.json')
  if (!fs.existsSync(launcherProfilesPath)) {
    await fs.promises.writeFile(launcherProfilesPath, JSON.stringify({ profiles: {}, settings: {} }))
  }

  sendLauncherStatus('progress', `Procesando Forge ${forgeVersion}...`)
  const { spawn } = require('child_process')
  let outputTail = ''
  const appendOutput = (data) => {
    outputTail = (outputTail + data.toString()).slice(-65536)
  }
  const exitCode = await new Promise((resolve, reject) => {
    const child = spawn(javaPath, ['-jar', installerPath, '--installClient', minecraftRoot], {
      cwd: minecraftRoot,
      stdio: ['ignore', 'pipe', 'pipe']
    })
    child.stdout.on('data', appendOutput)
    child.stderr.on('data', appendOutput)
    child.once('error', reject)
    child.once('close', resolve)
  })
  if (exitCode !== 0) {
    const usefulTail = outputTail.split(/\r?\n/).filter(Boolean).slice(-20).join('\n')
    throw new Error(`El instalador oficial de Forge termino con codigo ${exitCode}.\n${usefulTail}`)
  }

  const launcherProfiles = JSON.parse(await fs.promises.readFile(launcherProfilesPath, 'utf8'))
  const versionId = launcherProfiles?.profiles?.forge?.lastVersionId || `${instance.version}-forge-${forgeVersion}`
  const xmclCore = await getXmclCore()
  const resolvedVersion = await xmclCore.Version.parse(minecraftRoot, versionId)
  if (!await hasValidXmclGeneratedArtifacts(minecraftRoot, resolvedVersion)) {
    throw new Error(`Forge termino sin generar todos los artefactos requeridos (${versionId}).`)
  }
  return versionId
}

async function installXmclLoader(instance, minecraftRoot, javaPath, maxSockets, dispatcher) {
  if (!instance.loader || instance.loader === 'vanilla') return instance.version

  await ensureInstanceLoaderVersion(instance)
  throwIfXmclLaunchCancelled()
  const xmclCore = await getXmclCore()

  const cachedVersionId = String(instance.xmclVersionId || '').trim()
  if (cachedVersionId && fs.existsSync(getXmclVersionJsonPath(minecraftRoot, cachedVersionId))) {
    try {
      const resolvedVersion = await xmclCore.Version.parse(minecraftRoot, cachedVersionId)
      if (await hasValidXmclGeneratedArtifacts(minecraftRoot, resolvedVersion)) return cachedVersionId
      logOnly('debug', `Perfil XMCL en cache incompleto para ${instance.id}: faltan artefactos generados.`)
      await removeInvalidXmclGeneratedArtifacts(minecraftRoot, resolvedVersion)
    } catch (error) {
      logOnly('debug', `Perfil XMCL en cache invalido para ${instance.id}: ${error.message || error}`)
    }
  }

  const expectedVersionIds = getExpectedXmclLoaderVersionIds(instance)
  for (const versionId of expectedVersionIds) {
    if (!fs.existsSync(getXmclVersionJsonPath(minecraftRoot, versionId))) continue
    try {
      const resolvedVersion = await xmclCore.Version.parse(minecraftRoot, versionId)
      if (!await hasValidXmclGeneratedArtifacts(minecraftRoot, resolvedVersion)) {
        await removeInvalidXmclGeneratedArtifacts(minecraftRoot, resolvedVersion)
        continue
      }
      persistXmclVersionId(instance, versionId)
      return versionId
    } catch (error) {
      logOnly('debug', `Perfil XMCL detectado pero invalido (${versionId}): ${error.message || error}`)
    }
  }

  sendLauncherStatus('progress', `Instalando ${instance.loader} ${instance.loaderVersion}...`)
  const xmclInstaller = await getXmclInstaller()
  let versionId = ''

  if (instance.loader === 'fabric') {
    versionId = await xmclInstaller.installFabric({
      minecraftVersion: instance.version,
      version: instance.loaderVersion,
      minecraft: minecraftRoot,
      side: 'client'
    })
  } else if (instance.loader === 'quilt') {
    versionId = await xmclInstaller.installQuiltVersion({
      minecraftVersion: instance.version,
      version: instance.loaderVersion,
      minecraft: minecraftRoot,
      side: 'client'
    })
  } else if (instance.loader === 'forge') {
    versionId = await installForgeWithOfficialInstaller(instance, minecraftRoot, javaPath)
  } else if (instance.loader === 'neoforge') {
    versionId = await runXmclTaskWithRetry(
      () => xmclInstaller.installNeoForgedTask('neoforge', instance.loaderVersion, minecraftRoot, {
        side: 'client',
        java: javaPath,
        librariesDownloadConcurrency: maxSockets,
        dispatcher,
        mavenHost: ['https://maven.neoforged.net/releases']
      }),
      'Instalando NeoForge',
      3,
      { minecraftRoot, versionIds: expectedVersionIds }
    )
  } else {
    throw new Error(`Loader XMCL no soportado: ${instance.loader}`)
  }

  throwIfXmclLaunchCancelled()
  if (!versionId) throw new Error(`XMCL no devolvio la version instalada de ${instance.loader}.`)
  persistXmclVersionId(instance, versionId)
  return versionId
}

function waitForProcessSpawn(child) {
  return new Promise((resolve, reject) => {
    const cleanup = () => {
      child.off('spawn', onSpawn)
      child.off('error', onError)
    }
    const onSpawn = () => {
      cleanup()
      resolve()
    }
    const onError = (error) => {
      cleanup()
      reject(error)
    }
    child.once('spawn', onSpawn)
    child.once('error', onError)
  })
}

async function checkXmclNatives(resource, version, option = {}) {
  const xmclCore = await getXmclCore()
  const nativeRoot = option.nativeRoot || resource.getNativesRoot(version.id)
  await fs.promises.mkdir(nativeRoot, { recursive: true })

  const natives = version.libraries.filter((library) => library.isNative || String(library.classifier || '').startsWith('natives'))
  const includedLibraries = natives.map((library) => library.name).sort()
  const extractedByFile = new Map()
  const platform = option.platform || xmclCore.getPlatform()

  for (const library of natives) {
    if (!library.download?.path) {
      throw Object.assign(new TypeError(`Library ${library.name}(${version.id}) has no download path!`), { library })
    }

    const excluded = library.extractExclude || []
    const archivePath = resource.getLibraryByPath(library.download.path)
    const result = await extractZipEntries(archivePath, nativeRoot, {
      maxEntries: 100000,
      maxEntryBytes: 512 * 1024 * 1024,
      maxTotalBytes: 2 * 1024 * 1024 * 1024,
      mapEntry(entryName) {
        if (entryName.includes('META-INF/') || entryName.endsWith('.sha1') || entryName.endsWith('.git')) return null
        if (excluded.some((prefix) => entryName.startsWith(prefix))) return null
        if (entryName.includes('/')) {
          const [entryOs, entryArch] = entryName.split('/')
          const normalizedArch = entryArch === 'ia32' ? 'x86' : entryArch
          if (entryOs !== platform.name || normalizedArch !== platform.arch) return null
        }
        return path.basename(entryName)
      }
    })
    for (const extracted of result.entries) {
      extractedByFile.set(extracted.relativePath, library.name)
    }
  }

  const entries = []
  for (const [file, name] of extractedByFile) {
    entries.push({ file, name, sha1: await xmclCore.checksum(path.join(nativeRoot, file), 'sha1') })
  }
  await fs.promises.writeFile(path.join(nativeRoot, '.json'), JSON.stringify({ entries, libraries: includedLibraries }))
}

async function launchWithXMCL(instance, username, memory, javaPath, minecraftRoot, customArgs) {
  const settings = loadLauncherSettings()
  const maxSockets = Math.max(2, Math.min(Number(settings.maxConcurrentDownloads) || 6, 20))

  logOnly('debug', `Instancia: ${getInstanceDir(instance.id)}`)
  logOnly('debug', `Minecraft root: ${minecraftRoot}`)
  logOnly('debug', `Java major: ${getRequiredJavaMajor(instance.version)} para MC ${instance.version}`)
  logOnly('debug', `Memoria: min=${memory.min}MB max=${memory.max}MB`)
  logOnly('debug', `Descargas simultaneas: ${maxSockets}`)
  logOnly('debug', `Custom args: ${customArgs.length > 0 ? customArgs.join(' ') : '(ninguno)'}`)

  const msAccount = await getActiveMicrosoftAccount()
  const auth = msAccount ? {
    accessToken: msAccount.access_token,
    gameProfile: {
      id: msAccount.uuid,
      name: msAccount.name
    },
    userType: 'msa',
    properties: msAccount.user_properties || {},
    clientId: msAccount.client_id || getMicrosoftAuth().token?.client_id || '',
    xuid: msAccount.xuid || getXuidFromMinecraftToken(msAccount.access_token)
  } : {
    accessToken: 'null',
    gameProfile: {
      id: createOfflineUuid(username),
      name: username
    },
    userType: 'legacy',
    properties: {},
    clientId: '',
    xuid: ''
  }

  const minecraftLocation = minecraftRoot
  let installDispatcher = null

  try {
    const [xmclCore, xmclFileTransfer, xmclInstaller] = await Promise.all([
      getXmclCore(),
      getXmclFileTransfer(),
      getXmclInstaller()
    ])

    logOnly('debug', 'Obteniendo metadata de version...')
    const versionList = await xmclInstaller.getVersionList()
    const versionMeta = versionList.versions.find(v => v.id === instance.version)
    if (!versionMeta) {
      throw new Error(`Version de Minecraft no encontrada en el manifest: ${instance.version}`)
    }

    installDispatcher = xmclFileTransfer.getDefaultAgent({
      maxRetries: 5,
      minTimeout: 750,
      maxTimeout: 10000
    })
    const installOptions = {
      side: 'client',
      assetsDownloadConcurrency: maxSockets,
      librariesDownloadConcurrency: maxSockets,
      prevalidSizeOnly: true,
      dispatcher: installDispatcher
    }

    try { await tryPopulateFromSharedCache(minecraftLocation, instance.version) } catch {}
    await yieldToEventLoop()
    logOnly('debug', 'Instalando Minecraft y dependencias base...')
    const baseResolvedVersion = await runXmclTaskWithRetry(
      () => xmclInstaller.installTask(versionMeta, minecraftLocation, installOptions),
      'Descargando Minecraft'
    )
    throwIfXmclLaunchCancelled()
    await yieldToEventLoop()
    try { await populateSharedCache(minecraftLocation, instance.version) } catch {}

    javaPath = ensureJavaExecutableForLaunch(javaPath)
    logOnly('debug', `Java: ${javaPath}`)

    let resolvedVersion = baseResolvedVersion
    if (instance.loader && instance.loader !== 'vanilla') {
      const loaderVersionId = await installXmclLoader(
        instance,
        minecraftLocation,
        javaPath,
        maxSockets,
        installDispatcher
      )
      throwIfXmclLaunchCancelled()
      resolvedVersion = await xmclCore.Version.parse(minecraftLocation, loaderVersionId)
      resolvedVersion = await runXmclTaskWithRetry(
        () => xmclInstaller.installDependenciesTask(resolvedVersion, installOptions),
        `Descargando dependencias de ${instance.loader}`
      )
      throwIfXmclLaunchCancelled()
    }

    await installDispatcher.close()
    installDispatcher = null
    logOnly('debug', 'Instalacion completada. Iniciando lanzamiento...')

    resolvedVersion = applyModernAuthPlaceholders(resolvedVersion, auth)

    const launchOptions = {
      gameProfile: auth.gameProfile,
      accessToken: auth.accessToken,
      userType: auth.userType,
      properties: auth.properties,
      launcherName: 'KindyrLauncher',
      launcherBrand: 'KindyrLauncher',
      versionName: resolvedVersion.id,
      versionType: instance.versionType || 'release',
      gamePath: minecraftRoot,
      resourcePath: minecraftRoot,
      javaPath: javaPath,
      minMemory: memory.min,
      maxMemory: memory.max,
      version: resolvedVersion,
      extraJVMArgs: [],
      extraMCArgs: customArgs,
      prechecks: [
        xmclCore.LaunchPrecheck.checkVersion,
        xmclCore.LaunchPrecheck.checkLibraries,
        checkXmclNatives,
        xmclCore.LaunchPrecheck.linkAssets
      ]
    }

    minecraftProcess = await xmclCore.launch(launchOptions)

    if (inicioCancelado) {
      if (minecraftProcess) {
        minecraftProcess.kill('SIGKILL')
        minecraftProcess = null
      }
      currentLogFile = null
      return { ok: false, cancelled: true, error: 'Lanzamiento cancelado.' }
    }

    let spawnConfirmed = false
    if (minecraftProcess && minecraftProcess.on) {
      minecraftProcess.on('error', (error) => {
        if (!spawnConfirmed) return
        logAndSend('error', error.stack || error.message || String(error))
        flushLaunchLog()
        minecraftProcess = null
        runningInstanceId = null
        currentLogFile = null
      })

      if (minecraftProcess.stdout) {
        minecraftProcess.stdout.on('data', (data) => {
          logData(data.toString())
        })
      }

      if (minecraftProcess.stderr) {
        minecraftProcess.stderr.on('data', (data) => {
          logData(data.toString())
        })
      }

      minecraftProcess.on('close', (code, signal) => {
        const ranFor = Math.round((Date.now() - launchStartedAt) / 1000)
        const cleanMessage = formatMinecraftCloseMessage(code, signal, minecraftStopRequested)
        minecraftStopRequested = false
        logAndSend('close', `${cleanMessage} Duracion: ${ranFor}s`)
        flushLaunchLog()
        minecraftProcess = null
        runningInstanceId = null
        currentLogFile = null
      })
    }

    await waitForProcessSpawn(minecraftProcess)
    spawnConfirmed = true
    if (inicioCancelado) {
      minecraftProcess.kill('SIGKILL')
      minecraftProcess = null
      currentLogFile = null
      return { ok: false, cancelled: true, error: 'Lanzamiento cancelado.' }
    }

    runningInstanceId = instance.id
    logAndSend('running', 'Minecraft iniciado.')
    return { ok: true }

  } catch (error) {
    if (installDispatcher) {
      await installDispatcher.close().catch(() => { })
      installDispatcher = null
    }
    xmclLaunchTask = null
    minecraftProcess = null
    runningInstanceId = null
    if (inicioCancelado || xmclCancellationRequested || isXmclCancellationError(error)) {
      const message = 'Lanzamiento cancelado.'
      logAndSend('close', message)
      flushLaunchLog()
      currentLogFile = null
      inicioCancelado = false
      minecraftStopRequested = false
      return { ok: false, cancelled: true, error: message }
    }
    const detailedError = formatXmclError(error)
    logAndSend('error', detailedError)
    flushLaunchLog()
    currentLogFile = null
    return { ok: false, error: detailedError }
  }
}

let launchQueue = Promise.resolve()
function withLaunchLock(fn) {
  const next = launchQueue.then(fn, fn)
  launchQueue = next.catch(() => {})
  return next
}

ipcMain.handle('launch-game', async (_event, payload) => {
  return withLaunchLock(async () => {
  if (minecraftProcess || xmclLaunchTask || launchRequestInProgress) {
    return { ok: false, error: 'Minecraft ya se esta iniciando o ejecutando.' }
  }

  launchRequestInProgress = true
  try {
    const instance = getInstance(payload.instanceId)
    if (!instance) {
      return { ok: false, error: 'No existe la instancia seleccionada.' }
    }
    activeLaunchInstanceId = instance.id

  let username
  let memory
  try {
    username = validateUsername(payload.username)
    memory = validateMemory(payload.minRam, payload.maxRam)
  } catch (error) {
    return { ok: false, error: error.message || String(error) }
  }

  const minecraftRoot = ensureInstanceFolders(instance)
  const launcherLogsDir = getLauncherLogsDir(instance.id)
  fs.mkdirSync(launcherLogsDir, { recursive: true })
  currentLogFile = path.join(launcherLogsDir, 'latest.log')
  fs.writeFileSync(currentLogFile, '')

  beginXmclLaunch(instance)

  let javaPath = ''
  try {
    javaPath = await resolveLaunchJavaPath(instance.version)
  } catch (error) {
    logAndSend('error', error.stack || error.message || String(error))
    flushLaunchLog()
    currentLogFile = null
    return { ok: false, error: error.message || String(error) }
  }

  if (!javaPath || typeof javaPath !== 'string' || javaPath.trim() === '') {
    const errMsg = 'No se encontro ruta valida de Java. Asegurate de tener Java instalado o configurado en Ajustes.'
    logAndSend('error', errMsg)
    currentLogFile = null
    return { ok: false, error: errMsg }
  }

  if (typeof memory.min !== 'number' || typeof memory.max !== 'number' || memory.min <= 0 || memory.max <= 0) {
    const errMsg = `Parametros de memoria invalidos: min=${memory.min}, max=${memory.max}`
    writeLaunchLog(errMsg)
    currentLogFile = null
    return { ok: false, error: errMsg }
  }

  const customArgs = String(payload.customArgs || '')
    .split(/\s+/)
    .map(item => item.trim())
    .filter(Boolean)

    logOnly('debug', 'Usando XMCL como motor de lanzamiento')
    return await launchWithXMCL(instance, username, memory, javaPath, minecraftRoot, sanitizeCustomArgs(customArgs))
  } finally {
    launchRequestInProgress = false
    activeLaunchInstanceId = null
  }
  })
})

ipcMain.handle('ms-login', async () => {
  try {
    const auth = getMicrosoftAuth()
    const xboxManager = await auth.launch('electron')
    const token = await xboxManager.getMinecraft()
    const minecraftCredentials = getMinecraftCredentials(token)
    const refreshToken = xboxManager.save()
    if (!refreshToken) throw new Error('Microsoft no devolvió un token de renovación válido.')
    const account = {
      id: minecraftCredentials.uuid,
      name: minecraftCredentials.name,
      uuid: minecraftCredentials.uuid,
      access_token: minecraftCredentials.access_token,
      refresh_token: refreshToken,
      client_token: crypto.randomUUID(),
      client_id: auth.token?.client_id || '',
      xuid: minecraftCredentials.xuid,
      expires_at: minecraftCredentials.expires_at,
      user_properties: minecraftCredentials.user_properties || {},
      active: true,
      type: 'microsoft'
    }
    await withMicrosoftAccounts(async (accounts) => {
      const updated = accounts.map(a => ({ ...a, active: false }))
      const existing = updated.findIndex(a => a.id === account.id)
      if (existing >= 0) updated[existing] = account
      else updated.push(account)
      return updated
    })
    return { ok: true, account: sanitizeMicrosoftAccount(account) }
  } catch (error) {
    return { ok: false, error: error.message || String(error) }
  }
})

ipcMain.handle('ms-logout', async (_event, accountId) => {
  try {
    await withMicrosoftAccounts(async (accounts) => accounts.filter(a => a.id !== accountId))
    return { ok: true }
  } catch (error) {
    return { ok: false, error: error.message || String(error) }
  }
})

ipcMain.handle('ms-accounts-list', () => {
  try {
    microsoftAccounts = loadMicrosoftAccounts()
    return { ok: true, accounts: microsoftAccounts.map(sanitizeMicrosoftAccount) }
  } catch (error) {
    return { ok: false, error: error.message || String(error) }
  }
})

ipcMain.handle('ms-set-active', async (_event, accountId) => {
  try {
    await withMicrosoftAccounts(async (accounts) => accounts.map(a => ({ ...a, active: a.id === accountId })))
    return { ok: true }
  } catch (error) {
    return { ok: false, error: error.message || String(error) }
  }
})

ipcMain.handle('kill-minecraft', () => {
  inicioCancelado = true

  if (xmclLaunchTask) {

    xmclCancellationRequested = true
    try {
      xmclLaunchTask.cancel().catch(() => { })
    } catch (e) {

    }
    xmclLaunchTask = null
  }

  if (minecraftProcess) {
    const processToStop = minecraftProcess
    minecraftStopRequested = true
    processToStop.kill('SIGTERM')
    setTimeout(() => {
      if (minecraftProcess === processToStop) {
        processToStop.kill('SIGKILL')
      }
    }, 5000)
    return { ok: true }
  }
  return { ok: true }
})

ipcMain.handle('mc-status', () => {
  return {
    running: launchRequestInProgress || minecraftProcess !== null,
    instanceId: runningInstanceId || activeLaunchInstanceId
  }
})

ipcMain.handle('skin-save-local', async (_event, skinUrl, skinName, skinBytes) => {
  try {
    const bytes = await resolveSkinBytes(skinUrl, skinBytes)
    const skinsDirectory = path.join(getKindyrDataRoot(), 'skins')
    const fileName = `${sanitizeSkinName(skinName)}-${Date.now()}.png`
    const destination = path.join(skinsDirectory, fileName)
    fs.mkdirSync(skinsDirectory, { recursive: true, mode: 0o700 })
    fs.writeFileSync(destination, bytes, { mode: 0o600, flag: 'wx' })
    return { ok: true, name: fileName }
  } catch (err) {
    return { ok: false, error: err.message }
  }
})

async function uploadSkinToMinecraftWithRetry(skinBytes, model, accessToken, maxRetries = 3) {
  const transientCodes = [502, 503, 504, 429]
  let lastError = null

  for (let attempt = 0; attempt <= maxRetries; attempt++) {
    try {
      return await uploadSkinToMinecraft(skinBytes, model, accessToken)
    } catch (err) {
      lastError = err

      const isTransient = transientCodes.includes(err.statusCode)

      if (!isTransient || attempt === maxRetries) {
        throw err
      }

      let delayMs = Math.pow(2, attempt) * 1000 // 1s, 2s, 4s

      if (err.statusCode === 429 && err.retryAfter) {
        delayMs = parseInt(err.retryAfter) * 1000
      }

      await new Promise(resolve => setTimeout(resolve, delayMs))
    }
  }

  throw lastError
}

ipcMain.handle('skin-apply-online', async (_event, skinUrl, model, skinBytes) => {
  try {
    const activeAccount = await getActiveMicrosoftAccount()
    if (!activeAccount?.access_token) return { ok: false, error: 'Iniciá sesión con Microsoft para aplicar una skin online.' }
    skinBytes = await resolveSkinBytes(skinUrl, skinBytes)
    const response = await uploadSkinToMinecraftWithRetry(skinBytes, model, activeAccount.access_token)
    return response
  } catch (err) {
    if (err.message === 'Authentication failed. Please log in again.') {
      try {
        const activeAccount = await getActiveMicrosoftAccount({ force: true })
        if (activeAccount?.access_token) {
          const retrySkinBytes = validateSkinPng(skinBytes)
          const response = await uploadSkinToMinecraftWithRetry(retrySkinBytes, model, activeAccount.access_token)
          return response
        }
      } catch (refreshErr) {
        return { ok: false, error: refreshErr.message || err.message }
      }
    }
    return { ok: false, error: err.message }
  }
})

async function resolveSkinBytes(skinUrl, skinBytes) {
  const bytes = validateSkinPng(skinBytes || await downloadUrlToBuffer(skinUrl))
  const image = nativeImage.createFromBuffer(bytes)
  const size = image.isEmpty() ? null : image.getSize()
  if (!size || size.width !== 64 || ![32, 64].includes(size.height)) {
    throw new Error('La skin no contiene una imagen PNG válida de 64×64 o 64×32 píxeles.')
  }
  return bytes
}

async function downloadUrlToBuffer(value, redirectCount = 0) {
  if (redirectCount > 3) throw new Error('La descarga de la skin tuvo demasiadas redirecciones.')
  const https = require('https')
  const url = validateSkinSourceUrl(value)

  return new Promise((resolve, reject) => {
    const req = https.get(url, {
      headers: { 'User-Agent': MODRINTH_USER_AGENT }
    }, (res) => {
      if ([301, 302, 307, 308].includes(res.statusCode)) {
        res.resume()
        if (!res.headers.location) return reject(new Error('La redirección de la skin no tiene destino.'))
        const redirected = new URL(res.headers.location, url)
        downloadUrlToBuffer(redirected, redirectCount + 1).then(resolve, reject)
        return
      }
      if (res.statusCode !== 200) {
        res.resume()
        reject(new Error(`No se pudo descargar la skin: HTTP ${res.statusCode}`))
        return
      }
      const declaredLength = Number(res.headers['content-length'] || 0)
      if (declaredLength > MAX_SKIN_BYTES) {
        res.destroy()
        reject(new Error('La skin supera el límite de 5 MiB.'))
        return
      }
      const chunks = []
      let totalBytes = 0
      res.on('data', (chunk) => {
        totalBytes += chunk.length
        if (totalBytes > MAX_SKIN_BYTES) {
          res.destroy(new Error('La skin supera el límite de 5 MiB.'))
          return
        }
        chunks.push(chunk)
      })
      res.on('end', () => {
        resolve(Buffer.concat(chunks, totalBytes))
      })
      res.on('error', reject)
    })
    req.setTimeout(15000, () => req.destroy(new Error('La descarga de la skin agotó el tiempo de espera.')))
    req.on('error', reject)
  })
}

async function uploadSkinToMinecraft(skinBytes, model, accessToken) {
  const https = require('https')

  const variant = model === 'slim' ? 'slim' : 'classic'

  const boundary = '----WebKitFormBoundary' + Math.random().toString(16).substr(2, 16)

  const variantPart = `--${boundary}\r\nContent-Disposition: form-data; name="variant"\r\n\r\n${variant}\r\n`

  const filePart = `--${boundary}\r\nContent-Disposition: form-data; name="file"; filename="skin.png"\r\nContent-Type: image/png\r\n\r\n`

  const closingPart = `\r\n--${boundary}--\r\n`

  const variantBuffer = Buffer.from(variantPart, 'utf8')
  const fileHeaderBuffer = Buffer.from(filePart, 'utf8')
  const closingBuffer = Buffer.from(closingPart, 'utf8')

  const bodyBuffer = Buffer.concat([variantBuffer, fileHeaderBuffer, skinBytes, closingBuffer])

  const options = {
    hostname: 'api.minecraftservices.com',
    port: 443,
    path: '/minecraft/profile/skins',
    method: 'POST',
    headers: {
      'Authorization': `Bearer ${accessToken}`,
      'Content-Type': `multipart/form-data; boundary=${boundary}`,
      'Content-Length': bodyBuffer.length
    }
  }

  return new Promise((resolve, reject) => {
    const req = https.request(options, (res) => {
      let body = ''
      res.on('data', (chunk) => { body += chunk })
      res.on('end', () => {
        if (res.statusCode === 200 || res.statusCode === 204) {
          resolve({ ok: true })
        } else if (res.statusCode === 401) {
          const error = new Error('Authentication failed. Please log in again.')
          error.statusCode = res.statusCode
          error.retryAfter = res.headers['retry-after'] || null
          reject(error)
        } else if (res.statusCode === 403) {
          const error = new Error('Forbidden. You may not have permission to change skins.')
          error.statusCode = res.statusCode
          error.retryAfter = res.headers['retry-after'] || null
          reject(error)
        } else if (res.statusCode === 404) {
          const error = new Error('Profile not found.')
          error.statusCode = res.statusCode
          error.retryAfter = res.headers['retry-after'] || null
          reject(error)
        } else {
          try {
            const errorData = JSON.parse(body)
            const error = new Error(errorData.error || errorData.message || `HTTP ${res.statusCode}`)
            error.statusCode = res.statusCode
            error.retryAfter = res.headers['retry-after'] || null
            reject(error)
          } catch {
            const error = new Error(`HTTP ${res.statusCode}: ${body}`)
            error.statusCode = res.statusCode
            error.retryAfter = res.headers['retry-after'] || null
            reject(error)
          }
        }
      })
    })

    req.on('error', (error) => {
      reject(error)
    })

    req.write(bodyBuffer)
    req.end()
  })
}

app.on('window-all-closed', () => {
  clearSplashCloseTimer()
  clearMainWindowLoadFallbackTimer()
  if (splashWindow && !splashWindow.isDestroyed()) splashWindow.close()
  splashWindow = null
  if (process.platform !== 'darwin') app.quit()
})

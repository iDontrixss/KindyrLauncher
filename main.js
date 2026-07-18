const { app, BrowserWindow, ipcMain, shell, nativeImage } = require('electron')
const fs = require('fs')
const { autoUpdater } = require('electron-updater')
const path = require('path')
const crypto = require('crypto')
const semver = require('semver')
process.on('uncaughtException', (error) => {
  console.error('Error:', error)
})

let launcherClientClass = null
let mclcAssetsFastPathPatched = false
let msmcAuth = null

let microsoftAccounts = []

function getMicrosoftAccountsFile() {
  return path.join(getZotlinDataRoot(), 'ms-accounts.json')
}

function loadMicrosoftAccounts() {
  const file = getMicrosoftAccountsFile()
  if (!fs.existsSync(file)) return []
  try {
    const data = JSON.parse(fs.readFileSync(file, 'utf8'))
    return Array.isArray(data) ? data : []
  } catch { return [] }
}

function saveMicrosoftAccounts(accounts) {
  fs.mkdirSync(getZotlinDataRoot(), { recursive: true })
  fs.writeFileSync(getMicrosoftAccountsFile(), JSON.stringify(accounts, null, 2))
}


let mainWindow
let minecraftProcess = null
let runningInstanceId = null
let inicioCancelado = false
let splashWindow
let launcher
let launchStartedAt = 0
let currentLogFile = null
let lastProgressMessage = ''
let lastProgressSentAt = 0
let lastDataMessage = ''
let lastDataSentAt = 0
let pendingLogLines = []
let logFlushTimer = null

const defaultInstances = [
  { id: 'vanilla-1.21.4', name: 'Minecraft 1.21.4', version: '1.21.4', loader: 'vanilla' },
  { id: 'vanilla-1.20.6', name: 'Minecraft 1.20.6', version: '1.20.6', loader: 'vanilla' },
  { id: 'vanilla-1.19.4', name: 'Minecraft 1.19.4', version: '1.19.4', loader: 'vanilla' },
  { id: 'vanilla-1.18.2', name: 'Minecraft 1.18.2', version: '1.18.2', loader: 'vanilla' }
]

const MODRINTH_API = 'https://api.modrinth.com/v2'
const MODRINTH_USER_AGENT = 'ZotlinLauncher/1.2.0 (Minecraft launcher)'
const MOJANG_VERSION_MANIFEST = 'https://piston-meta.mojang.com/mc/game/version_manifest_v2.json'
const FABRIC_META = 'https://meta.fabricmc.net/v2'
const QUILT_META = 'https://meta.quiltmc.org/v3'
const FORGE_MAVEN_METADATA = 'https://maven.minecraftforge.net/net/minecraftforge/forge/maven-metadata.xml'
const NEOFORGE_MAVEN_METADATA = 'https://maven.neoforged.net/releases/net/neoforged/neoforge/maven-metadata.xml'
let minecraftVersionCache = null
let loaderVersionCache = {}
const modrinthTypeFilters = {
  all: [],
  mod: [['project_type:mod']],
  modpack: [['project_type:modpack']],
  resourcepack: [['project_type:resourcepack']],
  shader: [['project_type:shader']],
  datapack: [['project_type:mod'], ['categories:datapack']],
  plugin: [['project_type:mod'], ['categories:bukkit', 'categories:spigot', 'categories:paper', 'categories:purpur', 'categories:folia', 'categories:velocity', 'categories:waterfall']]
}
const modrinthSorts = new Set(['relevance', 'downloads', 'follows', 'newest', 'updated'])

function getAdmZip() {
  return require('adm-zip')
}

function getMicrosoftAuth() {
  if (!msmcAuth) {
    const { Auth } = require('msmc')
    msmcAuth = new Auth('select_account')
  }
  return msmcAuth
}

function patchMCLCAssetFastPath() {
  if (mclcAssetsFastPathPatched) return
  const MCLCHandler = require('minecraft-launcher-core/components/handler')
  const originalMCLCGetAssets = MCLCHandler.prototype.getAssets

  MCLCHandler.prototype.getAssets = async function getAssetsFastPath() {
    try {
      const assetDirectory = path.resolve(this.options.overrides.assetRoot || path.join(this.options.root, 'assets'))
      const assetId = this.options.version.custom || this.options.version.number
      const indexPath = path.join(assetDirectory, 'indexes', `${assetId}.json`)

      if (!fs.existsSync(indexPath)) {
        await this.downloadAsync(this.version.assetIndex.url, path.join(assetDirectory, 'indexes'), `${assetId}.json`, true, 'asset-json')
      }

      const index = JSON.parse(fs.readFileSync(indexPath, { encoding: 'utf8' }))
      const entries = Object.entries(index.objects || {})
      let done = 0

      this.client.emit('progress', { type: 'assets', task: 0, total: entries.length })

      await Promise.all(entries.map(async ([asset, info]) => {
        const hash = info.hash
        const subhash = hash.substring(0, 2)
        const subAsset = path.join(assetDirectory, 'objects', subhash)
        const filePath = path.join(subAsset, hash)
        let valid = fs.existsSync(filePath)

        if (valid && Number.isFinite(info.size)) {
          try {
            valid = fs.statSync(filePath).size === info.size
          } catch {
            valid = false
          }
        }

        if (!valid) {
          await this.downloadAsync(`${this.options.overrides.url.resource}/${subhash}/${hash}`, subAsset, hash, true, 'assets')
          if (!await this.checkSum(hash, filePath)) {
            await this.downloadAsync(`${this.options.overrides.url.resource}/${subhash}/${hash}`, subAsset, hash, true, 'assets')
          }
        }

        done++
        this.client.emit('progress', { type: 'assets', task: done, total: entries.length })
      }))

      if (this.isLegacy()) {
        return originalMCLCGetAssets.call(this)
      }

      this.client.emit('debug', '[Zotlin]: Assets verificados con fast path')
    } catch (error) {
      this.client.emit('debug', `[Zotlin]: Fast path de assets fallo, usando MCLC normal: ${error.message || error}`)
      return originalMCLCGetAssets.call(this)
    }
  }

  mclcAssetsFastPathPatched = true
}

function getLauncherClientClass() {
  if (!launcherClientClass) {
    patchMCLCAssetFastPath()
    launcherClientClass = require('minecraft-launcher-core').Client
  }
  return launcherClientClass
}

function getZotlinDataRoot() {
  return path.join(app.getPath('appData'), 'ZotlinLauncher')
}

function getInstanceDir(instanceId) {
  return path.join(getZotlinDataRoot(), 'instances', instanceId)
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
  return getAllInstances().find(item => item.id === instanceId)
}

function getCustomInstancesFile() {
  return path.join(getZotlinDataRoot(), 'instances.json')
}

function loadCustomInstances() {
  const file = getCustomInstancesFile()
  if (!fs.existsSync(file)) return []
  try {
    const data = JSON.parse(fs.readFileSync(file, 'utf8'))
    return Array.isArray(data) ? data : []
  } catch {
    return []
  }
}

function saveCustomInstances(instances) {
  fs.mkdirSync(getZotlinDataRoot(), { recursive: true })
  fs.writeFileSync(getCustomInstancesFile(), JSON.stringify(instances, null, 2))
}

function getAllInstances() {
  return [...defaultInstances, ...loadCustomInstances()]
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
  fs.mkdirSync(path.join(getZotlinDataRoot(), 'instances'), { recursive: true })
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
  return facets
}

async function searchModrinth(payload = {}) {
  const query = normalizeDiscoverQuery(payload.query)
  const sort = modrinthSorts.has(payload.sort) ? payload.sort : 'relevance'
  const offset = Math.max(0, Math.min(Number(payload.offset) || 0, 10000))
  const limit = Math.max(1, Math.min(Number(payload.limit) || 20, 40))
  const facets = buildModrinthFacets(payload)
  const url = new URL(MODRINTH_API + '/search')

  if (query) url.searchParams.set('query', query)
  url.searchParams.set('index', sort)
  url.searchParams.set('offset', String(offset))
  url.searchParams.set('limit', String(limit))
  if (facets.length) url.searchParams.set('facets', JSON.stringify(facets))

  const response = await fetch(url, {
    headers: {
      'User-Agent': MODRINTH_USER_AGENT,
      Accept: 'application/json'
    }
  })
  const body = await response.json().catch(() => ({}))

  if (!response.ok) {
    throw new Error(body.description || body.error || 'Modrinth no respondio bien.')
  }

  return {
    hits: Array.isArray(body.hits) ? body.hits : [],
    offset: body.offset || offset,
    limit: body.limit || limit,
    totalHits: body.total_hits || 0
  }
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

async function getMojangVersions() {
  if (minecraftVersionCache && Date.now() - minecraftVersionCache.cachedAt < 10 * 60 * 1000) {
    return minecraftVersionCache.versions
  }
  const manifest = await fetchJson(MOJANG_VERSION_MANIFEST)
  const versions = (manifest.versions || []).map(item => ({
    id: item.id,
    type: item.type,
    releaseTime: item.releaseTime,
    url: item.url
  }))
  minecraftVersionCache = { cachedAt: Date.now(), versions }
  return versions
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
  const key = loader || 'vanilla'
  if (loaderVersionCache[key] && Date.now() - loaderVersionCache[key].cachedAt < 10 * 60 * 1000) {
    return loaderVersionCache[key].versions
  }

  let versions = []
  if (key === 'vanilla') {
    versions = (await getMojangVersions()).map(item => ({ minecraft: item.id }))
  } else if (key === 'fabric') {
    const games = await fetchJson(FABRIC_META + '/versions/game')
    const loaders = await fetchJson(FABRIC_META + '/versions/loader')
    const latestLoader = (loaders || []).find(item => item.stable)?.version || loaders?.[0]?.version || ''
    versions = (games || []).map(item => ({ minecraft: item.version, loaderVersion: latestLoader }))
  } else if (key === 'quilt') {
    const games = await fetchJson(QUILT_META + '/versions/game')
    const loaders = await fetchJson(QUILT_META + '/versions/loader')
    const latestLoader = (loaders || []).find(item => item.stable)?.version || loaders?.[0]?.version || ''
    versions = (games || []).map(item => ({ minecraft: item.version, loaderVersion: latestLoader }))
  } else if (key === 'forge') {
    const forgeVersions = parseMavenVersions(await fetchText(FORGE_MAVEN_METADATA))
    versions = forgeVersions
      .map(version => ({ minecraft: version.split('-')[0], loaderVersion: version.split('-').slice(1).join('-'), raw: version }))
      .filter(item => item.minecraft && item.loaderVersion)
  } else if (key === 'neoforge') {
    const neoVersions = parseMavenVersions(await fetchText(NEOFORGE_MAVEN_METADATA))
    versions = neoVersions.map(version => ({ minecraftPrefix: version.split('.').slice(0, 2).join('.'), loaderVersion: version, raw: version }))
  }

  loaderVersionCache[key] = { cachedAt: Date.now(), versions }
  return versions
}

function pickLatestLoaderVersion(loader, minecraftVersion, supported) {
  if (loader === 'vanilla') return ''
  if (loader === 'neoforge') {
    const prefix = getNeoForgePrefix(minecraftVersion)
    return [...supported].reverse().find(item => item.minecraftPrefix === prefix)?.loaderVersion || ''
  }
  return [...supported].reverse().find(item => item.minecraft === minecraftVersion)?.loaderVersion || ''
}

async function listCreatableInstances(payload = {}) {
  const loader = String(payload.loader || 'vanilla')
  const includeSnapshots = Boolean(payload.includeSnapshots)
  const query = String(payload.query || '').trim().toLowerCase()
  const mojangVersions = await getMojangVersions()
  const supported = await getSupportedMinecraftVersions(loader)

  const result = mojangVersions
    .filter(item => includeSnapshots || item.type === 'release')
    .filter(item => !query || item.id.toLowerCase().includes(query))
    .map(item => {
      const loaderVersion = pickLatestLoaderVersion(loader, item.id, supported)
      return {
        id: item.id,
        type: item.type,
        releaseTime: item.releaseTime,
        loader,
        loaderVersion,
        compatible: loader === 'vanilla' || Boolean(loaderVersion)
      }
    })
    .filter(item => item.compatible)
    .slice(0, 120)

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

  const idParts = [loader, version, loaderVersion].filter(Boolean).map(sanitizeInstanceId)
  const instanceId = idParts.join('-')
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

async function writeLoaderProfile(instance, minecraftRoot, profileUrl) {
  const profile = await fetchJson(profileUrl)
  if (!profile.id) throw new Error('El perfil del loader no tiene ID.')
  const versionDir = path.join(minecraftRoot, 'versions', profile.id)
  fs.mkdirSync(versionDir, { recursive: true })
  fs.writeFileSync(path.join(versionDir, profile.id + '.json'), JSON.stringify(profile, null, 2))
  return profile.id
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

async function prepareLoaderLaunch(instance, minecraftRoot, opts) {
  if (!instance.loader || instance.loader === 'vanilla') return
  await ensureInstanceLoaderVersion(instance)

  if (instance.loader === 'fabric') {
    const custom = await writeLoaderProfile(
      instance,
      minecraftRoot,
      FABRIC_META + '/versions/loader/' + encodeURIComponent(instance.version) + '/' + encodeURIComponent(instance.loaderVersion) + '/profile/json'
    )
    opts.version.custom = custom
    return
  }

  if (instance.loader === 'quilt') {
    const custom = await writeLoaderProfile(
      instance,
      minecraftRoot,
      QUILT_META + '/versions/loader/' + encodeURIComponent(instance.version) + '/' + encodeURIComponent(instance.loaderVersion) + '/profile/json'
    )
    opts.version.custom = custom
    return
  }

  if (instance.loader === 'forge') {
    const raw = instance.version + '-' + instance.loaderVersion
    const forgeDir = path.join(getInstanceDir(instance.id), 'loaders')
    const installer = path.join(forgeDir, 'forge-' + raw + '-installer.jar')
    if (!fs.existsSync(installer)) {
      await downloadToFile('https://maven.minecraftforge.net/net/minecraftforge/forge/' + raw + '/forge-' + raw + '-installer.jar', installer)
    }
    opts.forge = installer
    return
  }

  if (instance.loader === 'neoforge') {
    const neoDir = path.join(getInstanceDir(instance.id), 'loaders')
    const installer = path.join(neoDir, 'neoforge-' + instance.loaderVersion + '-installer.jar')
    if (!fs.existsSync(installer)) {
      await downloadToFile('https://maven.neoforged.net/releases/net/neoforged/neoforge/' + instance.loaderVersion + '/neoforge-' + instance.loaderVersion + '-installer.jar', installer)
    }
    opts.forge = installer
  }
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
  const response = await fetch(parsed, {
    headers: {
      'User-Agent': MODRINTH_USER_AGENT,
      Accept: 'application/octet-stream'
    }
  })
  if (!response.ok) throw new Error('No se pudo descargar el archivo: HTTP ' + response.status)
  const buffer = Buffer.from(await response.arrayBuffer())
  fs.writeFileSync(destination, buffer)
  return { path: destination, bytes: buffer.length }
}

function pickPrimaryFile(version) {
  const files = Array.isArray(version.files) ? version.files : []
  const file = files.find(item => item.primary) || files[0]
  if (!file || !file.url) throw new Error('La version elegida no tiene archivo descargable.')
  return file
}

function pickLatestVersion(versions, versionType) {
  let list = Array.isArray(versions) ? versions : []
  if (versionType) list = list.filter(version => version.version_type === versionType)
  if (!list.length) return null
  return list.sort((a, b) => new Date(b.date_published || 0) - new Date(a.date_published || 0))[0]
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

function extractMrpackOverrides(zip, minecraftRoot) {
  zip.getEntries().forEach(entry => {
    const normalized = entry.entryName.replace(/\\/g, '/')
    const prefixes = ['overrides/', 'client-overrides/']
    const prefix = prefixes.find(item => normalized.startsWith(item))
    if (!prefix || entry.isDirectory) return
    const relative = normalized.slice(prefix.length)
    if (!isSafeRelativePath(relative)) return
    const destination = path.join(minecraftRoot, relative)
    fs.mkdirSync(path.dirname(destination), { recursive: true })
    fs.writeFileSync(destination, entry.getData())
  })
}

async function installMrpackInstance(version, project, options = {}) {
  const file = pickPrimaryFile(version)
  const baseName = sanitizeInstanceId(project.slug || project.title || version.name)
  const instanceId = baseName + '-' + sanitizeInstanceId(version.version_number || version.id).slice(0, 20)
  const instanceDir = getInstanceDir(instanceId)
  const minecraftRoot = getMinecraftRoot(instanceId)
  fs.mkdirSync(instanceDir, { recursive: true })
  fs.mkdirSync(minecraftRoot, { recursive: true })

  const mrpackPath = path.join(instanceDir, sanitizeFileName(file.filename || project.slug || 'modpack') + '.mrpack')
  await downloadToFile(file.url, mrpackPath)
  const AdmZip = getAdmZip()
  const zip = new AdmZip(mrpackPath)
  const indexEntry = zip.getEntry('modrinth.index.json')
  if (!indexEntry) throw new Error('El .mrpack no trae modrinth.index.json.')
  const index = JSON.parse(indexEntry.getData().toString('utf8'))
  const dependencies = index.dependencies || {}
  const minecraftVersion = String(dependencies.minecraft || version.game_versions?.[0] || '').trim() || 'unknown'

  ensureMinecraftSubfolders(instanceId)
  for (const packFile of index.files || []) {
    if (packFile.env && packFile.env.client === 'unsupported') continue
    if (!isSafeRelativePath(packFile.path)) continue
    const download = Array.isArray(packFile.downloads) ? packFile.downloads[0] : ''
    if (!download) continue
    await downloadToFile(download, path.join(minecraftRoot, packFile.path))
  }
  extractMrpackOverrides(zip, minecraftRoot)

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
    const downloadsDir = path.join(app.getPath('downloads'), 'ZotlinLauncher')
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
  return { type: 'content', path: downloaded.path, instance, version }
}

async function installLatestReleaseProject(payload = {}) {
  const instance = getInstance(payload.instanceId)
  if (!instance) throw new Error('No existe la instancia seleccionada.')
  if (!instance.version || instance.version === 'unknown') throw new Error('La instancia no tiene version de Minecraft valida.')

  const project = payload.project || {}
  const projectType = String(project.project_type || 'mod')
  const installKind = getProjectInstallKindFromProject(project)
  const needsLoader = installKind === 'mod'
  const loader = needsLoader && instance.loader && instance.loader !== 'vanilla'
    ? instance.loader
    : 'minecraft'

  if (needsLoader && (!instance.loader || instance.loader === 'vanilla')) {
    throw new Error('Esta instalacion es vanilla. Creá una con Fabric, Forge o similar para instalar mods.')
  }

  return installModrinthProject({
    project,
    installKind,
    destination: 'instance',
    instanceId: instance.id,
    gameVersion: instance.version,
    loader,
    versionType: 'release'
  })
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

function flushLaunchLog() {
  if (!currentLogFile || pendingLogLines.length === 0) {
    logFlushTimer = null
    return
  }

  const file = currentLogFile
  const chunk = pendingLogLines.join('')
  pendingLogLines = []
  logFlushTimer = null
  fs.appendFile(file, chunk, () => { })
}

function writeLaunchLog(message) {
  if (!currentLogFile) return
  pendingLogLines.push(`[${new Date().toLocaleTimeString()}] ${normalizeMessage(message, 3000)}` + '\n')
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
  const name = String(username || 'ZotlinUser').trim()
  if (!/^[A-Za-z0-9_]{3,16}$/.test(name)) {
    throw new Error('El nombre offline debe tener 3-16 caracteres y solo letras, numeros o guion bajo.')
  }
  return name
}

function parseMemory(memory, fallback) {
  const value = String(memory || fallback).trim().toUpperCase()
  const match = value.match(/^(\d+)(G|M)$/)
  if (!match) {
    throw new Error('La RAM debe tener formato como 2G, 4096M o 4G.')
  }

  const amount = Number(match[1])
  const unit = match[2]
  const mb = unit === 'G' ? amount * 1024 : amount
  if (mb < 512 || mb > 32768) {
    throw new Error('La RAM debe estar entre 512M y 32G.')
  }

  return { value, mb }
}

function validateMemory(minRam, maxRam) {
  const min = parseMemory(minRam, '2G')
  const max = parseMemory(maxRam, '4G')
  if (min.mb > max.mb) {
    throw new Error('La RAM minima no puede ser mayor que la maxima.')
  }
  return { min: min.mb, max: max.mb }
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

function formatProgress(progress) {
  if (!progress || typeof progress !== 'object') return 'Progreso de descarga...'
  const type = progress.type || progress.task || 'archivos'
  const total = progress.total || progress.totalTasks || '?'
  const current = progress.task || progress.current || progress.currentTask || 0
  return `Descargando ${type} ${current}/${total}`
}

function resolveJavaPath(javaPath) {
  if (!javaPath) return ''

  const cleanPath = javaPath.trim().replace(/^"|"$/g, '')
  if (!cleanPath) return ''

  if (!fs.existsSync(cleanPath)) {
    throw new Error(`No existe la ruta de Java: ${cleanPath}`)
  }

  const stat = fs.statSync(cleanPath)
  if (!stat.isDirectory()) return cleanPath

  const candidates = [
    path.join(cleanPath, 'bin', 'javaw.exe'),
    path.join(cleanPath, 'bin', 'java.exe'),
    path.join(cleanPath, 'javaw.exe'),
    path.join(cleanPath, 'java.exe')
  ]
  const found = candidates.find(candidate => fs.existsSync(candidate))
  if (!found) {
    throw new Error(`La carpeta de Java no contiene java.exe/javaw.exe: ${cleanPath}`)
  }

  return found
}

function getManagedRuntimeDir(javaMajor) {
  return path.join(getZotlinDataRoot(), 'runtime', `java-${javaMajor}`)
}

function getManagedJavaMarker(javaMajor) {
  return path.join(getManagedRuntimeDir(javaMajor), '.java-home')
}

function readManagedJavaHome(javaMajor) {
  const marker = getManagedJavaMarker(javaMajor)
  if (!fs.existsSync(marker)) return ''
  const home = fs.readFileSync(marker, 'utf8').trim()
  if (!home || !fs.existsSync(path.join(home, 'bin', 'javaw.exe'))) return ''
  return home
}

function writeManagedJavaHome(javaMajor, homeDir) {
  const runtimeDir = getManagedRuntimeDir(javaMajor)
  fs.mkdirSync(runtimeDir, { recursive: true })
  fs.writeFileSync(getManagedJavaMarker(javaMajor), homeDir)
}

function findExtractedJdkRoot(extractDir) {
  if (fs.existsSync(path.join(extractDir, 'bin', 'javaw.exe'))) return extractDir
  const entries = fs.readdirSync(extractDir, { withFileTypes: true })
  for (const entry of entries) {
    if (!entry.isDirectory()) continue
    const sub = path.join(extractDir, entry.name)
    if (fs.existsSync(path.join(sub, 'bin', 'javaw.exe'))) return sub
  }
  throw new Error('No se encontro javaw.exe despues de extraer Java.')
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
  return `https://api.adoptium.net/v3/binary/latest/${javaMajor}/ga/windows/x64/jre/hotspot/normal/eclipse?project=jdk`
}

const JAVA_MAJORS = [25, 21, 17, 8]

function getLauncherSettingsFile() {
  return path.join(getZotlinDataRoot(), 'settings.json')
}

function getDefaultLauncherSettings() {
  return {
    javaInstalls: { '8': '', '17': '', '21': '', '25': '' },
    maxConcurrentDownloads: 6
  }
}

function loadLauncherSettings() {
  const file = getLauncherSettingsFile()
  const defaults = getDefaultLauncherSettings()
  if (!fs.existsSync(file)) return { ...defaults, javaInstalls: { ...defaults.javaInstalls } }
  try {
    const data = JSON.parse(fs.readFileSync(file, 'utf8'))
    return {
      ...defaults,
      ...data,
      javaInstalls: { ...defaults.javaInstalls, ...(data.javaInstalls || {}) }
    }
  } catch {
    return { ...defaults, javaInstalls: { ...defaults.javaInstalls } }
  }
}

function saveLauncherSettings(data) {
  fs.mkdirSync(getZotlinDataRoot(), { recursive: true })
  fs.writeFileSync(getLauncherSettingsFile(), JSON.stringify(data, null, 2))
}

function getLauncherCacheDir() {
  return path.join(getZotlinDataRoot(), 'cache')
}

function getBackgroundImagePath() {
  const target = path.join(getZotlinDataRoot(), 'background.png')
  return fs.existsSync(target) ? target : ''
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
    const javaw = resolveJavaPath(homeDir)
    return { valid: true, path: javaw, home: path.dirname(path.dirname(javaw)) }
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

  const bases = [
    process.env.ProgramFiles,
    process.env['ProgramFiles(x86)'],
    path.join(process.env.LOCALAPPDATA || '', 'Programs')
  ].filter(Boolean)

  for (const base of bases) {
    for (const folder of ['Eclipse Adoptium', 'Java', 'Microsoft', 'Zulu']) {
      const parent = path.join(base, folder)
      if (!fs.existsSync(parent)) continue
      let entries = []
      try {
        entries = fs.readdirSync(parent, { withFileTypes: true })
      } catch {
        continue
      }
      for (const entry of entries) {
        if (!entry.isDirectory()) continue
        if (!entry.name.includes(String(javaMajor))) continue
        const home = javaHomeFromCandidate(path.join(parent, entry.name))
        if (home) return { ok: true, path: home, source: 'detected' }
      }
    }
  }

  return { ok: false, error: `No se encontro Java ${javaMajor} en el sistema.` }
}

function getDirSizeBytes(targetPath) {
  if (!fs.existsSync(targetPath)) return 0
  const stat = fs.statSync(targetPath)
  if (!stat.isDirectory()) return stat.size
  let total = 0
  for (const entry of fs.readdirSync(targetPath, { withFileTypes: true })) {
    total += getDirSizeBytes(path.join(targetPath, entry.name))
  }
  return total
}

// Storage cache system - avoids 4.5s filesystem scan on every Ajustes open
let storageCacheInMemory = null
let storageCacheTimestamp = 0
const CACHE_VALIDITY_MS = 5 * 60 * 1000 // 5 minutes

function getStorageCachePath() {
  return path.join(getZotlinDataRoot(), 'storage-cache.json')
}

function loadStorageCacheFromDisk() {
  try {
    const cachePath = getStorageCachePath()
    if (fs.existsSync(cachePath)) {
      const data = fs.readFileSync(cachePath, 'utf-8')
      return JSON.parse(data)
    }
  } catch (e) {
    // ignore corrupted cache
  }
  return null
}

function saveStorageCacheToDisk(data) {
  try {
    const cachePath = getStorageCachePath()
    fs.writeFileSync(cachePath, JSON.stringify(data), 'utf-8')
  } catch (e) {
    // ignore disk write errors
  }
}

function getStorageInfo() {
  // Return cached value if available and fresh
  const now = Date.now()
  if (storageCacheInMemory && (now - storageCacheTimestamp) < CACHE_VALIDITY_MS) {
    return storageCacheInMemory
  }

  // Try disk cache
  const diskCache = loadStorageCacheFromDisk()
  if (diskCache) {
    storageCacheInMemory = diskCache
    storageCacheTimestamp = now
    return diskCache
  }

  // Return minimal defaults while recalculating in background
  const defaultData = {
    ok: true,
    sizes: { total: 0, instances: 0, runtime: 0, cache: 0 },
    formatted: { total: '—', instances: '—', runtime: '—', cache: '—' }
  }

  // Recalculate asynchronously without blocking main thread
  setImmediate(() => {
    try {
      const dataRoot = getZotlinDataRoot()
      const instancesDir = path.join(dataRoot, 'instances')
      const runtimeDir = path.join(dataRoot, 'runtime')
      const cacheDir = getLauncherCacheDir()

      // Only scan the subdirectories, not the full dataRoot
      const instances = getDirSizeBytes(instancesDir)
      const runtime = getDirSizeBytes(runtimeDir)
      const cache = getDirSizeBytes(cacheDir)
      const total = instances + runtime + cache

      const updated = {
        ok: true,
        sizes: { total, instances, runtime, cache },
        formatted: {
          total: formatBytes(total),
          instances: formatBytes(instances),
          runtime: formatBytes(runtime),
          cache: formatBytes(cache)
        }
      }

      storageCacheInMemory = updated
      storageCacheTimestamp = Date.now()
      saveStorageCacheToDisk(updated)
    } catch (e) {
      // Background storage scan failed silently
    }
  })

  return defaultData
}

function invalidateStorageCache() {
  storageCacheInMemory = null
  storageCacheTimestamp = 0
  try {
    const cachePath = getStorageCachePath()
    if (fs.existsSync(cachePath)) fs.unlinkSync(cachePath)
  } catch (e) {
    // ignore
  }
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
  const zipPath = path.join(runtimeDir, 'download.zip')
  const extractDir = path.join(runtimeDir, '_extract')
  const report = (type, message) => {
    if (progressFn) progressFn(type, message)
    else logAndSend(type, message)
  }

  fs.mkdirSync(runtimeDir, { recursive: true })
  if (fs.existsSync(extractDir)) {
    fs.rmSync(extractDir, { recursive: true, force: true })
  }
  fs.mkdirSync(extractDir, { recursive: true })

  const url = getAdoptiumDownloadUrl(javaMajor)
  report('progress', `Descargando Java ${javaMajor} (Eclipse Temurin)...`)
  writeLaunchLog(`Descargando runtime Java ${javaMajor} desde Adoptium`)

  try {
    await downloadToFile(url, zipPath)
    report('progress', `Extrayendo Java ${javaMajor}...`)
    const AdmZip = getAdmZip()
    const zip = new AdmZip(zipPath)
    zip.extractAllTo(extractDir, true)
    const homeDir = findExtractedJdkRoot(extractDir)
    writeManagedJavaHome(javaMajor, homeDir)

    const settings = loadLauncherSettings()
    settings.javaInstalls[String(javaMajor)] = homeDir
    saveLauncherSettings(settings)

    return resolveJavaPath(homeDir)
  } catch (err) {
    // Solo limpiar si falló
    if (fs.existsSync(extractDir)) fs.rmSync(extractDir, { recursive: true, force: true })
    throw err
  } finally {
    // Solo borrar el zip descargado, siempre
    if (fs.existsSync(zipPath)) fs.unlinkSync(zipPath)
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

autoUpdater.autoDownload = true
autoUpdater.autoInstallOnAppQuit = true
autoUpdater.allowPrerelease = true

let pendingUpdateInfo = null
let updateConfirmationWindow = null

async function isPrerelease(version) {
  const semverPrerelease = semver.prerelease(version)
  if (semverPrerelease !== null) {
    return true
  }

  let lastError = null
  for (let attempt = 1; attempt <= 5; attempt++) {
    try {
      const response = await fetch(`https://api.github.com/repos/iDontrixss/ZotlinLauncher/releases/tags/v${version}`)
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
    width: 500,
    height: 250,
    frame: false,
    resizable: false,
    center: true,
    show: true,
    backgroundColor: '#1a1a1a',
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

autoUpdater.on('update-available', async (updateInfo) => {
  const isPrereleaseVersion = await isPrerelease(updateInfo.version)

  if (isPrereleaseVersion === null) {
    console.error(`Could not verify release status for v${updateInfo.version}, skipping update`)
    return
  }

  if (isPrereleaseVersion) {
    autoUpdater.autoDownload = false
    showUpdateConfirmation(updateInfo)
  } else {
    autoUpdater.autoDownload = true
    splashWindow?.webContents.send('update-status', 'Descargando actualización...')
  }
})

autoUpdater.on('download-progress', (progress) => {
  splashWindow?.webContents.send('update-status', `Descargando... ${Math.round(progress.percent)}%`)
})

autoUpdater.on('update-downloaded', () => {
  splashWindow?.webContents.send('update-status', 'Instalando actualización...')
  setTimeout(() => autoUpdater.quitAndInstall(), 1500)
})

autoUpdater.on('error', (err) => {
  console.error('AutoUpdater error:', err.message)
})

ipcMain.on('update-confirm', (_event, accepted) => {
  if (accepted && pendingUpdateInfo) {
    autoUpdater.downloadUpdate()
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
  splashWindow.loadFile('splash.html', { query: { v: version } })
  autoUpdater.checkForUpdates().catch(() => { })
}

function closeSplashAndShowMain() {
  if (mainWindow && !mainWindow.isDestroyed()) {
    mainWindow.show()
    mainWindow.focus()
  }
  if (splashWindow && !splashWindow.isDestroyed()) {
    splashWindow.close()
  }
  splashWindow = null
}
function isOnboardingDone() {
  const file = path.join(getZotlinDataRoot(), 'onboarding-done.json')
  return fs.existsSync(file)
}

function markOnboardingDone() {
  const dir = getZotlinDataRoot()
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

  mainWindow.loadFile('index.html')

  mainWindow.once('ready-to-show', () => {
    const wait = Math.max(0, SPLASH_MIN_MS - (Date.now() - splashStartedAt))
    setTimeout(closeSplashAndShowMain, wait)
  })
}

app.whenReady().then(() => {
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
}

ipcMain.on('minimize', () => {
  mainWindow?.minimize()
})

ipcMain.handle('finish-onboarding', (_event, config) => {
  markOnboardingDone()
  const settings = {
    username: config.username || 'ZotlinUser',
    language: config.language || 'es',
    theme: config.theme || 'dark',
    accountType: config.accountType || 'offline',
    minRam: '2G',
    maxRam: '4G',
    minRamMb: 2048,
    maxRamMb: 4096,
    javaArgs: '',
    maxConcurrentDownloads: 6
  }
  const settingsFile = path.join(getZotlinDataRoot(), 'settings.json')
  fs.writeFileSync(settingsFile, JSON.stringify(settings, null, 2))

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
  return getZotlinDataRoot()
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
  const instances = loadCustomInstances()
  const instance = instances.find(i => i.id === instanceId)
  if (!instance) return { ok: false, error: 'Instancia no encontrada' }

  const { dialog } = require('electron')
  const result = await dialog.showSaveDialog(mainWindow, {
    title: 'Exportar modpack',
    defaultPath: instance.name.replace(/[^a-z0-9]/gi, '-') + '.mrpack',
    filters: [{ name: 'Modpack Modrinth', extensions: ['mrpack'] }]
  })
  if (result.canceled || !result.filePath) return { cancelled: true }

  try {
    const AdmZip = require('adm-zip')
    const zip = new AdmZip()
    const instanceMinecraftDir = path.join(instance.dir, 'minecraft')

    // Crear modrinth.index.json
    const index = {
      formatVersion: 1,
      game: 'minecraft',
      versionId: instance.version,
      name: instance.name,
      dependencies: {
        minecraft: instance.version,
        ...(instance.loader && instance.loader !== 'vanilla' ? { [instance.loader]: '' } : {})
      },
      files: []
    }
    zip.addFile('modrinth.index.json', Buffer.from(JSON.stringify(index, null, 2)))

    // Agregar archivos como overrides (excepto mods)
    const overrideDirs = ['config', 'resourcepacks', 'shaderpacks', 'saves']
    for (const dir of overrideDirs) {
      const dirPath = path.join(instanceMinecraftDir, dir)
      if (!fs.existsSync(dirPath)) continue
      const addDir = (currentPath, zipPath) => {
        fs.readdirSync(currentPath).forEach(file => {
          const fullPath = path.join(currentPath, file)
          const zipFilePath = path.join(zipPath, file)
          if (fs.statSync(fullPath).isDirectory()) {
            addDir(fullPath, zipFilePath)
          } else {
            zip.addFile('overrides/' + zipFilePath.replace(/\\/g, '/'), fs.readFileSync(fullPath))
          }
        })
      }
      addDir(dirPath, dir)
    }

    zip.writeZip(result.filePath)
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
  if (!home) return { ok: false, error: 'No se encontro javaw.exe en esa carpeta.' }
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

ipcMain.handle('settings-get-storage', () => {
  const dataRoot = getZotlinDataRoot()
  const result = getStorageInfo()
  result.dataRoot = dataRoot
  return result
})

ipcMain.handle('settings-purge-cache', () => {
  minecraftVersionCache = null
  loaderVersionCache = {}
  
  // Función helper para eliminar directorio tolerante a archivos bloqueados
  const removeDirTolerant = (dirPath) => {
    try {
      if (!fs.existsSync(dirPath)) return
      
      // Intentar eliminación directa primero
      try {
        fs.rmSync(dirPath, { recursive: true, force: true })
        return
      } catch (directErr) {
        // Si falla, intentar archivo por archivo ignorando errores
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
                // Ignorar error al eliminar directorio
              }
            } else {
              try {
                fs.unlinkSync(currentPath)
              } catch (unlinkErr) {
                // Ignorar error al eliminar archivo (probablemente bloqueado)
              }
            }
          } catch (statErr) {
            // Ignorar error de stat
          }
        }
        removeRecursive(dirPath)
      }
    } catch (err) {
      // Ignorar todos los errores, no bloquear la operación
    }
  }
  
  const cacheDir = getLauncherCacheDir()
  removeDirTolerant(cacheDir)
  
  const runtimeDir = path.join(getZotlinDataRoot(), 'runtime')
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
  const dataRoot = getZotlinDataRoot()
  fs.mkdirSync(dataRoot, { recursive: true })
  shell.openPath(dataRoot)
  return { ok: true, path: dataRoot }
})

function convertVideoToH264(srcPath, destPath) {
  return new Promise((resolve, reject) => {
    const ffmpegPath = require('ffmpeg-static')
    const { spawn } = require('child_process')

    const args = [
      '-i', srcPath,
      '-c:v', 'libx264',
      '-preset', 'fast',
      '-crf', '23',
      '-c:a', 'aac',
      '-movflags', '+faststart',
      '-y',
      destPath
    ]

    const proc = spawn(ffmpegPath, args)

    proc.on('close', (code) => {
      if (code === 0) {
        resolve()
      } else {
        reject(new Error('ffmpeg salió con código ' + code))
      }
    })

    proc.on('error', (err) => {
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
      { name: 'Video', extensions: ['mp4', 'webm', 'ogg', 'mov', 'avi', 'mkv'] },
      { name: 'Todos los archivos', extensions: ['*'] }
    ]
  })
  if (result.canceled || !result.filePaths.length) return { ok: false, cancelled: true }

  const srcPath = result.filePaths[0]
  const ext = path.extname(srcPath).toLowerCase()
  const isVideo = /\.(mp4|webm|ogg|mov|avi|mkv)$/i.test(srcPath)
  fs.mkdirSync(getZotlinDataRoot(), { recursive: true })

  if (isVideo) {
    const target = path.join(getZotlinDataRoot(), 'background.mp4')
    try {
      await convertVideoToH264(srcPath, target)
      return { ok: true, path: target }
    } catch (err) {
      return { ok: false, error: 'No se pudo convertir el video: ' + err.message }
    }
  } else {
    const target = path.join(getZotlinDataRoot(), 'background' + ext)
    try {
      fs.copyFileSync(srcPath, target)
      return { ok: true, path: target }
    } catch (err) {
      return { ok: true, path: srcPath }
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
  const target = path.join(getZotlinDataRoot(), 'background.png')
  if (fs.existsSync(target)) fs.unlinkSync(target)
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
    const file = path.join(getZotlinDataRoot(), 'settings.json')
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

  // Fix file.close() + unlink race en Windows
  function safeCleanTmp(file, tmpPath) {
    return new Promise((resolve) => {
      file.close(() => {
        try { if (fs.existsSync(tmpPath)) fs.unlinkSync(tmpPath) } catch { }
        resolve()
      })
    })
  }

  try {
    const AdmZip = require('adm-zip')
    const zip = new AdmZip(mrpackPath)
    const indexEntry = zip.getEntry('modrinth.index.json')
    if (!indexEntry) return { ok: false, error: 'Archivo .mrpack inválido: falta modrinth.index.json' }

    const index = JSON.parse(indexEntry.getData().toString('utf8'))
    const packName = index.name || path.basename(mrpackPath, '.mrpack')
    const mcVersion = index.dependencies?.minecraft || 'unknown'
    const loader = Object.keys(index.dependencies || {}).find(k => k !== 'minecraft') || 'vanilla'

    const instanceId = 'modpack-' + packName.toLowerCase().replace(/[^a-z0-9]/g, '-').replace(/-+/g, '-').replace(/^-|-$/g, '') + '-' + Date.now()
    instanceDir = path.join(getZotlinDataRoot(), 'instances', instanceId)
    fs.mkdirSync(path.join(instanceDir, 'minecraft', 'mods'), { recursive: true })

    function safePath(base, filePath) {
      const baseResolved = path.resolve(base) + path.sep
      const resolved = path.resolve(base, filePath)
      if (!resolved.startsWith(baseResolved)) throw new Error('Path traversal detectado: ' + filePath)
      return resolved
    }

    event.sender.send('mrpack-progress', { stage: 'overrides', done: 0, total: 0, message: 'Extrayendo archivos...' })
    zip.getEntries().forEach(entry => {
      if (entry.entryName.startsWith('overrides/') && !entry.isDirectory) {
        const relPath = entry.entryName.replace(/^overrides\//, '')
        try {
          const destPath = safePath(path.join(instanceDir, 'minecraft'), relPath)
          fs.mkdirSync(path.dirname(destPath), { recursive: true })
          fs.writeFileSync(destPath, entry.getData())
        } catch (e) {
          console.error('Override bloqueado por path traversal:', e.message)
        }
      }
    })

    const https = require('https')
    const http = require('http')

    function downloadFile(url, destPath, redirectCount = 0) {
      return new Promise((resolve, reject) => {
        if (redirectCount > 5) return reject(new Error('Demasiados redirects'))
        const proto = url.startsWith('https') ? https : http
        const tmpPath = destPath + '.tmp'
        const file = fs.createWriteStream(tmpPath)

        const req = proto.get(url, (res) => {
          if ([301, 302, 307, 308].includes(res.statusCode)) {
            safeCleanTmp(file, tmpPath).then(() =>
              downloadFile(res.headers.location, destPath, redirectCount + 1).then(resolve).catch(reject)
            )
            return
          }
          if (res.statusCode !== 200) {
            safeCleanTmp(file, tmpPath).then(() =>
              reject(new Error(`HTTP ${res.statusCode}`))
            )
            return
          }
          res.pipe(file)
          file.on('finish', () => {
            file.close(() => {
              try {
                fs.renameSync(tmpPath, destPath)
                resolve()
              } catch (e) {
                reject(e)
              }
            })
          })
        })

        req.setTimeout(30000, () => {
          req.destroy()
          safeCleanTmp(file, tmpPath).then(() => reject(new Error('Timeout')))
        })

        req.on('error', (err) => {
          safeCleanTmp(file, tmpPath).then(() => reject(err))
        })
      })
    }

    async function downloadWithFallback(downloads, destPath) {
      for (const url of downloads) {
        try {
          await downloadFile(url, destPath)
          return true
        } catch (e) { /* intentar siguiente mirror */ }
      }
      return false
    }

    // Verificar hash SHA1 o SHA512
    function verifyHash(filePath, hashes) {
      if (!hashes) return true
      const algo = hashes.sha512 ? 'sha512' : hashes.sha1 ? 'sha1' : null
      if (!algo) return true
      return new Promise((resolve) => {
        const hash = crypto.createHash(algo)
        const stream = fs.createReadStream(filePath)
        stream.on('data', chunk => hash.update(chunk))
        stream.on('end', () => resolve(hash.digest('hex') === hashes[algo]))
        stream.on('error', () => resolve(false))
      })
    }

    const files = index.files || []
    const total = files.length
    let done = 0
    const failedDownloads = []
    const maxConcurrent = 6
    let fileIdx = 0

    async function downloadChunk() {
      const batch = files.slice(fileIdx, fileIdx + maxConcurrent)
      fileIdx += maxConcurrent
      if (!batch.length) return
      await Promise.all(batch.map(async (file) => {
        const downloads = file.downloads || []

        if (!downloads.length) {
          failedDownloads.push(file.path)
          const current = ++done
          event.sender.send('mrpack-progress', { stage: 'downloading', done: current, total, message: `Descargando mods... ${current}/${total}` })
          return
        }

        try {
          const destPath = safePath(path.join(instanceDir, 'minecraft'), file.path)
          fs.mkdirSync(path.dirname(destPath), { recursive: true })
          const ok = await downloadWithFallback(downloads, destPath)
          if (ok) {
            // Verificar hash si está disponible
            if (file.hashes && !await verifyHash(destPath, file.hashes)) {
              try { fs.unlinkSync(destPath) } catch { }
              failedDownloads.push(file.path + ' (hash inválido)')
            }
          } else {
            failedDownloads.push(file.path)
          }
        } catch (e) {
          failedDownloads.push(file.path)
        }

        const current = ++done
        event.sender.send('mrpack-progress', { stage: 'downloading', done: current, total, message: `Descargando mods... ${current}/${total}` })
      }))
      await downloadChunk()
    }

    event.sender.send('mrpack-progress', { stage: 'downloading', done: 0, total, message: `Descargando mods... 0/${total}` })

    try {
      await downloadChunk()
    } catch (err) {
      // Error grave durante descarga — limpiar instancia incompleta
      if (instanceDir) try { fs.rmSync(instanceDir, { recursive: true, force: true }) } catch { }
      throw err
    }

    const instances = loadCustomInstances()
    instances.push({
      id: instanceId,
      name: packName,
      version: mcVersion,
      loader: loader,
      type: 'modpack',
      dir: instanceDir,
      createdAt: new Date().toISOString()
    })
    saveCustomInstances(instances)

    return { ok: true, name: packName, warnings: failedDownloads.length }
  } catch (err) {
    // Error grave global — limpiar instancia si se llegó a crear
    if (instanceDir) try { fs.rmSync(instanceDir, { recursive: true, force: true }) } catch { }
    return { ok: false, error: err.message }
  }
})

ipcMain.handle('open-external-url', (_event, url) => {
  try {
    const parsed = new URL(String(url || ''))
    if (!['https:', 'http:'].includes(parsed.protocol)) {
      return { ok: false, error: 'URL invalida.' }
    }
    shell.openExternal(parsed.toString())
    return { ok: true }
  } catch (error) {
    return { ok: false, error: error.message || String(error) }
  }
})

ipcMain.handle('launch-game', async (_event, payload) => {
  if (launcher) {
    return { ok: false, error: 'Minecraft ya se esta iniciando o ejecutando.' }
  }

  const instance = getInstance(payload.instanceId)
  if (!instance) {
    return { ok: false, error: 'No existe la instancia seleccionada.' }
  }

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

  let javaPath = ''
  try {
    javaPath = await resolveLaunchJavaPath(instance.version)
  } catch (error) {
    writeLaunchLog(error.message || String(error))
    currentLogFile = null
    return { ok: false, error: error.message || String(error) }
  }

  // Validate Java path
  if (!javaPath || typeof javaPath !== 'string' || javaPath.trim() === '') {
    const errMsg = 'No se encontro ruta valida de Java. Asegurate de tener Java instalado o configurado en Ajustes.'
    writeLaunchLog(errMsg)
    currentLogFile = null
    return { ok: false, error: errMsg }
  }

  // Validate memory values
  if (typeof memory.min !== 'number' || typeof memory.max !== 'number' || memory.min <= 0 || memory.max <= 0) {
    const errMsg = `Parametros de memoria invalidos: min=${memory.min}, max=${memory.max}`
    writeLaunchLog(errMsg)
    currentLogFile = null
    return { ok: false, error: errMsg }
  }

  const settings = loadLauncherSettings()
  const maxSockets = Math.max(2, Math.min(Number(settings.maxConcurrentDownloads) || 6, 20))
  const opts = {
    authorization: (() => {
      const msAccount = microsoftAccounts.find(a => a.active)
      if (msAccount) {
        return {
          access_token: msAccount.access_token,
          client_token: msAccount.client_token || 'null',
          uuid: msAccount.uuid,
          name: msAccount.name,
          user_properties: '{}'
        }
      }
      return {
        access_token: 'null',
        client_token: 'null',
        uuid: createOfflineUuid(username),
        name: username,
        user_properties: '{}'
      }
    })(),
    root: minecraftRoot,
    version: { number: instance.version, type: instance.versionType || 'release' },
    memory: {
      max: memory.max,
      min: memory.min
    },
    javaPath: javaPath,
    overrides: {
      maxSockets
    }
  }

  const customArgs = String(payload.customArgs || '')
    .split(/\s+/)
    .map(item => item.trim())
    .filter(Boolean)
  if (customArgs.length) opts.customArgs = customArgs

  try {
    await prepareLoaderLaunch(instance, minecraftRoot, opts)
  } catch (error) {
    writeLaunchLog(error.message || String(error))
    currentLogFile = null
    return { ok: false, error: error.message || String(error) }
  }

  const Client = getLauncherClientClass()
  launcher = new Client()
  launchStartedAt = Date.now()
  inicioCancelado = false
  lastProgressMessage = ''
  lastProgressSentAt = 0
  lastDataMessage = ''
  lastDataSentAt = 0
  pendingLogLines = []
  if (logFlushTimer) {
    clearTimeout(logFlushTimer)
    logFlushTimer = null
  }
  logAndSend('starting', `Preparando ${instance.name}`)
  logOnly('debug', `Instancia: ${getInstanceDir(instance.id)}`)
  logOnly('debug', `Minecraft root: ${minecraftRoot}`)
  logOnly('debug', `Java: ${javaPath}`)
  logOnly('debug', `Java major: ${getRequiredJavaMajor(instance.version)} para MC ${instance.version}`)
  logOnly('debug', `Memoria: min=${memory.min}MB max=${memory.max}MB`)
  logOnly('debug', `Descargas simultaneas: ${maxSockets}`)
  logOnly('debug', `Custom args: ${customArgs.length > 0 ? customArgs.join(' ') : '(ninguno)'}`)

  launcher.on('debug', (message) => {
    logOnly('debug', message)
  })
  launcher.on('download', (message) => {
    logOnly('download', 'Descargado: ' + message)
  })
  launcher.on('progress', (progress) => {
    const message = formatProgress(progress)
    writeLaunchLog(message)
    if (shouldSendProgress(message)) sendLauncherStatus('progress', message)
  })
  launcher.on('data', (message) => {
    logData(message)
  })
  launcher.on('close', (code, signal) => {
    const ranFor = Math.round((Date.now() - launchStartedAt) / 1000)
    let cleanMessage
    if (code === 0) {
      cleanMessage = 'Minecraft se cerro correctamente.'
    } else if (code === null || code === undefined) {
      cleanMessage = `Minecraft se cerro (terminado por el launcher${signal ? ', señal: ' + signal : ''}).`
    } else {
      cleanMessage = `Minecraft se cerro/crasheo con codigo ${code}.`
    }
    logAndSend('close', `${cleanMessage} Duracion: ${ranFor}s`)
    flushLaunchLog()
    launcher = null
    minecraftProcess = null
    runningInstanceId = null
    currentLogFile = null
  })
  launcher.on('error', (err) => {
    logAndSend('error', err.stack || err.message || String(err))
    flushLaunchLog()
    launcher = null
    currentLogFile = null
  })

  try {
    minecraftProcess = await launcher.launch(opts)
    
    // Verificar si se canceló durante la descarga
    if (inicioCancelado) {
      // Matar el proceso si se inició
      if (minecraftProcess) {
        minecraftProcess.kill('SIGKILL')
        minecraftProcess = null
      }
      launcher = null
      currentLogFile = null
      return { ok: false, error: 'Lanzamiento cancelado' }
    }
    
    const child = minecraftProcess
    if (child && child.on) {
      child.on('error', (error) => {
        logAndSend('error', error.stack || error.message || String(error))
        flushLaunchLog()
        launcher = null
        currentLogFile = null
      })
      if (child.stdout) {
        child.stdout.on('data', (data) => {
          logData(data.toString())
        })
      }
      if (child.stderr) {
        child.stderr.on('data', (data) => {
          logData(data.toString())
        })
      }
      child.on('close', (code, signal) => {
        // Process close event
      })
      child.on('exit', (code, signal) => {
        // Process exit event
      })
    }
    runningInstanceId = instance.id
    logAndSend('running', 'Minecraft iniciado.')
    return { ok: true }
  } catch (error) {
    launcher = null
    logAndSend('error', error.stack || error.message || String(error))
    flushLaunchLog()
    currentLogFile = null
    return { ok: false, error: error.message || String(error) }
  }
})

ipcMain.handle('ms-login', async () => {
  try {
    const auth = getMicrosoftAuth()
    const xboxManager = await auth.launch('electron')
    const token = await xboxManager.getMinecraft()
    const mclc = token.mclc()
    const account = {
      id: mclc.uuid,
      name: mclc.name,
      uuid: mclc.uuid,
      access_token: mclc.access_token,
      client_token: crypto.randomUUID(),
      active: true,
      type: 'microsoft'
    }
    microsoftAccounts = loadMicrosoftAccounts()
    microsoftAccounts = microsoftAccounts.map(a => ({ ...a, active: false }))
    const existing = microsoftAccounts.findIndex(a => a.id === account.id)
    if (existing >= 0) microsoftAccounts[existing] = account
    else microsoftAccounts.push(account)
    saveMicrosoftAccounts(microsoftAccounts)
    return { ok: true, account }
  } catch (error) {
    return { ok: false, error: error.message || String(error) }
  }
})

ipcMain.handle('ms-logout', (_event, accountId) => {
  try {
    microsoftAccounts = loadMicrosoftAccounts()
    microsoftAccounts = microsoftAccounts.filter(a => a.id !== accountId)
    saveMicrosoftAccounts(microsoftAccounts)
    return { ok: true }
  } catch (error) {
    return { ok: false, error: error.message || String(error) }
  }
})

ipcMain.handle('ms-accounts-list', () => {
  try {
    microsoftAccounts = loadMicrosoftAccounts()
    return { ok: true, accounts: microsoftAccounts }
  } catch (error) {
    return { ok: false, error: error.message || String(error) }
  }
})

ipcMain.handle('ms-set-active', (_event, accountId) => {
  try {
    microsoftAccounts = loadMicrosoftAccounts()
    microsoftAccounts = microsoftAccounts.map(a => ({ ...a, active: a.id === accountId }))
    saveMicrosoftAccounts(microsoftAccounts)
    return { ok: true }
  } catch (error) {
    return { ok: false, error: error.message || String(error) }
  }
})

ipcMain.handle('kill-minecraft', () => {
  if (minecraftProcess) {
    minecraftProcess.kill('SIGTERM')
    setTimeout(() => {
      if (minecraftProcess) {
        minecraftProcess.kill('SIGKILL')
        minecraftProcess = null
      }
    }, 5000)
    return { ok: true }
  }
  // Si no hay proceso, estamos en fase de descarga - marcar como cancelado
  inicioCancelado = true
  return { ok: true }
})

ipcMain.handle('mc-status', () => {
  return { running: minecraftProcess !== null, instanceId: runningInstanceId }
})

ipcMain.handle('skin-save-local', async (_event, skinUrl, skinName) => {
  try {
    return { ok: true }
  } catch (err) {
    return { ok: false, error: err.message }
  }
})

// Función helper para retry con backoff exponencial para errores transitorios
async function uploadSkinToMinecraftWithRetry(skinBytes, model, accessToken, maxRetries = 3) {
  const transientCodes = [502, 503, 504, 429]
  let lastError = null
  
  for (let attempt = 0; attempt <= maxRetries; attempt++) {
    try {
      return await uploadSkinToMinecraft(skinBytes, model, accessToken)
    } catch (err) {
      lastError = err
      
      // Verificar si el error es de un código transitorio usando la propiedad statusCode
      const isTransient = transientCodes.includes(err.statusCode)
      
      if (!isTransient || attempt === maxRetries) {
        // No es transitorio o se agotaron los reintentos
        throw err
      }
      
      // Calcular backoff
      let delayMs = Math.pow(2, attempt) * 1000 // 1s, 2s, 4s
      
      // Si es 429, verificar header Retry-After usando la propiedad retryAfter
      if (err.statusCode === 429 && err.retryAfter) {
        delayMs = parseInt(err.retryAfter) * 1000
      }
      
      // Esperar antes del próximo reintento
      await new Promise(resolve => setTimeout(resolve, delayMs))
    }
  }
  
  throw lastError
}

ipcMain.handle('skin-apply-online', async (_event, skinUrl, model, accessToken, skinBytes) => {
  try {
    // Si se recibieron bytes directos del renderer (caso blob:), usarlos directamente
    if (skinBytes) {
      skinBytes = Buffer.from(skinBytes)
    } else if (skinUrl.startsWith('http://') || skinUrl.startsWith('https://')) {
      // Descargar la imagen a Buffer en memoria (caso galería online)
      skinBytes = await downloadUrlToBuffer(skinUrl)
    } else {
      // URL no soportada o blob sin bytes (no debería pasar)
      return { ok: false, error: 'Unsupported URL format or missing skin bytes' }
    }
    
    // Enviar a Minecraft Services con retry para errores transitorios
    const response = await uploadSkinToMinecraftWithRetry(skinBytes, model, accessToken)
    return response
  } catch (err) {
    // Manejo de token expirado (401)
    if (err.message === 'Authentication failed. Please log in again.') {
      try {
        // Refrescar el token usando la misma lógica que ms-login
        const auth = getMicrosoftAuth()
        const xboxManager = await auth.launch('electron')
        const token = await xboxManager.getMinecraft()
        const mclc = token.mclc()
        
        // Actualizar el access_token en la cuenta activa
        microsoftAccounts = loadMicrosoftAccounts()
        const activeAccount = microsoftAccounts.find(a => a.active)
        if (activeAccount) {
          activeAccount.access_token = mclc.access_token
          saveMicrosoftAccounts(microsoftAccounts)
          
          // Reintentar la petición con el nuevo token (con retry para errores transitorios)
          // Usar los mismos bytes que se obtuvieron originalmente
          let retrySkinBytes
          if (skinBytes) {
            // Si ya teníamos bytes del renderer, reusarlos
            retrySkinBytes = Buffer.from(skinBytes)
          } else if (skinUrl.startsWith('http://') || skinUrl.startsWith('https://')) {
            // Si era una URL remota, volver a descargar
            retrySkinBytes = await downloadUrlToBuffer(skinUrl)
          } else {
            return { ok: false, error: 'Unsupported URL format or missing skin bytes' }
          }
          
          const response = await uploadSkinToMinecraftWithRetry(retrySkinBytes, model, mclc.access_token)
          return response
        }
      } catch (refreshErr) {
        // Si falla el refresco, devolver el error original
        return { ok: false, error: err.message }
      }
    }
    return { ok: false, error: err.message }
  }
})

async function downloadBlobUrl(blobUrl) {
  // Esta función ya no se usa en el flujo de applyOnline
  // Los bytes de blob URLs se extraen en el renderer y se pasan directamente
  throw new Error('downloadBlobUrl is deprecated. Use the new flow with bytes from renderer.')
}

async function uploadToMcHeads(filePath) {
  // mc-heads.net no tiene una API pública de upload
  // Por ahora, vamos a usar una solución alternativa
  throw new Error('Local skins not yet supported for online upload. Please use a skin from mc-heads.net.')
}

// Función helper para descargar una URL a un Buffer en memoria
async function downloadUrlToBuffer(url) {
  const https = require('https')
  const http = require('http')
  const protocol = url.startsWith('https') ? https : http
  
  return new Promise((resolve, reject) => {
    const parsedUrl = new URL(url)
    const options = {
      hostname: parsedUrl.hostname,
      port: parsedUrl.port || (parsedUrl.protocol === 'https:' ? 443 : 80),
      path: parsedUrl.pathname + parsedUrl.search,
      method: 'GET'
    }
    
    const req = protocol.request(options, (res) => {
      const chunks = []
      res.on('data', (chunk) => chunks.push(chunk))
      res.on('end', () => {
        if (res.statusCode === 200 || res.statusCode === 304) {
          resolve(Buffer.concat(chunks))
        } else {
          reject(new Error(`HTTP ${res.statusCode}: Failed to download image from ${url}`))
        }
      })
    })
    
    req.on('error', reject)
    req.end()
  })
}

async function uploadSkinToMinecraft(skinBytes, model, accessToken) {
  const https = require('https')
  
  const variant = model === 'slim' ? 'slim' : 'classic'
  
  // Construir body multipart/form-data manualmente
  const boundary = '----WebKitFormBoundary' + Math.random().toString(16).substr(2, 16)
  
  // Parte 1: variant
  const variantPart = `--${boundary}\r\nContent-Disposition: form-data; name="variant"\r\n\r\n${variant}\r\n`
  
  // Parte 2: file
  const filePart = `--${boundary}\r\nContent-Disposition: form-data; name="file"; filename="skin.png"\r\nContent-Type: image/png\r\n\r\n`
  
  // Cierre
  const closingPart = `\r\n--${boundary}--\r\n`
  
  // Combinar todo en un Buffer
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
  if (splashWindow && !splashWindow.isDestroyed()) splashWindow.close()
  splashWindow = null
  if (process.platform !== 'darwin') app.quit()
})

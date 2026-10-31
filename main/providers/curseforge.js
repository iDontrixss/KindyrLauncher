// Kindyr Launcher - Copyright (C) 2026 iDontrixss
// This program is free software: you can redistribute it and/or modify
// it under the terms of the GNU General Public License as published by
// the Free Software Foundation, either version 3 of the License, or
// (at your option) any later version.
// SPDX-License-Identifier: GPL-3.0-or-later

const state = require('../state')
const { CURSEFORGE_API, MODRINTH_USER_AGENT } = require('../constants')
const { getCurseForgeApiKey } = require('./curseforge-key')
const { requireTrimmedString } = require('../ipc-guard')
const { normalizeDiscoverQuery, normalizeVersion } = require('./modrinth')
const { fetchWithTimeout } = require('../http')

// --- CurseForge (key nunca en renderer, solo main) ---
const CURSEFORGE_GAME_ID_MINECRAFT = 432
// Clases oficiales CurseForge para Minecraft (gameId 432), verificadas contra GET /v1/categories?gameId=432:
// 6 Mods, 4471 Modpacks, 12 Resource Packs, 6552 Shaders, 6945 Data Packs, 5 Bukkit Plugins.
// (4546 es Customization, 17 Worlds y 4559 Addons no se exponen como tipos buscables todavía.)
const curseClassIdByType = { mod: 6, modpack: 4471, resourcepack: 12, shader: 6552, datapack: 6945, plugin: 5 }
const curseClassIdToType = { 6: 'mod', 4471: 'modpack', 12: 'resourcepack', 6552: 'shader', 6945: 'datapack', 5: 'plugin' }
const curseSortFieldByModrinth = { relevance: 1, downloads: 6, follows: 2, updated: 3, newest: 11 }

function getCurseForgeSortField(sort) {
  return curseSortFieldByModrinth[String(sort || '').toLowerCase()] || 1
}

function normalizeCurseForgeHit(m, type) {
  // normalizar a shape Modrinth para reutilizar UI
  return {
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
    // Si es false, la API no da downloadUrl en ningún archivo: la UI lo
    // marca "Solo web" desde la card en vez de dejar intentar en vano.
    allowModDistribution: m.allowModDistribution !== false,
    _curseForge: true,
    _curseUrl: m.links?.websiteUrl || `https://www.curseforge.com/minecraft/mc-mods/${m.slug}`
  }
}

async function fetchCurseForgeSearchPage({ apiKey, query, classId, categoryId, gameVersion, modLoaderType, applyLoader, sortField, limit, offset, signal }) {
  // CurseForge pagination usa index (offset)
  const url = new URL(CURSEFORGE_API + '/mods/search')
  url.searchParams.set('gameId', String(CURSEFORGE_GAME_ID_MINECRAFT))
  if (query) url.searchParams.set('searchFilter', query)
  if (classId) url.searchParams.set('classId', String(classId))
  if (categoryId) url.searchParams.set('categoryId', String(categoryId))
  if (gameVersion) url.searchParams.set('gameVersion', gameVersion)
  if (modLoaderType && applyLoader) {
    url.searchParams.set('modLoaderType', String(modLoaderType))
  }
  url.searchParams.set('sortField', String(sortField))
  url.searchParams.set('sortOrder', 'desc')
  url.searchParams.set('pageSize', String(limit))
  url.searchParams.set('index', String(offset))
  const response = await fetchWithTimeout(url, {
    headers: { 'x-api-key': apiKey, Accept: 'application/json', 'User-Agent': MODRINTH_USER_AGENT },
    signal
  })
  const body = await response.json().catch(() => ({}))
  if (!response.ok) {
    // F1: por código. 401/403 = clave rechazada (sin retry), 429 = cuota,
    // 5xx = temporal (1 retry decide el llamador). Modrinth nunca se toca.
    const err = new Error(body.error || body.message || 'CurseForge no respondió bien.')
    err.code = response.status === 401 || response.status === 403 ? 'CF_AUTH'
      : response.status === 429 ? 'CF_QUOTA'
      : response.status >= 500 ? 'CF_TEMP' : 'CF_ERROR'
    err.status = response.status
    throw err
  }
  return body
}

// Un chip de "Todo" puede agrupar la misma categoría en varias clases (ej. Fantasy en
// Shaders + Data Packs). La API solo acepta UN categoryId por request, así que se hace
// fan-out en paralelo y se fusiona. Páginas profundas son aproximadas: cada sub-query
// pagina por su cuenta y se fusiona la ventana.
function mergeCurseForgeCategoryPages(pages, sortField, limit) {
  const seen = new Set()
  const merged = []
  let totalHits = 0
  for (const page of pages) {
    totalHits += Number(page.total) || 0
    for (const hit of page.hits) {
      if (!hit || seen.has(hit.project_id)) continue
      seen.add(hit.project_id)
      merged.push(hit)
    }
  }
  if (sortField === 6) {
    merged.sort((a, b) => (b.downloads || 0) - (a.downloads || 0))
  } else if (sortField === 3 || sortField === 11) {
    // newest (11) no expone fecha de creación en el hit: se aproxima con date_modified
    merged.sort((a, b) => (Date.parse(b.date_modified) || 0) - (Date.parse(a.date_modified) || 0))
  }
  return { hits: merged.slice(0, Math.max(1, limit)), totalHits }
}

function normalizeCurseForgeCategoryIds(value) {
  const list = Array.isArray(value) ? value : [value]
  const ids = []
  for (const item of list) {
    const id = Number(item)
    if (Number.isInteger(id) && id > 0 && !ids.includes(id)) ids.push(id)
  }
  return ids.slice(0, 8)
}

async function searchCurseForge(payload = {}, opts = {}) {
  if (state.curseSearchAbortController && !opts.signal) {
    try { state.curseSearchAbortController.abort() } catch {}
  }
  const localController = opts.signal ? null : new AbortController()
  const signal = opts.signal || localController.signal
  if (!opts.signal) state.curseSearchAbortController = localController
  try {
  const apiKey = getCurseForgeApiKey()
  if (!apiKey) throw new Error('CurseForge no configurado: falta API key. Configurá CURSEFORGE_API_KEY (ver docs).')
  const query = normalizeDiscoverQuery(payload.query)
  const offset = Math.max(0, Math.min(Number(payload.offset) || 0, 10000))
  const limit = Math.max(1, Math.min(Number(payload.limit) || 18, 50))
  const gameVersion = normalizeVersion(payload.version) || undefined
  const type = String(payload.type || 'all')
  const classId = (Object.hasOwn(curseClassIdByType, type) && curseClassIdByType[type]) || undefined
  const sortField = getCurseForgeSortField(payload.sort)
  const modLoaderType = getCurseForgeModLoaderType(payload.loader)
  const loaderAllowedForCF = new Set(['mod', 'modpack', 'plugin'])
  const applyLoader = Boolean(modLoaderType) && loaderAllowedForCF.has(type)
  const baseParams = { apiKey, query, classId, gameVersion, modLoaderType, applyLoader, sortField, limit, offset, signal }
  const categoryIds = normalizeCurseForgeCategoryIds(payload.categoryIds ?? payload.categoryId)
  if (categoryIds.length > 1) {
    const pages = await Promise.all(categoryIds.map(async (categoryId) => {
      const body = await fetchCurseForgeSearchPage({ ...baseParams, categoryId })
      const data = Array.isArray(body.data) ? body.data : []
      return { hits: data.map(m => normalizeCurseForgeHit(m, type)), total: (body.pagination || {}).totalCount || 0 }
    }))
    const merged = mergeCurseForgeCategoryPages(pages, sortField, limit)
    if (localController && state.curseSearchAbortController === localController) state.curseSearchAbortController = null
    return { hits: merged.hits, offset, limit, totalHits: merged.totalHits }
  }
  const body = await fetchCurseForgeSearchPage({ ...baseParams, categoryId: categoryIds[0] })
  const data = Array.isArray(body.data) ? body.data : []
  const hits = data.map(m => normalizeCurseForgeHit(m, type))
  const pagination = body.pagination || {}
  if (localController && state.curseSearchAbortController === localController) state.curseSearchAbortController = null
  return { hits, offset, limit, totalHits: pagination.totalCount || hits.length }
  } catch (e) {
    if (localController && state.curseSearchAbortController === localController) state.curseSearchAbortController = null
    throw e
  }
}

function getCurseForgeModLoaderType(loader) {
  const map = { forge: 1, fabric: 4, quilt: 5, neoforge: 6 }
  return map[String(loader || '').toLowerCase()] || 0
}

// Categorías oficiales CurseForge (GET /v1/categories?gameId=432), cacheadas 24h en memoria.
// El renderer las usa para pintar los chips de CATEGORÍAS por tipo de contenido.
let curseForgeCategoriesCache = null
let curseForgeCategoriesRequest = null
const CURSEFORGE_CATEGORIES_TTL_MS = 24 * 60 * 60 * 1000

async function getCurseForgeCategories() {
  if (curseForgeCategoriesCache && Date.now() - curseForgeCategoriesCache.cachedAt < CURSEFORGE_CATEGORIES_TTL_MS) {
    return curseForgeCategoriesCache.items
  }
  if (curseForgeCategoriesRequest) return curseForgeCategoriesRequest
  curseForgeCategoriesRequest = (async () => {
    const apiKey = getCurseForgeApiKey()
    if (!apiKey) throw new Error('CurseForge no configurado.')
    const res = await fetchWithTimeout(CURSEFORGE_API + '/categories?gameId=' + CURSEFORGE_GAME_ID_MINECRAFT, {
      headers: { 'x-api-key': apiKey, Accept: 'application/json', 'User-Agent': MODRINTH_USER_AGENT }
    })
    const body = await res.json().catch(() => ({}))
    if (!res.ok) throw new Error(body.error || body.message || 'CurseForge no respondió bien.')
    const items = (Array.isArray(body.data) ? body.data : [])
      .filter(c => c && !c.isClass)
      .map(c => ({ id: c.id, name: c.name, slug: c.slug || '', classId: c.classId }))
    curseForgeCategoriesCache = { items, cachedAt: Date.now() }
    return items
  })()
  try {
    return await curseForgeCategoriesRequest
  } finally {
    curseForgeCategoriesRequest = null
  }
}

// Detalle completo CurseForge: misma descripción HTML que la página + screenshots.
async function getCurseForgeProjectDetails(payload = {}) {
  const apiKey = getCurseForgeApiKey()
  if (!apiKey) throw new Error('CurseForge no configurado.')
  const modId = requireTrimmedString(payload.modId || payload.projectId, 'Proyecto CurseForge', 128)
  const headers = { 'x-api-key': apiKey, Accept: 'application/json', 'User-Agent': MODRINTH_USER_AGENT }
  const [infoRes, descRes] = await Promise.all([
    fetchWithTimeout(CURSEFORGE_API + '/mods/' + encodeURIComponent(modId), { headers }),
    fetchWithTimeout(CURSEFORGE_API + '/mods/' + encodeURIComponent(modId) + '/description', { headers })
  ])
  const info = await infoRes.json().catch(() => ({}))
  const desc = await descRes.json().catch(() => ({}))
  if (!infoRes.ok) throw new Error(info.error || info.message || 'CurseForge no respondió bien.')
  const m = info.data || {}
  const gameVersions = [...new Set((m.latestFilesIndexes || []).map(f => f.gameVersion).filter(v => /^\d+\.\d+/.test(String(v || ''))))].slice(0, 8)
  return {
    provider: 'curseforge',
    projectId: String(m.id || modId),
    slug: m.slug || String(modId),
    title: m.name || '',
    summary: m.summary || '',
    author: (m.authors && m.authors[0] && m.authors[0].name) || 'CurseForge',
    iconUrl: (m.logo && (m.logo.thumbnailUrl || m.logo.url)) || '',
    projectType: curseClassIdToType[m.classId] || 'mod',
    downloads: m.downloadCount || 0,
    follows: 0,
    categories: (m.categories || []).map(c => c.name),
    loaders: [],
    gameVersions,
    side: { client: '', server: '' },
    datePublished: m.dateCreated || '',
    dateUpdated: m.dateModified || '',
    license: '',
    links: { website: (m.links && m.links.websiteUrl) || '' },
    donations: [],
    creators: (m.authors || []).map(a => ({
      name: (a && a.name) || '',
      avatarUrl: '',
      role: 'author',
      url: (a && a.url) || ''
    })).filter(c => c.name),
    gallery: (Array.isArray(m.screenshots) ? m.screenshots : [])
      .filter(s => s && (s.url || s.thumbnailUrl))
      .map(s => ({ url: s.url || s.thumbnailUrl, thumb: s.thumbnailUrl || s.url, title: s.title || '' })),
    bodyHtml: typeof desc.data === 'string' ? desc.data : '',
    url: (m.links && m.links.websiteUrl) || ('https://www.curseforge.com/minecraft/mc-mods/' + encodeURIComponent(m.slug || modId))
  }
}

async function getCurseForgeFiles(payload = {}) {
  const apiKey = getCurseForgeApiKey()
  if (!apiKey) throw new Error('CurseForge no configurado.')
  const modId = requireTrimmedString(payload.modId || payload.projectId, 'Proyecto CurseForge', 128)
  const gameVersion = normalizeVersion(payload.gameVersion) || undefined
  const modLoaderType = getCurseForgeModLoaderType(payload.loader)
  const url = new URL(CURSEFORGE_API + '/mods/' + encodeURIComponent(modId) + '/files')
  if (gameVersion) url.searchParams.set('gameVersion', gameVersion)
  if (modLoaderType) url.searchParams.set('modLoaderType', String(modLoaderType))
  url.searchParams.set('pageSize', '20')
  url.searchParams.set('index', '0')
  const res = await fetchWithTimeout(url, { headers: { 'x-api-key': apiKey, Accept: 'application/json', 'User-Agent': MODRINTH_USER_AGENT } })
  const body = await res.json().catch(() => ({}))
  if (!res.ok) throw new Error(body.error || body.message || 'CurseForge no respondió bien.')
  return Array.isArray(body.data) ? body.data : []
}

function pickCurseForgePrimaryFile(files) {
  const list = Array.isArray(files) ? files : []
  if (!list.length) throw new Error('CurseForge: sin archivos compatibles.')
  // Solo se puede descargar lo que la API expone con URL: elegir el más
  // nuevo ENTRE los descargables, no a ciegas. Si ninguno tiene URL, el
  // autor desactivó la distribución por API (allowModDistribution=false) y
  // ningún reintento lo va a arreglar: error específico y accionable.
  const downloadable = list.filter(f => f && f.downloadUrl)
  if (!downloadable.length) throw new Error('CurseForge: el proyecto no permite descargas por API (solo web).')
  let best = downloadable[0]
  let bestTs = Date.parse(best.datePublished || best.fileDate || '') || 0
  for (const f of downloadable) {
    const ts = Date.parse(f.datePublished || f.fileDate || '') || 0
    if (ts > bestTs) { best = f; bestTs = ts }
  }
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
    downloads: file.downloadCount || 0,
    date_published: file.datePublished || file.fileDate || '',
    // webOnly: el autor desactivó la distribución por API y CurseForge no da
    // downloadUrl. La UI lo marca "Solo web" en vez de dejar intentar en vano.
    webOnly: !file.downloadUrl,
    files: [{ filename: file.fileName, url: file.downloadUrl }],
    _cfRaw: file
  }
}

module.exports = {
  getCurseForgeCategories,
  getCurseForgeFiles,
  getCurseForgeProjectDetails,
  normalizeCurseForgeFileForUI,
  pickCurseForgePrimaryFile,
  searchCurseForge
}

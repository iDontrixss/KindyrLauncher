// Kindyr Launcher - Copyright (C) 2026 iDontrixss
// This program is free software: you can redistribute it and/or modify
// it under the terms of the GNU General Public License as published by
// the Free Software Foundation, either version 3 of the License, or
// (at your option) any later version.
// SPDX-License-Identifier: GPL-3.0-or-later

const fs = require('fs')
const path = require('path')
const state = require('../state')
const { MODRINTH_API, MODRINTH_USER_AGENT } = require('../constants')
const { getInstanceDir } = require('../instances-store')
const { requireTrimmedString } = require('../ipc-guard')
const { fetchWithTimeout } = require('../http')

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

function normalizeDiscoverCategory(value) {
  const clean = String(value || '').toLowerCase().trim()
  if (!clean || !/^[a-z0-9][a-z0-9-]*$/.test(clean) || clean.length > 40) return ''
  return clean
}

function buildModrinthFacets(payload) {
  const type = String(payload.type || 'all')
  const facets = [...((Object.hasOwn(modrinthTypeFilters, type) && modrinthTypeFilters[type]) || [])]
  const version = normalizeVersion(payload.version)
  if (version) facets.push(['versions:' + version])
  const loader = String(payload.loader || '').toLowerCase()
  const loaderAllowedTypes = new Set(['mod', 'all'])
  if (['fabric', 'forge', 'neoforge', 'quilt'].includes(loader) && loaderAllowedTypes.has(type)) {
    facets.push(['categories:' + loader])
  }
  const category = normalizeDiscoverCategory(payload.category)
  if (category) facets.push(['categories:' + category])
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
  const category = normalizeDiscoverCategory(payload.category)
  if (category) parts.push(`categories = ${category}`)
  return parts.join(' AND ')
}

let modrinthSearchAbortController = null

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
    const response = await fetchWithTimeout(url, {
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

let markedInstancePromise = null
async function renderMarkdownToHtml(markdown) {
  const text = String(markdown || '')
  if (!text.trim()) return ''
  if (!markedInstancePromise) markedInstancePromise = import('marked').catch(() => null)
  const mod = await markedInstancePromise
  try {
    if (mod && mod.marked && typeof mod.marked.parse === 'function') return String(await mod.marked.parse(text))
    if (mod && typeof mod.parse === 'function') return String(await mod.parse(text))
  } catch {}
  return ''
}

// Detalle completo Modrinth: mismo contenido que la página (body markdown -> HTML, galería).
async function getModrinthProjectDetails(payload = {}) {
  const projectId = requireTrimmedString(payload.projectId || payload.slug, 'Proyecto', 128)
  const res = await fetchWithTimeout(MODRINTH_API + '/project/' + encodeURIComponent(projectId), {
    headers: { 'User-Agent': MODRINTH_USER_AGENT, Accept: 'application/json' }
  })
  const body = await res.json().catch(() => ({}))
  if (!res.ok) throw new Error(body.description || body.error || 'Modrinth no respondió bien.')
  const gallery = (Array.isArray(body.gallery) ? body.gallery : [])
    .filter(g => g && g.url)
    .sort((a, b) => (a.ordering || 0) - (b.ordering || 0))
    .map(g => ({ url: g.url, title: g.title || '', description: g.description || '' }))
  const donations = (Array.isArray(body.donation_urls) ? body.donation_urls : [])
    .filter(d => d && d.url)
    .map(d => ({ platform: d.platform || '', url: d.url }))
  let creators = []
  try {
    if (body.team) {
      const teamRes = await fetchWithTimeout(MODRINTH_API + '/team/' + encodeURIComponent(body.team) + '/members', {
        headers: { 'User-Agent': MODRINTH_USER_AGENT, Accept: 'application/json' }
      })
      const teamBody = await teamRes.json().catch(() => ([]))
      if (teamRes.ok && Array.isArray(teamBody)) {
        creators = teamBody.map(m => ({
          name: (m.user && m.user.username) || '',
          avatarUrl: (m.user && m.user.avatar_url) || '',
          role: m.role || '',
          url: (m.user && m.user.username) ? 'https://modrinth.com/user/' + m.user.username : ''
        })).filter(c => c.name)
      }
    }
  } catch {}
  return {
    provider: 'modrinth',
    projectId: body.id || projectId,
    slug: body.slug || projectId,
    title: body.title || '',
    summary: body.description || '',
    iconUrl: body.icon_url || '',
    projectType: body.project_type || 'mod',
    downloads: body.downloads || 0,
    follows: body.followers || 0,
    categories: [...(body.categories || []), ...(body.additional_categories || [])],
    loaders: body.loaders || [],
    gameVersions: body.game_versions || [],
    side: { client: body.client_side || '', server: body.server_side || '' },
    datePublished: body.published || '',
    dateUpdated: body.updated || '',
    license: (body.license && (body.license.id || body.license.name)) || '',
    links: {
      discord: body.discord_url || '',
      source: body.source_url || '',
      issues: body.issues_url || '',
      wiki: body.wiki_url || ''
    },
    donations,
    creators,
    gallery,
    bodyHtml: await renderMarkdownToHtml(body.body),
    url: 'https://modrinth.com/' + encodeURIComponent(body.project_type || 'mod') + '/' + encodeURIComponent(body.slug || projectId)
  }
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
  const response = await fetchWithTimeout(url, {
    headers: {
      'User-Agent': MODRINTH_USER_AGENT,
      Accept: 'application/json'
    }
  })
  const body = await response.json().catch(() => ({}))
  if (!response.ok) throw new Error(body.description || body.error || 'Modrinth no respondio bien.')
  return body
}

async function getModrinthVersions(payload = {}) {
  const projectId = requireTrimmedString(payload.projectId || payload.slug, 'Proyecto', 128)
  const gameVersion = normalizeVersion(payload.gameVersion)
  const loader = String(payload.loader || '').trim().slice(0, 32)
  const versionType = String(payload.versionType || '').trim().slice(0, 32)
  const params = { include_changelog: 'false' }
  if (gameVersion) params.game_versions = JSON.stringify([gameVersion])
  if (loader && loader !== 'any') params.loaders = JSON.stringify([loader])
  const versions = await modrinthJson('/project/' + encodeURIComponent(projectId) + '/version', params)
  const list = Array.isArray(versions) ? versions : []
  return versionType ? list.filter(version => version.version_type === versionType) : list
}

// Detalle de UNA versión Modrinth con changelog (la lista lo trae apagado).
async function getModrinthVersionDetails(payload = {}) {
  const versionId = requireTrimmedString(payload.versionId, 'Versión', 128)
  const body = await modrinthJson('/version/' + encodeURIComponent(versionId))
  if (!body || !body.id) throw new Error('Versión no encontrada.')
  return {
    id: body.id,
    projectId: body.project_id || '',
    name: body.name || '',
    versionNumber: body.version_number || body.name || '',
    versionType: body.version_type || 'release',
    changelog: body.changelog || '',
    changelogHtml: await renderMarkdownToHtml(body.changelog || ''),
    datePublished: body.published || body.date_published || '',
    gameVersions: Array.isArray(body.game_versions) ? body.game_versions : [],
    loaders: Array.isArray(body.loaders) ? body.loaders : [],
    files: (Array.isArray(body.files) ? body.files : []).map(f => ({
      filename: f.filename || '',
      url: f.url || '',
      size: f.size || 0,
      primary: Boolean(f.primary)
    }))
  }
}

// Ficha liviana de proyecto (para identificar archivos sin meta: pfp/título/autor).
async function getModrinthProjectMini(projectId) {
  const clean = String(projectId || '').trim()
  if (!clean) throw new Error('Proyecto inválido.')
  const res = await fetchWithTimeout(MODRINTH_API + '/project/' + encodeURIComponent(clean), {
    headers: { 'User-Agent': MODRINTH_USER_AGENT, Accept: 'application/json' }
  })
  const body = await res.json().catch(() => ({}))
  if (!res.ok) throw new Error(body.description || body.error || 'Modrinth no respondió bien.')
  let author = ''
  try {
    if (body.team) {
      const teamRes = await fetchWithTimeout(MODRINTH_API + '/team/' + encodeURIComponent(body.team) + '/members', {
        headers: { 'User-Agent': MODRINTH_USER_AGENT, Accept: 'application/json' }
      })
      const teamBody = await teamRes.json().catch(() => ([]))
      if (teamRes.ok && Array.isArray(teamBody) && teamBody.length) {
        author = (teamBody[0].user && teamBody[0].user.username) || ''
      }
    }
  } catch {}
  return {
    projectId: body.id || clean,
    slug: body.slug || clean,
    title: body.title || clean,
    iconUrl: body.icon_url || '',
    author,
    projectType: body.project_type || 'mod',
    url: 'https://modrinth.com/' + encodeURIComponent(body.project_type || 'mod') + '/' + encodeURIComponent(body.slug || clean)
  }
}

// Rescate cross-provider: si un proyecto de CurseForge bloqueó la
// distribución por API pero el MISMO proyecto existe en Modrinth, devuelve su
// ficha lista para instalar. Verificación estricta (slug exacto + tipo +
// título + autor del team): ante cualquier duda devuelve found:false y se
// sigue el camino manual. Nunca sustituye en silencio: el renderer siempre
// pide confirmación mostrando ambas fuentes.
const modrinthTwinCache = new Map()

function normalizeTwinText(value) {
  return String(value || '').toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g, '').replace(/[^a-z0-9]+/g, ' ').trim()
}

async function getModrinthTwinProject(payload = {}) {
  const cfId = String(payload.modId || '').trim().slice(0, 64)
  const slug = String(payload.slug || '').trim().slice(0, 128)
  const cfKind = String(payload.kind || 'mod').toLowerCase().slice(0, 32)
  if (!slug) return { found: false, reason: 'no-slug' }
  // Modpacks cambian la semántica (crean instancia) y plugins no tienen tipo
  // espejo en Modrinth: fuera de alcance, camino manual.
  if (cfKind === 'modpack' || cfKind === 'plugin') return { found: false, reason: 'kind' }
  const cacheKey = cfId || slug
  if (modrinthTwinCache.has(cacheKey)) return modrinthTwinCache.get(cacheKey)
  const result = await findModrinthTwinUncached({ slug, cfKind, title: String(payload.title || '').slice(0, 256), author: String(payload.author || '').slice(0, 128) })
  modrinthTwinCache.set(cacheKey, result)
  return result
}

async function findModrinthTwinUncached({ slug, cfKind, title, author }) {
  // Paso 1: slug exacto (barato y preciso).
  let lastReason = 'missing'
  try {
    const res = await fetchWithTimeout(MODRINTH_API + '/project/' + encodeURIComponent(slug), {
      headers: { 'User-Agent': MODRINTH_USER_AGENT, Accept: 'application/json' }
    })
    if (res.ok) {
      const body = await res.json().catch(() => null)
      if (body && body.id) {
        const verified = await verifyTwinCandidate(body, { cfKind, title, author })
        if (verified.ok) return twinFoundResult(body, verified.author)
        lastReason = verified.reason || lastReason
      }
    }
  } catch {
    return { found: false, reason: 'network' }
  }
  // Paso 2: el slug no coincide exacto (nombres ligeramente distintos):
  // búsqueda por título y misma verificación estricta (tipo + título + autor).
  // El autor es el ancla: sin match de autor no hay gemelo.
  try {
    const res = await fetchWithTimeout(MODRINTH_API + '/search?query=' + encodeURIComponent(String(title || slug)) + '&limit=10', {
      headers: { 'User-Agent': MODRINTH_USER_AGENT, Accept: 'application/json' }
    })
    if (!res.ok) return { found: false, reason: 'missing' }
    const searchBody = await res.json().catch(() => ({}))
    const hits = (searchBody && Array.isArray(searchBody.hits) ? searchBody.hits : []).slice(0, 8)
    for (const hit of hits) {
      const hitSlug = hit && hit.slug
      if (!hitSlug || hitSlug === slug) continue // el exacto ya se evaluó
      let full = null
      try {
        const hitRes = await fetchWithTimeout(MODRINTH_API + '/project/' + encodeURIComponent(hitSlug), {
          headers: { 'User-Agent': MODRINTH_USER_AGENT, Accept: 'application/json' }
        })
        if (!hitRes.ok) continue
        full = await hitRes.json().catch(() => null)
      } catch { continue }
      if (!full || !full.id) continue
      const verified = await verifyTwinCandidate(full, { cfKind, title, author })
      if (verified.ok) return twinFoundResult(full, verified.author)
      lastReason = verified.reason || lastReason
    }
  } catch {
    return { found: false, reason: 'network' }
  }
  return { found: false, reason: lastReason }
}

// Similitud de títulos (normalizados): contenencia o solape de tokens.
// Tolera sufijos tipo "Reimagined", "RP", "+FA version" sin abrir falsos positivos.
function titlesSimilar(a, b) {
  const x = normalizeTwinText(a)
  const y = normalizeTwinText(b)
  if (!x || !y) return false
  if (x.includes(y) || y.includes(x)) return true
  const tx = new Set(x.split(' ').filter(w => w.length >= 3))
  const ty = new Set(y.split(' ').filter(w => w.length >= 3))
  if (!tx.size || !ty.size) return false
  let shared = 0
  for (const w of tx) if (ty.has(w)) shared++
  return shared >= 2 && shared / Math.min(tx.size, ty.size) >= 0.5
}

async function verifyTwinCandidate(body, { cfKind, title, author }) {
  // Tipo: los datapacks de Modrinth son project_type mod + categoría datapack.
  const mrCats = [...(body.categories || []), ...(body.additional_categories || [])]
  const mrKind = mrCats.includes('datapack') ? 'datapack' : String(body.project_type || '')
  if (mrKind !== cfKind) return { ok: false, reason: 'kind' }
  if (!titlesSimilar(title, body.title)) return { ok: false, reason: 'title' }
  // Autor: username del team de Modrinth igual al autor de CurseForge.
  const wantAuthor = normalizeTwinText(author)
  let twinAuthor = ''
  try {
    if (wantAuthor && body.team) {
      const teamRes = await fetchWithTimeout(MODRINTH_API + '/team/' + encodeURIComponent(body.team) + '/members', {
        headers: { 'User-Agent': MODRINTH_USER_AGENT, Accept: 'application/json' }
      })
      const teamBody = await teamRes.json().catch(() => ([]))
      if (teamRes.ok && Array.isArray(teamBody)) {
        const match = teamBody.find(m => normalizeTwinText(m.user && m.user.username) === wantAuthor)
        if (match && match.user) twinAuthor = match.user.username || ''
      }
    }
  } catch {}
  if (!twinAuthor) return { ok: false, reason: 'author' }
  return { ok: true, author: twinAuthor }
}

function twinFoundResult(body, twinAuthor) {
  const mrCats = [...(body.categories || []), ...(body.additional_categories || [])]
  return {
    found: true,
    author: twinAuthor,
    project: {
      project_id: body.id,
      id: body.id,
      slug: body.slug,
      title: body.title,
      project_type: body.project_type,
      categories: mrCats,
      display_categories: mrCats,
      icon_url: body.icon_url || '',
      downloads: body.downloads || 0,
      follows: body.followers || 0
    }
  }
}

module.exports = {
  getModrinthProjectDetails,
  getModrinthProjectMini,
  getModrinthTwinProject,
  getModrinthVersionDetails,
  getModrinthVersions,
  loadModrinthFilesMeta,
  modrinthJson,
  normalizeDiscoverQuery,
  normalizeVersion,
  persistModrinthFileMeta,
  resolveModrinthFileUrlFallback,
  saveModrinthFilesMetaAtomic,
  searchModrinth
}

// Kindyr Launcher - Copyright (C) 2026 iDontrixss
// This program is free software: you can redistribute it and/or modify
// it under the terms of the GNU General Public License as published by
// the Free Software Foundation, either version 3 of the License, or
// (at your option) any later version.
// SPDX-License-Identifier: GPL-3.0-or-later

const state = require('./state')
const { FABRIC_META, FORGE_MAVEN_METADATA, MAX_LOADER_VERSION_CACHE_ENTRIES, MOJANG_VERSION_MANIFEST, NEOFORGE_MAVEN_METADATA, QUILT_META, VERSION_CACHE_TTL_MS } = require('./constants')
const { fetchJsonCached, fetchTextCached } = require('./http')
const { getSemver } = require('./lazy-deps')

const loaderVersionRequests = new Map()

function scheduleVersionCacheCleanup() {
  if (state.versionCacheCleanupTimer) {
    clearTimeout(state.versionCacheCleanupTimer)
    state.versionCacheCleanupTimer = null
  }

  const cachedAtValues = [
    state.minecraftVersionCache?.cachedAt,
    ...Object.values(state.loaderVersionCache).map(entry => entry?.cachedAt)
  ].filter(Number.isFinite)

  if (cachedAtValues.length === 0) return

  const nextExpiry = Math.min(...cachedAtValues) + VERSION_CACHE_TTL_MS
  state.versionCacheCleanupTimer = setTimeout(() => {
    state.versionCacheCleanupTimer = null
    pruneVersionCaches()
  }, Math.max(1, nextExpiry - Date.now()))
  state.versionCacheCleanupTimer.unref?.()
}

function pruneVersionCaches(now = Date.now()) {
  if (state.minecraftVersionCache && now - state.minecraftVersionCache.cachedAt >= VERSION_CACHE_TTL_MS) {
    state.minecraftVersionCache = null
  }

  for (const [key, entry] of Object.entries(state.loaderVersionCache)) {
    if (!entry || !Number.isFinite(entry.cachedAt) || now - entry.cachedAt >= VERSION_CACHE_TTL_MS) {
      delete state.loaderVersionCache[key]
    }
  }

  const loaderEntries = Object.entries(state.loaderVersionCache)
    .sort(([, left], [, right]) => right.cachedAt - left.cachedAt)
  for (const [key] of loaderEntries.slice(MAX_LOADER_VERSION_CACHE_ENTRIES)) {
    delete state.loaderVersionCache[key]
  }

  scheduleVersionCacheCleanup()
}

async function getMojangVersions() {
  pruneVersionCaches()
  if (state.minecraftVersionCache) {
    return state.minecraftVersionCache.versions
  }
  if (state.minecraftVersionRequest) return state.minecraftVersionRequest

  state.minecraftVersionRequest = (async () => {
    const manifest = await fetchJsonCached(MOJANG_VERSION_MANIFEST, { cacheKey: 'mojang-manifest-v2', ttlMs: VERSION_CACHE_TTL_MS })
    const versions = (manifest.versions || []).map(item => ({
      id: item.id,
      type: item.type,
      releaseTime: item.releaseTime,
      url: item.url
    }))
    state.minecraftVersionCache = { cachedAt: Date.now(), versions }
    pruneVersionCaches()
    return versions
  })()

  try {
    return await state.minecraftVersionRequest
  } finally {
    state.minecraftVersionRequest = null
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
  const cached = state.loaderVersionCache[key]
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
      const latestLoaders = sortLoaderVersionsAscending(normalizeLoaderListEntries(loaders))
      const latestStableLoader = [...latestLoaders].reverse().find(item => item.stable)
      const latestLoader = latestStableLoader?.version || latestLoaders[latestLoaders.length - 1]?.version || ''
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

    state.loaderVersionCache[key] = { cachedAt: Date.now(), versions }
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
  const loader = String(payload.loader || 'vanilla').slice(0, 32)
  const includeSnapshots = Boolean(payload.includeSnapshots)
  const query = String(payload.query || '').trim().toLowerCase().slice(0, 80)
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

function normalizeLoaderListEntries(raw) {
  const arr = Array.isArray(raw) ? raw : []
  const out = []
  for (const item of arr) {
    const node = item && typeof item === 'object'
      ? (item.loader && typeof item.loader === 'object' ? item.loader : item)
      : null
    const version = String(node?.version || '').trim()
    if (!version) continue
    out.push({ version, stable: node.stable === true })
  }
  return out
}

function sortLoaderVersionsAscending(list) {
  const arr = Array.isArray(list) ? [...list] : []
  let semver = null
  try { semver = getSemver() } catch {}
  const rank = (entry) => {
    if (semver) {
      const valid = semver.valid(String(entry.version || '').trim(), { loose: true })
      if (valid) return 'v:' + valid
    }
    return 's:' + String(entry.version || '')
  }
  const keyOf = (entry) => rank(entry)
  arr.sort((a, b) => {
    const ka = keyOf(a)
    const kb = keyOf(b)
    if (ka[0] === 'v' && kb[0] === 'v') {
      try { return semver.compare(ka.slice(2), kb.slice(2)) } catch {}
    }
    return ka < kb ? -1 : ka > kb ? 1 : 0
  })
  const seen = new Set()
  return arr.filter(entry => {
    if (seen.has(entry.version)) return false
    seen.add(entry.version)
    return true
  })
}

// Lista versiones del loader para un Minecraft dado (canal Estable/Mas reciente).
// Devuelve [{ version, stable }] en orden ascendente.
async function listLoaderVersions(loader, minecraftVersion) {
  const name = String(loader || '').trim()
  const mc = String(minecraftVersion || '').trim()
  if (!['fabric', 'forge', 'neoforge', 'quilt'].includes(name)) return []
  if (!mc) return []
  if (name === 'fabric' || name === 'quilt') {
    const baseUrl = name === 'fabric' ? FABRIC_META : QUILT_META
    const cachePrefix = name === 'fabric' ? 'fabric' : 'quilt'
    const [games, loaders] = await Promise.all([
      fetchJsonCached(baseUrl + '/versions/game', { cacheKey: cachePrefix + '-game', ttlMs: VERSION_CACHE_TTL_MS }),
      fetchJsonCached(baseUrl + '/versions/loader/' + encodeURIComponent(mc), { cacheKey: cachePrefix + '-loader-' + mc, ttlMs: VERSION_CACHE_TTL_MS }).catch(() => (
        fetchJsonCached(baseUrl + '/versions/loader', { cacheKey: cachePrefix + '-loader', ttlMs: VERSION_CACHE_TTL_MS })
      ))
    ])
    const gameOk = Array.isArray(games)
      ? games.some(game => String(game?.version || game?.id || game || '').trim() === mc)
      : true
    if (!gameOk) return []
    const sorted = sortLoaderVersionsAscending(normalizeLoaderListEntries(loaders))
    if (!sorted.length) return []
    if (!sorted.some(item => item.stable)) sorted[sorted.length - 1].stable = true
    return sorted
  }
  const supported = await getSupportedMinecraftVersions(name)
  let raws = []
  if (name === 'forge') {
    raws = supported
      .filter(item => item.minecraft === mc && item.loaderVersion)
      .map(item => ({ version: item.loaderVersion, stable: false, raw: item.raw }))
  } else {
    const prefix = getNeoForgePrefix(mc)
    raws = supported
      .filter(item => item.minecraftPrefix === prefix && item.loaderVersion)
      .map(item => ({ version: item.loaderVersion, stable: false, raw: item.raw }))
  }
  const sorted = sortLoaderVersionsAscending(raws)
  if (!sorted.length) return []
  sorted[sorted.length - 1].stable = true
  return sorted
}

module.exports = {
  getSupportedMinecraftVersions,
  listCreatableInstances,
  listLoaderVersions,
  loaderVersionRequests,
  pickLatestLoaderVersion
}

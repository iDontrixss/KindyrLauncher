// Kindyr Launcher - Copyright (C) 2026 iDontrixss
// This program is free software: you can redistribute it and/or modify
// it under the terms of the GNU General Public License as published by
// the Free Software Foundation, either version 3 of the License, or
// (at your option) any later version.
// SPDX-License-Identifier: GPL-3.0-or-later

const fs = require('fs')
const path = require('path')
const { getKindyrDataRoot, getLauncherCacheDir } = require('./paths')
const { formatBytes, yieldToEventLoop } = require('./util')

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

module.exports = {
  getDirSizeBytes,
  getStorageInfo,
  invalidateStorageCache
}

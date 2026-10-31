// Kindyr Launcher - Copyright (C) 2026 iDontrixss
// This program is free software: you can redistribute it and/or modify
// it under the terms of the GNU General Public License as published by
// the Free Software Foundation, either version 3 of the License, or
// (at your option) any later version.
// SPDX-License-Identifier: GPL-3.0-or-later

const fs = require('fs')
const path = require('path')
const { MODRINTH_USER_AGENT, VERSION_CACHE_TTL_MS } = require('./constants')
const { getLauncherCacheDir } = require('./paths')

// KL-15: toda llamada a APIs lleva timeout. Sin él, un servidor que acepta la
// conexión y no responde dejaba la UI esperando hasta los límites internos de
// undici (~5 min). Las descargas grandes NO usan esto (main/download.js tiene
// su propio control de cancelación y reanudación).
const API_TIMEOUT_MS = 30_000

function fetchWithTimeout(url, init = {}, timeoutMs = API_TIMEOUT_MS) {
  const timeout = AbortSignal.timeout(timeoutMs)
  const signal = init && init.signal ? AbortSignal.any([init.signal, timeout]) : timeout
  return fetch(url, { ...init, signal })
}

async function fetchJson(url) {
  const response = await fetch(url, {
    headers: {
      'User-Agent': MODRINTH_USER_AGENT,
      Accept: 'application/json'
    },
    // Sin timeout un stall de red colgaba el flujo para siempre (p. ej. import
    // de modpack esperando versiones del loader). 45s es holgado para APIs.
    signal: AbortSignal.timeout(45000)
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
    },
    signal: AbortSignal.timeout(45000)
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
    const response = await fetchWithTimeout(url, { headers })
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
    const response = await fetchWithTimeout(url, { headers })
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

module.exports = {
  API_TIMEOUT_MS,
  fetchJsonCached,
  fetchTextCached,
  fetchWithTimeout
}

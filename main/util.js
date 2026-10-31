// Kindyr Launcher - Copyright (C) 2026 iDontrixss
// This program is free software: you can redistribute it and/or modify
// it under the terms of the GNU General Public License as published by
// the Free Software Foundation, either version 3 of the License, or
// (at your option) any later version.
// SPDX-License-Identifier: GPL-3.0-or-later

const fs = require('fs')
const path = require('path')
const crypto = require('crypto')

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

// Ruta absoluta en un disco local. Rechaza UNC (\\host\share, //host/share) y
// rutas de dispositivo (\\?\, \\.\): solo tocarlas ya dispara una conexión SMB
// (filtra credenciales NTLM) y permite leer o ejecutar desde otra máquina.
function isLocalAbsolutePath(value) {
  if (typeof value !== 'string' || !value || value.includes('\0')) return false
  const clean = value.trim()
  if (/^[\\/]{2}/.test(clean)) return false
  return path.isAbsolute(clean)
}

function safePath(root, relativePath) {
  const resolvedRoot = path.resolve(root)
  const destination = path.resolve(resolvedRoot, relativePath)
  if (destination === resolvedRoot || !destination.startsWith(resolvedRoot + path.sep)) {
    throw new Error(`Ruta fuera de la instancia: ${relativePath}`)
  }
  return destination
}

function sha256OfFile(filePath) {
  return new Promise((resolve, reject) => {
    const hash = crypto.createHash('sha256')
    const stream = fs.createReadStream(filePath)
    stream.on('data', chunk => hash.update(chunk))
    stream.on('end', () => resolve(hash.digest('hex')))
    stream.on('error', reject)
  })
}

async function yieldToEventLoop() {
  return new Promise(resolve => setImmediate(resolve))
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

module.exports = {
  formatBytes,
  isLocalAbsolutePath,
  isSafeRelativePath,
  listFiles,
  runWithConcurrency,
  safeFileName,
  safePath,
  sanitizeFileName,
  sanitizeInstanceId,
  sha256OfFile,
  yieldToEventLoop
}

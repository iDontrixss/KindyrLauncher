const crypto = require('crypto')
const fs = require('fs')

function isReservedWindowsDeviceName(component) {
  const base = String(component).split('.')[0].split(':')[0].toLowerCase()
  return [
    'con', 'prn', 'aux', 'nul',
    'com1', 'com2', 'com3', 'com4', 'com5', 'com6', 'com7', 'com8', 'com9',
    'lpt1', 'lpt2', 'lpt3', 'lpt4', 'lpt5', 'lpt6', 'lpt7', 'lpt8', 'lpt9',
    'conin$', 'conout$'
  ].includes(base)
}

function normalizeMrpackPath(value) {
  const raw = String(value || '')
  if (!raw || raw.includes('\0')) {
    throw new Error(`Ruta insegura en modpack: ${value}`)
  }
  if (raw.includes('\\')) {
    throw new Error(`Ruta insegura en modpack: ${value}`)
  }
  if (raw.startsWith('/') || /^[a-zA-Z]:/.test(raw) || raw.startsWith('//')) {
    throw new Error(`Ruta insegura en modpack: ${value}`)
  }
  const parts = raw.split('/')
  for (const part of parts) {
    if (part === '') {
      throw new Error(`Ruta insegura en modpack: ${value}`)
    }
    if (part === '..') {
      throw new Error(`Ruta insegura en modpack: ${value}`)
    }
    if (part === '.') continue
    if (isReservedWindowsDeviceName(part)) {
      throw new Error(`Ruta insegura en modpack: ${value}`)
    }
  }
  const safe = parts.filter(part => part && part !== '.').join('/')
  if (!safe) throw new Error(`Ruta vacía en modpack: ${value}`)
  return safe
}

function normalizeMrpackDownloads(values) {
  const urls = []
  for (const value of Array.isArray(values) ? values : []) {
    try {
      const url = new URL(String(value || ''))
      if (url.protocol !== 'https:' || url.username || url.password) continue
      urls.push(url.toString())
    } catch {}
  }
  return urls
}

function getClientMrpackFiles(index = {}) {
  const accepted = []
  const rejected = []
  let unsupported = 0
  for (const file of Array.isArray(index.files) ? index.files : []) {
    if (file?.env?.client === 'unsupported') {
      unsupported++
      continue
    }
    try {
      const normalized = {
        ...file,
        path: normalizeMrpackPath(file.path),
        downloads: normalizeMrpackDownloads(file.downloads)
      }
      if (!normalized.downloads.length) throw new Error('no tiene una URL HTTPS descargable')
      const hasHash = (typeof file.hashes?.sha1 === 'string' && file.hashes.sha1) || (typeof file.hashes?.sha512 === 'string' && file.hashes.sha512)
      if (!hasHash) throw new Error('no tiene hash verificable (sha1/sha512 requerido)')
      accepted.push(normalized)
    } catch (error) {
      rejected.push({ path: String(file?.path || '(sin ruta)'), error: error.message })
    }
  }
  return { accepted, rejected, unsupported }
}

function getPreferredHash(hashes = {}) {
  if (typeof hashes.sha1 === 'string' && hashes.sha1) return ['sha1', hashes.sha1.toLowerCase()]
  if (typeof hashes.sha512 === 'string' && hashes.sha512) return ['sha512', hashes.sha512.toLowerCase()]
  return null
}

function verifyMrpackFile(filePath, hashes) {
  const preferred = getPreferredHash(hashes)
  if (!preferred) return Promise.resolve(false)
  const [algorithm, expected] = preferred
  return new Promise(resolve => {
    const hash = crypto.createHash(algorithm)
    const stream = fs.createReadStream(filePath)
    stream.on('data', chunk => hash.update(chunk))
    stream.on('end', () => resolve(hash.digest('hex') === expected))
    stream.on('error', () => resolve(false))
  })
}

module.exports = {
  getClientMrpackFiles,
  normalizeMrpackPath,
  verifyMrpackFile
}

const crypto = require('crypto')
const fs = require('fs')

function normalizeMrpackPath(value) {
  const normalized = String(value || '').replace(/\\/g, '/')
  const parts = normalized.split('/')
  if (
    !normalized ||
    normalized.includes('\0') ||
    normalized.startsWith('/') ||
    /^[a-zA-Z]:/.test(normalized) ||
    parts.includes('..')
  ) {
    throw new Error(`Ruta insegura en modpack: ${value}`)
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
      accepted.push(normalized)
    } catch (error) {
      rejected.push({ path: String(file?.path || '(sin ruta)'), error: error.message })
    }
  }
  return { accepted, rejected, unsupported }
}

function getPreferredHash(hashes = {}) {
  if (typeof hashes.sha512 === 'string' && hashes.sha512) return ['sha512', hashes.sha512.toLowerCase()]
  if (typeof hashes.sha1 === 'string' && hashes.sha1) return ['sha1', hashes.sha1.toLowerCase()]
  return null
}

function verifyMrpackFile(filePath, hashes) {
  const preferred = getPreferredHash(hashes)
  if (!preferred) return Promise.resolve(true)
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

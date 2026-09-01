const fs = require('fs')
const path = require('path')
const { Transform } = require('stream')
const { pipeline } = require('stream/promises')
const { open, openEntryReadStream, walkEntriesGenerator } = require('@xmcl/unzip')
const { ZipFile } = require('yazl')

const DEFAULT_MAX_ENTRIES = 100000
const DEFAULT_MAX_ENTRY_BYTES = 512 * 1024 * 1024
const DEFAULT_MAX_TOTAL_BYTES = 4 * 1024 * 1024 * 1024

function normalizeZipPath(value) {
  const normalized = String(value || '').replace(/\\/g, '/')
  const parts = normalized.split('/')
  if (
    !normalized ||
    normalized.includes('\0') ||
    normalized.startsWith('/') ||
    /^[a-zA-Z]:/.test(normalized) ||
    parts.includes('..')
  ) {
    throw new Error(`Ruta insegura dentro del ZIP: ${value}`)
  }
  return parts.filter(part => part && part !== '.').join('/')
}

function isZipSymlink(entry) {
  const unixMode = (entry.externalFileAttributes >>> 16) & 0o170000
  return unixMode === 0o120000
}

async function withZip(archivePath, callback) {
  const zip = await open(archivePath, { lazyEntries: true, autoClose: false, strictFileNames: true })
  try {
    return await callback(zip)
  } finally {
    try { zip.close() } catch {}
  }
}

async function readStreamBounded(stream, maxBytes) {
  const chunks = []
  let total = 0
  for await (const chunk of stream) {
    total += chunk.length
    if (total > maxBytes) {
      stream.destroy()
      throw new Error(`La entrada ZIP supera el límite de ${maxBytes} bytes.`)
    }
    chunks.push(chunk)
  }
  return Buffer.concat(chunks, total)
}

async function readZipEntryBuffer(archivePath, entryName, maxBytes = 10 * 1024 * 1024) {
  const wanted = normalizeZipPath(entryName)
  return withZip(archivePath, async zip => {
    let visited = 0
    for await (const entry of walkEntriesGenerator(zip)) {
      if (++visited > DEFAULT_MAX_ENTRIES) throw new Error('El ZIP contiene demasiadas entradas.')
      const name = normalizeZipPath(entry.fileName)
      if (name !== wanted) continue
      if (isZipSymlink(entry)) throw new Error(`La entrada ZIP no puede ser un enlace: ${name}`)
      if (entry.uncompressedSize > maxBytes) throw new Error(`La entrada ZIP supera el límite de ${maxBytes} bytes.`)
      return readStreamBounded(await openEntryReadStream(zip, entry), maxBytes)
    }
    return null
  })
}

async function streamEntryToFile(zip, entry, destination, maxBytes) {
  if (entry.uncompressedSize > maxBytes) {
    throw new Error(`La entrada ZIP supera el límite permitido: ${entry.fileName}`)
  }
  let total = 0
  const limiter = new Transform({
    transform(chunk, _encoding, callback) {
      total += chunk.length
      if (total > maxBytes) callback(new Error(`La entrada ZIP supera el límite permitido: ${entry.fileName}`))
      else callback(null, chunk)
    }
  })
  const source = await openEntryReadStream(zip, entry)
  const temporaryPath = `${destination}.part-${process.pid}-${Date.now()}`
  fs.mkdirSync(path.dirname(destination), { recursive: true })
  try {
    await pipeline(source, limiter, fs.createWriteStream(temporaryPath, { mode: 0o600 }))
    await fs.promises.rename(temporaryPath, destination)
  } catch (error) {
    await fs.promises.rm(temporaryPath, { force: true }).catch(() => {})
    throw error
  }
  return total
}

async function extractZipEntries(archivePath, destinationRoot, options = {}) {
  const maxEntries = options.maxEntries || DEFAULT_MAX_ENTRIES
  const maxEntryBytes = options.maxEntryBytes || DEFAULT_MAX_ENTRY_BYTES
  const maxTotalBytes = options.maxTotalBytes || DEFAULT_MAX_TOTAL_BYTES
  const mapEntry = options.mapEntry || (name => name)
  const extracted = []
  let totalBytes = 0
  await withZip(archivePath, async zip => {
    let visited = 0
    for await (const entry of walkEntriesGenerator(zip)) {
      if (++visited > maxEntries) throw new Error('El ZIP contiene demasiadas entradas.')
      const sourceName = normalizeZipPath(entry.fileName)
      if (entry.fileName.endsWith('/')) continue
      if (isZipSymlink(entry)) throw new Error(`El ZIP contiene un enlace no permitido: ${sourceName}`)
      const mapped = mapEntry(sourceName, entry)
      if (!mapped) continue
      const relativePath = normalizeZipPath(mapped)
      if (totalBytes + entry.uncompressedSize > maxTotalBytes) {
        throw new Error('El contenido extraído supera el límite total permitido.')
      }
      const destination = path.resolve(destinationRoot, relativePath)
      const root = path.resolve(destinationRoot) + path.sep
      if (!destination.startsWith(root)) throw new Error(`Path traversal detectado: ${sourceName}`)
      const remainingBytes = maxTotalBytes - totalBytes
      const bytes = await streamEntryToFile(zip, entry, destination, Math.min(maxEntryBytes, remainingBytes))
      totalBytes += bytes
      extracted.push({ sourceName, relativePath, bytes })
    }
  })
  return { entries: extracted, totalBytes }
}

async function writeZip(destination, configure) {
  const zip = new ZipFile()
  await configure({
    addBuffer: (buffer, name) => zip.addBuffer(Buffer.from(buffer), normalizeZipPath(name)),
    addFile: (filePath, name) => zip.addFile(filePath, normalizeZipPath(name))
  })
  const temporaryPath = `${destination}.part-${process.pid}-${Date.now()}`
  fs.mkdirSync(path.dirname(destination), { recursive: true })
  try {
    const completed = pipeline(zip.outputStream, fs.createWriteStream(temporaryPath))
    zip.end()
    await completed
    try {
      await fs.promises.rename(temporaryPath, destination)
    } catch (error) {
      if (!['EEXIST', 'EPERM'].includes(error.code)) throw error
      await fs.promises.rm(destination, { force: true })
      await fs.promises.rename(temporaryPath, destination)
    }
  } catch (error) {
    await fs.promises.rm(temporaryPath, { force: true }).catch(() => {})
    throw error
  }
}

module.exports = {
  extractZipEntries,
  normalizeZipPath,
  readZipEntryBuffer,
  writeZip
}

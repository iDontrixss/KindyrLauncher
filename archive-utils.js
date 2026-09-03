const crypto = require('crypto')
const fs = require('fs')
const path = require('path')
const { Transform } = require('stream')
const { pipeline } = require('stream/promises')
const { open, openEntryReadStream, walkEntriesGenerator } = require('@xmcl/unzip')
const { ZipFile } = require('yazl')

const DEFAULT_MAX_ENTRIES = 100000
const DEFAULT_MAX_ENTRY_BYTES = 512 * 1024 * 1024
const DEFAULT_MAX_TOTAL_BYTES = 4 * 1024 * 1024 * 1024

function isReservedWindowsDeviceNameZip(component) {
  const base = String(component).split('.')[0].split(':')[0].toLowerCase()
  return [
    'con', 'prn', 'aux', 'nul',
    'com1', 'com2', 'com3', 'com4', 'com5', 'com6', 'com7', 'com8', 'com9',
    'lpt1', 'lpt2', 'lpt3', 'lpt4', 'lpt5', 'lpt6', 'lpt7', 'lpt8', 'lpt9',
    'conin$', 'conout$'
  ].includes(base)
}

function normalizeZipPath(value) {
  const raw = String(value || '')
  if (!raw || raw.includes('\0')) {
    throw new Error(`Ruta insegura dentro del ZIP: ${value}`)
  }
  if (raw.includes('\\')) {
    throw new Error(`Ruta insegura dentro del ZIP: ${value}`)
  }
  if (raw.startsWith('/') || /^[a-zA-Z]:/.test(raw) || raw.startsWith('//')) {
    throw new Error(`Ruta insegura dentro del ZIP: ${value}`)
  }
  const parts = raw.split('/')
  for (const part of parts) {
    if (part === '') {
      throw new Error(`Ruta insegura dentro del ZIP: ${value}`)
    }
    if (part === '..') {
      throw new Error(`Ruta insegura dentro del ZIP: ${value}`)
    }
    if (part === '.') continue
    if (isReservedWindowsDeviceNameZip(part)) {
      throw new Error(`Ruta insegura dentro del ZIP: ${value}`)
    }
  }
  return parts.filter(part => part && part !== '.').join('/')
}

function isZipSymlink(entry) {
  const unixMode = (entry.externalFileAttributes >>> 16) & 0o170000
  return unixMode === 0o120000
}

function diagnoseZipFile(archivePath, originalError) {
  let stat = null
  try { stat = fs.statSync(archivePath) } catch {}
  const size = stat ? stat.size : -1
  if (size === 0) {
    return new Error(`Archivo .mrpack vacío (0 bytes). Descarga incompleta o corrupta: ${archivePath}. Re-descarga el modpack.`)
  }
  if (size > 0 && size < 22) {
    return new Error(`Archivo .mrpack truncado (${size} bytes, mínimo 22). Re-descarga el modpack. Detalle: ${originalError.message}`)
  }
  let headerHex = '??'
  let headerText = ''
  let fd = null
  try {
    fd = fs.openSync(archivePath, 'r')
    const head = Buffer.alloc(Math.min(16, size))
    fs.readSync(fd, head, 0, head.length, 0)
    headerHex = head.toString('hex')
    headerText = head.toString('utf8', 0, Math.min(8, head.length)).replace(/[^\x20-\x7E]/g, '.')
  } catch {} finally {
    if (fd !== null) try { fs.closeSync(fd) } catch {}
  }
  const isHtml = headerText.trimStart().startsWith('<') || headerHex.startsWith('3c')
  const isZip = headerHex.startsWith('504b0304') || headerHex.startsWith('504b0506') || headerHex.startsWith('504b0708')
  if (isHtml) {
    return new Error(`El archivo no es un ZIP válido (cabecera ${headerHex} = "${headerText}", ${size} bytes). Parece HTML (página de error/Cloudflare). Descarga el .mrpack directo de Modrinth con el navegador y reintenta.`)
  }
  if (!isZip) {
    return new Error(`El archivo no es un ZIP válido (cabecera 0x${headerHex} "${headerText}", ${size} bytes). Archivo corrupto o formato incorrecto (¿es un .zip de CurseForge renombrado?). Detalle: ${originalError.message}`)
  }
  return new Error(`${originalError.message} (tamaño ${size} bytes, cabecera 0x${headerHex}). Archivo .mrpack corrupto o truncado. Re-descarga el modpack y verifica que abra con 7-Zip/WinRAR.`)
}

async function withZip(archivePath, callback) {
  let zip
  try {
    zip = await open(archivePath, { lazyEntries: true, autoClose: false, strictFileNames: true })
  } catch (error) {
    const msg = String(error && error.message || '')
    const isEocd = /end of central directory/i.test(msg)
    if (isEocd) {
      const diagnosed = diagnoseZipFile(archivePath, error)
      // Fallback: intenta leer como Buffer (evita bug de fd-slicer) — limitado a 100MiB para no OOM
      let fallbackSucceeded = false
      let fallbackResult
      try {
        const stat = fs.statSync(archivePath)
        if (stat.size >= 22 && stat.size <= 100 * 1024 * 1024) {
          const buffer = fs.readFileSync(archivePath)
          if (buffer.length >= 22 && buffer[0] === 0x50 && buffer[1] === 0x4b) {
            const fallbackZip = await open(buffer, { lazyEntries: true, autoClose: false, strictFileNames: true })
            try {
              fallbackResult = await callback(fallbackZip)
              fallbackSucceeded = true
            } finally {
              try { fallbackZip.close() } catch {}
            }
          }
        }
      } catch {}
      if (fallbackSucceeded) return fallbackResult
      throw diagnosed
    }
    throw error
  }
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
      if (entry.fileName.endsWith('/')) continue
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
      if (entry.fileName.endsWith('/')) continue
      const sourceName = normalizeZipPath(entry.fileName)
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
  const randomSuffix = crypto.randomUUID ? crypto.randomUUID() : `${process.pid}-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`
  const temporaryPath = `${destination}.part-${randomSuffix}`
  fs.mkdirSync(path.dirname(destination), { recursive: true })
  try {
    const completed = pipeline(zip.outputStream, fs.createWriteStream(temporaryPath))
    zip.end()
    await completed
    try {
      await fs.promises.rename(temporaryPath, destination)
    } catch (error) {
      if (!['EEXIST', 'EPERM', 'EXDEV'].includes(error.code)) throw error
      if (error.code === 'EXDEV') {
        await fs.promises.copyFile(temporaryPath, destination)
        await fs.promises.rm(temporaryPath, { force: true }).catch(() => {})
        return
      }
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

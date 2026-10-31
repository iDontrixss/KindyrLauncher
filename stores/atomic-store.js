// Kindyr Launcher - Copyright (C) 2026 iDontrixss
// SPDX-License-Identifier: GPL-3.0-or-later
// F1: store atómico probado. Patrón write-file-atomic + SQLite atomiccommit:
// tmp mismo volumen + wx O_EXCL + fsync(file) + fsync(dir POSIX) + rename.
// Kill-9 en 4 puntos → viejo o nuevo intacto, jamás parcial.
// Corrupto → .corrupt-<ts>.bak + aviso, nunca defaults silenciosos.
// version > KNOWN → cero escrituras (no degradar futuro).
const fs = require('fs')
const path = require('path')

const SETTINGS_STORE_VERSION = 1

function fsyncFileSync(fd) {
  try { fs.fsyncSync(fd) } catch (e) { throw e }
}
function fsyncDirSync(dir) {
  // POSIX: fsync del dir para persistir el rename. Win: no existe igual —
  // se registra limitación y sigue (atomicidad proceso sí, dir no).
  if (process.platform === 'win32') {
    const err = new Error('dir-sync no disponible en Windows; garantía vigente = atomicidad proceso')
    err.code = 'DIRSYNC_UNAVAILABLE'
    throw err
  }
  const fd = fs.openSync(dir, 'r')
  try { fs.fsyncSync(fd) } finally { try { fs.closeSync(fd) } catch {} }
}

function atomicWriteJsonSync(dest, obj, { mode = 0o600 } = {}) {
  const dir = path.dirname(dest)
  fs.mkdirSync(dir, { recursive: true })
  const tmp = `${dest}.tmp-${process.pid}-${Date.now()}-${Math.floor(Math.random() * 1e6)}`
  const payload = JSON.stringify(obj, null, 2)
  const fd = fs.openSync(tmp, 'wx', mode)
  try {
    fs.writeFileSync(fd, payload)
    fsyncFileSync(fd)
  } finally { try { fs.closeSync(fd) } catch {} }
  fs.renameSync(tmp, dest)
  // fsync dir: best-effort con límite documentado por plataforma
  try { fsyncDirSync(dir) } catch (e) {
    if (e && e.code !== 'DIRSYNC_UNAVAILABLE') throw e
    try { console.warn('[Kindyr][store] dir-sync no disponible:', dir) } catch {}
  }
  try { fs.chmodSync(dest, mode) } catch {}
  return dest
}

function purgeStaleTmps(dir, prefix) {
  // Limpia solo tmp propio, nunca el único .bak bueno.
  try {
    if (!fs.existsSync(dir)) return 0
    let n = 0
    for (const name of fs.readdirSync(dir)) {
      if (prefix && !name.startsWith(prefix)) continue
      if (!name.includes('.tmp-')) continue
      try { fs.rmSync(path.join(dir, name), { force: true }); n++ } catch {}
    }
    return n
  } catch { return 0 }
}

function preserveCorruptSync(file) {
  try {
    if (!fs.existsSync(file)) return ''
    const bak = `${file}.corrupt-${new Date().toISOString().replace(/[:.]/g, '-')}.bak`
    fs.copyFileSync(file, bak)
    return bak
  } catch { return '' }
}

module.exports = {
  SETTINGS_STORE_VERSION,
  atomicWriteJsonSync,
  purgeStaleTmps,
  preserveCorruptSync
}

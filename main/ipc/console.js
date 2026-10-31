// Kindyr Launcher - Copyright (C) 2026 iDontrixss
// This program is free software: you can redistribute it and/or modify
// it under the terms of the GNU General Public License as published by
// the Free Software Foundation, either version 3 of the License, or
// (at your option) any later version.
// SPDX-License-Identifier: GPL-3.0-or-later

const { ipcMain } = require('electron')
const fs = require('fs')
const path = require('path')
const { getInstance, getLauncherLogsDir, getMinecraftRoot } = require('../instances-store')

// Consola read-only del Centro de control: cola del launcher-log SIN filtrar
// (el panel legacy colapsa espacios, trunca a 180 chars y topea líneas).
// Lectura incremental por byte para polling en vivo + cola inicial acotada.
const INSTANCE_CONSOLE_TAIL_BYTES = 256 * 1024
const INSTANCE_CONSOLE_CHUNK_BYTES = 512 * 1024

ipcMain.handle('read-instance-console', (_event, payload = {}) => {
  try {
    const instance = getInstance(payload.instanceId)
    if (!instance) throw new Error('No existe la instancia seleccionada.')
    const file = path.join(getLauncherLogsDir(instance.id), 'latest.log')
    if (!fs.existsSync(file)) return { ok: true, exists: false, text: '', nextByte: 0, size: 0, reset: true }
    const size = fs.statSync(file).size
    // sizeOnly: drenar hasta EOF sin traer texto (limpiar vista al cerrar).
    if (payload.sizeOnly) return { ok: true, exists: true, text: '', nextByte: size, size, reset: false }
    const fromByte = Math.max(0, Math.floor(Number(payload.fromByte) || 0))
    // Log recreado/rotado desde la última lectura: empezar de cero.
    const reset = fromByte > size
    const base = reset ? 0 : fromByte
    let start = base
    if (start === 0 && size > INSTANCE_CONSOLE_TAIL_BYTES) start = size - INSTANCE_CONSOLE_TAIL_BYTES
    if (size - start > INSTANCE_CONSOLE_CHUNK_BYTES) start = size - INSTANCE_CONSOLE_CHUNK_BYTES
    if (start >= size) return { ok: true, exists: true, text: '', nextByte: size, size, reset }
    const fd = fs.openSync(file, 'r')
    try {
      const buf = Buffer.alloc(size - start)
      fs.readSync(fd, buf, 0, buf.length, start)
      let text = buf.toString('utf8')
      // No partir una línea a la mitad al recortar por el inicio.
      if (start > base) {
        const nl = text.indexOf('\n')
        text = nl >= 0 ? text.slice(nl + 1) : ''
      }
      return { ok: true, exists: true, text, nextByte: size, size, reset }
    } finally {
      fs.closeSync(fd)
    }
  } catch (error) {
    return { ok: false, error: error.message || String(error) }
  }
})

// F1 huérfana: consola sin pipes. Minecraft escribe logs/latest.log en su
// carpeta; el tail por archivo + fs.watch del renderer sigue vivo aunque el
// launcher haya cerrado y reabierto. Pérdida documentada: mensajes JVM muy
// tempranos previos al log.
ipcMain.handle('read-minecraft-log-file', (_event, payload = {}) => {
  try {
    const instance = getInstance(payload.instanceId)
    if (!instance) throw new Error('No existe la instancia seleccionada.')
    const file = path.join(getMinecraftRoot(instance.id), 'logs', 'latest.log')
    if (!fs.existsSync(file)) return { ok: true, exists: false, text: '', nextByte: 0, size: 0, reset: true }
    const size = fs.statSync(file).size
    if (payload.sizeOnly) return { ok: true, exists: true, text: '', nextByte: size, size, reset: false }
    const fromByte = Math.max(0, Math.floor(Number(payload.fromByte) || 0))
    const reset = fromByte > size
    const base = reset ? 0 : fromByte
    let start = base
    if (start === 0 && size > INSTANCE_CONSOLE_TAIL_BYTES) start = size - INSTANCE_CONSOLE_TAIL_BYTES
    if (size - start > INSTANCE_CONSOLE_CHUNK_BYTES) start = size - INSTANCE_CONSOLE_CHUNK_BYTES
    if (start >= size) return { ok: true, exists: true, text: '', nextByte: size, size, reset }
    const fd = fs.openSync(file, 'r')
    try {
      const buf = Buffer.alloc(size - start)
      fs.readSync(fd, buf, 0, buf.length, start)
      let text = buf.toString('utf8')
      if (start > base) {
        const nl = text.indexOf('\n')
        text = nl >= 0 ? text.slice(nl + 1) : ''
      }
      return { ok: true, exists: true, text, nextByte: size, size, reset }
    } finally {
      fs.closeSync(fd)
    }
  } catch (error) {
    return { ok: false, error: error.message || String(error) }
  }
})

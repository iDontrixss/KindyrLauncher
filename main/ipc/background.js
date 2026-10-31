// Kindyr Launcher - Copyright (C) 2026 iDontrixss
// This program is free software: you can redistribute it and/or modify
// it under the terms of the GNU General Public License as published by
// the Free Software Foundation, either version 3 of the License, or
// (at your option) any later version.
// SPDX-License-Identifier: GPL-3.0-or-later

const { ipcMain, dialog } = require('electron')
const fs = require('fs')
const path = require('path')
const state = require('../state')
const { getKindyrDataRoot } = require('../paths')
const { getBackgroundImagePath } = require('../settings')

const MAX_BACKGROUND_IMAGE_BYTES = 15 * 1024 * 1024
const MAX_BACKGROUND_VIDEO_BYTES = 50 * 1024 * 1024
const MAX_BACKGROUND_VIDEO_DURATION_SEC = 30
const ALLOWED_BACKGROUND_IMAGE_EXTS = new Set(['.png', '.jpg', '.jpeg', '.webp', '.gif'])
const ALLOWED_BACKGROUND_VIDEO_EXTS = new Set(['.mp4', '.webm', '.ogg', '.mov', '.avi', '.mkv'])

// KL-09: un ejecutable dentro de app.asar no se puede lanzar con spawn
// (ENOENT). electron-builder lo deja en app.asar.unpacked (build.asarUnpack);
// aquí se apunta a esa copia real.
function resolveFfmpegPath() {
  const bundled = require('ffmpeg-static')
  if (!bundled) throw new Error('ffmpeg no está disponible para esta plataforma.')
  return String(bundled).replace(/app\.asar([\\/])/, 'app.asar.unpacked$1')
}

function convertVideoToH264(srcPath, destPath) {
  return new Promise((resolve, reject) => {
    const ffmpegPath = resolveFfmpegPath()
    const { spawn } = require('child_process')

    const args = [
      '-i', srcPath,
      '-t', String(MAX_BACKGROUND_VIDEO_DURATION_SEC),
      '-c:v', 'libx264',
      '-preset', 'fast',
      '-crf', '23',
      '-vf', 'scale=1280:-2:flags=lanczos',
      '-c:a', 'aac',
      '-movflags', '+faststart',
      '-y',
      destPath
    ]

    const proc = spawn(ffmpegPath, args)
    let timedOut = false
    const timeout = setTimeout(() => {
      timedOut = true
      try { proc.kill('SIGKILL') } catch {}
      reject(new Error('La conversión de video excedió el tiempo límite (60s).'))
    }, 60_000)
    timeout.unref?.()

    proc.on('close', (code) => {
      clearTimeout(timeout)
      if (timedOut) return
      if (code === 0) {
        resolve()
      } else {
        reject(new Error('ffmpeg salió con código ' + code))
      }
    })

    proc.on('error', (err) => {
      clearTimeout(timeout)
      reject(err)
    })
  })
}

ipcMain.handle('settings-pick-background', async () => {
  try {
    return await pickBackgroundFile()
  } catch (error) {
    console.error('[settings-pick-background]', error)
    return { ok: false, error: error?.message || String(error) }
  }
})

async function pickBackgroundFile() {
  let result
  try {
    result = await dialog.showOpenDialog(state.mainWindow, {
      title: 'Elegir imagen o video de fondo',
      properties: ['openFile'],
      filters: [
        { name: 'Imagen', extensions: ['png', 'jpg', 'jpeg', 'webp', 'gif'] },
        { name: 'Video', extensions: ['mp4', 'webm', 'ogg', 'mov', 'avi', 'mkv'] }
      ]
    })
  } catch (error) {
    throw new Error('No se pudo abrir el selector de archivos: ' + (error?.message || String(error)))
  }
  if (result.canceled || !result.filePaths.length) return { ok: false, cancelled: true }

  const srcPath = result.filePaths[0]
  let stat
  try {
    stat = fs.statSync(srcPath)
    if (!stat.isFile()) throw new Error('No es un archivo válido.')
  } catch (e) {
    return { ok: false, error: 'No se pudo leer el archivo: ' + (e.message || String(e)) }
  }
  const ext = path.extname(srcPath).toLowerCase()
  const isVideo = ALLOWED_BACKGROUND_VIDEO_EXTS.has(ext)
  const isImage = ALLOWED_BACKGROUND_IMAGE_EXTS.has(ext)
  if (!isVideo && !isImage) {
    return { ok: false, error: 'Formato no soportado. Usa PNG/JPG/WebP/GIF o MP4/WebM/OGG/MOV/AVI/MKV.' }
  }
  const maxBytes = isVideo ? MAX_BACKGROUND_VIDEO_BYTES : MAX_BACKGROUND_IMAGE_BYTES
  if (stat.size > maxBytes) {
    return { ok: false, error: `El archivo supera el límite de ${Math.round(maxBytes / 1024 / 1024)} MiB.` }
  }
  try {
    fs.mkdirSync(getKindyrDataRoot(), { recursive: true })
  } catch (e) {
    return { ok: false, error: 'No se pudo crear la carpeta de datos: ' + (e.message || String(e)) }
  }

  if (isVideo) {
    const target = path.join(getKindyrDataRoot(), 'background.mp4')
    try {
      await convertVideoToH264(srcPath, target)
      return { ok: true, path: target }
    } catch (err) {
      return { ok: false, error: 'No se pudo convertir el video: ' + err.message }
    }
  } else {
    const target = path.join(getKindyrDataRoot(), 'background' + ext)
    try {
      // validate image is decodable
      const buf = fs.readFileSync(srcPath)
      if (buf.length > MAX_BACKGROUND_IMAGE_BYTES) throw new Error('Imagen demasiado grande.')
      // basic magic check: PNG/JPG/GIF/WebP
      fs.copyFileSync(srcPath, target)
      return { ok: true, path: target }
    } catch (err) {
      return { ok: false, error: 'No se pudo copiar la imagen: ' + (err.message || String(err)) }
    }
  }
}

ipcMain.on('log-info', (_e, msg) => {})
ipcMain.on('log-error', (_e, msg) => {})

ipcMain.handle('settings-get-background', () => {
  const bg = getBackgroundImagePath()
  return { ok: true, path: bg }
})

ipcMain.handle('settings-clear-background', () => {
  const dataRoot = getKindyrDataRoot()
  for (const ext of [...ALLOWED_BACKGROUND_IMAGE_EXTS, ...ALLOWED_BACKGROUND_VIDEO_EXTS, '.png', '.mp4']) {
    const target = path.join(dataRoot, 'background' + ext)
    try { if (fs.existsSync(target)) fs.unlinkSync(target) } catch {}
  }
  // legacy single file
  try { if (fs.existsSync(path.join(dataRoot, 'background.png'))) fs.unlinkSync(path.join(dataRoot, 'background.png')) } catch {}
  try { if (fs.existsSync(path.join(dataRoot, 'background.mp4'))) fs.unlinkSync(path.join(dataRoot, 'background.mp4')) } catch {}
  return { ok: true }
})

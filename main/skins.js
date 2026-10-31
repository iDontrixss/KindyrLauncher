// Kindyr Launcher - Copyright (C) 2026 iDontrixss
// This program is free software: you can redistribute it and/or modify
// it under the terms of the GNU General Public License as published by
// the Free Software Foundation, either version 3 of the License, or
// (at your option) any later version.
// SPDX-License-Identifier: GPL-3.0-or-later

const { ipcMain, nativeImage } = require('electron')
const fs = require('fs')
const path = require('path')
const { MAX_SKIN_BYTES, sanitizeSkinName, validateSkinPng, validateSkinSourceUrl } = require('../skin-security')
const { getActiveMicrosoftAccount } = require('./accounts')
const { MODRINTH_USER_AGENT } = require('./constants')
const { getKindyrDataRoot } = require('./paths')

ipcMain.handle('skin-save-local', async (_event, skinUrl, skinName, skinBytes) => {
  try {
    const bytes = await resolveSkinBytes(skinUrl, skinBytes)
    const skinsDirectory = path.join(getKindyrDataRoot(), 'skins')
    const fileName = `${sanitizeSkinName(skinName)}-${Date.now()}.png`
    const destination = path.join(skinsDirectory, fileName)
    fs.mkdirSync(skinsDirectory, { recursive: true, mode: 0o700 })
    fs.writeFileSync(destination, bytes, { mode: 0o600, flag: 'wx' })
    return { ok: true, name: fileName }
  } catch (err) {
    return { ok: false, error: err.message }
  }
})

async function uploadSkinToMinecraftWithRetry(skinBytes, model, accessToken, maxRetries = 3) {
  const transientCodes = [502, 503, 504, 429]
  let lastError = null

  for (let attempt = 0; attempt <= maxRetries; attempt++) {
    try {
      return await uploadSkinToMinecraft(skinBytes, model, accessToken)
    } catch (err) {
      lastError = err

      const isTransient = transientCodes.includes(err.statusCode)

      if (!isTransient || attempt === maxRetries) {
        throw err
      }

      let delayMs = Math.pow(2, attempt) * 1000 // 1s, 2s, 4s

      if (err.statusCode === 429 && err.retryAfter) {
        delayMs = parseInt(err.retryAfter) * 1000
      }

      await new Promise(resolve => setTimeout(resolve, delayMs))
    }
  }

  throw lastError
}

ipcMain.handle('skin-apply-online', async (_event, skinUrl, model, skinBytes) => {
  try {
    const activeAccount = await getActiveMicrosoftAccount()
    if (!activeAccount?.access_token) return { ok: false, error: 'Iniciá sesión con Microsoft para aplicar una skin online.' }
    skinBytes = await resolveSkinBytes(skinUrl, skinBytes)
    const response = await uploadSkinToMinecraftWithRetry(skinBytes, model, activeAccount.access_token)
    return response
  } catch (err) {
    if (err.message === 'Authentication failed. Please log in again.') {
      try {
        const activeAccount = await getActiveMicrosoftAccount({ force: true })
        if (activeAccount?.access_token) {
          const retrySkinBytes = validateSkinPng(skinBytes)
          const response = await uploadSkinToMinecraftWithRetry(retrySkinBytes, model, activeAccount.access_token)
          return response
        }
      } catch (refreshErr) {
        return { ok: false, error: refreshErr.message || err.message }
      }
    }
    return { ok: false, error: err.message }
  }
})

async function resolveSkinBytes(skinUrl, skinBytes) {
  // S5/B2: skinBytes llega por IPC como array/Buffer. Medir ANTES de
  // Buffer.from: un array gigante agotaría memoria antes de que
  // validateSkinPng pudiera rechazarlo. El preload ya corta en 6 MiB; esta
  // es la barrera autoritativa en main (el preload puede bypasearse).
  if (skinBytes && skinBytes.length > MAX_SKIN_BYTES) {
    throw new Error('La skin supera el límite de 5 MiB.')
  }
  const bytes = validateSkinPng(skinBytes || await downloadUrlToBuffer(skinUrl))
  const image = nativeImage.createFromBuffer(bytes)
  const size = image.isEmpty() ? null : image.getSize()
  if (!size || size.width !== 64 || ![32, 64].includes(size.height)) {
    throw new Error('La skin no contiene una imagen PNG válida de 64×64 o 64×32 píxeles.')
  }
  return bytes
}

async function downloadUrlToBuffer(value, redirectCount = 0) {
  if (redirectCount > 3) throw new Error('La descarga de la skin tuvo demasiadas redirecciones.')
  const https = require('https')
  const url = validateSkinSourceUrl(value)

  return new Promise((resolve, reject) => {
    const req = https.get(url, {
      headers: { 'User-Agent': MODRINTH_USER_AGENT }
    }, (res) => {
      if ([301, 302, 307, 308].includes(res.statusCode)) {
        res.resume()
        if (!res.headers.location) return reject(new Error('La redirección de la skin no tiene destino.'))
        const redirected = new URL(res.headers.location, url)
        downloadUrlToBuffer(redirected, redirectCount + 1).then(resolve, reject)
        return
      }
      if (res.statusCode !== 200) {
        res.resume()
        reject(new Error(`No se pudo descargar la skin: HTTP ${res.statusCode}`))
        return
      }
      const declaredLength = Number(res.headers['content-length'] || 0)
      if (declaredLength > MAX_SKIN_BYTES) {
        res.destroy()
        reject(new Error('La skin supera el límite de 5 MiB.'))
        return
      }
      const chunks = []
      let totalBytes = 0
      res.on('data', (chunk) => {
        totalBytes += chunk.length
        if (totalBytes > MAX_SKIN_BYTES) {
          res.destroy(new Error('La skin supera el límite de 5 MiB.'))
          return
        }
        chunks.push(chunk)
      })
      res.on('end', () => {
        resolve(Buffer.concat(chunks, totalBytes))
      })
      res.on('error', reject)
    })
    req.setTimeout(15000, () => req.destroy(new Error('La descarga de la skin agotó el tiempo de espera.')))
    req.on('error', reject)
  })
}

async function uploadSkinToMinecraft(skinBytes, model, accessToken) {
  const https = require('https')

  const variant = model === 'slim' ? 'slim' : 'classic'

  const boundary = '----WebKitFormBoundary' + Math.random().toString(16).substr(2, 16)

  const variantPart = `--${boundary}\r\nContent-Disposition: form-data; name="variant"\r\n\r\n${variant}\r\n`

  const filePart = `--${boundary}\r\nContent-Disposition: form-data; name="file"; filename="skin.png"\r\nContent-Type: image/png\r\n\r\n`

  const closingPart = `\r\n--${boundary}--\r\n`

  const variantBuffer = Buffer.from(variantPart, 'utf8')
  const fileHeaderBuffer = Buffer.from(filePart, 'utf8')
  const closingBuffer = Buffer.from(closingPart, 'utf8')

  const bodyBuffer = Buffer.concat([variantBuffer, fileHeaderBuffer, skinBytes, closingBuffer])

  const options = {
    hostname: 'api.minecraftservices.com',
    port: 443,
    path: '/minecraft/profile/skins',
    method: 'POST',
    headers: {
      'Authorization': `Bearer ${accessToken}`,
      'Content-Type': `multipart/form-data; boundary=${boundary}`,
      'Content-Length': bodyBuffer.length
    }
  }

  return new Promise((resolve, reject) => {
    const req = https.request(options, (res) => {
      let body = ''
      res.on('data', (chunk) => { body += chunk })
      res.on('end', () => {
        if (res.statusCode === 200 || res.statusCode === 204) {
          resolve({ ok: true })
        } else if (res.statusCode === 401) {
          const error = new Error('Authentication failed. Please log in again.')
          error.statusCode = res.statusCode
          error.retryAfter = res.headers['retry-after'] || null
          reject(error)
        } else if (res.statusCode === 403) {
          const error = new Error('Forbidden. You may not have permission to change skins.')
          error.statusCode = res.statusCode
          error.retryAfter = res.headers['retry-after'] || null
          reject(error)
        } else if (res.statusCode === 404) {
          const error = new Error('Profile not found.')
          error.statusCode = res.statusCode
          error.retryAfter = res.headers['retry-after'] || null
          reject(error)
        } else {
          try {
            const errorData = JSON.parse(body)
            const error = new Error(errorData.error || errorData.message || `HTTP ${res.statusCode}`)
            error.statusCode = res.statusCode
            error.retryAfter = res.headers['retry-after'] || null
            reject(error)
          } catch {
            const error = new Error(`HTTP ${res.statusCode}: ${body}`)
            error.statusCode = res.statusCode
            error.retryAfter = res.headers['retry-after'] || null
            reject(error)
          }
        }
      })
    })

    req.on('error', (error) => {
      reject(error)
    })

    req.write(bodyBuffer)
    req.end()
  })
}

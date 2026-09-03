// Kindyr Launcher - Copyright (C) 2026 iDontrixss
// This program is free software: you can redistribute it and/or modify
// it under the terms of the GNU General Public License as published by
// the Free Software Foundation, either version 3 of the License, or
// (at your option) any later version.
// SPDX-License-Identifier: GPL-3.0-or-later

const MAX_SKIN_BYTES = 5 * 1024 * 1024
const ALLOWED_SKIN_HOSTS = new Set(['mc-heads.net', 'www.mc-heads.net'])

function validateSkinSourceUrl(value) {
  const url = new URL(String(value || ''))
  if (url.protocol !== 'https:' || !ALLOWED_SKIN_HOSTS.has(url.hostname.toLowerCase())) {
    throw new Error('La fuente de la skin no está permitida.')
  }
  return url
}

function validateSkinPng(value) {
  const bytes = Buffer.from(value || [])
  if (bytes.length === 0 || bytes.length > MAX_SKIN_BYTES) {
    throw new Error('La skin está vacía o supera el límite de 5 MiB.')
  }
  const pngSignature = Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a])
  if (bytes.length < 24 || !bytes.subarray(0, 8).equals(pngSignature)) {
    throw new Error('La skin debe ser un PNG válido.')
  }
  const width = bytes.readUInt32BE(16)
  const height = bytes.readUInt32BE(20)
  if (width !== 64 || ![32, 64].includes(height)) {
    throw new Error('La skin debe medir 64×64 o 64×32 píxeles.')
  }
  return bytes
}

function sanitizeSkinName(value) {
  const normalized = String(value || 'skin')
    .normalize('NFKD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/[^a-zA-Z0-9._-]+/g, '-')
    .replace(/^[.-]+|[.-]+$/g, '')
    .slice(0, 80)
  return normalized || 'skin'
}

module.exports = {
  MAX_SKIN_BYTES,
  sanitizeSkinName,
  validateSkinPng,
  validateSkinSourceUrl
}

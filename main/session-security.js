// Kindyr Launcher - Copyright (C) 2026 iDontrixss
// This program is free software: you can redistribute it and/or modify
// it under the terms of the GNU General Public License as published by
// the Free Software Foundation, either version 3 of the License, or
// (at your option) any later version.
// SPDX-License-Identifier: GPL-3.0-or-later

// KL-08: sin handler propio, Electron APRUEBA toda solicitud de permiso web
// (cámara, micrófono, ubicación, notificaciones, MIDI, HID/serial/USB...).
// La UI solo necesita escribir en el portapapeles (copiar consola/nombre de
// archivo), y solo desde páginas de la propia app.
const { session } = require('electron')

const ALLOWED_PERMISSIONS = new Set(['clipboard-sanitized-write'])

function isAppOrigin(url) {
  return String(url || '').startsWith('file://')
}

function isPermissionAllowed(permission, requestingUrl) {
  return ALLOWED_PERMISSIONS.has(String(permission)) && isAppOrigin(requestingUrl)
}

function hardenDefaultSession(target = session.defaultSession) {
  target.setPermissionRequestHandler((webContents, permission, callback, details) => {
    const url = (details && (details.requestingUrl || details.securityOrigin)) || (webContents && webContents.getURL())
    callback(isPermissionAllowed(permission, url))
  })
  target.setPermissionCheckHandler((_webContents, permission, requestingOrigin, details) => {
    const url = (details && (details.requestingUrl || details.securityOrigin)) || requestingOrigin
    return isPermissionAllowed(permission, url)
  })
  // Acceso a dispositivos (USB/HID/serial) siempre denegado.
  if (typeof target.setDevicePermissionHandler === 'function') target.setDevicePermissionHandler(() => false)
  // Nunca descargar archivos desde el renderer: las descargas legítimas las hace main.
  target.on('will-download', (event) => event.preventDefault())
}

module.exports = {
  hardenDefaultSession,
  isPermissionAllowed
}

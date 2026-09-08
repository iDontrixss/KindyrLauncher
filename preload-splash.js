// Kindyr Launcher - Copyright (C) 2026 iDontrixss
// This program is free software: you can redistribute it and/or modify
// it under the terms of the GNU General Public License as published by
// the Free Software Foundation, either version 3 of the License, or
// (at your option) any later version.
// SPDX-License-Identifier: GPL-3.0-or-later

const { contextBridge, ipcRenderer } = require('electron')

contextBridge.exposeInMainWorld('splashAPI', {
  onUpdateStatus: (callback) => {
    const listener = (_event, msg) => callback(msg)
    ipcRenderer.on('update-status', listener)
    return () => ipcRenderer.removeListener('update-status', listener)
  }
})

window.addEventListener('DOMContentLoaded', () => {
  const handler = (msg) => {
    const el = document.getElementById('splash-status')
    if (el) el.textContent = msg
  }
  if (window.splashAPI) window.splashAPI.onUpdateStatus(handler)
  else ipcRenderer.on('update-status', (_e, msg) => handler(msg))
})
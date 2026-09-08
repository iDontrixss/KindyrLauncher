// Kindyr Launcher - Copyright (C) 2026 iDontrixss
// This program is free software: you can redistribute it and/or modify
// it under the terms of the GNU General Public License as published by
// the Free Software Foundation, either version 3 of the License, or
// (at your option) any later version.
// SPDX-License-Identifier: GPL-3.0-or-later

const { contextBridge, ipcRenderer } = require('electron')

const ALLOWED_SEND = new Set(['minimize', 'maximize', 'close'])
const ALLOWED_INVOKE = new Set(['finish-onboarding', 'get-onboarding-settings', 'ms-login'])

contextBridge.exposeInMainWorld('electronAPI', {
  send: (channel, data) => {
    if (!ALLOWED_SEND.has(channel)) throw new Error(`IPC send not allowed: ${channel}`)
    return ipcRenderer.send(channel, data)
  },
  invoke: (channel, data) => {
    if (!ALLOWED_INVOKE.has(channel)) throw new Error(`IPC invoke not allowed: ${channel}`)
    return ipcRenderer.invoke(channel, data)
  }
})
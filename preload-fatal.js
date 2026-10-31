// Kindyr Launcher - Copyright (C) 2026 iDontrixss
// SPDX-License-Identifier: GPL-3.0-or-later

// Puente mínimo del diálogo fatal (fatal-dialog.html). Solo confirma la
// elección; el título/mensaje llegan por query como en update-confirmation.
const { contextBridge, ipcRenderer } = require('electron')

contextBridge.exposeInMainWorld('fatalAPI', {
  confirm: (choice) => ipcRenderer.invoke('fatal-choice', choice)
})

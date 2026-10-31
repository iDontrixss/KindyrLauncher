// Kindyr Launcher - Copyright (C) 2026 iDontrixss
// This program is free software: you can redistribute it and/or modify
// it under the terms of the GNU General Public License as published by
// the Free Software Foundation, either version 3 of the License, or
// (at your option) any later version.
// SPDX-License-Identifier: GPL-3.0-or-later

const { ipcMain, shell, dialog } = require('electron')
const { registerExternalLaunchersIpc } = require('../../external-launchers/ipc')
const { getKindyrDataRoot } = require('../paths')

// Importar desde otro launcher (nuevo; no toca el flujo import-mrpack).
// Detección/listado solo-lectura + copia con staging, progreso y cancelación.
registerExternalLaunchersIpc({ ipcMain, dialog, getDataRoot: getKindyrDataRoot })

ipcMain.handle('open-external-url', (_event, url) => {
  try {
    const parsed = new URL(String(url || ''))
    const host = parsed.hostname.toLowerCase()
    const allowed = ['modrinth.com', 'www.modrinth.com', 'curseforge.com', 'www.curseforge.com', 'legacy.curseforge.com', 'github.com', 'www.github.com']
    if (parsed.protocol !== 'https:' || !allowed.includes(host)) {
      return { ok: false, error: 'URL invalida.' }
    }
    shell.openExternal(parsed.toString())
    return { ok: true }
  } catch (error) {
    return { ok: false, error: error.message || String(error) }
  }
})

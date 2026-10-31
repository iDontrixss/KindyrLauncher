// Kindyr Launcher - Copyright (C) 2026 iDontrixss
// This program is free software: you can redistribute it and/or modify
// it under the terms of the GNU General Public License as published by
// the Free Software Foundation, either version 3 of the License, or
// (at your option) any later version.
// SPDX-License-Identifier: GPL-3.0-or-later

const { app } = require('electron')
const path = require('path')

function getKindyrDataRoot() {
  return path.join(app.getPath('appData'), 'KindyrLauncher')
}

function getLauncherCacheDir() {
  return path.join(getKindyrDataRoot(), 'cache')
}

module.exports = {
  getKindyrDataRoot,
  getLauncherCacheDir
}

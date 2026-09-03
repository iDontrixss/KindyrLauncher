// Kindyr Launcher - Copyright (C) 2026 iDontrixss
// This program is free software: you can redistribute it and/or modify
// it under the terms of the GNU General Public License as published by
// the Free Software Foundation, either version 3 of the License, or
// (at your option) any later version.
// SPDX-License-Identifier: GPL-3.0-or-later

const { contextBridge, ipcRenderer } = require('electron')

contextBridge.exposeInMainWorld('electronAPI', {
  updateConfirm: (accepted) => ipcRenderer.send('update-confirm', accepted)
})

contextBridge.exposeInMainWorld('kindyrAPI', {
  window: {
    minimize: () => ipcRenderer.send('minimize'),
    maximize: () => ipcRenderer.send('maximize'),
    close: () => ipcRenderer.send('close')
  },
  profile: {
    checkpoint: (label, renderer = null) => ipcRenderer.send('profile-checkpoint', { label, renderer })
  },
  log: {
  info: (msg) => ipcRenderer.send('log-info', msg),
  error: (msg) => ipcRenderer.send('log-error', msg)
},
  instances: {
    list: () => ipcRenderer.invoke('get-instances'),
    versions: (payload) => ipcRenderer.invoke('minecraft-versions', payload),
    create: (payload) => ipcRenderer.invoke('create-instance', payload),
    prepare: (instanceId) => ipcRenderer.invoke('prepare-instance', instanceId),
    prepareStatus: () => ipcRenderer.invoke('prepare-status'),
    getDataRoot: () => ipcRenderer.invoke('get-data-root'),
    openFolder: (instanceId) => ipcRenderer.invoke('open-instance-folder', instanceId),
    getDetails: (instanceId) => ipcRenderer.invoke('get-instance-details', instanceId),
    openTarget: (instanceId, target) => ipcRenderer.invoke('open-instance-target', instanceId, target),
    toggleMod: (instanceId, fileName) => ipcRenderer.invoke('toggle-instance-mod', instanceId, fileName),
    importMrpack: () => ipcRenderer.invoke('import-mrpack'),
    onImportProgress: (callback) => ipcRenderer.on('mrpack-progress', (_event, data) => callback(data)),
    offImportProgress: () => ipcRenderer.removeAllListeners('mrpack-progress'),
    exportMrpack: (instanceId) => ipcRenderer.invoke('export-mrpack', instanceId),
  },
  modrinth: {
    search: (payload) => ipcRenderer.invoke('modrinth-search', payload),
    versions: (payload) => ipcRenderer.invoke('modrinth-versions', payload),
    install: (payload) => ipcRenderer.invoke('modrinth-install', payload),
    installLatestRelease: (payload) => ipcRenderer.invoke('modrinth-install-latest-release', payload),
    openProject: (url) => ipcRenderer.invoke('open-external-url', url)
  },
  curseforge: {
    search: (payload) => ipcRenderer.invoke('curseforge-search', payload),
    versions: (payload) => ipcRenderer.invoke('curseforge-versions', payload),
    install: (payload) => ipcRenderer.invoke('curseforge-install', payload),
    installLatestRelease: (payload) => ipcRenderer.invoke('curseforge-install-latest-release', payload),
    status: () => ipcRenderer.invoke('curseforge-status'),
    setKey: (apiKey) => ipcRenderer.invoke('curseforge-set-key', apiKey),
    openProject: (url) => ipcRenderer.invoke('open-external-url', url)
  },
  launcher: {
  launch: (payload) => ipcRenderer.invoke('launch-game', payload),
  kill: () => ipcRenderer.invoke('kill-minecraft'),
  status: () => ipcRenderer.invoke('mc-status'),
  onStatus: (callback) => {
    const listener = (_event, status) => callback(status)
    ipcRenderer.on('launcher-status', listener)
    return () => ipcRenderer.removeListener('launcher-status', listener)
  }
},
  settings: {
     getJavaInstalls: () => ipcRenderer.invoke('settings-get-java'),
     saveResources: (payload) => ipcRenderer.invoke('settings-save-resources', payload),
     setJavaPath: (payload) => ipcRenderer.invoke('settings-set-java-path', payload),
     browseJava: () => ipcRenderer.invoke('settings-browse-java'),
     detectJava: (major) => ipcRenderer.invoke('settings-detect-java', major),
     installJava: (major) => ipcRenderer.invoke('settings-install-java', major),
     getStorage: () => {
       return ipcRenderer.invoke('settings-get-storage')
       
     },
     purgeCache: async () => {
       try {
         return await ipcRenderer.invoke('settings-purge-cache')
       } catch (error) {
         return { ok: false, error: error?.message || String(error) }
       }
     },
     openDataRoot: () => ipcRenderer.invoke('settings-open-data-root'),
     pickBackground: () => ipcRenderer.invoke('settings-pick-background'),
     getBackground: () => ipcRenderer.invoke('settings-get-background'),
     clearBackground: () => ipcRenderer.invoke('settings-clear-background'),
     onStatus: (callback) => {
       const listener = (_event, status) => callback(status)
       ipcRenderer.on('settings-status', listener)
       return () => ipcRenderer.removeListener('settings-status', listener)
     }
  },
  updater: {
     getVersion: () => ipcRenderer.invoke('get-app-version'),
     getPreviousVersions: () => ipcRenderer.invoke('get-previous-versions'),
     rollback: (tag) => ipcRenderer.invoke('rollback-to-version', tag),
     getDowngradeTarget: () => ipcRenderer.invoke('get-downgrade-target'),
     downgradeToPrevious: () => ipcRenderer.invoke('downgrade-to-previous'),
     showUpdateNotice: () => ipcRenderer.invoke('show-update-notice'),
     checkForUpdates: () => ipcRenderer.invoke('check-for-updates'),
     getLastUpdateInfo: () => ipcRenderer.invoke('get-last-update-info'),
     installUpdate: () => ipcRenderer.invoke('install-update'),
     onUpdateAvailable: (cb) => {
       const listener = (_event, info) => cb(info)
       ipcRenderer.on('update-available-notify', listener)
       return () => ipcRenderer.removeListener('update-available-notify', listener)
     },
     onUpdateDownloaded: (cb) => {
       const listener = (_event, info) => cb(info)
       ipcRenderer.on('update-downloaded-notify', listener)
       return () => ipcRenderer.removeListener('update-downloaded-notify', listener)
     },
     onDownloadProgress: (cb) => {
       const listener = (_event, p) => cb(p)
       ipcRenderer.on('update-download-progress', listener)
       return () => ipcRenderer.removeListener('update-download-progress', listener)
     }
  },
 microsoft: {
    login: () => ipcRenderer.invoke('ms-login'),
    logout: (accountId) => ipcRenderer.invoke('ms-logout', accountId),
    list: () => ipcRenderer.invoke('ms-accounts-list'),
    setActive: (accountId) => ipcRenderer.invoke('ms-set-active', accountId),
    onLoginStatus: (callback) => {
      const listener = (_event, status) => callback(status)
      ipcRenderer.on('ms-login-status', listener)
      return () => ipcRenderer.removeListener('ms-login-status', listener)
    }
  },
  onboarding: {
    getSettings: () => ipcRenderer.invoke('get-onboarding-settings')
  },
  skins: {
    saveLocal: (skinUrl, skinName, skinBytes) =>
      ipcRenderer.invoke('skin-save-local', skinUrl, skinName, skinBytes),

    applyOnline: (skinUrl, model, skinBytes) =>
      ipcRenderer.invoke('skin-apply-online', skinUrl, model, skinBytes)
  }
})
window.addEventListener('DOMContentLoaded', () => {
  document.addEventListener('contextmenu', e => e.preventDefault())
})

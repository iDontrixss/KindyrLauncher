// Kindyr Launcher - Copyright (C) 2026 iDontrixss
// This program is free software: you can redistribute it and/or modify
// it under the terms of the GNU General Public License as published by
// the Free Software Foundation, either version 3 of the License, or
// (at your option) any later version.
// SPDX-License-Identifier: GPL-3.0-or-later

// KL-10: acciones de la UI sin manejadores inline (onclick=...), para que la
// CSP pueda prohibir 'unsafe-inline' en script-src.
//
// Marcado:  <button data-click="openTab" data-args='["mods","$this"]'>
//   data-<evento>  nombre de la acción (click, change, input, keydown, error,
//                  dragover, dragleave, drop)
//   data-args      JSON con los argumentos. Tokens: "$this" (el elemento),
//                  "$event", "$value" (this.value), "$checked" (this.checked)
//   data-key       en keydown: solo dispara con esa tecla (p. ej. "Enter")
//   data-stop      corta la propagación (equivale a event.stopPropagation())
//   data-prevent   event.preventDefault() antes de la acción (vacío: todos los
//                  eventos; o una lista "dragover,drop")
//   data-args-<evento>  argumentos propios de ese evento (varios en un elemento)
//
// Se escucha en FASE DE CAPTURA en document y se recorre del objetivo hacia
// arriba, ejecutando cada acción como lo habría hecho su onclick en el
// burbujeo. data-stop corta ese recorrido y además la propagación nativa, de
// modo que los listeners de los contenedores tampoco lo reciben (igual que
// event.stopPropagation() dentro de un onclick).
//
// Solo se invocan funciones de UI_ACTIONS: el marcado no puede llamar a
// cualquier global (y el HTML de proveedores nunca conserva atributos data-*).
const UI_ACTION_EVENTS = ['click', 'change', 'input', 'keydown', 'error', 'dragover', 'dragleave', 'drop']

const UI_ACTIONS = new Set([
  // Lista mantenida a mano; test/ui-actions.test.js verifica que coincide con
  // las acciones usadas en el marcado y que cada una es una función global.
  'addOfflineAccount', 'applySkin', 'backToImportMenu', 'browseInstallLocalPath',
  'browseInstallModpackPath', 'browseJavaPath', 'bulkDeleteInstanceContent',
  'bulkToggleInstanceContent', 'cancelExternalImports', 'changeDiscoverLimit',
  'changeDiscoverPage', 'checkForUpdatesManual', 'chooseExternalLauncher', 'clearBackgroundImage',
  'clearInstanceConsoleView', 'closeAccountManager', 'closeCompatWarnModal', 'closeConfirmModal',
  'closeCreateInstanceModal', 'closeImportModpackMenu', 'closeInstallModal',
  'closeInstanceContentVersions', 'closeInstanceSettings', 'closeProjectDetails', 'closeTwinModal',
  'closeWindow', 'copyInstanceConsole', 'createBrowseModpacks', 'createImportMrpack',
  'createRandomIcon', 'createSelectedInstance', 'createTogglePresets', 'createUploadIcon',
  'cycleInstanceContentSort', 'detectJavaPath', 'downgradeToPreviousVersion', 'editCurrentSkin',
  'externalBrowseFolder', 'favCurrentSkin', 'filterCreateVersionOptions', 'filterInstanceContent',
  'filterVersions', 'goHomeFromInstance', 'handleDrop', 'handleFileUpload', 'hidePrepareToast',
  'installCompatInstanceAnyway', 'installDetailProject', 'installDiscoveredProject',
  'installFromProjectDetails', 'installRecommendedJava', 'installSelectedProject',
  'installToCompatInstance', 'isettingsApplyVersion', 'isettingsBrowseJava', 'isettingsClearJava',
  'isettingsDelete', 'isettingsDeleteCheck', 'isettingsDuplicate', 'isettingsRandomIcon',
  'isettingsRename', 'isettingsRepair', 'isettingsSaveJava', 'isettingsSelectChannel',
  'isettingsSelectLoader', 'isettingsSelectMcVersion', 'isettingsSetChannel',
  'isettingsTogglePresets', 'isettingsUnlinkModpack', 'isettingsUploadIcon', 'loadCreateVersions',
  'loadInstallVersions', 'loadPreviousVersions', 'loadSection', 'loginMicrosoft',
  'markCreateNameEdited', 'maximizeWindow', 'minimizeWindow', 'openAccountManager',
  'openCreateInstanceModal', 'openDataRoot', 'openDetailGalleryImage', 'openDetailLink',
  'openDetailProjectUrl', 'openDiscoverForInstance', 'openDiscoverSection',
  'openDiscoveredProjectDetails', 'openExternalFromImportMenu', 'openExternalImport',
  'openImportModpackMenu', 'openInstanceFolder', 'openInstanceFromList', 'openInstanceTarget',
  'openInstanceView', 'openKeoOptimizedInstall', 'openModrinthProject', 'openTab',
  'pickBackgroundImage', 'purgeLauncherCache', 'refreshInstanceConsole', 'refreshInstancePanel',
  'refreshStorageInfo', 'resetDiscoverFilters', 'resetSettings', 'returnToInstanceFromDiscover',
  'rollbackToVersion', 'runExternalImports', 'saveCurseForgeKey', 'saveSettings',
  'scheduleModrinthSearch', 'searchModrinth', 'searchSkin', 'selectCreateChannel',
  'selectCreateLoader', 'selectCreatePreset', 'selectCreateStep', 'selectCreateVersion',
  'selectDiscoverCategory', 'selectDiscoverLoader', 'selectDiscoverProvider', 'selectDiscoverType',
  'selectIsettingsPreset', 'selectLanguage', 'selectModpackDestination', 'selectOfflineAccount',
  'selectProjectTab', 'selectRecentInstance', 'selectSkin', 'selectTheme', 'setEagerPrepare',
  'setExternalCheckedAll', 'setInstanceContentFilter', 'setModel', 'setSkinDropHighlight',
  'showMicrosoftAvatarFallback', 'showSettingsTab', 'showUpdateNotice', 'simulateCrashDev',
  'switchInstanceSettingsTab', 'switchInstanceTab', 'syncRamFromInput', 'syncRamFromSlider',
  'toggleContentVersionsIncompatible', 'toggleDiscordRPC', 'toggleExternalChecked', 'toggleFav',
  'toggleInstallLocalPanel', 'toggleInstanceConsoleFollow', 'toggleInstanceContentUpdatesOnly',
  'toggleSelectAllInstanceContent', 'toggleSidebarVersions', 'toggleSkinSection', 'uiClickById',
  'uiRemoveElement', 'uiRemoveParent', 'updateAllInstanceContent', 'updateDownloadsLabel',
  'uploadInstanceFiles'
])

function uiArgs(...args) {
  return escapeHtml(JSON.stringify(args))
}

function resolveUiArg(token, el, event) {
  if (typeof token !== 'string' || token.charAt(0) !== '$') return token
  if (token === '$this') return el
  if (token === '$event') return event
  if (token === '$value') return el.value
  if (token === '$checked') return el.checked
  if (token.startsWith('$data:')) return el.dataset[token.slice(6)]
  if (token.startsWith('$id:')) return document.getElementById(token.slice(4))
  return token
}

// Acciones genéricas de marcado (antes eran expresiones inline).
function uiRemoveElement(el) {
  if (el) el.remove()
}

function uiRemoveParent(el) {
  if (el && el.parentElement) el.parentElement.remove()
}

function uiClickById(id) {
  const target = document.getElementById(id)
  if (target) target.click()
}

function runUiAction(el, type, event) {
  const name = el.getAttribute('data-' + type)
  if (!name) return
  if (type === 'keydown') {
    const key = el.getAttribute('data-key')
    if (key && event.key !== key) return
  }
  if (el.hasAttribute('data-prevent')) {
    const only = el.getAttribute('data-prevent')
    if (!only || only.split(',').map(s => s.trim()).includes(type)) event.preventDefault()
  }
  if (!UI_ACTIONS.has(name) || typeof window[name] !== 'function') {
    console.error('[Kindyr] Acción de UI no registrada:', name)
    return
  }
  let args = []
  // data-args-<evento> cuando un mismo elemento atiende varios eventos.
  const raw = el.hasAttribute('data-args-' + type) ? el.getAttribute('data-args-' + type) : el.getAttribute('data-args')
  if (raw) {
    try { args = JSON.parse(raw) } catch {
      console.error('[Kindyr] data-args inválido en', name)
      return
    }
  }
  window[name](...(Array.isArray(args) ? args : [args]).map(token => resolveUiArg(token, el, event)))
}

function dispatchUiEvent(event) {
  const type = event.type
  // error no burbujea: solo cuenta el propio elemento (p. ej. <img>).
  if (type === 'error') {
    const el = event.target
    if (el && el.nodeType === 1 && el.hasAttribute('data-error')) runUiAction(el, 'error', event)
    return
  }
  let el = event.target && event.target.nodeType === 1 ? event.target : event.target && event.target.parentElement
  while (el && el !== document.documentElement) {
    if (el.hasAttribute('data-' + type)) runUiAction(el, type, event)
    if (type === 'click' && el.hasAttribute('data-stop')) {
      event.stopPropagation()
      return
    }
    el = el.parentElement
  }
}

for (const type of UI_ACTION_EVENTS) document.addEventListener(type, dispatchUiEvent, true)

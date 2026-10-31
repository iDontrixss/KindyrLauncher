// Kindyr Launcher - Copyright (C) 2026 iDontrixss
// This program is free software: you can redistribute it and/or modify
// it under the terms of the GNU General Public License as published by
// the Free Software Foundation, either version 3 of the License, or
// (at your option) any later version.
// SPDX-License-Identifier: GPL-3.0-or-later

const state = require('./state')

function getSemver() {
  if (!state.semverModule) state.semverModule = require('semver')
  return state.semverModule
}

function getXmclCore() {
  if (!state.xmclCorePromise) {
    state.xmclCorePromise = Promise.resolve()
      .then(() => require('@xmcl/core'))
      .catch(error => {
        state.xmclCorePromise = null
        throw error
      })
  }
  return state.xmclCorePromise
}

function getXmclFileTransfer() {
  if (!state.xmclFileTransferPromise) {
    state.xmclFileTransferPromise = Promise.resolve()
      .then(() => {
        try {
          return require('@xmcl/file-transfer/dist/index.js')
        } catch {
          return require('@xmcl/file-transfer')
        }
      })
      .catch(error => {
        state.xmclFileTransferPromise = null
        throw error
      })
  }
  return state.xmclFileTransferPromise
}

function getXmclInstaller() {
  if (!state.xmclInstallerPromise) {
    state.xmclInstallerPromise = Promise.resolve()
      .then(() => require('@xmcl/installer'))
      .catch(error => {
        state.xmclInstallerPromise = null
        throw error
      })
  }
  return state.xmclInstallerPromise
}

function getMicrosoftAuth() {
  if (!state.msmcAuth) {
    const { Auth } = require('msmc')
    state.msmcAuth = new Auth('select_account')
  }
  return state.msmcAuth
}

module.exports = {
  getMicrosoftAuth,
  getSemver,
  getXmclCore,
  getXmclFileTransfer,
  getXmclInstaller
}

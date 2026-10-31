// Kindyr Launcher - Copyright (C) 2026 iDontrixss
// This program is free software: you can redistribute it and/or modify
// it under the terms of the GNU General Public License as published by
// the Free Software Foundation, either version 3 of the License, or
// (at your option) any later version.
// SPDX-License-Identifier: GPL-3.0-or-later

const { safeStorage } = require('electron')
const fs = require('fs')
const path = require('path')
const { createMicrosoftAccountStore } = require('../account-storage')
const state = require('./state')
const { getMicrosoftAuth } = require('./lazy-deps')
const { getKindyrDataRoot } = require('./paths')

const microsoftAccountRefreshRequests = new Map()

function getMicrosoftAccountsFile() {
  return path.join(getKindyrDataRoot(), 'ms-accounts.json')
}

function getMicrosoftAccountStore() {
  if (!state.microsoftAccountStore) {
    state.microsoftAccountStore = createMicrosoftAccountStore({
      fs,
      path,
      safeStorage,
      filePath: getMicrosoftAccountsFile()
    })
  }
  return state.microsoftAccountStore
}

function loadMicrosoftAccounts() {
  return getMicrosoftAccountStore().load()
}

function saveMicrosoftAccounts(accounts) {
  getMicrosoftAccountStore().save(accounts)
}

function saveMicrosoftAccountsQueued(accounts) {
  const task = () => {
    getMicrosoftAccountStore().save(accounts)
    return accounts
  }
  state.microsoftAccountWriteQueue = state.microsoftAccountWriteQueue.then(task, task)
  return state.microsoftAccountWriteQueue
}

async function withMicrosoftAccounts(mutator) {
  const result = await (state.microsoftAccountWriteQueue = state.microsoftAccountWriteQueue.then(async () => {
    const accounts = getMicrosoftAccountStore().load()
    const updated = await mutator(accounts)
    if (updated !== undefined) {
      getMicrosoftAccountStore().save(updated)
      state.microsoftAccounts = updated
      return updated
    }
    state.microsoftAccounts = accounts
    return accounts
  }).catch(async (error) => {
    const accounts = getMicrosoftAccountStore().load()
    const updated = await mutator(accounts)
    if (updated !== undefined) {
      getMicrosoftAccountStore().save(updated)
      state.microsoftAccounts = updated
      return updated
    }
    throw error
  }))
  return result
}

function getMinecraftCredentials(token) {
  const fullToken = token.getToken(true)
  const profile = fullToken.profile || token.profile
  if (!fullToken.mcToken || !profile?.id || !profile?.name) {
    throw new Error('Microsoft no devolvió credenciales completas de Minecraft.')
  }
  return {
    access_token: fullToken.mcToken,
    uuid: profile.id,
    name: profile.name,
    xuid: fullToken.xuid || token.xuid || '',
    expires_at: normalizeMicrosoftTokenExpiry(fullToken.exp || token.exp),
    user_properties: {}
  }
}

function normalizeMicrosoftTokenExpiry(expiry) {
  const value = Number(expiry)
  if (!Number.isFinite(value) || value <= 0) return 0
  return value < 1_000_000_000_000 ? value * 1000 : value
}

function getMicrosoftAccessTokenExpiry(accessToken) {
  try {
    const payload = String(accessToken || '').split('.')[1]
    if (!payload) return 0
    return normalizeMicrosoftTokenExpiry(JSON.parse(Buffer.from(payload, 'base64url').toString('utf8')).exp)
  } catch {
    return 0
  }
}

function getMicrosoftAccountExpiry(account) {
  return normalizeMicrosoftTokenExpiry(account?.expires_at) || getMicrosoftAccessTokenExpiry(account?.access_token)
}

async function persistMicrosoftCredentials(account, xboxManager, token) {
  const credentials = getMinecraftCredentials(token)
  const refreshToken = xboxManager.save()
  if (!refreshToken) throw new Error('Microsoft no devolvió un token de renovación válido.')

  const clientId = getMicrosoftAuth().token?.client_id || ''
  const updated = await withMicrosoftAccounts(async (accounts) => {
    const index = accounts.findIndex(item => item.id === account.id)
    if (index < 0) throw new Error('La cuenta de Microsoft ya no existe en Kindyr.')

    const updatedAccount = {
      ...accounts[index],
      id: credentials.uuid,
      name: credentials.name,
      uuid: credentials.uuid,
      access_token: credentials.access_token,
      refresh_token: refreshToken,
      client_id: clientId || accounts[index].client_id || '',
      xuid: credentials.xuid,
      expires_at: credentials.expires_at,
      user_properties: credentials.user_properties || {},
      type: 'microsoft'
    }
    const next = accounts.slice()
    next[index] = updatedAccount
    return next
  })
  return updated.find(item => item.id === credentials.uuid)
}

async function refreshMicrosoftAccount(account, { force = false } = {}) {
  if (!account) return null

  const expiresAt = getMicrosoftAccountExpiry(account)
  const hasUsableAccessToken = Boolean(account.access_token) && (!expiresAt || expiresAt > Date.now() + 5 * 60 * 1000)
  if (!force && hasUsableAccessToken) return account

  if (!account.refresh_token) {
    if (!force && account.access_token && (!expiresAt || expiresAt > Date.now())) return account
    throw new Error('La sesión de Microsoft venció. Iniciá sesión nuevamente para continuar.')
  }

  const accountKey = String(account.id || account.uuid || 'active')
  if (microsoftAccountRefreshRequests.has(accountKey)) {
    return microsoftAccountRefreshRequests.get(accountKey)
  }

  const request = (async () => {
    try {
      const xboxManager = await getMicrosoftAuth().refresh(account.refresh_token)
      const token = await xboxManager.getMinecraft()
      return persistMicrosoftCredentials(account, xboxManager, token)
    } catch (error) {
      console.error('[Kindyr] No se pudo renovar la sesión de Microsoft:', error?.code || error?.statusCode || error?.name || 'authentication_error')
      throw new Error('No se pudo renovar la sesión de Microsoft. Iniciá sesión nuevamente.', { cause: error })
    }
  })()

  microsoftAccountRefreshRequests.set(accountKey, request)
  try {
    return await request
  } finally {
    if (microsoftAccountRefreshRequests.get(accountKey) === request) {
      microsoftAccountRefreshRequests.delete(accountKey)
    }
  }
}

async function getActiveMicrosoftAccount(options) {
  state.microsoftAccounts = loadMicrosoftAccounts()
  const activeAccount = state.microsoftAccounts.find(account => account.active)
  return refreshMicrosoftAccount(activeAccount, options)
}

function getXuidFromMinecraftToken(accessToken) {
  try {
    const payload = String(accessToken || '').split('.')[1]
    if (!payload) return ''
    return String(JSON.parse(Buffer.from(payload, 'base64url').toString('utf8')).xuid || '')
  } catch {
    return ''
  }
}

module.exports = {
  getActiveMicrosoftAccount,
  getMinecraftCredentials,
  getXuidFromMinecraftToken,
  loadMicrosoftAccounts,
  withMicrosoftAccounts
}

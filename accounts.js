// Kindyr Launcher - Copyright (C) 2026 iDontrixss
// This program is free software: you can redistribute it and/or modify
// it under the terms of the GNU General Public License as published by
// the Free Software Foundation, either version 3 of the License, or
// (at your option) any later version.
// SPDX-License-Identifier: GPL-3.0-or-later

let confirmCallback = null

function showConfirm(message, callback) {
  document.getElementById('confirm-modal-message').textContent = message
  confirmCallback = callback
  document.getElementById('confirm-modal').classList.add('active')
}

function closeConfirmModal(event) {
  if (event && event.target.id !== 'confirm-modal') return
  document.getElementById('confirm-modal').classList.remove('active')
  confirmCallback = null
}

document.getElementById('confirm-modal-ok').addEventListener('click', () => {
  document.getElementById('confirm-modal').classList.remove('active')
  if (confirmCallback) confirmCallback()
  confirmCallback = null
})

async function loginMicrosoft() {
  const btn = document.getElementById('ms-login-btn')
  const statusEl = document.getElementById('ms-login-status')
  btn.disabled = true
  btn.innerHTML = '<i class="fa-solid fa-spinner fa-spin"></i> ' + escapeHtml(t('account.ms.opening'))
  statusEl.textContent = t('account.ms.waiting')

  const result = await window.kindyrAPI.microsoft.login()

  btn.disabled = false
  btn.innerHTML = '<i class="fa-brands fa-microsoft"></i> ' + escapeHtml(t('account.ms.login'))

  if (!result.ok) {
    statusEl.textContent = 'Error: ' + result.error
    return
  }

  statusEl.textContent = t('account.added.microsoft', { name: result.account.name })
  if (result.account) {
    applyActiveAccount(result.account.name, 'microsoft', result.account.uuid || result.account.id || '')
  }
  await loadMicrosoftAccounts()
}

async function loadMicrosoftAccounts() {
  const result = await window.kindyrAPI.microsoft.list()
  if (!result.ok) return
  const list = document.getElementById('ms-account-list')
  if (!list) return

  const msAccounts = result.accounts || []
  const activeAccountId = result.accounts?.find(a => a.active)?.id
  const msHtml = msAccounts.map(account => {
    const cleanUuid = String(account.uuid || account.id || '').replace(/-/g, '')
    const hasUuid = /^[a-f0-9]{32}$/i.test(cleanUuid)
    const avatarHtml = hasUuid
      ? `<img src="https://mc-heads.net/avatar/${cleanUuid}/48" alt="${escapeHtml(account.name)}" style="width:100%;height:100%;object-fit:cover;image-rendering:pixelated;display:block;" onerror="this.style.display='none';this.parentElement.innerHTML='<i class=\\'fa-brands fa-microsoft\\'></i>'">`
      : `<i class="fa-brands fa-microsoft"></i>`
    return `
    <div class="account-item ${account.id === activeAccountId ? 'active microsoft' : ''}" onclick="setActiveMicrosoftAccount('${account.id}')">
      <div class="avatar" style="overflow:hidden;padding:0;">
        ${avatarHtml}
      </div>
      <div class="account-meta">
        <strong>${escapeHtml(account.name)}</strong>
        <span>${escapeHtml(t('account.ms.premium'))}${account.id === activeAccountId ? ' ' + escapeHtml(t('account.ms.active')) : ''}</span>
      </div>
      <button type="button" class="icon-action" onclick="logoutMicrosoft(event, '${account.id}')" title="${escapeHtml(t('account.logout'))}">
        <i class="fa-solid fa-right-from-bracket"></i>
      </button>
    </div>
  `}).join('')

  list.innerHTML = msHtml || '<div style="color:#666;font-size:13px;">' + escapeHtml(t('account.ms.none')) + '</div>'
  const active = result.accounts?.find(a => a.id === activeAccountId)
  if (active && settings && settings.accountType === 'microsoft' && settings.username === active.name) {
    if (typeof hydratePremiumAvatars === 'function') hydratePremiumAvatars()
  }
}

async function setActiveMicrosoftAccount(accountId) {
  await window.kindyrAPI.microsoft.setActive(accountId)
  const result = await window.kindyrAPI.microsoft.list()
  const active = result.accounts?.find(a => a.id === accountId)
  if (active) {
    applyActiveAccount(active.name, 'microsoft', active.uuid || active.id || '')
  }
  await loadMicrosoftAccounts()
  const modal = document.getElementById('account-modal')
  if (modal) modal.classList.remove('active')
}

async function logoutMicrosoft(event, accountId) {
  event.stopPropagation()
  const before = await window.kindyrAPI.microsoft.list()
  const loggingOut = before.accounts?.find(a => a.id === accountId)
  showConfirm(t('confirm.logout.ms'), async () => {
    await window.kindyrAPI.microsoft.logout(accountId)
    await loadMicrosoftAccounts()
    const after = await window.kindyrAPI.microsoft.list()
    const stillActive = after.accounts?.some(a => a.active)
    if (!stillActive && settings.accountType === 'microsoft' && loggingOut && settings.username === loggingOut.name) {
      const nextMicrosoft = after.accounts?.[0]
      if (nextMicrosoft) {
        await window.kindyrAPI.microsoft.setActive(nextMicrosoft.id)
        const refreshed = await window.kindyrAPI.microsoft.list()
        const newActive = refreshed.accounts?.find(a => a.active) || refreshed.accounts?.find(a => a.id === nextMicrosoft.id) || nextMicrosoft
        applyActiveAccount(newActive.name, 'microsoft', newActive.uuid || newActive.id || '')
      } else {
        const nextOffline = (typeof accounts !== 'undefined' ? accounts.find(a => a.type === 'offline') : null)
        if (nextOffline) applyActiveAccount(nextOffline.name, 'offline')
        else applyActiveAccount('', 'offline')
      }
    } else if (stillActive) {
      const newActive = after.accounts?.find(a => a.active)
      if (newActive) applyActiveAccount(newActive.name, 'microsoft', newActive.uuid || newActive.id || '')
    }
    if (typeof hydratePremiumAvatars === 'function' && settings.accountType === 'microsoft') hydratePremiumAvatars()
  })
}

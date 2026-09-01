

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
  await loadMicrosoftAccounts()
}

async function loadMicrosoftAccounts() {
  const result = await window.kindyrAPI.microsoft.list()
  if (!result.ok) return
  const list = document.getElementById('ms-account-list')
  if (!list) return

  const msAccounts = result.accounts || []
  const activeAccountId = result.accounts?.find(a => a.active)?.id
  const msHtml = msAccounts.map(account => `
    <div class="account-item ${account.id === activeAccountId ? 'active microsoft' : ''}" onclick="setActiveMicrosoftAccount('${account.id}')">
      <div class="avatar">
        <i class="fa-brands fa-microsoft"></i>
      </div>
      <div class="account-meta">
        <strong>${escapeHtml(account.name)}</strong>
        <span>${escapeHtml(t('account.ms.premium'))}${account.id === activeAccountId ? ' ' + escapeHtml(t('account.ms.active')) : ''}</span>
      </div>
      <button type="button" class="icon-action" onclick="logoutMicrosoft(event, '${account.id}')" title="${escapeHtml(t('account.logout'))}">
        <i class="fa-solid fa-right-from-bracket"></i>
      </button>
    </div>
  `).join('')

  list.innerHTML = msHtml || '<div style="color:#666;font-size:13px;">' + escapeHtml(t('account.ms.none')) + '</div>'
}

async function setActiveMicrosoftAccount(accountId) {
  await window.kindyrAPI.microsoft.setActive(accountId)
  const result = await window.kindyrAPI.microsoft.list()
  const active = result.accounts?.find(a => a.id === accountId)
  if (active) {
    applyActiveAccount(active.name, 'microsoft')
  }
  await loadMicrosoftAccounts()
  const modal = document.getElementById('account-modal')
  if (modal) modal.classList.remove('active')
}

async function logoutMicrosoft(event, accountId) {
  event.stopPropagation()
  showConfirm(t('confirm.logout.ms'), async () => {
    await window.kindyrAPI.microsoft.logout(accountId)
    await loadMicrosoftAccounts()
  })
}

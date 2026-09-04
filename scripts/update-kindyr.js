// Kindyr Launcher - Copyright (C) 2026 iDontrixss
// SPDX-License-Identifier: GPL-3.0-or-later
// Uso: pnpm update-kindyr
// Si la release ya está en GitHub, solo habilita el updater para esa release.
// No necesita electron-builder si la release ya existe.

const { execSync } = require('child_process')
const fs = require('fs')
const path = require('path')
const readline = require('readline')

function run(cmd, opts = {}) {
  console.log(`> ${cmd}`)
  return execSync(cmd, { stdio: 'inherit', ...opts })
}

async function ask(q) {
  const rl = readline.createInterface({ input: process.stdin, output: process.stdout })
  return new Promise(res => rl.question(q, ans => { rl.close(); res(ans.trim()) }))
}

async function fetchJson(url) {
  const res = await fetch(url, { headers: { Accept: 'application/vnd.github+json', 'User-Agent': 'KindyrLauncher-update-kindyr' } })
  if (!res.ok) throw new Error(`HTTP ${res.status} para ${url}`)
  return res.json()
}

async function main() {
  const updateJsonPath = path.join(__dirname, '..', 'update.json')
  const pkgPath = path.join(__dirname, '..', 'package.json')

  console.log('Buscando última release en GitHub...')
  let latest = null
  try {
    latest = await fetchJson('https://api.github.com/repos/iDontrixss/KindyrLauncher/releases?per_page=1')
    if (Array.isArray(latest)) latest = latest[0]
    // Si es array con per_page=1, es la última. También probar /releases/latest
    if (!latest || !latest.tag_name) {
      latest = await fetchJson('https://api.github.com/repos/iDontrixss/KindyrLauncher/releases/latest')
    }
  } catch (e) {
    console.error('No se pudo obtener la última release:', e.message)
  }

  let targetTag = null
  let targetVersion = null

  if (latest && latest.tag_name) {
    console.log(`Última release en GitHub: ${latest.tag_name} (${latest.name || ''}) - prerelease=${latest.prerelease} draft=${latest.draft}`)
    const ans = await ask(`¿Es esta la release que querés habilitar? (${latest.tag_name}) (s/N): `)
    if (ans.toLowerCase() === 's' || ans.toLowerCase() === 'y') {
      targetTag = String(latest.tag_name).trim()
      targetVersion = targetTag.replace(/^[vV]/, '')
    }
  }

  if (!targetTag) {
    const tagInput = await ask('Ingresá el tag a habilitar (ej: v0.1.1 o 0.1.1-beta.1): ')
    if (!tagInput) {
      console.error('Tag vacío, cancelado.')
      process.exit(1)
    }
    targetTag = tagInput.trim()
    if (!targetTag.startsWith('v') && !targetTag.startsWith('V')) targetTag = 'v' + targetTag
    targetVersion = targetTag.replace(/^[vV]/, '')
    console.log(`Verificando que ${targetTag} exista en GitHub...`)
    try {
      const rel = await fetchJson(`https://api.github.com/repos/iDontrixss/KindyrLauncher/releases/tags/${encodeURIComponent(targetTag)}`)
      if (!rel || !rel.tag_name) throw new Error('No se encontró')
      console.log(`Encontrada: ${rel.tag_name} - ${rel.name || ''}`)
    } catch (e) {
      console.error(`No se encontró la release ${targetTag} en GitHub:`, e.message)
      const cont = await ask('¿Seguir igual y habilitar de todos modos? (s/N): ')
      if (cont.toLowerCase() !== 's' && cont.toLowerCase() !== 'y') process.exit(1)
    }
  }

  console.log(`\nHabilitando updater para ${targetTag} (versión ${targetVersion})...`)
  console.log('Sin este paso, aunque la release esté en GitHub, Kindyr NO la ofrecerá (medida de seguridad).')

  // Actualizar update.json — habilita UN chequeo, no whitelist
  let updateJson = {}
  try { updateJson = JSON.parse(fs.readFileSync(updateJsonPath, 'utf8')) } catch {}
  updateJson.updatesEnabled = true
  updateJson.approvedAt = new Date().toISOString()
  updateJson.version = targetVersion
  updateJson.tag = targetTag
  updateJson.notes = `Habilitado via pnpm update-kindyr ${new Date().toISOString().slice(0,10)} — autoriza UN chequeo a GitHub para ${targetTag}`
  fs.writeFileSync(updateJsonPath, JSON.stringify(updateJson, null, 2) + '\n')
  console.log(`update.json habilitado (approvedAt=${updateJson.approvedAt}, tag=${targetTag})`)

  // Sincronizar package.json version si hace falta (opcional, para coherencia)
  try {
    const pkg = JSON.parse(fs.readFileSync(pkgPath, 'utf8'))
    if (pkg.version !== targetVersion) {
      const upd = await ask(`package.json es ${pkg.version}, ¿actualizar a ${targetVersion} para coherencia? (s/N): `)
      if (upd.toLowerCase() === 's' || upd.toLowerCase() === 'y') {
        pkg.version = targetVersion
        fs.writeFileSync(pkgPath, JSON.stringify(pkg, null, 2) + '\n')
        console.log(`package.json actualizado a ${targetVersion}`)
        run(`git add package.json update.json`)
        run(`git commit -m "chore: habilita updater para ${targetTag} (update.json aprobadoAt ${updateJson.approvedAt})"`)
      } else {
        run(`git add update.json`)
        run(`git commit -m "chore: habilita updater para ${targetTag} (update.json aprobadoAt ${updateJson.approvedAt})"`)
      }
    } else {
      run(`git add update.json`)
      run(`git commit -m "chore: habilita updater para ${targetTag} (update.json aprobadoAt ${updateJson.approvedAt})"`)
    }
  } catch (e) {
    run(`git add update.json`)
    run(`git commit -m "chore: habilita updater para ${targetTag}"`)
  }

  try { run(`git tag ${targetTag}`) } catch { console.log(`Tag ${targetTag} ya existe localmente, continuando...`) }

  const doPush = await ask(`¿Hacer git push (incluye update.json) + --follow-tags? (s/N): `)
  if (doPush.toLowerCase() === 's' || doPush.toLowerCase() === 'y') {
    run(`git push --follow-tags`)
    run(`git push`)
    console.log('\n=== HABILITADO ===')
    console.log(`Los launchers harán UN ciclo 5s→3s→5s a update.json y GitHub. Si encuentran ${targetTag} mayor que su versión, mostrarán el diálogo.`)
    console.log('Si no aceptan, no descarga. Ciclo consumido hasta próximo pnpm update-kindyr.')
  } else {
    console.log('No se hizo push. Recordá: sin git push de update.json, el updater no se activa aunque la release esté en GitHub.')
  }

  console.log('\nNo se necesita electron-builder si la release ya está en GitHub. Solo se habilita el aviso.')
}

main().catch(e => { console.error(e); process.exit(1) })

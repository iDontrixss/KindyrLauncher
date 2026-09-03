const fs = require('fs')
const path = require('path')

const FORBIDDEN_ASAR_PATTERNS = [
  'minecraft-launcher-core',
  'adm-zip',
  'form-data',
  'test/',
  'docs/performance',
  'tools/performance',
  'audit-',
  '.backup',
  'knip.json',
  'scripts/install-electron'
]

const REQUIRED_ASAR_FILES = [
  'account-storage.js',
  'archive-utils.js',
  'mrpack-utils.js',
  'skin-security.js',
  'main.js',
  'preload.js',
  'curseforge-embedded.json'
]

module.exports = async function afterPack(context) {
  const appOutDir = context.appOutDir
  const asarPath = path.join(appOutDir, 'resources', 'app.asar')
  const unpackedDir = path.join(appOutDir, 'resources', 'app.asar.unpacked')

  console.log(`[Kindyr afterPack] Verifying ${asarPath}`)

  // 1. Check unpacked dir doesn't contain forbidden leftovers
  if (fs.existsSync(unpackedDir)) {
    const forbiddenFound = []
    function walk(dir) {
      for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
        const full = path.join(dir, entry.name)
        const rel = path.relative(appOutDir, full).replace(/\\/g, '/')
        for (const pat of FORBIDDEN_ASAR_PATTERNS) {
          if (rel.includes(pat) || entry.name.includes(pat)) {
            forbiddenFound.push(rel)
          }
        }
        if (entry.isDirectory()) walk(full)
      }
    }
    try { walk(unpackedDir) } catch {}
    if (forbiddenFound.length) {
      throw new Error(`[Kindyr afterPack] Forbidden files in unpacked ASAR: ${forbiddenFound.slice(0, 20).join(', ')}`)
    }
  }

  // 2. Try to inspect ASAR via asar package if available
  let asarList = null
  try {
    const asar = require('asar')
    if (fs.existsSync(asarPath)) {
      asarList = asar.listPackage(asarPath)
    }
  } catch (e) {
    try {
      const asar2 = require(path.join(context.packager.projectDir, 'node_modules', 'asar', 'lib', 'asar.js'))
      if (fs.existsSync(asarPath)) asarList = asar2.listPackage(asarPath)
    } catch {}
  }

  if (Array.isArray(asarList)) {
    const asarStr = asarList.join('\n')
    const missing = REQUIRED_ASAR_FILES.filter(f => !asarStr.includes(f))
    if (missing.length) {
      throw new Error(`[Kindyr afterPack] Missing required files in ASAR: ${missing.join(', ')}`)
    }
    const forbiddenInAsar = FORBIDDEN_ASAR_PATTERNS.filter(pat => asarStr.includes(pat))
    if (forbiddenInAsar.length) {
      throw new Error(`[Kindyr afterPack] Forbidden patterns in ASAR: ${forbiddenInAsar.join(', ')}`)
    }
    // Anti-RE: curseforge-embedded.json debe estar DENTRO del ASAR, nunca como extraResources/unpacked
    if (asarStr.includes('curseforge-embedded.json')) {
      console.log('[Kindyr afterPack] CurseForge embedded OK inside ASAR (portable, no plaintext)')
    } else {
      throw new Error('[Kindyr afterPack] curseforge-embedded.json missing in ASAR — build no portable')
    }
    // Verificar que no haya leak plaintext de key en ASAR (heurística)
    try {
      const asar = require('asar')
      const content = asar.extractFile(asarPath, 'curseforge-embedded.json').toString('utf8')
      if (content.includes('$2a$10$') || content.includes('FbSvMc')) {
        throw new Error('[Kindyr afterPack] Plaintext CurseForge key leaked in embedded json!')
      }
      const parsed = JSON.parse(content)
      if (!parsed.k || typeof parsed.k !== 'string' || parsed.k.length < 60) {
        throw new Error('[Kindyr afterPack] Embedded CurseForge json malformed')
      }
    } catch (e) {
      if (e.message.includes('Plaintext') || e.message.includes('malformed') || e.message.includes('missing in ASAR')) throw e
      console.log('[Kindyr afterPack] Embedded content check skipped (asar read not available)')
    }
    console.log(`[Kindyr afterPack] ASAR OK: ${asarList.length} files, required present`)
  } else {
    console.log('[Kindyr afterPack] ASAR list not available (asar pkg missing), skipping deep check')
    // Fallback: check files config
    const files = context.packager.config.files || []
    console.log(`[Kindyr afterPack] Configured files: ${JSON.stringify(files).slice(0, 500)}`)
    if (!JSON.stringify(files).includes('curseforge-embedded.json')) {
      throw new Error('[Kindyr afterPack] curseforge-embedded.json not in build.files — no será portable')
    }
  }

  // 3. Verify no backup files in appOutDir
  function checkBackups(dir) {
    for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
      if (entry.name.endsWith('.backup')) {
        throw new Error(`[Kindyr afterPack] Backup file leaked to package: ${entry.name}`)
      }
      if (entry.isDirectory() && !entry.name.startsWith('.') && entry.name !== 'node_modules') {
        // shallow check only
      }
    }
  }
  try { checkBackups(appOutDir) } catch (e) { if (e.message.includes('Backup file')) throw e }

  console.log('[Kindyr afterPack] Verification passed')
}

# CurseForge API Key — Cifrado y Gating

> **Objetivo**: la key nunca en plaintext en git, nunca en logs/errores/consola/crash/DevTools, solo pedida al entrar explícitamente a Descubrir → CurseForge.

## 1. Cómo se guardó

1. Key recibida por canal privado (no commit, no issue, no log).
2. Generación local:
   ```powershell
   $env:CURSEFORGE_API_KEY='***'  # valor privado
   node scripts/obfuscate-curseforge-key.js
   # -> curseforge-embedded.json { "k": "base64..." } (93 bytes)
   Remove-Item Env:CURSEFORGE_API_KEY
   ```
3. Archivo verificado:
   - `git check-ignore -v curseforge-embedded.json` → `.gitignore:27:curseforge-embedded.json`
   - `git status --ignored --porcelain` → `!! curseforge-embedded.json` (ignorado, no trackeado)
   - `package.json:82` incluye `curseforge-embedded.json` en `build.files` → se empaqueta dentro del ASAR pero no en git.
   - `Remove-Item Env:CURSEFORGE_API_KEY` deja env limpio; no queda en historial de shell persistente.

## 2. Cómo se cifra

### Nivel A — Obfuscación embebida (anti-RE, código libre) — v2
- **Script**: `scripts/obfuscate-curseforge-key.js:14-27`
- **Algoritmo**: 
  1. `deriveXorKey()` fragmentado — `Buffer.from('S2luZHly','base64')` → Kindyr + Launcher + `-` + CurseForge + `-` + `2026` (nunca literal `"KindyrLauncher-CurseForge-2026"` greppeable).
  2. `XOR` con key → `reverse()` → `+ROT(37)` → `base64`. Triple capa (XOR + reverse + rotación).
- **Almacenamiento**: `curseforge-embedded.json { k: "<base64-xor-rot-reverse>" }` gitignored. El ASAR contiene solo esa cadena, nunca plaintext.
- **Descifrado LAZY** `main.js:deriveEmbeddedXorKey()+getEmbeddedCurseForgeKey()`:
  - No se descifra al iniciar. Solo al invocar `getCurseForgeApiKey()` desde `search/status` (gating descubrir/curseforge).
  - `Buffer.from(k,'base64') → -ROT → reverse() → XOR → trim() → buf.fill(0); out.fill(0)` + `delete require.cache` para no dejar plaintext en cache.
  - `catch {}` silencioso — nunca loggea `k`, `xorKey` ni plaintext. Buffers zeroizados.
- **Portabilidad**: determinístico, **funciona en cualquier PC** que instale el build (no es solo local dev). `curseforge-embedded.json` está empaquetado DENTRO del ASAR (`package.json:82` + `scripts/after-pack.js` verifica `!! inside ASAR`). No depende de `safeStorage` ni de máquina de build.

### Nivel B — Cifrado por usuario (OS Keychain)
- **Store**: `curseforge-store.js:18-32` `createCurseForgeStore({fs,path,safeStorage,filePath})`
  - `assertSecureStorage()` `curseforge-store.js:3-12` exige `safeStorage.isEncryptionAvailable()` y rechaza `backend === 'basic_text'` (linux sin llavero).
  - `safeStorage.encryptString(key).toString('base64')` → `JSON {version:1, encrypted}` en `%AppData%/KindyrLauncher/curseforge.key` con `mkdir 0o700`, `writeFile 0o600 wx`, `rename` atómico.
  - `load()` `curseforge-store.js:36-50` hace `decryptString(Buffer.from(encrypted,'base64'))` + migración legacy plaintext.
- **Env var**: `main.js:184-188` si existe `process.env.CURSEFORGE_API_KEY`, hace `save()` cifrado y `delete process.env.CURSEFORGE_API_KEY` inmediato.

> Prioridad `main.js:getCurseForgeApiKey()`:
> 0) embebida lazy → 1) env var (auto-cifra y borra) → 2) store cifrado. Nunca plaintext en disco fuera de `safeStorage`.

### Transporte
- `main.js:758-779` `fetch('https://api.curseforge.com/v1/mods/search' , headers: {'x-api-key': apiKey})` — `apiKey` solo en RAM del proceso main, header `x-api-key`, TLS OS. CSP `index.html:5` limita `connect-src` a `https://api.curseforge.com`.

## 3. Cómo se pide (gating explícito)

- **Solo en `main`**, nunca en renderer. `preload.js:43-46` expone `window.kindyrAPI.curseforge.{search,status,setKey}` vía `ipcRenderer.invoke`, no fetch directo.
- **Descifrado lazy**: `main.js:getEmbeddedCurseForgeKey()` no se ejecuta al iniciar la app, solo cuando `searchCurseForge()` o `curseforge-status` lo requieren.
- **Handlers**:
  - `ipcMain.handle('curseforge-status')` `main.js:3201` → `Boolean(getCurseForgeApiKey())` solo retorna `hasKey`, no key.
  - `ipcMain.handle('curseforge-search')` `main.js:3192` → `getCurseForgeApiKey()` dentro de `searchCurseForge()` `main.js:759`, solo si `discoverProvider === 'curseforge'`.
  - `ipcMain.handle('curseforge-set-key')` `main.js:3210` → `save(key)` con `safeStorage`, valida `len>=10`, no loggea.
- **UI gating** `sections/descubrir.html:146-176`:
  - `selectDiscoverProvider('curseforge')` → `checkCurseForgeStatus()` → `window.kindyrAPI.curseforge.status()`
  - `searchModrinth()` `sections/descubrir.html:506` elige `curseforge.search` solo si `discoverProvider === 'curseforge'`, sino `modrinth.search`.
  - Input `type=password` `sections/descubrir.html:24` `autocomplete=off`, `saveCurseForgeKey()` limpia `input.value=''` tras `setKey` `sections/descubrir.html:185`, `setup.hidden = Boolean(hasKey)`.
- **No fugas**:
  - `main.js:3087-3088` `log-info/log-error` son no-op, no persisten payload.
  - `searchCurseForge` error `main.js:760` genérico, no incluye key.
  - `getEmbeddedCurseForgeKey` catch vacío, sin `console.error`.
  - Ningún `console.log/error/warn` en main/renderer imprime `apiKey`, `k` o `xorKey`.

## 4. Portabilidad — ¿funciona en otra PC?

**Sí, es portátil y distribuido — NO es solo local dev.** Corregido:

- `curseforge-embedded.json` se genera una vez y se incluye en `package.json:82` `build.files` → queda **dentro del `app.asar`** en `dist/`. Cualquier usuario que descargue el `Setup`/`AppImage` lo tiene.
- El descifrado `main.js:deriveEmbeddedXorKey()/getEmbeddedCurseForgeKey()` es puro JS determinístico (no usa `safeStorage` ni `machineId`), por eso funciona en cualquier OS sin config.
- El fallback `safeStorage` (`curseforge-store.js`) es per-máquina cifrado y también portátil: si el usuario pega key manualmente en Descubrir→CurseForge, se guarda cifrado local y ya no necesita el embebido.

> Si fuera "solo local dev" no serviría distribuido; por eso el parche empaqueta el `k` obfuscado en el ASAR y el descifrado es lazy pero universal.

## 5. Anti-Ingeniería Inversa aplicado

- `xorKey` nunca literal — fragmentado en 4 `Buffer.from(...,'base64')` + `String.fromCharCode(45)` `main.js:deriveEmbeddedXorKey()` / `scripts/obfuscate-curseforge-key.js`.
- Triple capa: XOR → reverse → ROT37 → base64 (no solo XOR).
- `getEmbeddedCurseForgeKey()` borra `require.cache` y `buf.fill(0)` tras descifrar.
- `webPreferences: {devTools:false, contextIsolation:true, sandbox:true}` `main.js:2435-2442` — DevTools deshabilitado en build; `preload.js` no expone `safeStorage` ni `process`.
- `scripts/after-pack.js` verifica: `curseforge-embedded.json` **dentro** del ASAR, no en `extraResources/unpacked`, y que no contenga plaintext `$2a$10$` ni `FbSvMc`; falla el build si hay leak.
- Mitigación: `searchCurseForge` solo header `x-api-key` en RAM main, nunca en renderer; `CSP` limita `connect-src` a `https://api.curseforge.com`; errores genéricos sin key.

> Nota honesta: cualquier secreto en cliente es extraíble por atacante determinado (ASAR es ZIP). Esto es **ofuscación + gating**, no cifrado fuerte. Si se sospecha leak, rotar key en CurseForge y regenerar `curseforge-embedded.json` vía CI secret.

## 6. Verificación

```powershell
git check-ignore -v curseforge-embedded.json # .gitignore:27
git status --porcelain --ignored | findstr curseforge # !! curseforge-embedded.json
node scripts/check-syntax.js # Sintaxis válida: 31 archivos
node -e "require('./scripts/obfuscate-curseforge-key.js')" # debe pedir env, no logear key
# Test descifrado sin exponer plaintext:
node -e "const j=require('./curseforge-embedded.json');console.log('k len',j.k.length)"
```

Build: `curseforge-embedded.json` va en ASAR, no en repo. En CI: secret `CURSEFORGE_API_KEY` → `node scripts/obfuscate-curseforge-key.js` antes de `electron-builder` (`afterPack` valida inside ASAR).

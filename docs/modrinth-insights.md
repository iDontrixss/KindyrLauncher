# Modrinth Insights para KindyrLauncher

> **Fuente:** `https://github.com/modrinth/code` (`main` 2026-09-02) — `apps/labrinth` (API Rust) + `packages/app-lib` (Theseus) + `packages/path-util`. Comparado con Kindyr `C:\KindyrLauncher` en solo lectura. **No se propone migrar `facets→new_filters` aún.**
> Prioridad: **1. `.mrpack` a fondo > 2. Discover/Search > 3. Rate/cache (propuesta) > 4. app-lib vs Kindyr**. CurseForge excluido.

---

## 1. `.mrpack` — Compatibilidad oficial (P0)

### 1.1 Spec oficial Modrinth

**PackFormat** `packages/app-lib/src/api/pack/install_from.rs:12-22`
```json
{
  "game": "minecraft",            // must == "minecraft" (install_mrpack.rs:295 `Pack does not support Minecraft`)
  "formatVersion": 1,             // i32, hoy 1 (Help Center 2025-10-15)
  "versionId": "8ch... ",         // 8 chars base62
  "name": "My Pack",
  "summary": "optional",
  "files": [ { "path": SafeRelativeUtf8UnixPathBuf, "hashes": {sha1, sha512}, "env": {client/server}, "downloads": [https], "fileSize": u32 } ],
  "dependencies": { "minecraft": "1.20.1", "fabric-loader": "0.15", "quilt-loader": "...", "forge": "47.1", "neoforge"/"neo-forge": "..." } // alias neo-forge→neoforge L.66
}
```
- `files[].hashes` **MUST sha1 + sha512** (Help Center), `fileSize:u32` 0..4294967295, `downloads` https sin userinfo, sigue 3 redirects.
- `dependencies` **debe** tener `minecraft` (`set_instance_information:410` → error si falta). Otros opcionales.
- `SafeRelativeUtf8UnixPathBuf` `packages/path-util/src/lib.rs:28-60` **rechaza** `""`, `\0`, `/abs`, `C:`, `//`, `..`, `\` backslash, reservados Windows `CON/PRN/AUX/NUL/COM1-9/LPT1-9/CONIN$` con `.ext` o `:ads`. **Permite** `.` (`"./a/b"` ok, PR #4486), Kindyr lo elimina.
- `EnvType::Client/Server` → `SideType::Required|Optional|Unsupported|Unknown` (`cache.rs:420`). Docs listan 3 valores, código maneja `Unknown`.
- `MAX_LOCAL_FILE_HASH_LOOKUP_SIZE=1GiB` (`install_from.rs:95`) — .mrpack >1GiB no se hashea para lookup.

**Overrides** `install_mrpack.rs:315-620`
- Cliente extrae **solo** `overrides/` + `client-overrides/` (`!endsWith('/') && !is_ignored && ProjectType::get_from_parent_folder.is_some()` `mods/resourcepacks/shaderpacks/datapacks`). `server-overrides/` **ignorado** en cliente (sí cacheado para hash).
- Strip `SafeRelativeUtf8UnixPathBuf::strip_prefix("overrides")` else `client-overrides`.
- Ignorados `.rpo` (`MRPACK_WARNING_IGNORED_EXTENSIONS:20`) + configs.
- Icon fallback `icon.png` → `overrides/icon.png` → `client-overrides/icon.png` → `instance/icon.png:315+619`.
- CRC32 verificado antes de persistir (`hash_zip_entry:195`, `extract_zip_entry:380`).

**Contradicciones con supuestos iniciales:**
- `formatVersion` sigue **1**, no 2. `512MiB/4GiB` no existen como const (solo 1GiB + 500MiB upload `version_creation.rs:330`).
- Canónico es **`sha1`** (40 hex, `fetch_mirrors_with_progress(..., Sha1)` `L.620`, `cache_modpack_files` solo `Sha1`), no `sha512`. Kindyr prioriza `sha512` inverso.

### 1.2 Implementación Kindyr

- `archive-utils.js:32` `diagnoseZipFile` (HTML `3c` vs `504b`, size 0/<22, fallback Buffer) + `63` `withZip` + `114` `readZipEntryBuffer` + `155` `extractZipEntries` (`MAX_ENTRIES 100k, ENTRY 512MiB, TOTAL 4GiB`) + `187` `writeZip`.
- `mrpack-utils.js:4` `normalizeMrpackPath` (reemplaza `\`→`/`, rechaza `\0`, `/`, `C:`, `..`, elimina `.`), `21` `normalizeMrpackDownloads` (solo `https` sin auth), `33` `getClientMrpackFiles` (solo skip `client==='unsupported'`), `57` `getPreferredHash` (`sha512` primero), `63` `verifyMrpackFile` (`return true` si sin hash).
- `main.js:979` `safePath`, `973` `isSafeRelativePath`, `1289` `normalizeForgeLoaderVersion`, `1298` `resolveLoaderFromDependencies`, `1436` `extractMrpackOverrides` (`overrides`+`client-overrides`, `512MiB/2GiB`), `1450` `downloadMrpackFile` (loop mirrors + `verify`), `1465` `installMrpackInstance` (descarga mrpack, `readZipEntryBuffer modrinth.index.json`, `getClientMrpackFiles`, `runWithConcurrency` `maxDownloads=min(settings.maxConcurrentDownloads||6,20)`, `extractMrpackOverrides`), `3518` `import-mrpack` (duplicado: `maxConcurrent=6` fijo, `downloadChunk` batch serial, `instanceId` con `Date.now()`).
- `main.js:2970` `export-mrpack` escribe `files:[]` vacío.

### 1.3 Bugs reales (P0)

| # | Archivo:línea | Qué está mal | Por qué es necesario | Impacto |
|---|---|---|---|---|
| B1 | `main.js:2970-3010` | Export `index.files=[]` vacío, sin `hashes/downloads/fileSize`. | Spec exige `files[]` poblado para re-importar en Modrinth/Prism. Kindyr pack no es portable, solo backup configs. | **Crítico**: packs de Kindyr no abren en otros launchers. |
| B2 | `mrpack-utils.js:4-18` | `normalizeMrpackPath` elimina `.` y acepta `CON.txt`, acepta `a\B` (convierte `\`). Oficial rechaza `\` y reservados, **permite** `.`. | Incompatibilidad + bypass path traversal. | Pack válido con `./mods/a.jar` rechazado; `CON.txt` aceptado (vuln). |
| B3 | `mrpack-utils.js:57-73` | `getPreferredHash` prioriza `sha512`, oficial usa `sha1`; `verifyMrpackFile` `true` si sin hash. | Divergencia verificación + permite file sin hash (malicioso). | Falso negativo/positivo hash. |
| B4 | `main.js:1465` vs `3518` | Flujos `installMrpackInstance` y `import-mrpack` duplicados y divergentes (instanceId, concurrencia, progreso). | Doble mantenimiento, fix de spec debe parchear 2 sitios. | Riesgo drift futuro (`formatVersion:2`). |
| B5 | `mrpack-utils.js:33` | Solo filtra `client:unsupported`, ignora `server-overrides` copia (aunque `extractMrpackOverrides` ya ignora, `getClientMrpackFiles` no documenta `server.`). | Pack con `server: required, client: optional` se instala innecesario. | Over-install, pero no bloqueante. |

### 1.4 Diferencias intencionales (ok)

- `archive-utils.js:32` `diagnoseZipFile` HTML detection (`3c`/`Modrinth`) — hardening Kindyr, no existe en `app-lib`.
- `mrpack-utils.js:21` whitelist `https` estricta — `app-lib` sigue redirects sin whitelist, Labrinth valida dominios; Kindyr más estricto correcto.
- `mrpack-utils.js:48` rechaza `downloads.length===0` — `app-lib` no valida, Kindyr correcto.

### 1.5 Mejoras recomendadas (P0/P1)

- **M0** Alinear `normalizeMrpackPath` a `path-util` exacto (rechazar `\\`, reservados, permitir `.`). **Por qué:** compat + seguridad. **Impacto:** +compat, -falsos rechazos.
- **M1** Cambiar `getPreferredHash` a `sha1` primero, `sha512` fallback. **Por qué:** alinea con `app-lib`. **Impacto:** verificación idéntica Modrinth.
- **M2** Explicit `server-overrides` skip documentado. **Por qué:** spec cliente. **Impacto:** evita copiar servidor.
- **M3** Validar `formatVersion===1` y `game==="minecraft"` en lectura. **Por qué:** `install_mrpack.rs:295` lo exige. **Impacto:** error claro vs crash.
- **M4** Respetar `u32` + `1GiB` skip lookup. **Por qué:** spec. **Impacto:** evita OOM en packs grandes.

### 1.6 Curiosidades

- `fileSize` `u32` max 4GiB-1, upload Modrinth 500MiB, `downloads` siempre incluye `sha1+sha512` (Labrinth `version_creation.rs:450`).
- `PR #4482/#4486` endureció path, luego permitió `.`.
- `PackDependency` serializa `neoforge` pero acepta `neo-forge` alias.

---

## 2. Discover/Search

### 2.1 Spec

`apps/labrinth/src/search/mod.rs:29` `SearchQuery {query, offset, index, limit, new_filters, facets(deprecated), filters, version}` `WILL BE REMOVED V3!` + `search/backend/common.rs:9` `limit cap 100` + `apps/labrinth/src/routes/v2/tags.rs` + `openapi.yaml` `/search`.

Facets actuales: `project_type` (`mod/modpack/resourcepack/shader`), `all_project_types` (`+plugin/datapack`), `categories` (incluye loaders `fabric/forge/neoforge/quilt` + `datapack` + `bukkit/spigot/paper/purpur/folia/velocity/waterfall/sponge`), `versions` (alias `game_versions`), `environment` etc. `index=relevance/downloads/follows/newest/updated`.

**Migración futura `new_filters` (no implementar, solo preparar):**
```
facets=[["project_type:mod"],["versions:1.21.4"],["categories:fabric"]]
→ new_filters=project_types = ["mod"] AND game_versions = ["1.21.4"] AND loaders = ["fabric"]
plugin: project_types = ["mod"] AND (categories = ["bukkit"] OR categories = ["spigot"] OR ...)
```
Campos array requieren `= ["value"]`, `AND/OR/()`, `IN`. Ganancia: V3 compat, `loaders` separado de `categories`, filtros `downloads >1000`. Riesgo no migrar: `410` en V3, `versions` traducción silenciosa falla → versiones incorrectas.

### 2.2 Implementación Kindyr

`main.js:395` `modrinthTypeFilters` (`datapack`→`[["project_type:mod"],["categories:datapack"]]`, `plugin`→7 categories), `404` `modrinthSorts`, `721` `normalizeVersion` regex estricto, `731` `buildModrinthFacets` (hoy `loaderAllowedTypes=['mod','plugin','datapack','all']`), `743` `searchModrinth` (limit 40, offset 10000, `facets=JSON`), `1335` `getModrinthVersions` (`game_versions/loaders` JSON). `sections/descubrir.html:215` `getDiscoverTypes` filtra `all/modpack/plugin` en contexto instancia, `258` `syncDiscoverContextView` fija `version/loader` instancia y fuerza `all→mod`, `238` `selectDiscoverType`, `508` `searchModrinth` con `requestContextId` race guard, `141` `tDiscover` (Modrinth→CurseForge).

### 2.3 Bugs reales (P1)

| # | Archivo:línea | Bug | Por qué | Impacto |
|---|---|---|---|---|
| S1 | `main.js:737` parcial | `datapack/plugin+fabric` aún aplica `categories:fabric` → 0 hits | Datapacks vanilla nunca tienen fabric. | 100% vacío para esas combos (<2% uso). |
| S2 | `sections/descubrir.html:519` | Race `requestContextId` sin `AbortController`, solo relanza | Cambio rápido instancia/proveedor despilfarra requests | Doble fetch, spinner prolongado. |
| S3 | `modrinth.js:237` home sin guard | Home discover sin `requestContextId` | Instance switch muestra versión antigua | Leve stale. |

### 2.4 Diferencias intencionales

- `limit` Kindyr 40 vs server 100, UI 36 → evita payload gigante, intencional.
- `offset` clamp 10000 vs server ilimitado → protege deep pagination.
- `all:[]` sin facet → mix intencional.
- `modrinthSorts` fallback `relevance` → evita 400.
- `normalizeVersion` estricta → UI no expone snapshots en Discover, ok.

### 2.5 Mejoras recomendadas (P1/P2)

- **S-M1** `loaderAllowedTypes = ['mod','all']` solo (quitar `datapack/plugin`). **Por qué:** datapacks vanilla. **Impacto:** corrige 0 hits.
- **S-M2** Migrar `buildModrinthNewFilters` en paralelo (mantener `facets` fallback). **Por qué:** V3. **Impacto:** evita ruptura.
- **S-M3** `AbortController` en `searchModrinth`. **Por qué:** race. **Impacto:** -requests.

### 2.6 Curiosidades

- `loaders` vs `categories` duplicados en índice (`indexing.rs:541` `mrpack_loaders` → categories).
- `all_project_types` histórico, no usar para filtrar; `display_categories` vs `categories`.
- `total_hits` exacto (no aprox), `page=offset/hits_per_page+1`.
- `SearchField` no documentados: `DependencyProjectIds`, `disclosure_types`.

---

## 3. Rate limit / Cache — Investigación + propuesta (sin implementar)

**Remoto:** `ratelimit.rs:9` GCRA `300/min` (`200ms`), `rate_limit:v4` Redis 5min, fail-open, headers `X-Ratelimit-Limit/Remaining/Reset`, `429 retry_after_ms`, `CF-Connecting-IP`. Docs `Ratelimits` + `User Agents` (UA único obligatorio, `KindyrLauncher/1.2.0 (github; contact)`).

**Kindyr:** `main.js:323` UA harcodeado `1.2.0` vs `app.getVersion()` desactualizable, `main.js:1026` `fetchJsonCached` (ETag `304` + disk) solo para Mojang/Fabric/Forge 10min, **no** para `searchModrinth:743`/`getModrinthVersions:1335`. Debounce `450ms` (`descubrir.html:330`) pero sin deduplicación ni `X-Ratelimit` lectura.

**Propuesta coste/beneficio:**
| Mejora | Coste | Beneficio |
|---|---|---|
| Cache `search` hash `facets+query+sort+offset+limit` TTL 5min disk+mem + dedup promise | 30-60 LOC reusando `getHttpDiskCacheFile` | 30-50% menos `/search`, -200ms hit |
| Cache `versions` `projectId|gameVersion|loader` TTL 10min | 20-40 LOC | ~40% menos `/version` |
| Manejo `429 retry_after_ms` + toast retry 1 | 20 LOC `modrinthJson` | UX evita error genérico |
| Respeto `X-Ratelimit-Remaining` proactivo | 80-120 LOC + queue | Solo burst extremo (<5% casos) |

**Bugs:** UA desactualizado, `If-None-Match` inútil para Modrinth (no emite ETag search), sin manejo `429`.

---

## 4. app-lib vs Kindyr — Comparativa instalación `.mrpack`

| Aspecto | `install_mrpack.rs` (Theseus) | Kindyr `installMrpackInstance:1465` / `import-mrpack:3518` | Diagnóstico |
|---|---|---|---|
| Concurrencia | 4 fijo + `fetch/io/db` semáforos separados | `install` 6-20 configurable `runWithConcurrency`, `import` 6 fijo serial batch `downloadChunk` | **Bug leve:** `import` desperdicia throughput (batch espera 6), divergencia. |
| Progreso | `AtomicU64` throttled `total/200 max 256KB` | `install` sin bytes, `import` `mrpack-progress` por archivo | Kindyr simplificado. |
| Hash | `sha1` only `sha1_smol` + CRC32 `ZipError` | `sha512` pref + post-verify, sin CRC32 explícito | Divergencia, ver 1.3. |
| Overrides | Solo `overrides/client-overrides`, CRC32+temp persist | `extractMrpackOverrides:1436` mismo, correcto | OK. |
| Icon | `icon.png` fallback 3 lugares + `edit_icon` | No maneja icon | **Mejora:** copiar icon fallback. |
| Cache | 100 años `ModpackFiles`, 30d `File` | No cache modpack | **Mejora:** cache hash. |
| Limpieza | `remove_all_related_files:680` por `project_id` + path | No huérfanos | **Mejora:** borrar huérfanos en update. |

---

## 5. TODOs accionables

### P0 — Bloqueante compatibilidad `.mrpack` (hacer primero)

- **P0-1** `main.js:2970` **Export `files[]` poblado.** Implementar `collectMrpackFiles` hasheando `overrides` + `mods` (sha1+sha512, `fileSize`), `env`, `downloads` (si es redistribuible) . **Por qué:** pack Kindyr no abre en Prism. **Impacto:** crítico portable.
- **P0-2** `mrpack-utils.js:4` **`normalizeMrpackPath` → `path-util` exacto.** Rechazar `\\`, reservados `CON/PRN…`, permitir `.`. **Por qué:** spec + seguridad. **Impacto:** compat + vuln.
- **P0-3** `mrpack-utils.js:57` **Hash canónico `sha1` primero.** `getPreferredHash` → `sha1` luego `sha512`. **Por qué:** alinea `app-lib`. **Impacto:** verificación idéntica.
- **P0-4** `mrpack-utils.js:63` **No `return true` sin hash.** Exigir al menos `sha1` o marcar `rejected`. **Por qué:** evita file sin verificar. **Impacto:** seguridad.
- **P0-5** `main.js:3518` **Unificar `import-mrpack` y `installMrpackInstance`.** Extraer `installFromPack(pack, opts)` común, conc. `runWithConcurrency` + progreso bytes. **Por qué:** doble mantenimiento. **Impacto:** evita drift `formatVersion`. **Nota:** mantener validación `formatVersion===1` + `game==="minecraft"` explícita.

### P1 — Search frágil / futuro V3

- **P1-1** `main.js:737` **`loaderAllowedTypes = ['mod','all']`** (quitar `datapack/plugin`). **Por qué:** datapacks vanilla. **Impacto:** corrige 0 hits. (Ya fixeado parcial para resourcepack/shader).
- **P1-2** `main.js:743` + `sections/descubrir.html:508` **Migrar `new_filters` (mantener `facets` fallback).** Crear `buildModrinthNewFilters` con `project_types/game_versions/loaders`. **Por qué:** `facets` será removido V3 (TODO). **Impacto:** evita 410 futuro.
- **P1-3** `sections/descubrir.html:519` **`AbortController` para search.** **Por qué:** race. **Impacto:** -requests.
- **P1-4** `modrinth.js:237` **Home guard `requestContextId`.** **Por qué:** stale. **Impacto:** evita versión antigua.
- **P1-5** `main.js:1335` **Cambiar `versions`→`game_versions` en `new_filters` path.** **Por qué:** compat alias puede caer. **Impacto:** versiones correctas futuro.

### P2 — Mejoras / curiosidades

- **P2-1** `main.js:323` **UA dinámico `KindyrLauncher/${app.getVersion()} (github.com/...; contact)`**. **Por qué:** docs Best practice. **Impacto:** evita bloqueo sorpresa.
- **P2-2** `main.js:1026` **Cache `search` 5min + `versions` 10min** (propuesta tabla). **Por qué:** 30-50% req menos. **Impacto:** perf + rate.
- **P2-3** `main.js:768` **Manejo `429` con `retry_after_ms` + toast.** **Por qué:** UX. **Impacto:** evita error genérico.
- **P2-4** `archive-utils.js` **Icon fallback + huérfanos.** **Por qué:** paridad `app-lib`. **Impacto:** UX.

---

### Fuentes

- `https://raw.githubusercontent.com/modrinth/code/main/packages/app-lib/src/api/pack/install_from.rs` L.12,95
- `https://raw.githubusercontent.com/modrinth/code/main/packages/app-lib/src/api/pack/install_mrpack.rs` L.19,195,315,530,680
- `https://raw.githubusercontent.com/modrinth/code/main/packages/path-util/src/lib.rs` L.28,97
- `https://raw.githubusercontent.com/modrinth/code/main/apps/labrinth/src/search/mod.rs` L.29
- `https://raw.githubusercontent.com/modrinth/code/main/apps/labrinth/src/search/backend/common.rs` L.9
- `https://raw.githubusercontent.com/modrinth/code/main/apps/labrinth/src/routes/v2/tags.rs` + `openapi.yaml` `/search`
- `https://support.modrinth.com/en/articles/8802351-modrinth-modpack-format-mrpack`
- Kindyr `C:\KindyrLauncher\mrpack-utils.js:1`, `archive-utils.js:32`, `main.js:395,731,1465,2970,3518`, `sections/descubrir.html:215,258`, `modrinth.js:237`

> Fin fase documentación. Sin commits ni cambios de código.

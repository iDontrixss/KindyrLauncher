# Fase 3 — cachés, logs, listeners y ciclo de vida de ventanas

Estado: completado. Grupos A, B y C validados; benchmark final de tres réplicas registrado.

## Entorno y límites de la medición

- Se leyeron `baseline.md`, `baseline.json` y el informe de Fase 2 antes de comenzar.
- Chrome DevTools MCP no está disponible porque falta Chrome estable en `/opt/google/chrome/chrome`. Se usó CDP temporal del AppImage exclusivamente en `127.0.0.1` para recorrer botones conocidos de Kindyr.
- Métrica: PSS desde `/proc/<pid>/smaps_rollup`; nunca se sumó RSS.
- No se cambiaron flags gráficos, Electron, XMCL ni `electron-updater`.

## Mapa previo

| Elemento | Tipo, crecimiento y limpieza | Límite actual / riesgo | Cambio mínimo recomendado |
| --- | --- | --- | --- |
| `minecraftVersionCache` | Un objeto `{ cachedAt, versions }`; se llena al consultar el manifiesto Mojang y se libera por TTL. | TTL de 10 min; una lista de versiones. Riesgo bajo y acotado. | Conservar; no añadir otra caché. |
| `loaderVersionCache` | Objeto por loader con `{ cachedAt, versions }`; Forge/NeoForge pueden contener listas grandes. | TTL de 10 min y máximo de 5 claves; borra primero vencidas y luego las más antiguas. Riesgo ya mitigado. | Conservar y validar con harness, sin duplicar política. |
| `loaderVersionRequests` | `Map` de promesas en vuelo. | Se elimina en `finally`; sin retención tras petición. | Sin cambio. |
| `customInstancesCache` | Array de instancias serializables; se copia al leer y se reemplaza al guardar. | Sin TTL, pero el cardinal esperado es bajo; no crece por navegación. | Sin política adicional salvo evidencia de crecimiento. |
| `launcherSettingsCache` | Objeto pequeño de settings y rutas Java. | Se reemplaza al guardar; cardinal fijo. | Sin cambio. |
| `storageCacheInMemory` | Resumen numérico de almacenamiento. | TTL en memoria de 5 min; riesgo de memoria bajo. La caché de disco no lleva fecha, un problema de frescura, no de retención. | No tocar en esta fase salvo evidencia. |
| `pendingLogLines` / `pendingLogBytes` | Cola de escritura a archivo de launcher. | 500 líneas o 512 KiB y flush a 250 ms; una línea se normaliza a 3.000 caracteres, lo que limita memoria pero también trunca el archivo persistente. | Separar límite de UI/IPC del registro persistente; evitar que una línea grande entre en la cola y serializar escrituras. |
| Consola renderer | `pendingConsoleLines` (40) y `consoleLines` (120); cada mensaje se recorta a 180 caracteres. | Límite por líneas, no por bytes; descartes silenciosos. | Añadir contabilidad de bytes y una única línea-resumen de descartes para UI. |
| Splash | `BrowserWindow` global y un `setInterval` dentro de su renderer. | Al cerrar la ventana se destruyen renderer e intervalo. El `setTimeout` de `ready-to-show` no tiene referencia cancelable. | Guardar y cancelar el temporizador de cierre; cerrar splash si se destruye main antes de mostrarla. |
| Main / onboarding / update confirmation | Referencias globales se ponen en `null` con `closed`; onboarding usa `global.onboardingWindow`. | No hay pool; update confirmation no tiene temporizador propio. | Mantener; verificar unicidad y callbacks pendientes. |
| IPC y listeners | 44 registros `ipcMain` en evaluación de `main.js`; no se registran desde `createWindow`. Las secciones usan `loadedSections`, por lo que sus scripts/listeners se cargan una vez. | No hay duplicación por recrear ventana. | Sin re-registro; validar tras build. |
| AbortController / peticiones de vistas | No se encontraron `AbortController`. Las secciones se mantienen cargadas y no crean listeners repetidos al navegar. | Las peticiones ya iniciadas pueden completar tras cambiar de vista; no se observó multiplicación de DOM. | Documentar como limitación; no introducir cancelación amplia sin evidencia. |

## Medición previa de navegación acumulada

AppImage de Fase 2; Inicio → Instancias → Descubrir → Skins → Ajustes, 10 veces por ciclo, espera de 30 s, misma instancia.

| Punto | Total PSS | Procesos | Renderers | main | renderer | GPU | Network Service |
| --- | ---: | ---: | ---: | ---: | ---: | ---: | ---: |
| Reposo 60 s | 295.620 KiB | 8 | 1 | 107.324 | 93.618 | 31.769 | 28.319 |
| Navegación ciclo 1 + 30 s | 311.885 KiB | 8 | 1 | 116.619 | 99.075 | 31.804 | 29.603 |
| Navegación ciclo 2 + 30 s | 316.962 KiB | 8 | 1 | 116.756 | 103.884 | 32.115 | 29.418 |
| Navegación ciclo 3 + 30 s | 322.059 KiB | 8 | 1 | 117.062 | 108.688 | 32.115 | 29.409 |
| Navegación ciclo 4 + 30 s | 325.183 KiB | 8 | 1 | 118.842 | 110.040 | 32.115 | 29.400 |

El crecimiento fue gradual (+13.298 KiB entre los ciclos 1 y 4), concentrado en main y renderer. DOM observado al final de cada recorrido: 1.761 nodos; no aparecieron renderers ni ventanas adicionales. No se observó recuperación en las esperas de 30 s. Este resultado identifica una necesidad de validar ciclo de vida, pero no prueba una fuga ni asigna causalidad a una caché concreta.

## Grupos

### A. Cachés

No se modificó código. El código existente ya elimina entradas vencidas y retiene como máximo cinco claves de `loaderVersionCache`. Un harness con una entrada de manifiesto vencida, entradas de loader vencidas/malformadas y ocho entradas vigentes conservó exactamente las cinco más recientes (`fifth`, `fourth`, `newest`, `second`, `third`) y liberó el manifiesto vencido. `node --check main.js` pasó.

Se conserva el grupo sin cambio: no se observó una brecha de límites que justificara introducir otra política de caché, y `customInstancesCache` no mostró crecimiento atribuible a la navegación.

### B. Logs

Se aplicaron únicamente límites a las colas destinadas al UI y al batch de escritura, sin truncar el archivo persistente:

- `pendingLogLines`: máximo existente de 500 líneas o 512 KiB, con flush a los 250 ms. Una línea mayor de 64 KiB se escribe tras vaciar el batch, sin quedar retenida en memoria y sin truncarla en disco. El callback de vaciado mantiene el orden entre el batch previo y esa escritura directa.
- Consola del renderer: 40 líneas u 8 KiB pendientes; historial visible de 120 líneas o 32 KiB. La política es FIFO. Cuando descarta, agrega una sola línea-resumen `[UI] Se descartaron N líneas...` en lugar de emitir una por línea.
- `clearConsole` ahora reinicia también contadores de bytes y descartes.

Harness antes del cambio: una línea de 2 MiB era normalizada antes de persistirse; el archivo resultante era de 7.284 bytes. Harness después: la misma línea y 199 adicionales dejaron 0 líneas y 0 bytes en la cola, escribieron 2.101.233 bytes y confirmaron `preservedHugeLine: true`; el recorrido sin I/O real demoró 3,9 ms. El RSS del proceso de harness aumentó temporalmente 12.072 KiB y no se interpretó como una regresión: no se usó `global.gc()` y V8 puede retener su heap tras manejar el string.

Un segundo harness con 1.000 líneas de consola confirmó 41 líneas visibles, 0 pendientes, 8.199 bytes retenidos (por debajo de 32 KiB) y un solo resumen de descarte. `node --check main.js` y `node --check common.js` pasaron.

### C. Ventanas/listeners

Se agregó exclusivamente un `splashCloseTimer` cancelable. El callback de `ready-to-show` conserva la ventana a la que pertenece, verifica que no fue destruida y se cancela al cerrar splash, main o la última ventana. Al cerrar main, se libera su referencia y se cierra el splash aún abierto; las referencias de onboarding y confirmación de actualización ya se limpiaban con `closed` y se conservaron sin cambio.

Los 44 handlers IPC permanecen registrados a nivel de módulo, no desde `createWindow`, por lo que recrear una ventana no los duplica. En una ejecución de desarrollo se recorrieron las cinco vistas por CDP local: hubo un renderer, 1.761 nodos DOM y todas las vistas estuvieron presentes. `node --check main.js` pasó.

## Build, ASAR y AppImage

- `npm run build:linux` falló dentro del sandbox con `No JSON content found in output`: electron-builder dejó vacío el archivo temporal de `npm list`, aunque el mismo `npm list -a --include prod --include optional --omit dev --json --long --silent --loglevel=error` produjo JSON válido de 503.343 bytes. No se modificaron dependencias ni configuración para sortearlo.
- El mismo build ejecutado fuera del sandbox terminó correctamente con electron-builder 26.8.1 y Electron 42.3.0. AppImage: `Kindyr Launcher-1.2.0.AppImage`, 124.991.173 bytes, ejecutable.
- El ASAR contiene `main.js`, `common.js`, `navigation.js`, `launcher.js`, `index.html` y las cinco secciones. No contiene `tools/performance`, Clinic, MemLab ni Knip.
- El AppImage se inició en las tres réplicas y las cinco vistas se recorrieron mediante CDP sólo en `127.0.0.1`. Cada réplica cerró con cero procesos de Kindyr restantes.

## Benchmark final

Fecha: 2026-07-26. Cada réplica: AppImage nuevo, reposo 60 s; Inicio → Instancias → Descubrir → Skins → Ajustes diez veces por ciclo; cuatro ciclos con espera de 30 s; recuperación a 30 y 60 s. PSS se leyó de `smaps_rollup` por proceso. El proceso auxiliar `broker` explicó la variación entre ocho y nueve procesos; no hubo más de un renderer ni más de 1.761 nodos DOM.

| Punto | Mínimo PSS | Mediana PSS | Máximo PSS | Procesos | Renderers |
| --- | ---: | ---: | ---: | ---: | ---: |
| Reposo 60 s | 278.952 KiB | 284.609 KiB | 305.322 KiB | 8–9 | 1 |
| Navegación ciclo 1 + 30 s | 304.905 KiB | 310.414 KiB | 317.879 KiB | 8–9 | 1 |
| Navegación ciclo 4 + 30 s | 320.833 KiB | 330.601 KiB | 338.697 KiB | 8–9 | 1 |
| Recuperación 30 s | 320.695 KiB | 330.616 KiB | 338.700 KiB | 8–9 | 1 |
| Recuperación 60 s | 320.718 KiB | 330.532 KiB | 338.727 KiB | 8–9 | 1 |

En la muestra mediana, reposo tuvo main 107.946 KiB, renderer 80.143 KiB, GPU 34.964 KiB, Network Service 27.898 KiB, zygotes 26.289 KiB y broker/otros 8.180 KiB. En el ciclo 4 mediano: main 118.285 KiB, renderer 113.362 KiB, GPU 35.488 KiB, Network Service 29.116 KiB, zygotes 26.146 KiB y broker/otros 8.204 KiB.

El crecimiento mediano fue 25.805 KiB después del primer ciclo y 45.992 KiB tras cuatro ciclos respecto al reposo. Entre ciclo 4 y la espera de 60 s se recuperaron sólo 69 KiB en la mediana. Esto confirma retención/caché de navegación por investigar, pero no demuestra una fuga ni permite atribuirla a los cambios de esta fase: la dispersión de reposo fue 26.370 KiB y la ejecución con GPU/proceso broker varió entre réplicas.

## Limitaciones y continuación

- Chrome DevTools MCP sigue indisponible: `list_pages` falla porque falta `/opt/google/chrome/chrome`. CDP temporal de Electron funcionó sólo en localhost; no se dejaron flags ni instrumentación permanentes.
- No se ejecutaron instalación ni lanzamiento de Minecraft.
- La siguiente sesión debe perfilar la retención de renderer durante navegación con heap snapshots/CDP o MemLab cuando Chrome DevTools MCP esté operativo, correlacionando objetos DOM/JS con las secciones cargadas. No aplicar lazy loading, updater ni `utilityProcess` como parte de esta fase.

## Continuación

1. Verificar de nuevo el entorno y abrir el AppImage sólo con CDP local:

   ```bash
   './dist/Kindyr Launcher-1.2.0.AppImage' --remote-debugging-address=127.0.0.1 --remote-debugging-port=9222
   ```

2. Capturar heap snapshots del único renderer antes de navegar y después del ciclo 4; comparar retenciones de DOM/JS. Si Chrome DevTools MCP sigue sin Chrome estable, usar CDP local como en esta fase.
3. Repetir el benchmark de navegación de este informe antes de conservar cualquier cambio posterior. No iniciar instalación ni Minecraft todavía.

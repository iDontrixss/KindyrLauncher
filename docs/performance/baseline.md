# Línea base de rendimiento — Fase 1

Fecha de captura: 2026-07-23. Esta línea base mide el AppImage existente; no se reconstruyó ni se modificó lógica del launcher.

## Entorno y artefacto

- Commit / rama: `becee684ed1f249dea5073cc4394067290dbf2b9` / `main`.
- Runtime: Node `v26.4.0`, npm `12.0.1`, Electron `42.3.0`, Electron Builder instalado `26.8.1` (rango declarado `^26.0.12`).
- SO gráfico: kernel `7.1.3-2-cachyos`, Wayland (`wayland-0`; `DISPLAY=:0`).
- GPU: NVIDIA GeForce GT 440, controlador `nouveau`. Se conservó el modo gráfico seguro: el proceso GPU mostró `--use-gl=disabled` y el renderer `--disable-gpu-compositing`.
- AppImage: `dist/Kindyr Launcher-1.2.0.AppImage`, 124.991.191 bytes, modificada `2026-07-23 01:37:09 -03`, ejecutable. SHA-256: `43b3d1806885197bb3d13b6f3af8a350a2cdc192ab5d90f213f31ba1ec9e13e6`.
- Builder: `files` enumera los recursos de ejecución; `extraResources` sólo añade `assets/icon.ico`. El ASAR contiene los scripts requeridos por `index.html` (`common`, `navigation`, `accounts`, `instances`, `modrinth`, `launcher`) y no contiene rutas de MemLab, Clinic, Knip, Chrome DevTools ni `tools/performance`.

El árbol ya tenía cambios sin commit antes de esta tarea, incluidos archivos funcionales, `package.json`, `package-lock.json`, `knip.json` y `tools/`. Se preservaron. El estado se documentó, pero no se usa como representación del AppImage medido.

## Herramientas

| Herramienta | Estado | Versión / resultado |
| --- | --- | --- |
| Codebase Memory MCP | disponible | Grafo conectado como `kindyr-launcher-current` (520 nodos, 1.437 aristas). |
| Chrome DevTools MCP | instalado, no conectable | El adaptador requiere Chrome estable en `/opt/google/chrome/chrome`, ausente. Se usó CDP temporal del Electron en `127.0.0.1:9222`. |
| MemLab | instalada | `2.0.4`, declarada en `devDependencies`; `memlab --help` no respondió en 20 s. El runner existente no descarga Chrome y exige un ejecutable compatible. |
| Clinic.js | disponible | `13.0.0`, declarada en `devDependencies`; funciona con `XDG_CONFIG_HOME` temporal. El runner fue sólo dry-run. |
| Knip | disponible | `6.29.0`, declarada en `devDependencies`; `--version` y `--help` correctos. |
| Scripts existentes | disponibles | `pss.sh`, `processes.sh`, `app-metrics.js`, `imports.js`, `clinic-runner.js`, `memlab-runner.js`, `memlab-scenario.js`, README. |

Las herramientas npm figuran en `devDependencies`; la inspección del ASAR confirma que las herramientas de diagnóstico no están empaquetadas.

## Metodología

Métrica principal: PSS de `/proc/<pid>/smaps_rollup`; los totales son la suma de PSS de los procesos `kindyrlauncher`. RSS se registró sólo en el script existente y no se sumó como RAM real. Se mantuvo el AppImage abierto con `--remote-debugging-address=127.0.0.1 --remote-debugging-port=9222` exclusivamente durante la prueba; no se modificaron flags gráficos.

- Arranque frío: se cerró Kindyr antes de cada réplica, y se midió a 10, 30 y 60 s.
- Reposo: corresponde al punto de 60 s de cada arranque, sin interacción.
- Navegación: Inicio, Instancias, Descubrir, Skins y Ajustes, en ese orden, 10 veces (50 clics); espera de 30 s.
- Red liviana: Descubrir y Skins, sin instalar ni descargar; espera de 8 s por vista hasta completar las peticiones.
- CPU: lectura de `ps %CPU` para arranque y muestras de 1 s tras navegación/red. Tras navegación y red las muestras fueron 0,00 % en todos los procesos; por ello PSS es el indicador comparativo fiable de esta fase.

Comandos reproducibles principales:

```bash
./dist/Kindyr\ Launcher-1.2.0.AppImage --remote-debugging-address=127.0.0.1 --remote-debugging-port=9222
KINDYR_PROCESS_PATTERN='kindyrlauncher' npm run perf:pss
KINDYR_PROCESS_PATTERN='kindyrlauncher' npm run perf:processes
curl --fail --silent http://127.0.0.1:9222/json/list
```

Para repetir exactamente la suma de PSS, iterar `pgrep -x kindyrlauncher` y leer `Pss:` de cada `smaps_rollup`; no usar la suma RSS.

## Resultados PSS

Todas las cifras son KiB; MiB usa 1024 KiB. El detalle bruto por proceso está en `baseline.json`.

| Escenario | Réplicas PSS total (KiB) | Mínimo | Mediana | Máximo |
| --- | ---: | ---: | ---: | ---: |
| Arranque, 10 s | 283.876 / 287.111 / 287.574 | 283.876 | 287.111 | 287.574 |
| Arranque, 30 s | 281.519 / 282.526 / 283.790 | 281.519 | 282.526 | 283.790 |
| Arranque y reposo, 60 s | 278.943 / 279.940 / 282.793 | 278.943 | 279.940 | 282.793 |
| Navegación + 30 s | 314.857 / 295.529 / 296.013 | 295.529 | 296.013 | 314.857 |
| Red liviana completada | 321.633 / 298.624 / 298.118 | 298.118 | 298.624 | 321.633 |

Network Service en red liviana: 31.296 / 26.634 / 26.579 KiB (mín. 26.579, mediana 26.634, máx. 31.296). Navegación: 8 / 9 / 9 procesos y 1 / 2 / 2 renderers; se observó una ventana de splash adicional en la tercera ejecución. No se infiere una fuga a partir de esa diferencia; queda como variabilidad que la siguiente fase debe controlar.

## DevTools/CDP

Chrome DevTools MCP no llegó al Electron porque falta Chrome estable. CDP del propio Electron funcionó en localhost y se cerró al final.

- Renderer visible: 1 página principal; en la tercera ejecución coexistió un renderer adicional asociado al splash.
- DOM: 1.761 nodos, estable en las tres recorridas de navegación observadas.
- Navegación: 41--93 recursos acumulados según ejecución. Red liviana: 16 `fetch` a perfiles de Mojang; no hubo instalación ni descarga de Minecraft.
- Tareas largas observadas durante la carga de Skins: 61 ms, 57 ms y 51 ms.
- Consola: errores repetidos de `skinview3d` al crear contexto WebGL, seguido de fallback 2D. Es coherente con el modo gráfico seguro (`GL_RENDERER = Disabled`); no se cambiaron flags.
- Timers y listeners: las APIs web estándar no exponen handles de timers activos; `getEventListeners` no está disponible en Runtime CDP. No se dejó instrumentación para enumerarlos.

## Limitaciones y problemas

- No se ejecutaron descarga completa, instalación ni lanzamiento de Minecraft.
- MemLab no se ejecutó: el preflight requiere un Chrome compatible y no instala navegadores; su CLI no respondió al `--help` dentro de 20 s.
- Clinic y Knip se verificaron sin perfilar el AppImage ni cambiar código.
- Los recursos con `transferSize=0` en CDP no permiten concluir fallo de red para `file://`; se conservaron como metadato, no como error.
- Las lecturas iniciales de CPU con `ps %CPU` son acumuladas desde inicio; para comparaciones futuras usar siempre deltas de 1 s o `pidstat`.

## Continuación

1. Confirmar y estabilizar el ciclo de vida del splash para que las siguientes mediciones separen claramente una y dos ventanas/renderer.
2. Repetir esta línea base en el mismo AppImage con una muestra CPU de 1 s por réplica y, si se dispone de Chrome compatible, ejecutar el escenario MemLab sin alterar la app.
3. Sólo después, analizar las causas de los errores WebGL/fallback y de la variación de renderer; no aplicar lazy-loading ni otras optimizaciones hasta revisar esta base.

Antes de iniciar una medición nueva, cerrar restos y comprobar:

```bash
pkill -x kindyrlauncher || true
pgrep -af 'kindyrlauncher|memlab|clinic|chrome-devtools' || true
```

# Diagnóstico de rendimiento de Kindyr

Estas herramientas son opt-in y no cambian el launcher. Los resultados de Knip son candidatos para revisión, no pruebas definitivas de código o dependencias sin uso.

## Procesos Linux

```bash
npm run perf:pss
npm run perf:processes
KINDYR_PROCESS_PATTERN='Kindyr|kindyr|electron' npm run perf:processes
```

`perf:pss` muestra PSS total por proceso y `perf:processes` muestra RSS, PSS y memoria privada (`Private_Clean + Private_Dirty`). Ambos leen `/proc` y no envían señales.

## Imports

```bash
npm run perf:imports
```

Mide el tiempo de carga CommonJS de `electron-updater`, `adm-zip`, `@xmcl/core`, `@xmcl/file-transfer` y `@xmcl/installer`. Puede cargar código de inicialización de los paquetes; no inicia el launcher.

## App metrics

El `main.js` que ya estaba en el worktree incluye un hook opt-in para el launcher:

```bash
KINDYR_PROFILE=1 npm start
```

Ese modo imprime checkpoints con `app.getAppMetrics()` y PSS. No se modificó ese código durante esta preparación.

```bash
ELECTRON_PERF_APP_METRICS=1 ./node_modules/.bin/electron tools/performance/app-metrics.js
```

Este probe demuestra la captura de `app.getAppMetrics()` dentro de un proceso Electron controlado y no arranca el launcher real.

## Knip

```bash
npm run perf:knip
```

La configuración incluye CommonJS, entradas HTML y preload/main de Electron. No elimina nada.

## MemLab

```bash
npm run perf:memlab
```

El comando usa el escenario mínimo preparado en `memlab-scenario.js` y requiere un Chrome compatible. No incluye acciones largas ni descarga navegadores. Para el renderer real, definí `KINDYR_MEMLAB_URL` con una URL de diagnóstico disponible.

## Clinic.js

Clinic perfila scripts Node aislados, no el AppImage:

```bash
npm run perf:clinic
KINDYR_CLINIC_RUN=1 npm run perf:clinic
```

Sin `KINDYR_CLINIC_RUN=1` sólo imprime comandos. Con la variable activa ejecuta Doctor, Flame y Bubbleprof sobre `imports.js`; Heap Profiler se puede lanzar con `KINDYR_CLINIC_MODE=heap`. Reemplazá el script objetivo con `KINDYR_CLINIC_SCRIPT` si necesitás perfilar otro script Node aislado.

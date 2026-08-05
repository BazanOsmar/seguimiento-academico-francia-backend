# Revisión del módulo de Carga de Notas (Calificaciones)

> ✅ **Actualización 2026-07-15:** corregidos en la rama `fix/notas-estudiante-id` (sin commitear aún): **C-3** (el confirmar responde `guardado: False` + status 500 si `errores > 0`, captura `BulkWriteError` con contadores reales y no calcula snapshots mensuales ni dispara K-Means sobre datos fallidos), **C-4** (alias global `window.showToast = _apiToast` en `api.js`), **C-5** (`CACHES` con `DatabaseCache` en `base.py` — requiere `manage.py createcachetable` en cada entorno; ya creada en local), **A-1** (labels SABER/HACER corregidos), **A-2** (nuevo `validar_rango_notas`: 0–10/0–45/0–40/0–5 autoeval), **A-3** (solo `.xlsx` en backend, JS y templates), **A-4** (`logger.exception` en todos los except mudos del service + logger `backend.apps.academics` en LOGGING), **A-5** (`eliminar_notas_mes` filtra `fecha_cambio` por rango UTC del mes de La Paz vía `_rango_mes_utc`), **M-6** (gestión siempre con `timezone.localtime`). Pendientes: M-1…M-5, M-7, B-*, y el "cap" del export (A-2 nota: se mantuvo por datos viejos).

> ✅ **Actualización 2026-07-07:** **C-1 y C-2 corregidos** en la rama `fix/notas-estudiante-id` (commit `0a4a38b`, desplegada en staging): `guardar_notas`/`comparar_notas_con_mongo`/`calcular_notas_mensuales` traducen nro de planilla → PK real vía `mapa_nro_pk` (construido en `validar_estudiantes`), los documentos guardan `nro_planilla`, y el índice único incluye `gestion` + `curso_id`. Los datos de staging se regeneraron con `manage.py seed_notas_v3` (backup previo en `/opt/francia/backups/backup_notas_20260707`). Pendiente: mergear a `master` y el resto de hallazgos (C-3, C-4, C-5, A-*).

**Fecha:** 2026-07-06
**Alcance:** flujo completo de calificaciones — validación de planilla, guardado en MongoDB, visualización (profesor y director), edición implícita (re-subida con diff) y eliminación de notas del mes.
**Rama revisada:** `master` (commit `b59ec5e`).

> ⚠️ **Nota previa importante:** la rama activa `develop` (donde estás parado ahora) **NO contiene el código de notas**. Los archivos `planilla_views.py`, `notas_mongo_service.py`, `director_notas_views.py`, `carga_calificaciones.js`, etc. solo existen en `master` y `universidad`. En tu working tree quedaron `__pycache__` huérfanos (`.pyc` sin su `.py`). Si sigues desarrollando en `develop` y mergeas a `master`, hay riesgo de conflictos raros o de pisar la funcionalidad de notas. Ver hallazgo **G-1**.

---

## Tabla resumen

| ID | Severidad | Área | Problema | Archivo principal |
|----|-----------|------|----------|-------------------|
| C-1 | 🔴 Crítico | Guardado / Consulta | `estudiante_id` en Mongo es el **Nro de fila de la planilla**, no el ID real del estudiante en SQL. Todos los endpoints que consultan por PK real no matchean o matchean al estudiante equivocado | `notas_mongo_service.py` |
| C-2 | 🔴 Crítico | Guardado | Índice único y filtro de `UpdateOne` **sin `curso_id` ni `gestion`** → colisión entre paralelos con la misma materia: el segundo curso no puede guardar (duplicate key silencioso) | `notas_mongo_service.py` |
| C-3 | 🔴 Crítico | Guardado | `ConfirmarPlanillaView` devuelve `guardado: True` aunque el `bulk_write` haya fallado por completo; escritura parcial deja el mes "bloqueado" sin poder reintentar | `planilla_views.py` |
| C-4 | 🔴 Crítico | Frontend | `showToast()` **no existe en ningún archivo** → `ReferenceError` en 6 rutas de error de la carga; el profesor no ve ningún mensaje cuando algo falla | `carga_calificaciones.js` |
| C-5 | 🔴 Crítico | Infraestructura | `draft_token` guardado en `LocMemCache` (no hay `CACHES` en settings): con gunicorn multi-worker en el VPS el confirmar puede caer en otro proceso → "El tiempo para confirmar venció" al instante, de forma intermitente | `planilla_views.py` / settings |
| A-1 | 🟠 Alto | Muestra | Etiquetas **SABER y HACER intercambiadas** en el dashboard: las notas de SABER se muestran bajo el encabezado "HACER" y viceversa | `carga_calificaciones.js` |
| A-2 | 🟠 Alto | Validación | **No se valida el rango de la nota** (0–45 / 0–40 / 0–10). Una nota de 450 pasa la validación y se guarda | `planilla_validator_2026.py` |
| A-3 | 🟠 Alto | Validación | Se acepta `.xls` pero openpyxl **no soporta .xls** → siempre falla con un mensaje engañoso | `planilla_views.py` |
| A-4 | 🟠 Alto | Todo el módulo | `except Exception: pass / return {}` por todas partes: si Mongo está caído, el diff dice "sin cambios", el modo lectura muestra vacío y nadie se entera del error real | `notas_mongo_service.py` |
| A-5 | 🟠 Alto | Eliminación | `eliminar_notas_mes` filtra el historial con `$month` de `fecha_cambio` en **UTC**: cambios hechos después de las 20:00 (Bolivia, UTC−4) del último día del mes caen en el mes siguiente y no se revierten | `notas_mongo_service.py` |
| M-1 | 🟡 Medio | Muestra | Fallback nro→nombre asume que el orden alfabético actual del curso = orden de la planilla original; si un estudiante se agrega o da de baja, los nombres se corren | `notas_mongo_service.py` |
| M-2 | 🟡 Medio | Validación | `ValidarPlanillaView` no verifica `hay_notas_mes`: valida OK, entrega token, y recién el confirmar rechaza con "ya fueron subidas" | `planilla_views.py` |
| M-3 | 🟡 Medio | Cálculo | Recuperatorios: se excluyen de la completitud pero **sí dividen** el promedio mensual → quien no rindió recuperatorio recibe un 0 implícito | `notas_mongo_service.py` |
| M-4 | 🟡 Medio | Validación | Match del nombre del maestro falla si el profesor no tiene `first_name`/`last_name` (compara contra el username) | `planilla_validator.py` |
| M-5 | 🟡 Medio | Seguridad | Upload sin límite de tamaño de archivo; endpoint de eliminar sin throttling (permite fuerza bruta de la contraseña del director) | `planilla_views.py`, `director_notas_views.py` |
| M-6 | 🟡 Medio | Consistencia | `gestion`/mes calculados a veces con `timezone.now()` (UTC) y a veces con `localtime()` (La Paz) — inconsistente entre vistas | varios |
| M-7 | 🟡 Medio | Eliminación | Borrar la carga de **una materia** elimina las predicciones K-Means de **todo el curso** de ese mes | `notas_mongo_service.py` |
| B-1 | 🔵 Bajo | Cálculo | `round()` de Python usa redondeo bancario: 44.5 → 44 | `planilla_validator_2026.py` |
| B-2 | 🔵 Bajo | Frontend | Código muerto: `_buildSuccessSummary`, `overallAverage`, `riskCount`, `coverage` se calculan y nunca se muestran; umbral 60 sobre escala 95 | `carga_calificaciones.js` |
| B-3 | 🔵 Bajo | Frontend | `_fmt1()` promete 1 decimal pero redondea a entero; estilos inline manipulados con `cssText` pisan otros estilos | `carga_calificaciones.js` |
| G-1 | ⚙️ Estructural | Git | El código de notas no existe en `develop`; hay `.pyc` huérfanos en el working tree | repositorio |

---

## Hallazgos críticos (detalle)

### C-1. `estudiante_id` en Mongo no es el ID del estudiante

**Qué está mal.** El docstring de `notas_mongo_service.py` dice:

```
estudiante_id: int — FK → tabla estudiantes (SQL)
```

pero lo que realmente se guarda en `guardar_notas()` es `n['nro']`, que viene de `_extraer_headers_trim()` en `planilla_validator_2026.py`: **la columna A del Excel, o sea la posición 1, 2, 3… del estudiante en la planilla**. Lo confirma el propio fallback de `obtener_notas_mes()`: *"mapea posición 1,2,3… → nombre completo"*.

Sin embargo, varios endpoints consultan `detalle_notas` con el **PK real** de `Estudiante`:

- `NotasEstudianteProfesorView` → `obtener_detalle_notas_tutor(estudiante_id=<PK>)`
- `ResumenGrupoProfesorView` → `obtener_promedios_grupo(materia_id, [e.id, ...])`
- Los endpoints del tutor (móvil) → `obtener_detalle_notas_tutor`, `promedios_saber_hacer_por_materia`, `ultima_carga_por_materia`
- `predicciones_arbol` queda indexada por ese pseudo-id

**Consecuencia.** Si los PKs de tus estudiantes no coinciden casualmente con su posición en la planilla (con más de un curso es imposible que coincidan, porque los PKs son globales y los "nro" reinician en 1 por curso), estos endpoints devuelven **vacío o las notas de otro estudiante**. Esto explica síntomas del tipo "el resumen del grupo sale sin notas" o "el detalle muestra notas de otro alumno".

**Cómo arreglarlo.**
1. En `validar_estudiantes()` ya se hace el match nombre-Excel ↔ nombre-BD; ampliarlo para que devuelva un mapa `nro → estudiante.id` (agregando `id` al `.values(...)` y guardando en cada entrada de `lista_estudiantes` el `estudiante_id` real).
2. Guardar ese mapa dentro del draft en cache (`planilla_views.py`) y pasarlo a `guardar_notas()` / `calcular_notas_mensuales()` para traducir `n['nro']` → PK real antes de escribir.
3. Conservar `nro_planilla` como campo adicional del documento (útil para reconstruir la vista de planilla).
4. Migración de datos: script que recorra `detalle_notas`/`notas_mensuales`/`historial_notas` existentes y reasigne `estudiante_id` usando el orden alfabético del curso (mientras nadie haya cambiado la lista, el mapeo es recuperable).

---

### C-2. Índice único y filtro de actualización sin `curso_id` ni `gestion`

**Qué está mal.** En `ensure_indexes()` (que sí se ejecuta, desde `apps.py`):

```python
db['detalle_notas'].create_index([
    ('estudiante_id', ...), ('materia_id', ...), ('trimestre', ...),
    ('dimension', ...), ('columna_idx', ...),
], unique=True, name='upsert_key')
```

y el filtro del `UpdateOne` en `guardar_notas()` usa exactamente esas mismas 5 claves. **Falta `curso_id` y `gestion`.**

Como `Materia.nombre` es `unique=True`, la misma `materia_id` (p. ej. Matemática) se comparte entre 1ro "A" y 1ro "B". Combinado con C-1 (`estudiante_id` = nro 1..N en ambos cursos), las claves colisionan:

- El profesor del paralelo "A" sube Matemática, trimestre 1 → inserta `(1, mat, 1, saber, 19)`, `(2, mat, 1, saber, 19)`, …
- El profesor del paralelo "B" sube Matemática del mismo trimestre → sus `InsertOne` tienen **las mismas claves** → `bulk_write` lanza `BulkWriteError` por duplicate key.
- El `except Exception` lo traga, marca `errores = len(operaciones)`… y por C-3 el profesor ve "éxito".

**Resultado: el segundo paralelo de cualquier materia compartida no puede guardar notas jamás**, y nadie recibe un error visible. Este es el candidato número uno a los "bugs raros" que mencionas.

Además, sin `gestion` en la clave: en 2027, la planilla nueva hará *update* sobre los documentos de 2026 (mismo trimestre/columna) en lugar de insertar, destruyendo el histórico de la gestión anterior.

**Cómo arreglarlo.**
1. Rehacer el índice único como `(gestion, curso_id, materia_id, trimestre, dimension, columna_idx, estudiante_id)`.
2. Agregar `curso_id` y `gestion` al filtro del `UpdateOne` en `guardar_notas()` (y verificar `eliminar_notas_mes`, que sí los incluye en `clave_det` — ese está bien).
3. Para migrar: `dropIndex('upsert_key')` y `create_index` con la clave nueva (revisar duplicados antes).
4. Nota: si arreglas C-1 (PK real), la colisión entre cursos desaparece por sí sola, pero el índice **igual** debe incluir `gestion` y conviene incluir `curso_id` por si un estudiante cambia de curso a mitad de año.

---

### C-3. El confirmar reporta éxito aunque el guardado falle

**Qué está mal.** En `guardar_notas()`:

```python
try:
    col.bulk_write(operaciones, ordered=False)
except Exception:
    errores = len(operaciones)
    insertados = actualizados = 0
```

y en `ConfirmarPlanillaView` el contador `errores` se suma al resultado pero **nunca se evalúa**: la vista siempre responde `{'guardado': True, ...}`. El frontend muestra el panel "done" con "Notas guardadas correctamente".

Agravantes:

1. Con `ordered=False`, un `BulkWriteError` significa **escritura parcial**: algunos documentos sí entraron. Pero el código reporta 0 insertados, y lo guardado a medias hace que `hay_notas_mes()` devuelva `True` → el profesor queda **bloqueado para reintentar ese mes** (solo el director puede eliminar la carga).
2. `calcular_notas_mensuales` corre igual sobre los datos parciales → snapshots mensuales incorrectos → K-Means/árbol se alimentan de datos corruptos.
3. El historial (`historial_notas`) solo se salta si falló *todo* — con fallo parcial se insertan historiales de updates que quizá no se aplicaron.

**Cómo arreglarlo.**
1. Capturar `pymongo.errors.BulkWriteError` específicamente y leer `exc.details['writeErrors']` para saber exactamente qué falló y cuánto se escribió (`nInserted`, `nModified`).
2. Si `errores > 0`, responder con status 500/207 y `guardado: False` (o `parcial: True`), con el detalle, y **loggear** el error (`logger.exception`).
3. En el frontend, si `resultado.errores > 0`, mostrar el estado de error en el diálogo en vez del panel "done".
4. Considerar compensación: si el guardado fue parcial, ofrecer al profesor re-subir — para eso `ConfirmarPlanillaView` debería permitir re-confirmar cuando la carga previa del mes quedó marcada como fallida (p. ej. guardando un flag en una colección `cargas` con estado `completa/parcial`).

---

### C-4. `showToast` no está definida en ninguna parte

**Qué está mal.** `carga_calificaciones.js` llama a `showToast(...)` en 6 lugares:

- extensión de archivo inválida (`_setArchivo`)
- falta `pc_id` (`_validarPlanilla`)
- confirmar sin token, token vencido, error del servidor y error de conexión (`_confirmarPlanilla`)

pero `showToast` **no existe en ningún JS del proyecto** (en `api.js` solo hay `_apiToast`; `academico.js` incluso se protege con `typeof showToast === 'function'`, señal de que alguien ya sospechó esto).

**Consecuencia.** Cada una de esas rutas lanza `ReferenceError: showToast is not defined`:

- Arrastras un PDF → no pasa nada, ni mensaje ni rechazo visible.
- El confirmar falla (por C-2/C-3/C-5, token vencido, red caída) → el diálogo se cierra o se queda colgado **sin ningún mensaje**. En `_confirmarPlanilla`, el `ReferenceError` del `try` cae al `catch`… que vuelve a llamar `showToast` y revienta de nuevo. El único rescate es el `finally`.

Esto convierte cualquier error de backend en un fallo *mudo* — la combinación C-2 + C-3 + C-4 hace que un guardado fallido sea completamente invisible.

**Cómo arreglarlo.** Reemplazar las 6 llamadas por `_apiToast(mensaje, tipo)` (ya definida en `api.js`, que la página carga), o definir un alias global `window.showToast = _apiToast` en `api.js`. Revisar también `academico.js` para unificar.

---

### C-5. `draft_token` en cache local de proceso

**Qué está mal.** El flujo validar→confirmar depende de `cache.set(_DRAFT_PREFIX + token, ...)`. No hay `CACHES` en settings, así que Django usa **LocMemCache**, que vive *dentro de cada proceso*:

- En el VPS con gunicorn y más de 1 worker: el validar cae en el worker 1 (guarda el draft en SU memoria), el confirmar cae en el worker 2 → `cache.get()` devuelve `None` → **"El tiempo para confirmar venció (30 min)"** aunque hayan pasado 5 segundos.
- Es intermitente (depende de a qué worker enrute cada request), que es la firma clásica de los bugs "a veces funciona, a veces no".
- Cualquier reinicio del contenedor también borra todos los drafts.

**Cómo arreglarlo.** Usar un backend de cache compartido:
- Lo más simple sin infraestructura extra: `django.core.cache.backends.db.DatabaseCache` (con `python manage.py createcachetable`). Sobra para este volumen.
- Alternativa: Redis si ya piensas usarlo para otra cosa.
- Alternativa sin cache: persistir el draft en una colección Mongo `planilla_drafts` con TTL index de 30 min (ya tienes Mongo en el flujo).

---

## Hallazgos altos

### A-1. Etiquetas SABER/HACER intercambiadas en el dashboard

En `_renderSuccessDashboard()`:

```js
const dimensionDefs = [
    { key: 'saber', label: 'HACER',  css: 'saber', short: 'Hacer' },
    { key: 'hacer', label: 'SABER',  css: 'hacer', short: 'Saber' },
    { key: 'ser',   label: 'SER',    css: 'ser',   short: 'Ser'   },
];
```

El backend define sin ambigüedad que `saber` = columnas 19–28 (SABER/45) y `hacer` = 30–39 (HACER/40) — coincide con la estructura oficial de la planilla (`'S8': 'SABER/45'`, `'AD8': 'HACER/40'`). Pero el frontend renderiza el grupo de datos `saber` bajo el título **"HACER"** y viceversa. También afecta el filtro por dimensión (el `<select>` muestra el label cruzado) y el pie con promedios ("Hacer Promedio" calcula sobre saber).

**Consecuencia:** el profesor ve sus exámenes (sobre 45) bajo el encabezado HACER (que sugiere máximo 40) y sus tareas bajo SABER. Los números guardados están bien; **solo la muestra está cruzada**, lo que hace parecer que "se guardó mal".

**Arreglo:** corregir los `label`/`short` para que `key: 'saber'` → `label: 'SABER'` y `key: 'hacer'` → `label: 'HACER'`. Verificar visualmente después contra un Excel conocido (si alguien "compensó" este cruce en otra capa, se notará de inmediato — no encontré ninguna compensación en el código).

### A-2. No se valida el rango de las notas

`_es_numero()` acepta cualquier número ≥ 0 y `_extraer_headers_trim()` guarda `int(round(float(val)))` sin comparar contra `nota_maxima`. Una nota de 450 en SABER (máx. 45), o 99 en SER (máx. 10), pasa los 7 niveles de validación, se guarda, infla `notas_mensuales.nota_mensual` y contamina K-Means/árbol. El export del director lo disimula (capa el *promedio* al máximo de la dimensión en `notas_export_service.py`, línea `if promedio > dim_max: promedio = dim_max`), lo cual **enmascara** el dato malo en lugar de rechazarlo.

**Arreglo:** agregar un nivel de validación (junto a `validar_completitud_notas`) que verifique `0 <= nota <= nota_maxima_de_la_dimension` y reporte celda/estudiante/columna exactos. Quitar el "cap" silencioso del export una vez que la validación exista.

### A-3. `.xls` aceptado pero imposible de leer

`ValidarPlanillaView` acepta `nombre.endswith('.xls')`, pero `openpyxl.load_workbook` solo lee `.xlsx`/`.xlsm`. Todo `.xls` real muere en el `except` con *"No se pudo leer el archivo. Asegúrate de que no esté dañado"* — mensaje que manda al profesor a pelear con un archivo que nunca va a funcionar.

**Arreglo:** o quitar `.xls` de las extensiones aceptadas (frontend `accept=".xlsx"` + backend) con mensaje claro ("Guarda la planilla como .xlsx"), o soportarlo de verdad (xlrd/libreoffice-convert — no lo recomiendo para este caso).

### A-4. Errores silenciados en todo el service

Prácticamente todas las funciones de `notas_mongo_service.py` hacen `except Exception: return <vacío>` sin loggear: `ensure_indexes` (si el índice falla nadie se entera → habilita C-2 en modo "update al doc equivocado"), `comparar_notas_con_mongo` (Mongo caído → el preview dice "0 cambios, 0 nuevas" y el profesor confirma a ciegas), `obtener_notas_mes` (modo lectura muestra vacío → parece que "se borraron las notas"), `hay_notas_mes` (devuelve False con Mongo caído → deja pasar un confirm que luego reventará), etc.

**Arreglo:** un `logger = logging.getLogger(__name__)` en el módulo y `logger.exception(...)` en cada except. Y en los puntos donde el dato es crítico para una decisión (p. ej. `hay_notas_mes` antes de confirmar, `comparar_notas_con_mongo` para el preview), distinguir "no hay datos" de "no pude consultar": si Mongo no responde, es mejor devolver 503 ("Servicio de notas no disponible, intenta más tarde") que continuar con datos vacíos.

### A-5. Zona horaria en la eliminación por mes

`eliminar_notas_mes` selecciona el historial a revertir con `{'$expr': {'$eq': [{'$month': '$fecha_cambio'}, mes]}}`. `fecha_cambio` se guarda en UTC, pero el "mes en curso" que valida `DirectorEliminarNotasMesView` es de La Paz (UTC−4). Una corrección hecha el 31 de marzo a las 21:00 de Bolivia tiene `fecha_cambio` = 1 de abril 01:00 UTC → al borrar "la carga de marzo" esa corrección **no se revierte**, y al borrar "abril" se revierte una corrección que el director cree de marzo.

Lo mismo aplica, con menor impacto, a la mezcla de `timezone.now()` (UTC) y `timezone.localtime()` para calcular `gestion`/mes en distintas vistas (ver M-6).

**Arreglo:** comparar contra el rango del mes convertido a UTC: calcular `inicio = datetime(gestion, mes, 1, tz=La_Paz).astimezone(UTC)` y `fin = (mes+1)`, y filtrar `fecha_cambio: {'$gte': inicio, '$lt': fin}` (además elimina el `$expr`, que no puede usar índices).

---

## Hallazgos medios

### M-1. Fallback nro→nombre depende del orden alfabético actual
`obtener_notas_mes()` y `notas_historico()` reconstruyen nombres faltantes mapeando la posición 1..N contra `Estudiante.objects.filter(curso_id=...).order_by(apellidos...)` **de hoy**. Si después de la carga se inscribe un estudiante nuevo (o se elimina uno de la BD), todos los que están después se corren un lugar y el modo lectura muestra notas con el nombre del compañero. Mitigación actual: los documentos nuevos ya guardan `nombre_estudiante`, así que esto solo afecta cargas viejas — pero es otra razón para migrar a PK real (C-1), que elimina el fallback por completo. Ojo: el fallback también filtra sin `activo=True` mientras otras vistas sí filtran activos — puede descuadrar la numeración por sí solo.

### M-2. La validación no avisa que el mes ya está cargado
`hay_notas_mes()` solo se consulta en `ConfirmarPlanillaView`. El profesor puede pasar toda la validación (7 niveles + preview + diálogo) y recibir el rechazo recién al final. La página lo previene con `_verificarEstadoNotas()` al cargar, pero si dos pestañas/dispositivos validan a la vez, o el mes cambió mientras la página estaba abierta, la experiencia es mala. **Arreglo:** repetir el chequeo `hay_notas_mes` al inicio de `ValidarPlanillaView` y devolver el error ahí.

### M-3. Recuperatorios dividen el promedio mensual
`validar_completitud_notas()` exime a las columnas con "recuperatorio" en el título de exigir nota para todos. Pero `calcular_notas_mensuales()` usa `_promedio_todos(notas, n_cols)` donde `n_cols` cuenta **todas** las columnas del mes, incluido el recuperatorio. Resultado: un estudiante que no necesitaba rendir recuperatorio recibe un 0 implícito en esa columna y su promedio mensual baja injustamente. **Arreglo:** decidir la semántica — lo razonable es excluir columnas "recuperatorio" del denominador para quienes no tienen nota en ellas (promediar solo columnas regulares + recuperatorio si existe nota).

### M-4. Match del nombre del maestro frágil
`validar_pertenencia[_2026]` exige ≥2 palabras en común entre el nombre de la BD y el del Excel (o todas si el nombre BD tiene 1 palabra). Si el usuario profesor no tiene `first_name`/`last_name`, se compara contra el **username** ("profesor" vs "Juan Carlos Mamani") → 0 coincidencias → *"Este no es tu registro de calificaciones"* sin que el profesor pueda hacer nada. **Arreglo:** exigir en el registro/admin que los profesores tengan nombre completo, y/o degradar a advertencia cuando la cuenta no tiene nombres cargados.

### M-5. Sin límites en el upload ni throttling en eliminar
- `archivo.read()` carga el archivo completo en memoria sin verificar tamaño; un xlsx de cientos de MB (o un zip-bomb) puede tumbar el worker. **Arreglo:** rechazar `archivo.size > 5*1024*1024` antes de leer.
- `DirectorEliminarNotasMesView` verifica `check_password` sin límite de intentos → permite fuerza bruta de la contraseña del director desde una sesión de director robada… y con cualquier token válido de director se puede golpear indefinidamente. **Arreglo:** DRF `throttle_classes` (p. ej. 5/min) en ese endpoint.

### M-6. UTC vs La Paz inconsistente
`ValidarPlanillaView` usa `localtime().month` para el mes pero `timezone.now().year` para gestión; `DirectorResumenNotasMesView` usa `timezone.now().year`; otras vistas usan `localtime().year`. Entre el 31/dic 20:00 y medianoche (Bolivia) las dos formas difieren de año. Es un caso borde, pero gratis de arreglar: **usar siempre `timezone.localtime(timezone.now())`** para derivar gestión/mes "de Bolivia", idealmente con un helper único `hoy_bolivia()` en un módulo común.

### M-7. Eliminar una materia borra predicciones de todo el curso
En `eliminar_notas_mes` paso 4: `db['predicciones'].delete_many({gestion, mes, curso_id ∈ afectados})` — sin filtrar materia. Al eliminar la carga de Matemática de 3ro "A", se borran las predicciones K-Means del curso completo (todas las materias) de ese mes. Está documentado como intencional ("se recalcularán"), pero el recálculo solo ocurre cuando *todos* vuelven a cargar (`todos_cargaron_mes`), o sea puede quedar un hueco de predicciones indefinido. **Arreglo:** disparar el recálculo del curso tras la eliminación, o marcar las predicciones como `stale` en lugar de borrarlas.

---

## Hallazgos bajos / limpieza

- **B-1.** `int(round(float(val)))` usa redondeo bancario de Python: 44.5 → 44, 43.5 → 44. Si la política es "medio punto sube", usar `math.floor(x + 0.5)` o `Decimal` con `ROUND_HALF_UP`.
- **B-2.** En `carga_calificaciones.js`, `overallAverage`, `riskCount`, `coverage`, `coverageLabel` y `_buildSuccessSummary()` se calculan/definen y **nunca se renderizan** (el HTML retornado no los incluye). O se reintegran las métricas al dashboard o se elimina el código muerto. Además el umbral `< 60` está pensado para escala 100 pero el "promedio" es la suma de dimensiones sobre 95.
- **B-3.** `_fmt1()` se llama "formato 1 decimal" pero hace `Math.round` a entero — renombrar o corregir. `_toggleModoAnterior` usa `cell.style.cssText = ...` que borra cualquier otro estilo inline de la celda.
- **B-4.** `EstadoNotasView` responde "las notas del mes" pero devuelve `notas_historico(..., mes_hasta=mes)` = acumulado del año hasta ese mes. Coincide con lo que muestra la vista de lectura, pero el nombre del endpoint y el docstring engañan — documentarlo.
- **B-5.** `historial_meses_profesor` marca meses "completo/parcial" comparando contra el total de asignaciones **actuales**; si al profesor le reasignan cursos a mitad de año, el estado histórico de meses pasados cambia retroactivamente.
- **B-6.** `NotasEstudianteProfesorView` no valida que el `estudiante_id` pertenezca al curso del `pc_id` — un profesor puede consultar notas de su materia para estudiantes de otros cursos (bajo impacto, pero fácil de cerrar con un `Estudiante.objects.filter(id=..., curso=pc.curso).exists()`).

---

## G-1. Estado del repositorio (importante para no perder trabajo)

- `develop` (tu rama activa, último commit 2026-03-22) **no contiene** el módulo de notas. Todo lo revisado vive en `master` (2026-06-09) y `universidad` (2026-05-18), con historias divergentes.
- En el working tree quedaron `__pycache__` con `.pyc` de archivos que no existen en `develop` (`notas_mongo_service`, `director_notas_views`, `planilla_views`, etc.) — basura de cuando corriste el server parado en otra rama. No afectan a `master`, pero pueden confundir (imports que "funcionan" localmente por el `.pyc` sin que exista el `.py`).
- Tu memoria de flujo dice "todos los commits van a develop y se mergea a master", pero ahora mismo `master` está muy por delante de `develop`. **Recomendación:** decidir cuál es la rama de trabajo real, rebasar/actualizar `develop` desde `master` (o abandonar `develop`), y borrar los `__pycache__` huérfanos (`git clean -ndX` primero para ver qué borraría).

---

## Cosas que no están mal hoy pero pueden salir mal (checklist preventivo)

1. **Cambio de gestión (2027):** sin el fix de C-2, la primera planilla de 2027 sobreescribirá los documentos de 2026. Probar el flujo con `gestion` distinta antes de fin de año.
2. **Draft de 30 min vs cambio de mes:** ya está bien manejado (el confirm rechaza si el mes cambió), pero el mensaje aparecerá mudo mientras exista C-4.
3. **Dos profesores compartiendo materia/curso** (`ProfesorCurso` lo permite: la clave única es profesor+curso+materia): `hay_notas_mes` filtra por profesor, así que el profesor B puede cargar el mismo curso/materia/mes que el A → los documentos de ambos conviven y `obtener_notas`/centralizador (que no filtran por profesor) mezclan las dos cargas.
4. **`threading.Thread` para K-Means/árbol dentro del request:** si el contenedor se reinicia a mitad del análisis, se pierde sin rastro; y con SQLite puede chocar con escrituras concurrentes. Para la escala del colegio funciona, pero considera un management command programado (cron) como plan B.
5. **`_extraer_headers_trim` lee filas 15–200 fijas:** si el formato oficial de la planilla cambia una fila (pasa entre gestiones del Ministerio), la extracción se rompe silenciosamente. El chequeo estructural (`validar_estructura_2026`) mitiga, pero conviene un test con la planilla real de cada gestión.
6. **Estudiantes homónimos:** `_coincide_nombre` usa subconjunto de palabras — "MAMANI QUISPE Juan" y "MAMANI QUISPE Juan Carlos" matchean entre sí. Con hermanos/primos de nombres contenidos uno en otro, la validación bidireccional puede emparejar mal. Considerar exigir igualdad exacta de conjuntos cuando ambos nombres tienen ≥3 palabras.
7. **`localStorage` para tokens + `DEV_BYPASS_AUTH`:** recordatorio de poner `DEV_BYPASS_AUTH = false` en producción (ya lo tienes anotado en CLAUDE.md) — la página de carga redirige por rol leyendo `localStorage`, que es manipulable; la protección real es del API (esa sí está bien con `IsProfesor`/`IsDirector`).

---

## Orden sugerido de corrección

1. **C-4** (`showToast` → `_apiToast`): 15 minutos, destapa todos los errores que hoy son invisibles.
2. **C-3** (propagar `errores` del bulk + logging): con esto vas a *ver* los fallos de C-2 en vez de adivinarlos.
3. **C-2 + C-1** juntos (PK real + índice con gestion/curso): son el mismo refactor de fondo; requieren script de migración de datos en Mongo.
4. **C-5** (cache compartido para drafts): antes del próximo deploy multi-worker.
5. **A-1, A-2, A-3** (labels cruzados, rango de notas, .xls).
6. El resto según prioridad de uso real.

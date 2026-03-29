# Contexto: Flujo de Carga de Notas desde Excel 2026

## Estado actual (2026-03-27)

---

## ¿Qué se implementó?

### 1. Validador de formato 2026 (`planilla_validator_2026.py`)
- Detecta si el Excel es formato 2026 por presencia de hoja `LIST 1TRIM`
- Extrae metadatos de las hojas trimestrales (1TRIM, 2TRIM, 3TRIM):
  - `maestro`, `area`, `paralelo`, `año_escolaridad` (normalizado a "1ro", "2do", etc.)
- Valida estructura: hojas obligatorias `CARATULA`, `FILIACION`, `1TRIM`, `2TRIM`, `3TRIM`
- Valida pertenencia: compara metadatos del Excel vs `ProfesorCurso` de la BD
- Extrae headers de actividades con notas reales (solo columnas con al menos 1 nota)
- Extrae lista de estudiantes desde hoja `FILIACION`

### 2. Extracción de headers de actividades (`_extraer_headers_trim`)
- Escanea filas 9-13 en columnas SER (14-17), SABER (19-28), HACER (30-39)
- Solo incluye columnas donde al menos un estudiante tiene nota > 0
- Incluye las notas de cada estudiante por columna (`nro`, `nombre`, `nota`)
- Formato esperado del título: `dd/mm/yyyy - Nombre actividad`

### 3. MongoDB Atlas (`notas_mongo_service.py`)
- Conexión activa a Atlas: `cluster0.mufoyzz.mongodb.net`
- Base de datos: `seguimiento_academico`
- Colección: `detalle_notas`
- `guardar_notas()`: upsert de notas por actividad/estudiante
- `obtener_notas()`: recupera notas agrupadas por actividad
- Índice único: `estudiante_id + materia_id + trimestre + dimension + columna_idx`

### 4. Endpoint de validación (`ValidarPlanillaView`)
- `POST /api/academics/profesor/validar-planilla/`
- Si `profesor_curso_id` se pasa: valida pertenencia + guarda en MongoDB si válido
- Si no se pasa: solo extrae y retorna metadatos (modo lectura)
- Bifurca automáticamente entre formato 2026 y Ley 070

### 5. Endpoint de consulta (`NotasMongoView`)
- `GET /api/academics/profesor/notas/?profesor_curso_id=X&trimestre=1`
- Recupera notas guardadas en MongoDB para una asignación y trimestre

### 6. Frontend (`profesor.js` + `dashboard.html`)
- **Card 1 (Subir Notas)**: sube Excel, muestra metadatos + actividades + lista de estudiantes. Sin validación estricta de BD.
- **Card 2 (Validar con BD)**: sube Excel con `profesor_curso_id`, valida pertenencia contra BD y guarda en MongoDB si pasa.
- Botón "Recuperar datos de MongoDB": consulta y muestra las notas guardadas.

---

## Estructura del documento en MongoDB

```json
{
  "estudiante_id":   1,           // ⚠️ Por ahora es el nro de fila del Excel, NO el ID de SQL
  "materia_id":      3,           // FK → tabla materias (SQL)
  "curso_id":        1,           // FK → tabla cursos (SQL)
  "profesor_id":     5,           // FK → tabla usuarios (SQL)
  "gestion":         2026,
  "trimestre":       1,
  "mes":             3,           // extraído de fecha_actividad
  "dimension":       "saber",     // "saber" | "hacer"
  "columna_idx":     19,          // posición en el Excel (clave de upsert)
  "titulo":          "15/03/2026 - Examen parcial",
  "fecha_actividad": "2026-03-15T00:00:00Z",
  "nota":            35.0,
  "nota_maxima":     45.0,
  "fecha_carga":     "2026-03-27T01:00:00Z"
}
```

---

## Columnas del Excel formato 2026

| Dimensión | Columnas (1-indexed) | Máximo | Promedio en |
|-----------|---------------------|--------|-------------|
| SER       | 14 – 17 (N-Q)       | /10    | col 18 (R)  |
| SABER     | 19 – 28 (S-AB)      | /45    | col 29 (AC) |
| HACER     | 30 – 39 (AD-AM)     | /40    | col 40 (AN) |

- Estudiantes empiezan en **fila 15**
- Headers de actividades en **filas 9-13**
- Metadatos (ÁREA, MAESTRA/O, PARALELO, AÑO DE ESCOLARIDAD) en **filas 1-6**

---

## Lo que falta implementar

### Prioridad 1 — Validación completa con BD (siguiente paso)
El flujo de la Card 2 ya llega al endpoint y valida maestro/área/curso contra `ProfesorCurso`.
Lo que **falta** es validar los estudiantes del Excel contra la BD:

- Comparar lista de nombres de `FILIACION` vs estudiantes registrados en `estudiantes` para ese `curso_id`
- Reportar: cuáles coinciden, cuáles no se encontraron, cuáles sobran
- Usar normalización de nombres (quitar tildes, lowercase, ignorar dobles espacios)
- Umbral de coincidencia: si más del X% no coincide → rechazar

### Prioridad 2 — Resolver `estudiante_id` real
Actualmente `estudiante_id` en MongoDB es el número de fila del Excel (1, 2, 3...).
Hay que reemplazarlo por el ID real de la tabla `estudiantes` de SQL.
Esto se resuelve al mismo tiempo que la validación de estudiantes (Prioridad 1):
al hacer el match de nombres, se obtiene el `estudiante_id` real y se usa al guardar.

### Prioridad 3 — Detectar trimestre automáticamente
Actualmente el trimestre se hardcodea a `1` en la vista.
Hay que detectarlo del nombre de la hoja con datos (`1TRIM` → 1, `2TRIM` → 2, `3TRIM` → 3).
Ya está en `resultado['metadatos']['hoja_origen']`.

### Prioridad 4 — UI final del flujo
Una vez validaciones completas, simplificar a un solo flujo:
1. Seleccionar asignación
2. Subir Excel
3. Ver resultado de validación
4. Confirmar guardado en MongoDB

---

## Archivos clave

| Archivo | Descripción |
|---------|-------------|
| `backend/apps/academics/services/planilla_validator_2026.py` | Validador formato 2026 + extracción de metadatos, headers y estudiantes |
| `backend/apps/academics/services/notas_mongo_service.py` | Conexión Atlas, guardar/obtener notas |
| `backend/apps/academics/views.py` | `ValidarPlanillaView`, `NotasMongoView` |
| `backend/apps/academics/urls.py` | URLs de los endpoints |
| `backend/static/js/profesor.js` | Lógica frontend del panel de notas |
| `backend/templates/profesor/dashboard.html` | UI panel notas (2 cards) |
| `backend/config/settings/local.py` | `MONGO_URI` y `MONGO_DB_NAME` |
| `scrips de python/extraer_detalle_notas_2026.py` | Documentación del mapeo de columnas del Excel 2026 |
| `scrips de python/test_validar_2026.py` | Script de prueba del validador sin Django |

---

## Notas adicionales

- El formato 2026 tiene AMBAS hojas: `BOLETIN` y `LIST xTRIM`. La detección se hace por presencia de `LIST 1TRIM`, no por ausencia de `BOLETIN`.
- Los valores en las celdas de metadatos están **hasta 7 columnas** después de la etiqueta (celdas fusionadas). El escáner usa rango `i+1` a `i+10`.
- El paralelo no está de forma confiable en CARATULA (es un dropdown). Se extrae de la hoja trimestral.
- `pymongo==4.10.1` agregado a `requirements.txt`.

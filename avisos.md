# Módulo de Avisos (Citaciones + Comunicados) — Documentación para App Móvil

## Índice
1. [Modelos](#modelos)
2. [Endpoints — Citaciones](#endpoints-citaciones)
3. [Endpoints — Comunicados](#endpoints-comunicados)
4. [Serializers — Estructura de datos](#serializers-estructura-de-datos)
5. [Permisos por rol](#permisos-por-rol)
6. [Lógica de negocio](#logica-de-negocio)
7. [Notificaciones FCM](#notificaciones-fcm)
8. [Flujos de usuario](#flujos-de-usuario)
9. [Archivos clave](#archivos-clave)

---

## Modelos

### Citacion (`backend/apps/discipline/models.py`)

```
Citacion
├── id                         (PK)
├── estudiante                 FK → Estudiante
├── emisor                     FK → User (Director, Regente, Profesor que emite)
├── motivo                     CharField choices:
│     FALTAS, COMPORTAMIENTO, BAJO_RENDIMIENTO, OTRO
├── descripcion                TextField
├── estado                     CharField choices: ENVIADA | VISTO
│     (default: ENVIADA — cambia a VISTO cuando el tutor marca como visto)
├── fecha_envio                DateTimeField (auto, creación)
├── fecha_limite_asistencia    DateField (hasta cuándo debe presentarse el tutor)
├── fecha_asistencia           DateField null (cuándo se presentó el tutor)
├── asistencia                 CharField choices (estado de presentación):
│     PENDIENTE (default) | ASISTIO | NO_ASISTIO | ATRASO | ANULADA
├── materia                    FK → Materia null (auto-asignada si emisor es Profesor)
└── actualizado_por            FK → User null (quién marcó la asistencia)

Meta: ordering = ['-fecha_envio']
Index: fecha_limite_asistencia, asistencia
```

**Estados `asistencia` — transiciones válidas:**
```
PENDIENTE ──▶ ASISTIO      (si tutor llegó antes o en fecha_limite)
          ──▶ ATRASO       (si tutor llegó después de fecha_limite)
          ──▶ NO_ASISTIO   (automático cuando fecha_limite < hoy)
          ──▶ ANULADA      (Director/Regente/emisor la anulan manualmente)
```

---

### Comunicado (`backend/apps/comunicados/models.py`)

```
Comunicado
├── id                 (PK)
├── titulo             CharField max=150
├── contenido          TextField
├── estado             CharField: ACTIVO | ANULADO (default: ACTIVO)
├── emisor             FK → User
├── fecha_envio        DateTimeField (auto)
├── fecha_expiracion   DateField null
├── materia            FK → Materia null (auto-asignada si emisor es Profesor)
├── alcance            CharField choices:
│     TODOS      → todos los tutores activos con hijos activos
│     GRADO      → tutores del grado especificado
│     CURSO      → tutores de un curso específico
│     MIS_CURSOS → tutores de todos los cursos del profesor emisor
│     GRUPO      → tutores de un subconjunto de cursos (≥2)
├── curso              FK → Curso null  (requerido si alcance=CURSO)
├── grado              CharField null   (requerido si alcance=GRADO)
└── cursos_grupo       M2M → Curso      (requerido si alcance=GRUPO, mín 2)

Meta: ordering = ['-fecha_envio']
```

```
ComunicadoVisto
├── id          (PK)
├── comunicado  FK → Comunicado
├── tutor       FK → User
└── visto_en    DateTimeField (auto)

unique_together: (comunicado, tutor)
```

---

## Endpoints — Citaciones

Base URL: `/api/discipline/`

---

### GET `/api/discipline/citaciones/`
**Permisos:** IsAuthenticated + (IsDirector | IsRegente | IsProfesor)  
**Descripción:** Lista citaciones. El backend filtra automáticamente por rol:
- Director → ve todas
- Regente → ve solo las que emitió
- Profesor → ve solo las que emitió

**Query params:**
| Param | Tipo | Descripción |
|-------|------|-------------|
| `asistencia` | string | Filtra por estado: PENDIENTE, ASISTIO, NO_ASISTIO, ATRASO, ANULADA |
| `curso_id` | int | Filtra por curso del estudiante |
| `estudiante_id` | int | Filtra por estudiante específico |
| `fecha_creacion` | YYYY-MM-DD | Filtra citaciones creadas ese día (`fecha_envio__date`) |
| `fecha_actualizacion` | YYYY-MM-DD | Filtra citaciones cuya `fecha_asistencia` es ese día |

**Efecto secundario:** en cada GET se ejecuta `marcar_citaciones_vencidas()` — pasa a NO_ASISTIO todas las citaciones PENDIENTE con `fecha_limite_asistencia < hoy`.

**Respuesta exitosa (200):** array de `CitacionListSerializer`
```json
[
  {
    "id": 12,
    "estudiante_nombre": "García López Juan",
    "curso": "3 A",
    "asistencia": "PENDIENTE",
    "fecha_envio": "2026-04-10T14:30:00-04:00",
    "fecha_limite_asistencia": "2026-04-20",
    "motivo": "FALTAS",
    "descripcion": "El estudiante acumuló 5 faltas en el mes.",
    "estado": "ENVIADA",
    "fecha_asistencia": null,
    "emisor_nombre": "Carlos Mamani",
    "emisor_tipo": "Profesor",
    "materia_nombre": "Matemáticas"
  }
]
```

---

### GET `/api/discipline/citaciones/mis-citaciones/`
**Permisos:** IsAuthenticated + IsTutor  
**Descripción:** Citaciones dirigidas al tutor autenticado (sus hijos). Excluye ANULADAS.

**Query params:**
| Param | Tipo | Descripción |
|-------|------|-------------|
| `estado` | ENVIADA \| VISTO | Filtra por estado de lectura |
| `asistencia` | string | Filtra por estado de asistencia |

**Respuesta exitosa (200):** array de `CitacionTutorSerializer`
```json
[
  {
    "id": 12,
    "estudiante_nombre": "García López Juan",
    "curso": "3 A",
    "motivo": "FALTAS",
    "descripcion": "El estudiante acumuló 5 faltas en el mes.",
    "estado": "ENVIADA",
    "asistencia": "PENDIENTE",
    "fecha_envio": "2026-04-10T14:30:00-04:00",
    "fecha_limite_asistencia": "2026-04-20",
    "fecha_asistencia": null,
    "emisor_nombre": "Carlos Mamani",
    "emisor_cargo": "Profesor"
  }
]
```

---

### POST `/api/discipline/citaciones/crear/`
**Permisos:** IsAuthenticated + (IsDirector | IsRegente | IsProfesor)

**Body:**
```json
{
  "estudiante": 5,
  "motivo": "FALTAS",
  "descripcion": "El estudiante acumuló 5 faltas en el mes.",
  "estado": "ENVIADA",
  "fecha_limite_asistencia": "2026-04-30"
}
```

**Validaciones:**
- `estudiante` debe estar activo (`activo=True`) y tener tutor asignado
- `fecha_limite_asistencia` no puede ser fecha pasada

**Asignaciones automáticas del backend:**
- `emisor` = `request.user`
- `materia` = materia del profesor emisor (si es Profesor; null si es Director/Regente)

**Efectos secundarios:**
- Crea entrada de auditoría
- Envía notificación FCM al tutor (hilo separado)

**Respuesta exitosa (201):** `CitacionListSerializer`

**Errores:**
```json
{ "errores": "El estudiante no tiene un tutor asignado." }
{ "errores": "La fecha límite no puede ser en el pasado." }
{ "estudiante": ["Este campo es obligatorio."] }
```

---

### GET `/api/discipline/citaciones/<id>/`
**Permisos:** IsAuthenticated + (IsDirector | IsRegente | IsProfesor)  
**Descripción:** Detalle completo de una citación.

**Respuesta exitosa (200):** `CitacionDetailSerializer`
```json
{
  "id": 12,
  "estudiante_nombre": "García López Juan",
  "curso": "3 A",
  "asistencia": "PENDIENTE",
  "estado": "ENVIADA",
  "fecha_envio": "2026-04-10T14:30:00-04:00",
  "fecha_limite_asistencia": "2026-04-20",
  "tutor_nombre": "Elena García",
  "emitido_por_nombre": "Carlos Mamani",
  "emitido_por_cargo": "Profesor",
  "emisor_id": 7,
  "motivo": "FALTAS",
  "motivo_descripcion": "Faltas",
  "fecha_asistencia": null,
  "actualizado_por_nombre": null
}
```

---

### PATCH `/api/discipline/citaciones/<id>/`
**Permisos:** IsAuthenticated + (IsDirector | IsRegente | IsProfesor)  
**Descripción:** Marca la asistencia del tutor a la citación.

**Restricciones:**
- Solo el emisor original puede marcar asistencia (o el Director sobre cualquiera)
- No se puede marcar si ya está en ASISTIO, ATRASO o ANULADA

**Body:** vacío `{}` — el backend calcula todo automáticamente:
- `fecha_asistencia` = hoy
- `asistencia` = ASISTIO si (hoy ≤ fecha_limite) | ATRASO si (hoy > fecha_limite)
- `actualizado_por` = `request.user`

**Respuesta exitosa (200):**
```json
{
  "id": 12,
  "asistencia": "ASISTIO",
  "fecha_asistencia": "2026-04-15",
  "mensaje": "Asistencia registrada correctamente."
}
```

**Errores:**
```json
{ "errores": "No tienes permiso para actualizar esta citación." }
{ "errores": "La asistencia ya fue registrada." }
```

---

### PATCH `/api/discipline/citaciones/<id>/anular/`
**Permisos:** IsAuthenticated + (IsDirector | IsRegente | IsProfesor)

**Restricciones:**
- Director/Regente: pueden anular cualquiera
- Profesor: solo puede anular las suyas
- No se puede anular si ya está en ASISTIO, ATRASO o ANULADA

**Body:** vacío `{}`

**Efecto:** `asistencia = ANULADA`, `actualizado_por = request.user`

**Respuesta exitosa (200):** `CitacionListSerializer` actualizada

**Errores:**
```json
{ "errores": "No se puede anular una citación ya atendida." }
{ "errores": "No tienes permiso para anular esta citación." }
```

---

### POST `/api/discipline/citaciones/<id>/visto/`
**Permisos:** IsAuthenticated + IsTutor  
**Descripción:** El tutor marca la citación como leída.

**Body:** vacío `{}`

**Efecto:** `estado = VISTO`

**Respuesta exitosa (200):**
```json
{ "id": 12, "estado": "VISTO" }
```

---

## Endpoints — Comunicados

Base URL: `/api/comunicados/`

---

### GET `/api/comunicados/`
**Permisos:** IsAuthenticated  
**Descripción:** Lista comunicados según el rol:
- Director → ve todos
- Tutor → ve solo los que le corresponden según su grado/curso

**Respuesta exitosa (200):** array de `ComunicadoSerializer`
```json
[
  {
    "id": 3,
    "titulo": "Cambio de horario",
    "contenido": "El lunes no habrá clases por feriado...",
    "estado": "ACTIVO",
    "emisor_nombre": "Carlos Mamani",
    "emisor_tipo": "Profesor",
    "fecha_envio": "2026-04-10T09:00:00-04:00",
    "fecha_expiracion": "2026-04-20",
    "alcance": "CURSO",
    "alcance_display": "Un curso específico",
    "curso_nombre": "3 A",
    "grado": null,
    "materia_nombre": "Matemáticas",
    "visto": false,
    "visto_en": null
  }
]
```

---

### POST `/api/comunicados/crear/`
**Permisos:** IsAuthenticated + (IsDirector | IsProfesor)

**Body según alcance:**

```json
// Alcance TODOS (solo Director)
{
  "titulo": "Reunión de padres",
  "contenido": "Se convoca a reunión el viernes...",
  "alcance": "TODOS",
  "fecha_expiracion": "2026-04-25"
}

// Alcance GRADO (solo Director)
{
  "titulo": "...",
  "contenido": "...",
  "alcance": "GRADO",
  "grado": "3"
}

// Alcance CURSO
{
  "titulo": "...",
  "contenido": "...",
  "alcance": "CURSO",
  "curso": 5
}

// Alcance MIS_CURSOS (solo Profesor)
{
  "titulo": "...",
  "contenido": "...",
  "alcance": "MIS_CURSOS"
}

// Alcance GRUPO
{
  "titulo": "...",
  "contenido": "...",
  "alcance": "GRUPO",
  "cursos_grupo_ids": [3, 5, 7]
}
```

**Validaciones:**
- `alcance=CURSO` → `curso` requerido
- `alcance=GRADO` → `grado` requerido
- `alcance=GRUPO` → `cursos_grupo_ids` con mínimo 2 cursos
- `fecha_expiracion` no puede ser en el pasado (si se envía)

**Asignaciones automáticas del backend:**
- `emisor` = `request.user`
- `materia` = materia del profesor (si es Profesor y alcance=CURSO)

**Efectos secundarios:**
- Determina lista de tutores según alcance
- Envía notificación FCM a cada tutor (hilo separado por tutor)

**Respuesta exitosa (201):** `ComunicadoSerializer`

---

### PATCH `/api/comunicados/<pk>/anular/`
**Permisos:** IsAuthenticated + (IsDirector | IsRegente | IsProfesor)

**Restricciones:**
- Profesor: solo puede anular los suyos
- Director/Regente: puede anular cualquiera

**Body:** vacío `{}`

**Efecto:** `estado = ANULADO`

**Respuesta exitosa (200):** `ComunicadoSerializer` actualizado

---

### POST `/api/comunicados/<pk>/visto/`
**Permisos:** IsAuthenticated + IsTutor  
**Descripción:** El tutor marca el comunicado como leído.

**Body:** vacío `{}`

**Efecto:** Crea registro `ComunicadoVisto(comunicado, tutor, visto_en=now)`.  
Si ya existía, no hace nada (unique_together).

**Respuesta exitosa (200):**
```json
{ "id": 3, "visto": true, "visto_en": "2026-04-15T10:30:00-04:00" }
```

---

## Serializers — Estructura de datos

### CitacionListSerializer (lista general — Staff)
Campos: `id`, `estudiante_nombre`, `curso`, `asistencia`, `fecha_envio`, `fecha_limite_asistencia`, `motivo`, `descripcion`, `estado`, `fecha_asistencia`, `emisor_nombre`, `emisor_tipo`, `materia_nombre`

### CitacionTutorSerializer (lista — App Móvil Tutor)
Campos: `id`, `estudiante_nombre`, `curso`, `motivo`, `descripcion`, `estado`, `asistencia`, `fecha_envio`, `fecha_limite_asistencia`, `fecha_asistencia`, `emisor_nombre`, `emisor_cargo`

### CitacionDetailSerializer (detalle completo)
Campos adicionales vs. lista: `tutor_nombre`, `emitido_por_nombre`, `emitido_por_cargo`, `emisor_id`, `motivo_descripcion`, `actualizado_por_nombre`

### ComunicadoSerializer (lista y detalle)
Campos: `id`, `titulo`, `contenido`, `estado`, `emisor_nombre`, `emisor_tipo`, `fecha_envio`, `fecha_expiracion`, `alcance`, `alcance_display`, `curso_nombre`, `grado`, `materia_nombre`, `visto`, `visto_en`

---

## Permisos por rol

| Acción | Director | Regente | Profesor | Tutor |
|--------|----------|---------|----------|-------|
| GET citaciones/ | ✅ todas | ✅ sus | ✅ sus | ❌ |
| POST citaciones/crear/ | ✅ | ✅ | ✅ | ❌ |
| GET citaciones/<id>/ | ✅ todas | ✅ sus | ✅ sus | ❌ |
| PATCH citaciones/<id>/ (marcar asistencia) | ✅ cualquiera | ✅ sus | ✅ sus | ❌ |
| PATCH citaciones/<id>/anular/ | ✅ cualquiera | ✅ cualquiera | ✅ sus | ❌ |
| POST citaciones/<id>/visto/ | ❌ | ❌ | ❌ | ✅ |
| GET citaciones/mis-citaciones/ | ❌ | ❌ | ❌ | ✅ |
| GET comunicados/ | ✅ todos | ❌ | ❌ | ✅ sus |
| POST comunicados/crear/ | ✅ | ❌ | ✅ sus cursos | ❌ |
| PATCH comunicados/<pk>/anular/ | ✅ cualquiera | ✅ cualquiera | ✅ sus | ❌ |
| POST comunicados/<pk>/visto/ | ❌ | ❌ | ❌ | ✅ |

---

## Lógica de negocio

### Auto-vencimiento de citaciones
**Archivo:** `backend/apps/discipline/services/citacion_vencimiento.py`

Se ejecuta en cada `GET /api/discipline/citaciones/`. Actualiza en bulk:
```
Citacion
  WHERE asistencia = "PENDIENTE"
    AND fecha_limite_asistencia < hoy
  SET asistencia = "NO_ASISTIO"
```

### Auto-asignación de materia en citaciones/comunicados
- Si `request.user.tipo_usuario.nombre == "Profesor"`:
  - En citaciones: `materia` = materia que el profesor imparte al curso del estudiante
  - En comunicados con `alcance=CURSO`: `materia` = materia del profesor en ese curso
- Si es Director o Regente: `materia = null`

### Distribución de comunicados por alcance
| Alcance | Tutores que reciben |
|---------|---------------------|
| TODOS | Todos los tutores con al menos un hijo activo |
| GRADO | Tutores de estudiantes activos del grado especificado |
| CURSO | Tutores de estudiantes activos del curso especificado |
| MIS_CURSOS | Tutores de estudiantes activos en todos los cursos del profesor |
| GRUPO | Tutores de estudiantes activos en los cursos del grupo seleccionado |

---

## Notificaciones FCM

Se envían en hilo separado (`threading.Thread`) tras crear citación o comunicado.

### Notificación de citación nueva
```
Título:  "Citación escolar"
Cuerpo:  "Su hijo/a {nombre} tiene una citación por {motivo}. 
          Preséntese antes del {fecha_limite_legible}."
Datos:   { "rol": "padre", "citacion_id": "<id>" }
Imagen:  settings.FCM_NOTIFICATION_IMAGE
```

### Notificación de comunicado nuevo
```
Título:  comunicado.titulo
Cuerpo:  primeros 200 caracteres de comunicado.contenido
Datos:   { "rol": "padre", "comunicado_id": "<id>" }
Imagen:  settings.FCM_NOTIFICATION_IMAGE
```

---

## Flujos de usuario

### Flujo: Tutor ve sus citaciones (App Móvil)

```
1. GET /api/discipline/citaciones/mis-citaciones/
   Params opcionales: ?estado=ENVIADA, ?asistencia=PENDIENTE
   
2. App muestra lista con badge de estado:
   - ENVIADA (no leído)
   - VISTO   (leído)
   
   Y badge de asistencia:
   - PENDIENTE  (debe presentarse)
   - ASISTIO    (ya se presentó)
   - ATRASO     (llegó tarde)
   - NO_ASISTIO (no se presentó / venció)
   
3. Usuario toca una citación
   → POST /api/discipline/citaciones/<id>/visto/   (si estado era ENVIADA)
   → La app actualiza estado local a VISTO
   
4. App muestra detalle:
   - Nombre del hijo
   - Motivo y descripción
   - Fecha límite para presentarse
   - Nombre del emisor (profesor/director) y su cargo
   - Estado actual de asistencia
```

### Flujo: Tutor ve comunicados (App Móvil)

```
1. GET /api/comunicados/
   → Backend filtra automáticamente los comunicados que corresponden al tutor
   
2. App muestra lista con:
   - Título del comunicado
   - Nombre del emisor
   - Fecha de envío
   - Indicador visto/no visto
   - Fecha de expiración (si existe)
   
3. Usuario toca un comunicado
   → POST /api/comunicados/<pk>/visto/   (si visto=false)
   → La app actualiza visto_en local
   
4. App muestra detalle:
   - Título y contenido completo
   - Materia relacionada (si aplica)
   - Alcance / a quién va dirigido
   - Fecha de expiración
```

### Flujo: Profesor crea una citación (Web — referencia)

```
1. Selecciona curso → GET /api/academics/cursos/
2. Selecciona estudiante del curso → GET /api/students/curso/<id>/estudiantes/
3. Llena: motivo, descripción, fecha límite de asistencia
4. POST /api/discipline/citaciones/crear/
   Body: { estudiante, motivo, descripcion, estado, fecha_limite_asistencia }
5. Backend crea citación, asigna materia, envía FCM al tutor
```

### Flujo: Profesor marca asistencia a citación (Web — referencia)

```
1. Ve la citación en estado PENDIENTE
2. Presiona "Marcar asistencia" → confirma
3. PATCH /api/discipline/citaciones/<id>/   Body: {}
4. Backend calcula: asistencia = ASISTIO o ATRASO según fecha actual
```

---

## Archivos clave

```
backend/apps/discipline/
├── models.py
├── urls.py
├── services/
│   └── citacion_vencimiento.py
├── serializers/
│   ├── citacion_read_serializers.py   (List, Tutor, Detail)
│   └── citacion_write_serializers.py  (Create, UpdateAsistencia)
└── views/
    ├── citacion_create_views.py       (CitacionCreateView)
    ├── citacion_detail_views.py       (Detail, Anular, Visto)
    └── citacion_list_views.py         (ListAll, TutorList)

backend/apps/comunicados/
├── models.py
├── urls.py
├── serializers/
│   ├── comunicado_read_serializers.py
│   └── comunicado_write_serializers.py
└── views/
    ├── comunicado_create_views.py
    ├── comunicado_detail_views.py     (MarcarVisto, Anular)
    └── comunicado_list_views.py

backend/templates/profesor/
└── citaciones.html                    (UI web de referencia)

backend/static/js/
└── comunicados.js                     (lógica frontend web de referencia)
```

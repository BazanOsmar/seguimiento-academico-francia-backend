"""
Service para guardar/actualizar notas de estudiantes en MongoDB.

Colección: detalle_notas
Estructura de cada documento:
{
    _id:             ObjectId  — generado por Mongo
    estudiante_id:   int       — FK → tabla estudiantes (SQL)
    materia_id:      int       — FK → tabla materias (SQL)
    curso_id:        int       — FK → tabla cursos (SQL)
    profesor_id:     int       — FK → tabla usuarios (SQL)

    gestion:         int       — año escolar (2026)
    trimestre:       int       — 1, 2 o 3
    mes:             int       — mes de la actividad (1-12)

    dimension:       str       — "saber" | "hacer"
    columna_idx:     int       — índice de columna en el Excel (para upserts)
    titulo:          str       — "15/03/2026 - Examen parcial"
    fecha_actividad: datetime  — parseada del título
    nota:            float     — nota del estudiante
    nota_maxima:     float     — 45 (saber) | 40 (hacer)

    fecha_carga:     datetime  — cuándo subió el profesor
}

CONEXIÓN:
    Pendiente conectar MongoDB Atlas.
    Cuando esté listo, configurar MONGO_URI en settings.py y
    descomentar la inicialización del cliente más abajo.
"""

import re
from collections import defaultdict
from datetime import datetime, timezone

# ── Conexión MongoDB ──────────────────────────────────────────────────────────
from django.conf import settings
from pymongo import MongoClient, ASCENDING, UpdateOne, InsertOne

_client          = None
_db              = None
_indexes_ensured = False

def _get_db():
    global _client, _db
    if _db is None:
        _client = MongoClient(
            settings.MONGO_URI,
            serverSelectionTimeoutMS=2000,
            connectTimeoutMS=2000,
            socketTimeoutMS=4000,
        )
        _db = _client[settings.MONGO_DB_NAME]
    return _db

def ensure_indexes():
    """Crea los índices necesarios. Llamar una sola vez al arrancar el servidor."""
    global _indexes_ensured
    if _indexes_ensured:
        return
    try:
        db = _get_db()

        # detalle_notas
        db['detalle_notas'].create_index([
            ('estudiante_id', ASCENDING),
            ('materia_id',    ASCENDING),
            ('trimestre',     ASCENDING),
            ('dimension',     ASCENDING),
            ('columna_idx',   ASCENDING),
        ], unique=True, name='upsert_key')

        db['detalle_notas'].create_index([
            ('materia_id', ASCENDING),
            ('curso_id',   ASCENDING),
            ('trimestre',  ASCENDING),
            ('mes',        ASCENDING),
        ], name='consulta_mensual')

        # notas_mensuales
        db['notas_mensuales'].create_index([
            ('estudiante_id', ASCENDING),
            ('materia_id',    ASCENDING),
            ('gestion',       ASCENDING),
            ('trimestre',     ASCENDING),
            ('mes',           ASCENDING),
        ], unique=True, name='upsert_key')

        db['notas_mensuales'].create_index([
            ('curso_id',  ASCENDING),
            ('materia_id',ASCENDING),
            ('gestion',   ASCENDING),
            ('mes',       ASCENDING),
        ], name='consulta_curso_mes')

        # historial_notas
        db['historial_notas'].create_index([
            ('materia_id', ASCENDING),
            ('curso_id',   ASCENDING),
            ('trimestre',  ASCENDING),
        ], name='consulta_historial_curso')

        db['historial_notas'].create_index([
            ('estudiante_id', ASCENDING),
            ('materia_id',    ASCENDING),
        ], name='consulta_historial_estudiante')

        _indexes_ensured = True
    except Exception:
        pass


# ── Helpers ───────────────────────────────────────────────────────────────────

_FECHA_RE = re.compile(r'(\d{1,2})[/\-](\d{1,2})[/\-](\d{2,4})')

def _parsear_fecha(titulo):
    """
    Intenta extraer la fecha del título en formato dd/mm/yyyy.
    Retorna datetime o None si no encuentra fecha.
    """
    m = _FECHA_RE.search(titulo or '')
    if not m:
        return None
    dia, mes, anio = int(m.group(1)), int(m.group(2)), int(m.group(3))
    if anio < 100:
        anio += 2000
    try:
        return datetime(anio, mes, dia, tzinfo=timezone.utc)
    except ValueError:
        return None


_NOTA_MAXIMA = {'ser': 10.0, 'saber': 45.0, 'hacer': 40.0}

def _nota_maxima(dimension):
    return _NOTA_MAXIMA.get(dimension, 10.0)


# ── API pública ───────────────────────────────────────────────────────────────

def guardar_notas(profesor_curso, trimestre, headers_actividades, gestion=2026):
    """
    Guarda las notas del Excel en detalle_notas con lógica de comparación:
      - Documento nuevo      → INSERT  (fecha_carga = ahora)
      - Nota o título cambió → UPDATE  (fecha_actualizacion = ahora, fecha_carga intacta)
      - Sin cambios          → omitir  (no se escribe en Mongo)

    Optimización: un solo find() carga todos los existentes en memoria;
    todas las escrituras se envían en un único bulk_write al final.

    Returns:
        dict con contadores { insertados, actualizados, sin_cambios, errores }
    """
    db  = _get_db()
    col = db['detalle_notas']

    materia_id = profesor_curso.materia.id
    curso_id   = profesor_curso.curso.id
    profesor_id = profesor_curso.profesor.id
    ahora      = datetime.now(tz=timezone.utc)

    # ── 1. Cargar todos los existentes de este trimestre en memoria ───────────
    existentes = {}
    for doc in col.find(
        {'materia_id': materia_id, 'curso_id': curso_id, 'trimestre': trimestre},
        {'estudiante_id': 1, 'dimension': 1, 'columna_idx': 1, 'nota': 1, 'titulo': 1},
    ):
        clave = (doc['estudiante_id'], doc['dimension'], doc['columna_idx'])
        existentes[clave] = doc

    # ── 2. Construir operaciones comparando en memoria ────────────────────────
    operaciones    = []
    historial_ops  = []
    insertados     = actualizados = sin_cambios = 0

    for dimension, columnas in headers_actividades.items():
        nota_max = _nota_maxima(dimension)
        for col_data in columnas:
            col_idx     = col_data['col']
            titulo      = col_data['titulo']
            fecha_activ = _parsear_fecha(titulo)
            mes         = fecha_activ.month if fecha_activ else None

            for n in col_data.get('notas', []):
                clave = (n['nro'], dimension, col_idx)
                prev  = existentes.get(clave)

                if prev is None:
                    operaciones.append(InsertOne({
                        'estudiante_id':      n['nro'],
                        'nombre_estudiante':  n.get('nombre', ''),
                        'materia_id':         materia_id,
                        'curso_id':           curso_id,
                        'profesor_id':        profesor_id,
                        'gestion':            gestion,
                        'trimestre':          trimestre,
                        'mes':                mes,
                        'dimension':          dimension,
                        'columna_idx':        col_idx,
                        'titulo':             titulo,
                        'fecha_actividad':    fecha_activ,
                        'nota':               n['nota'],
                        'nota_maxima':        nota_max,
                        'fecha_carga':        ahora,
                    }))
                    insertados += 1

                elif prev['nota'] != n['nota'] or prev.get('titulo') != titulo:
                    operaciones.append(UpdateOne(
                        {'estudiante_id': n['nro'], 'materia_id': materia_id,
                         'trimestre': trimestre, 'dimension': dimension, 'columna_idx': col_idx},
                        {'$set': {
                            'nombre_estudiante':   n.get('nombre', ''),
                            'titulo':              titulo,
                            'fecha_actividad':     fecha_activ,
                            'nota':                n['nota'],
                            'nota_maxima':         nota_max,
                            'mes':                 mes,
                            'fecha_actualizacion': ahora,
                        }},
                    ))
                    actualizados += 1

                    # Registrar qué cambió para el historial
                    nota_cambio   = prev['nota'] != n['nota']
                    titulo_cambio = prev.get('titulo') != titulo
                    tipo          = '+'.join(filter(None, [
                        'nota'   if nota_cambio   else None,
                        'titulo' if titulo_cambio else None,
                    ]))
                    historial_ops.append(InsertOne({
                        'estudiante_id':   n['nro'],
                        'materia_id':      materia_id,
                        'curso_id':        curso_id,
                        'profesor_id':     profesor_id,
                        'gestion':         gestion,
                        'trimestre':       trimestre,
                        'dimension':       dimension,
                        'columna_idx':     col_idx,
                        'nota_anterior':   prev['nota'],
                        'nota_nueva':      n['nota'],
                        'titulo_anterior': prev.get('titulo') if titulo_cambio else None,
                        'titulo_nuevo':    titulo              if titulo_cambio else None,
                        'tipo_cambio':     tipo,
                        'fecha_cambio':    ahora,
                    }))

                else:
                    sin_cambios += 1

    # ── 3. Enviar todo en un solo round trip ──────────────────────────────────
    errores = 0
    if operaciones:
        try:
            col.bulk_write(operaciones, ordered=False)
        except Exception:
            errores = len(operaciones)
            insertados = actualizados = 0

    # Historial solo si el bulk principal no falló en su totalidad
    if historial_ops and errores == 0:
        try:
            db['historial_notas'].bulk_write(historial_ops, ordered=False)
        except Exception:
            pass  # El historial no bloquea el guardado principal

    return {'insertados': insertados, 'actualizados': actualizados,
            'sin_cambios': sin_cambios, 'errores': errores}


_TRIM_MAP = {'1TRIM': 1, '2TRIM': 2, '3TRIM': 3}


def comparar_notas_con_mongo(profesor_curso, headers_por_trim, gestion=2026):
    """
    Compara las notas del Excel (headers_por_trim) contra las guardadas en
    detalle_notas, trimestre por trimestre.

    Devuelve un resumen listo para incluir en la respuesta de ValidarPlanillaView,
    para que el profesor sepa qué va a cambiar antes de confirmar.

    Returns:
        {
            'sin_cambios': int,
            'nuevas':      int,
            'modificadas': [
                {
                    'estudiante_id': int,
                    'nombre':        str,
                    'trimestre':     int,
                    'dimension':     str,
                    'titulo':        str,
                    'nota_anterior': float,
                    'nota_nueva':    float,
                    'titulo_cambiado': bool,
                }
            ],
        }
    Devuelve vacío (sin_cambios=0, nuevas=0, modificadas=[]) si hay error de conexión.
    """
    try:
        col        = _get_db()['detalle_notas']
        materia_id = profesor_curso.materia.id
        curso_id   = profesor_curso.curso.id

        sin_cambios     = 0
        nuevas          = 0
        modificadas     = []
        nuevas_columnas = []

        for hoja, dims in headers_por_trim.items():
            trimestre = _TRIM_MAP.get(hoja, 1)

            # Un find por trimestre, igual que en guardar_notas
            existentes = {}
            for doc in col.find(
                {'materia_id': materia_id, 'curso_id': curso_id, 'trimestre': trimestre},
                {'estudiante_id': 1, 'dimension': 1, 'columna_idx': 1,
                 'nota': 1, 'titulo': 1, 'nombre_estudiante': 1},
            ):
                clave = (doc['estudiante_id'], doc['dimension'], doc['columna_idx'])
                existentes[clave] = doc

            for dimension, columnas in dims.items():
                for col_data in columnas:
                    col_idx = col_data['col']
                    titulo  = col_data['titulo']
                    notas   = col_data.get('notas', [])

                    # Columna nueva si ningún estudiante tiene entrada previa en Mongo
                    if notas and not any(
                        existentes.get((n['nro'], dimension, col_idx)) is not None
                        for n in notas
                    ):
                        nuevas_columnas.append({
                            'trimestre': trimestre,
                            'dimension': dimension,
                            'col_idx':   col_idx,
                        })

                    for n in notas:
                        clave = (n['nro'], dimension, col_idx)
                        prev  = existentes.get(clave)

                        if prev is None:
                            nuevas += 1
                        elif prev['nota'] != n['nota'] or prev.get('titulo') != titulo:
                            modificadas.append({
                                'estudiante_id':   n['nro'],
                                'nombre':          n.get('nombre') or prev.get('nombre_estudiante', ''),
                                'trimestre':       trimestre,
                                'dimension':       dimension,
                                'titulo':          titulo,
                                'nota_anterior':   prev['nota'],
                                'nota_nueva':      n['nota'],
                                'titulo_cambiado': prev.get('titulo') != titulo,
                            })
                        else:
                            sin_cambios += 1

        return {
            'sin_cambios':     sin_cambios,
            'nuevas':          nuevas,
            'modificadas':     modificadas,
            'nuevas_columnas': nuevas_columnas,
        }

    except Exception:
        return {'sin_cambios': 0, 'nuevas': 0, 'modificadas': [], 'nuevas_columnas': []}


def asignaciones_con_notas(pares, mes=None):
    """
    Dado una lista de (materia_id, curso_id), retorna el set de pares que
    tienen al menos un documento de notas en MongoDB.
    Si se pasa mes (1-12), filtra solo documentos de ese mes.
    Devuelve set vacío si hay error de conexión.
    """
    if not pares:
        return set()
    try:
        db  = _get_db()
        col = db['detalle_notas']
        match = {'$or': [{'materia_id': m, 'curso_id': c} for m, c in pares]}
        if mes is not None:
            match['mes'] = mes
        pipeline = [
            {'$match': match},
            {'$group': {'_id': {'materia_id': '$materia_id', 'curso_id': '$curso_id'}}},
        ]
        return {(r['_id']['materia_id'], r['_id']['curso_id']) for r in col.aggregate(pipeline)}
    except Exception:
        return set()


def obtener_notas(materia_id, curso_id, trimestre):
    """
    Recupera todas las notas de una materia/curso/trimestre desde MongoDB.
    Retorna lista agrupada por actividad (titulo + notas de estudiantes).
    """
    db  = _get_db()
    col = db['detalle_notas']

    docs = list(col.find(
        {'materia_id': materia_id, 'curso_id': curso_id, 'trimestre': trimestre},
        {'_id': 0}
    ).sort([('dimension', 1), ('columna_idx', 1), ('estudiante_id', 1)]))

    # Agrupar por dimension + columna_idx
    actividades = {}
    for doc in docs:
        key = (doc['dimension'], doc['columna_idx'])
        if key not in actividades:
            actividades[key] = {
                'dimension':      doc['dimension'],
                'titulo':         doc['titulo'],
                'fecha_actividad': doc['fecha_actividad'].isoformat() if doc.get('fecha_actividad') else None,
                'nota_maxima':    doc['nota_maxima'],
                'notas':          [],
            }
        actividades[key]['notas'].append({
            'estudiante_id': doc['estudiante_id'],
            'nota':          doc['nota'],
        })

    return list(actividades.values())


def calcular_notas_mensuales(profesor_curso, trimestre, headers_actividades, gestion=2026):
    """
    Calcula y guarda notas_mensuales a partir de headers_actividades (ya en memoria).
    Se llama inmediatamente después de guardar_notas.

    Lógica:
      - SER/SABER/HACER = promedio de TODAS las notas del mes (incluye 0, que = no presentó)
      - promedio_examenes/tareas = promedio solo de notas > 0 (rendimiento real, útil para ML)
      - cantidad_rendidos/entregados = cuántas notas > 0 tuvo el estudiante

    Returns:
        { procesados: int }
    """
    materia_id  = profesor_curso.materia.id
    curso_id    = profesor_curso.curso.id
    profesor_id = profesor_curso.profesor.id
    ahora       = datetime.now(tz=timezone.utc)

    # ── Agrupar notas por (estudiante_id, mes, dimension) ────────────────────
    # student_data[est_id][mes][dim] = [notas]
    student_data = defaultdict(lambda: defaultdict(lambda: defaultdict(list)))
    # Contar columnas por (mes, dimension) — para los totales
    cols_por_mes = defaultdict(lambda: defaultdict(int))

    for dimension, columnas in headers_actividades.items():
        for col_data in columnas:
            fecha_activ = _parsear_fecha(col_data['titulo'])
            if not fecha_activ:
                continue
            mes = fecha_activ.month
            cols_por_mes[mes][dimension] += 1

            for n in col_data.get('notas', []):
                student_data[n['nro']][mes][dimension].append(n['nota'])

    if not student_data:
        return {'procesados': 0}

    # ── Construir operaciones bulk ────────────────────────────────────────────
    operaciones = []

    for estudiante_id, meses in student_data.items():
        for mes, dims in meses.items():
            ser_notas   = dims.get('ser',   [])
            saber_notas = dims.get('saber', [])
            hacer_notas = dims.get('hacer', [])

            total_saber = cols_por_mes[mes].get('saber', 0)
            total_hacer = cols_por_mes[mes].get('hacer', 0)

            def _promedio_todos(notas, total_cols):
                """Promedio incluyendo 0s — usa total_cols como denominador."""
                if not total_cols:
                    return 0.0
                return round(sum(notas) / total_cols, 2)

            def _promedio_rendidos(notas):
                """Promedio solo de notas > 0."""
                rendidos = [n for n in notas if n > 0]
                return round(sum(rendidos) / len(rendidos), 2) if rendidos else 0.0

            ser_total   = cols_por_mes[mes].get('ser', 0)
            ser_val     = _promedio_todos(ser_notas, ser_total)
            saber_val   = _promedio_todos(saber_notas, total_saber)
            hacer_val   = _promedio_todos(hacer_notas, total_hacer)

            filtro = {
                'estudiante_id': estudiante_id,
                'materia_id':    materia_id,
                'gestion':       gestion,
                'trimestre':     trimestre,
                'mes':           mes,
            }

            operaciones.append(UpdateOne(filtro, {'$set': {
                **filtro,
                'curso_id':                   curso_id,
                'profesor_id':                profesor_id,
                'ser':                        ser_val,
                'saber':                      saber_val,
                'hacer':                      hacer_val,
                'nota_mensual':               round(ser_val + saber_val + hacer_val, 2),
                'promedio_examenes':          _promedio_rendidos(saber_notas),
                'promedio_tareas':            _promedio_rendidos(hacer_notas),
                'cantidad_examenes_rendidos': sum(1 for n in saber_notas if n > 0),
                'cantidad_examenes_total':    total_saber,
                'cantidad_tareas_entregadas': sum(1 for n in hacer_notas if n > 0),
                'cantidad_tareas_total':      total_hacer,
                'fecha_carga':                ahora,
            }}, upsert=True))

    procesados = len(operaciones)
    if operaciones:
        _get_db()['notas_mensuales'].bulk_write(operaciones, ordered=False)

    return {'procesados': procesados}


def obtener_detalle_notas_tutor(estudiante_id, materia_id, dimensiones=None):
    """
    Devuelve las notas de un estudiante en una materia, agrupadas por trimestre.

    dimensiones: lista de dimensiones a incluir. Por defecto ['saber', 'hacer']
                 (el tutor no puede ver 'ser'). El profesor pasa las tres.

    Returns:
        { trimestre: [ { titulo, fecha_actividad, nota, nota_maxima, dimension } ] }
        dict vacío si no hay notas.

    Raises:
        Exception si falla la conexión a MongoDB (el caller debe manejarla).
    """
    if dimensiones is None:
        dimensiones = ['saber', 'hacer']

    col  = _get_db()['detalle_notas']
    docs = list(col.find(
        {
            'estudiante_id': estudiante_id,
            'materia_id':    materia_id,
            'dimension':     {'$in': dimensiones},
        },
        {'_id': 0, 'trimestre': 1, 'dimension': 1, 'titulo': 1,
         'fecha_actividad': 1, 'nota': 1, 'nota_maxima': 1},
    ).sort([('trimestre', 1), ('dimension', 1), ('columna_idx', 1)]))

    agrupado = {}
    for doc in docs:
        t = doc['trimestre']
        agrupado.setdefault(t, []).append({
            'dimension':       doc['dimension'],
            'titulo':          doc.get('titulo'),
            'fecha_actividad': doc['fecha_actividad'].isoformat() if doc.get('fecha_actividad') else None,
            'nota':            doc['nota'],
            'nota_maxima':     doc['nota_maxima'],
        })

    return agrupado


def obtener_promedios_grupo(materia_id: int, estudiante_ids: list) -> dict:
    """
    Calcula el promedio del trimestre más reciente con datos para cada estudiante,
    usando una sola consulta a MongoDB.

    Escala de dimensiones: SABER=45 | HACER=40 | SER=10

    Returns:
        { estudiante_id: {'nota_total': float, 'nota_sobre': int, 'trimestre': int} }
        Estudiantes sin datos no aparecen en el resultado.
    """
    if not estudiante_ids:
        return {}

    _MAX_DIM = {'saber': 45, 'hacer': 40, 'ser': 10}

    col  = _get_db()['detalle_notas']
    docs = col.find(
        {
            'materia_id':    materia_id,
            'estudiante_id': {'$in': estudiante_ids},
            'dimension':     {'$in': list(_MAX_DIM.keys())},
        },
        {'_id': 0, 'estudiante_id': 1, 'trimestre': 1, 'dimension': 1, 'nota': 1},
    )

    # eid → trimestre → dimension → {'suma': float, 'cantidad': int}
    agrupado: dict = {}
    for doc in docs:
        eid  = doc['estudiante_id']
        t    = doc['trimestre']
        dim  = doc['dimension'].lower()
        nota = float(doc.get('nota') or 0)
        agrupado.setdefault(eid, {}).setdefault(t, {}).setdefault(dim, {'suma': 0.0, 'cantidad': 0})
        agrupado[eid][t][dim]['suma']     += nota
        agrupado[eid][t][dim]['cantidad'] += 1

    result = {}
    for eid, trims in agrupado.items():
        ultimo_trim = max(trims.keys())
        dims        = trims[ultimo_trim]
        nota_total  = 0.0
        nota_sobre  = 0
        for dim, max_dim in _MAX_DIM.items():
            if dim in dims:
                data         = dims[dim]
                promedio_dim = data['suma'] / data['cantidad'] if data['cantidad'] > 0 else 0.0
                nota_total  += promedio_dim
                nota_sobre  += max_dim
        result[eid] = {
            'nota_total': round(nota_total, 1),
            'nota_sobre': nota_sobre,
            'trimestre':  ultimo_trim,
        }

    return result


def pc_ids_con_notas_mes(asignaciones, profesor_id, mes, gestion):
    """
    Dado una lista de dicts {id, materia_id, curso_id}, retorna el set de
    pc_ids que ya tienen notas en Mongo para ese profesor/mes/gestión.
    Hace una sola query de agregación.
    """
    if not asignaciones:
        return set()
    try:
        col = _get_db()['detalle_notas']
        pipeline = [
            {'$match': {
                'profesor_id': profesor_id,
                'mes':         mes,
                'gestion':     gestion,
                '$or': [
                    {'materia_id': a['materia_id'], 'curso_id': a['curso_id']}
                    for a in asignaciones
                ],
            }},
            {'$group': {'_id': {'materia_id': '$materia_id', 'curso_id': '$curso_id'}}},
        ]
        pares = {(r['_id']['materia_id'], r['_id']['curso_id']) for r in col.aggregate(pipeline)}
        return {a['id'] for a in asignaciones if (a['materia_id'], a['curso_id']) in pares}
    except Exception:
        return set()


def hay_notas_mes(materia_id, curso_id, profesor_id, mes, gestion):
    """
    True si ya existen notas guardadas para ese mes/materia/curso/profesor.
    Usado para bloquear re-subidas y detectar modo lectura.
    """
    try:
        col = _get_db()['detalle_notas']
        return col.count_documents({
            'materia_id':  materia_id,
            'curso_id':    curso_id,
            'profesor_id': profesor_id,
            'mes':         mes,
            'gestion':     gestion,
        }, limit=1) > 0
    except Exception:
        return False


def obtener_notas_mes(materia_id, curso_id, profesor_id, mes, gestion):
    """
    Retorna las notas del mes en formato headers_actividades compatible con el
    validador y con _renderSuccessDashboard del frontend.

    Cuando un documento no tiene 'nombre_estudiante' (notas subidas antes de
    que se añadiera el campo), hace fallback a SQL: obtiene los estudiantes del
    curso ordenados alfabéticamente (orden estándar de las planillas bolivianas)
    y mapea posición 1,2,3… → nombre completo.
    """
    _TRIM_INV = {1: '1TRIM', 2: '2TRIM', 3: '3TRIM'}
    try:
        col  = _get_db()['detalle_notas']
        docs = list(col.find({
            'materia_id':  materia_id,
            'curso_id':    curso_id,
            'profesor_id': profesor_id,
            'mes':         mes,
            'gestion':     gestion,
        }, {'_id': 0}).sort([
            ('trimestre', 1), ('dimension', 1), ('columna_idx', 1), ('estudiante_id', 1),
        ]))

        if not docs:
            return {}

        # Fallback a SQL cuando algún doc no tiene nombre guardado
        nro_a_nombre = {}
        if any(not doc.get('nombre_estudiante') for doc in docs):
            from backend.apps.students.models import Estudiante
            for i, est in enumerate(
                Estudiante.objects
                .filter(curso_id=curso_id)
                .order_by('apellido_paterno', 'apellido_materno', 'nombre')
                .values('apellido_paterno', 'apellido_materno', 'nombre'),
                start=1,
            ):
                partes = [est['apellido_paterno'], est['apellido_materno'], est['nombre']]
                nro_a_nombre[i] = ' '.join(p for p in partes if p)

        # Agrupar: trim_key → dimension → col_idx → actividad_dict
        buckets = {}
        for doc in docs:
            trim_key = _TRIM_INV.get(doc['trimestre'], '1TRIM')
            dim      = doc['dimension']
            col_idx  = doc['columna_idx']
            nro      = doc['estudiante_id']
            nombre   = doc.get('nombre_estudiante') or nro_a_nombre.get(nro, f'Estudiante {nro}')

            buckets.setdefault(trim_key, {}).setdefault(dim, {})
            if col_idx not in buckets[trim_key][dim]:
                buckets[trim_key][dim][col_idx] = {
                    'col':         col_idx,
                    'titulo':      doc['titulo'],
                    'nota_maxima': doc['nota_maxima'],
                    'notas':       [],
                }
            buckets[trim_key][dim][col_idx]['notas'].append({
                'nro':    nro,
                'nombre': nombre,
                'nota':   doc['nota'],
            })

        # Convertir col_idx dict a lista ordenada
        result = {}
        for trim_key, dims in buckets.items():
            result[trim_key] = {
                dim: sorted(col_data.values(), key=lambda x: x['col'])
                for dim, col_data in dims.items()
            }
        return result

    except Exception:
        return {}


def promedios_saber_hacer_por_materia(estudiante_id, materia_ids, trimestre=None):
    """
    Devuelve el promedio de (saber + hacer) por materia para un estudiante,
    calculado sobre los meses de notas_mensuales.

    Args:
        estudiante_id: int
        materia_ids:   lista de ints
        trimestre:     int (1, 2 o 3) — si se pasa, filtra solo ese trimestre;
                       si es None, promedia todos los meses disponibles.

    Returns:
        dict { materia_id: float | None }
        None si la materia no tiene ningún registro para ese trimestre.
    """
    if not materia_ids:
        return {}

    try:
        col = _get_db()['notas_mensuales']
        filtro = {
            'estudiante_id': estudiante_id,
            'materia_id':    {'$in': list(materia_ids)},
        }
        if trimestre is not None:
            filtro['trimestre'] = trimestre

        docs = col.find(filtro, {'materia_id': 1, 'saber': 1, 'hacer': 1, '_id': 0})

        acumulado = {}   # materia_id → [saber+hacer por mes]
        for doc in docs:
            mid = doc['materia_id']
            acumulado.setdefault(mid, []).append(
                (doc.get('saber') or 0) + (doc.get('hacer') or 0)
            )

        resultado = {mid: None for mid in materia_ids}
        for mid, valores in acumulado.items():
            resultado[mid] = round(sum(valores) / len(valores), 1)

        return resultado

    except Exception:
        return {mid: None for mid in materia_ids}


def ultima_carga_por_materia(estudiante_id, materia_ids, trimestre=None):
    """
    Devuelve la fecha de carga más reciente en detalle_notas por materia.

    Args:
        estudiante_id: int
        materia_ids:   lista de ints
        trimestre:     int (1, 2 o 3) opcional — si se pasa, filtra ese trimestre.

    Returns:
        dict { materia_id: str ISO8601 | None }
        None si la materia no tiene ningún registro.
    """
    if not materia_ids:
        return {}

    try:
        col = _get_db()['detalle_notas']
        filtro = {
            'estudiante_id': estudiante_id,
            'materia_id':    {'$in': list(materia_ids)},
        }
        if trimestre is not None:
            filtro['trimestre'] = trimestre

        pipeline = [
            {'$match': filtro},
            {'$group': {
                '_id':         '$materia_id',
                'ultima_carga': {'$max': '$fecha_carga'},
            }},
        ]

        resultado = {mid: None for mid in materia_ids}
        for doc in col.aggregate(pipeline):
            fecha = doc['ultima_carga']
            resultado[doc['_id']] = fecha.isoformat() if fecha else None

        return resultado

    except Exception:
        return {mid: None for mid in materia_ids}

    except Exception:
        return {mid: None for mid in materia_ids}


def cursos_con_notas_mes(mes, gestion):
    """
    Retorna el set de (profesor_id, curso_id) que tienen al menos un documento
    de notas en detalle_notas para el mes/gestión indicados.
    Usado por el Director para saber qué profesores ya cargaron notas ese mes.
    Devuelve set vacío si hay error de conexión.
    """
    try:
        col = _get_db()['detalle_notas']
        pipeline = [
            {'$match': {'mes': mes, 'gestion': gestion}},
            {'$group': {'_id': {'profesor_id': '$profesor_id', 'curso_id': '$curso_id'}}},
        ]
        return {
            (r['_id']['profesor_id'], r['_id']['curso_id'])
            for r in col.aggregate(pipeline)
        }
    except Exception:
        return set()

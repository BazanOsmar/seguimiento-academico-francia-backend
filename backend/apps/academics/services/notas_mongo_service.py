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
from datetime import datetime, timezone

# ── Conexión MongoDB Atlas ────────────────────────────────────────────────────
from django.conf import settings
from pymongo import MongoClient, ASCENDING

_client = None
_db     = None

def _get_db():
    global _client, _db
    if _db is None:
        _client = MongoClient(settings.MONGO_URI, serverSelectionTimeoutMS=5000)
        _db = _client[settings.MONGO_DB_NAME]
        _ensure_indexes(_db)
    return _db

def _ensure_indexes(db):
    col = db['detalle_notas']
    col.create_index([
        ('estudiante_id', ASCENDING),
        ('materia_id',    ASCENDING),
        ('trimestre',     ASCENDING),
        ('dimension',     ASCENDING),
        ('columna_idx',   ASCENDING),
    ], unique=True, name='upsert_key')


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


def _nota_maxima(dimension):
    return 45.0 if dimension == 'saber' else 40.0


# ── API pública ───────────────────────────────────────────────────────────────

def guardar_notas(profesor_curso, trimestre, headers_actividades, gestion=2026):
    """
    Recibe los datos extraídos del Excel y hace upsert en detalle_notas.

    Args:
        profesor_curso:      instancia ProfesorCurso (con .profesor, .materia, .curso)
        trimestre:           int (1, 2 o 3)
        headers_actividades: dict extraído por _extraer_headers_trim()
                             { 'saber': [{col, titulo, notas:[{nro,nombre,nota}]}], ... }
        gestion:             año escolar (default 2026)

    Returns:
        dict con contadores { insertados, actualizados, errores }

    NOTA: función pendiente de activar cuando haya conexión a Atlas.
    Por ahora solo construye y retorna los documentos que se guardarían.
    """
    # db  = _get_db()
    # col = db['detalle_notas']

    fecha_carga = datetime.now(tz=timezone.utc)
    documentos  = []

    for dimension, columnas in headers_actividades.items():
        nota_max = _nota_maxima(dimension)
        for col_data in columnas:
            col_idx       = col_data['col']
            titulo        = col_data['titulo']
            fecha_activ   = _parsear_fecha(titulo)
            mes           = fecha_activ.month if fecha_activ else None

            for n in col_data.get('notas', []):
                doc = {
                    'estudiante_id':   n['nro'],          # se reemplaza por FK real al integrar
                    'materia_id':      profesor_curso.materia.id,
                    'curso_id':        profesor_curso.curso.id,
                    'profesor_id':     profesor_curso.profesor.id,

                    'gestion':         gestion,
                    'trimestre':       trimestre,
                    'mes':             mes,

                    'dimension':       dimension,
                    'columna_idx':     col_idx,
                    'titulo':          titulo,
                    'fecha_actividad': fecha_activ,
                    'nota':            n['nota'],
                    'nota_maxima':     nota_max,

                    'fecha_carga':     fecha_carga,
                }
                documentos.append(doc)

    db  = _get_db()
    col = db['detalle_notas']

    insertados = actualizados = errores = 0
    for doc in documentos:
        filtro = {
            'estudiante_id': doc['estudiante_id'],
            'materia_id':    doc['materia_id'],
            'trimestre':     doc['trimestre'],
            'dimension':     doc['dimension'],
            'columna_idx':   doc['columna_idx'],
        }
        try:
            res = col.update_one(filtro, {'$set': doc}, upsert=True)
            if res.upserted_id:
                insertados += 1
            else:
                actualizados += 1
        except Exception:
            errores += 1

    return {'insertados': insertados, 'actualizados': actualizados, 'errores': errores}


def asignaciones_con_notas(pares):
    """
    Dado una lista de (materia_id, curso_id), retorna el set de pares que
    tienen al menos un documento de notas en MongoDB (cualquier trimestre).
    Devuelve set vacío si hay error de conexión.
    """
    if not pares:
        return set()
    try:
        db  = _get_db()
        col = db['detalle_notas']
        pipeline = [
            {'$match': {'$or': [{'materia_id': m, 'curso_id': c} for m, c in pares]}},
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

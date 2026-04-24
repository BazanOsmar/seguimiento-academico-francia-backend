"""
Genera notas de prueba en MongoDB para 1ro A — Trimestres 1 y 2 (gestión 2026).

Colecciones afectadas: detalle_notas, notas_mensuales
No afecta la BD SQL ni otras colecciones.

Uso:
    python manage.py seed_notas_1ro_a
    python manage.py seed_notas_1ro_a --limpiar   # borra datos previos del curso
"""
import random
from collections import defaultdict
from datetime import datetime, timezone

from django.core.management.base import BaseCommand

from backend.apps.academics.services.notas_mongo_service import _get_db

# ── Datos del curso ───────────────────────────────────────────────────────────

CURSO_ID = 1
GESTION  = 2026

MATERIAS = [
    {'materia_id':  1, 'profesor_id':  1, 'nombre': 'Artes Plásticas y Visuales'},
    {'materia_id':  3, 'profesor_id': 13, 'nombre': 'Ciencias Sociales'},
    {'materia_id':  4, 'profesor_id': 17, 'nombre': 'Cosmovisiones Filosofía Psicología'},
    {'materia_id':  5, 'profesor_id': 15, 'nombre': 'Educación Física y Deportes'},
    {'materia_id':  6, 'profesor_id': 29, 'nombre': 'Educación Musical'},
    {'materia_id':  8, 'profesor_id': 22, 'nombre': 'Lengua Castellana y Originaria'},
    {'materia_id':  9, 'profesor_id': 19, 'nombre': 'Lengua Extranjera'},
    {'materia_id': 10, 'profesor_id': 23, 'nombre': 'Matemática'},
    {'materia_id': 12, 'profesor_id': 32, 'nombre': 'Técnica Tecnológica General'},
    {'materia_id': 13, 'profesor_id': 30, 'nombre': 'Valores, Espiritualidades y Religiones'},
    {'materia_id': 39, 'profesor_id':  4, 'nombre': 'Ciencias Naturales: Biología'},
]

ESTUDIANTES = [
    (1,  'ALANOCA PACARI, ABIGAIL'),
    (2,  'ARUQUIPA NISTAUZ, JHEYMI MAYTE'),
    (3,  'CALLA NINA, LEONEL JOSE'),
    (4,  'CANDIA TARQUI, JADEN MATIAS'),
    (5,  'CHAIÑA LIMACHI, YHULIANA'),
    (6,  'CHUQUIMIA CABRERA, GUILLERMO SANTIAGO'),
    (7,  'CONDORI CHUI, NEYMAR JHUNIOR'),
    (8,  'COPA ENCINAS, ELIEL AZAI ADIF'),
    (9,  'CRUZ CUTIPA, CELESTE ABRIL'),
    (10, 'CUTIPA MAMANI, LEONEL AGUSTIN'),
    (11, 'FARFAN QUENALLATA, ALISON NAYELY'),
    (12, 'GUARACHI APAZA, ROBERTO EMANUEL'),
    (13, 'JARANDILLA LOZA, BELEN'),
    (14, 'LOPEZ SALINA, SEBASTIAN ABDUL'),
    (15, 'MACHICADO ACARAPI, ABDEL DAYAN'),
    (16, 'MACHICADO APAZA, MIA DARLIN'),
    (17, 'MAMANI MACUCHAPI, NICOLAS URIEL'),
    (18, 'MAMANI SILICUANA, MARIO'),
    (19, 'MARQUEZ MAMANI, IKER GAEL'),
    (20, 'MERMA CHOQUE, DAYANA MAYLEN'),
    (21, 'MIRANDA CONDORI, ROBERT EMANUEL'),
    (22, 'POMA LLANQUE, ESTHER KARINA'),
    (23, 'QUINTEROS VISCARRA, ALEXANDRA VALENTINA'),
    (24, 'RAMIREZ MEZA, ANA ABIGAIL'),
    (25, 'RAMOS MACHACA, JAYDEN LUZ'),
    (26, 'RODRIGUEZ MANICO, DANIEL FELIX'),
    (27, 'SARAVIA QUISBERT, LITHZIA KAMILA'),
    (28, 'SCHAFER ALBORTA, MIA ALESSANDRA'),
    (29, 'SIÑANI QUISPE, ANDRE SANTIAGO'),
    (30, 'TORREZ CALLE, MARIA DEL ROSARIO'),
    (31, 'VALLEJOS AVIRCATA, DANITZA'),
    (32, 'VALLEJOS BELTRAN, AYLIN IRIS'),
    (33, 'VILLAZON RAMOS, FERNANDO'),
]

# Perfiles de rendimiento por estudiante_id
PERFILES = {
    'excelente':  {1, 9, 11, 23, 24, 27, 28, 32},
    'dificultad': {3, 5, 7, 10, 18, 21, 26, 33},
    # el resto es "promedio"
}

# ── Definición de actividades por trimestre ──────────────────────────────────
#
# Cada entrada: (col_idx, mes, titulo_sufijo)
# El título final será "DD/MM/YYYY - {sufijo}"
#
_SER_TITULOS   = ['Evaluación Comportamental', 'Autoevaluación', 'Comportamiento y Actitud', 'Evaluación de Valores']
_SABER_TITULOS = ['Examen de Diagnóstico', 'Control de Lectura', 'Evaluación Escrita',
                  'Examen Parcial', 'Prueba Oral', 'Evaluación Escrita', 'Examen',
                  'Control de Lectura', 'Prueba Escrita', 'Examen Bimestral']
_HACER_TITULOS = ['Trabajo Práctico', 'Tarea', 'Proyecto', 'Exposición', 'Trabajo Grupal',
                  'Tarea', 'Trabajo Práctico', 'Exposición', 'Proyecto Final', 'Tarea']

ACTIVIDADES = {
    1: {  # T1: Feb-Abr
        'ser': [
            (13, 2, '20/02/2026'),
            (14, 3, '15/03/2026'),
            (15, 4, '10/04/2026'),
        ],
        'saber': [
            (18, 2, '10/02/2026'),
            (19, 2, '20/02/2026'),
            (20, 2, '28/02/2026'),
            (21, 3, '10/03/2026'),
            (22, 3, '20/03/2026'),
            (23, 3, '31/03/2026'),
            (24, 4, '10/04/2026'),
            (25, 4, '20/04/2026'),
            (26, 4, '30/04/2026'),
        ],
        'hacer': [
            (29, 2, '12/02/2026'),
            (30, 2, '22/02/2026'),
            (31, 2, '27/02/2026'),
            (32, 3, '12/03/2026'),
            (33, 3, '22/03/2026'),
            (34, 3, '30/03/2026'),
            (35, 4, '12/04/2026'),
            (36, 4, '22/04/2026'),
            (37, 4, '29/04/2026'),
        ],
    },
    2: {  # T2: May-Ago
        'ser': [
            (13, 5, '15/05/2026'),
            (14, 6, '12/06/2026'),
            (15, 7, '10/07/2026'),
            (16, 8, '07/08/2026'),
        ],
        'saber': [
            (18, 5, '08/05/2026'),
            (19, 5, '28/05/2026'),
            (20, 6, '05/06/2026'),
            (21, 6, '19/06/2026'),
            (22, 6, '27/06/2026'),
            (23, 7, '10/07/2026'),
            (24, 7, '25/07/2026'),
            (25, 8, '07/08/2026'),
            (26, 8, '21/08/2026'),
            (27, 8, '28/08/2026'),
        ],
        'hacer': [
            (29, 5, '09/05/2026'),
            (30, 5, '29/05/2026'),
            (31, 6, '06/06/2026'),
            (32, 6, '20/06/2026'),
            (33, 6, '28/06/2026'),
            (34, 7, '11/07/2026'),
            (35, 7, '26/07/2026'),
            (36, 8, '08/08/2026'),
            (37, 8, '22/08/2026'),
            (38, 8, '29/08/2026'),
        ],
    },
}

_NOTA_MAX = {'ser': 10.0, 'saber': 45.0, 'hacer': 40.0}


# ── Generadores de notas ──────────────────────────────────────────────────────

def _perfil(est_id):
    if est_id in PERFILES['excelente']:
        return 'excelente'
    if est_id in PERFILES['dificultad']:
        return 'dificultad'
    return 'promedio'


def _gen_nota(dimension, perfil, rng, trimestre, col_orden):
    """
    Genera una nota realista para la dimensión y perfil dados.
    col_orden: posición de la columna dentro del trimestre (añade variación).
    """
    max_nota = _NOTA_MAX[dimension]

    rangos = {
        'ser':   {'excelente': (0.88, 0.99), 'promedio': (0.72, 0.92), 'dificultad': (0.55, 0.80)},
        'saber': {'excelente': (0.75, 0.96), 'promedio': (0.50, 0.80), 'dificultad': (0.18, 0.52)},
        'hacer': {'excelente': (0.78, 0.97), 'promedio': (0.52, 0.83), 'dificultad': (0.15, 0.55)},
    }

    lo, hi = rangos[dimension][perfil]
    # Pequeña variación por columna y trimestre
    ajuste = rng.uniform(-0.06, 0.06) + (0.03 if trimestre == 2 else 0)
    pct = max(lo - 0.05, min(hi + 0.05, lo + rng.random() * (hi - lo) + ajuste))

    # 5% de probabilidad de nota 0 (falta/no entregó) para dim saber/hacer en dificultad
    if dimension != 'ser' and perfil == 'dificultad' and rng.random() < 0.12:
        return 0.0

    nota = round(pct * max_nota, 1)
    # Redondear al entero más cercano para SER (es 0-10 entero)
    if dimension == 'ser':
        nota = float(round(nota))
    return nota


def _parsear_fecha(fecha_str):
    """Parsea 'DD/MM/YYYY' a datetime UTC."""
    d, m, y = fecha_str.split('/')
    return datetime(int(y), int(m), int(d), tzinfo=timezone.utc)


# ── Lógica de notas_mensuales ─────────────────────────────────────────────────

def _calcular_notas_mensuales(detalle_docs):
    """
    Calcula notas_mensuales a partir de una lista de docs de detalle_notas.
    Replica exactamente la lógica de calcular_notas_mensuales() del service.
    """
    # Agrupar: (est_id, materia_id, trimestre, mes) → dimension → [notas]
    agrupado = defaultdict(lambda: defaultdict(list))
    # Contar columnas únicas por (materia_id, trimestre, mes, dim) para el denominador
    cols_contadas = defaultdict(set)

    for doc in detalle_docs:
        clave = (doc['estudiante_id'], doc['materia_id'], doc['trimestre'], doc['mes'])
        agrupado[clave][doc['dimension']].append(doc['nota'])
        cols_contadas[(doc['materia_id'], doc['trimestre'], doc['mes'], doc['dimension'])].add(doc['columna_idx'])

    total_cols = {k: len(v) for k, v in cols_contadas.items()}

    mensuales = []
    for (est_id, mat_id, trim, mes), dims in agrupado.items():
        def _prom_todos(dim_key):
            notas = dims.get(dim_key, [])
            total = total_cols.get((mat_id, trim, mes, dim_key), 0)
            if not total:
                return 0.0
            return round(sum(notas) / total, 2)

        def _prom_rendidos(dim_key):
            notas = [n for n in dims.get(dim_key, []) if n > 0]
            return round(sum(notas) / len(notas), 2) if notas else 0.0

        def _count_rendidos(dim_key):
            return sum(1 for n in dims.get(dim_key, []) if n > 0)

        ser_val   = _prom_todos('ser')
        saber_val = _prom_todos('saber')
        hacer_val = _prom_todos('hacer')

        mensuales.append({
            'estudiante_id':             est_id,
            'materia_id':                mat_id,
            'curso_id':                  CURSO_ID,
            'profesor_id':               next(
                m['profesor_id'] for m in MATERIAS if m['materia_id'] == mat_id
            ),
            'gestion':                   GESTION,
            'trimestre':                 trim,
            'mes':                       mes,
            'ser':                       ser_val,
            'saber':                     saber_val,
            'hacer':                     hacer_val,
            'nota_mensual':              round(ser_val + saber_val + hacer_val, 2),
            'promedio_examenes':         _prom_rendidos('saber'),
            'promedio_tareas':           _prom_rendidos('hacer'),
            'cantidad_examenes_rendidos': _count_rendidos('saber'),
            'cantidad_examenes_total':   total_cols.get((mat_id, trim, mes, 'saber'), 0),
            'cantidad_tareas_entregadas': _count_rendidos('hacer'),
            'cantidad_tareas_total':     total_cols.get((mat_id, trim, mes, 'hacer'), 0),
            'fecha_carga':               datetime.now(tz=timezone.utc),
        })

    return mensuales


# ── Comando ───────────────────────────────────────────────────────────────────

class Command(BaseCommand):
    help = 'Genera notas de prueba para 1ro A (T1 y T2 2026) en MongoDB staging'

    def add_arguments(self, parser):
        parser.add_argument(
            '--limpiar',
            action='store_true',
            help='Elimina datos previos de 1ro A antes de insertar',
        )

    def handle(self, *args, **options):
        db  = _get_db()
        rng = random.Random(42)
        ahora = datetime.now(tz=timezone.utc)

        if options['limpiar']:
            eliminados_d = db['detalle_notas'].delete_many({'curso_id': CURSO_ID}).deleted_count
            eliminados_m = db['notas_mensuales'].delete_many({'curso_id': CURSO_ID}).deleted_count
            self.stdout.write(f'Limpieza: {eliminados_d} detalle_notas, {eliminados_m} notas_mensuales eliminados')

        self.stdout.write(f'Generando notas para {len(ESTUDIANTES)} estudiantes, '
                          f'{len(MATERIAS)} materias, trimestres 1 y 2...')

        todos_detalle = []

        for materia in MATERIAS:
            mat_id     = materia['materia_id']
            prof_id    = materia['profesor_id']

            for trimestre, dims_actvs in ACTIVIDADES.items():
                for dim, actividades in dims_actvs.items():
                    titulos = {
                        'ser':   _SER_TITULOS,
                        'saber': _SABER_TITULOS,
                        'hacer': _HACER_TITULOS,
                    }[dim]

                    for orden, (col_idx, mes, fecha_str) in enumerate(actividades):
                        titulo      = f'{fecha_str} - {titulos[orden % len(titulos)]}'
                        fecha_activ = _parsear_fecha(fecha_str)
                        nota_max    = _NOTA_MAX[dim]

                        for est_id, nombre in ESTUDIANTES:
                            perfil = _perfil(est_id)
                            nota   = _gen_nota(dim, perfil, rng, trimestre, orden)

                            todos_detalle.append({
                                'estudiante_id':    est_id,
                                'nombre_estudiante': nombre,
                                'materia_id':        mat_id,
                                'curso_id':          CURSO_ID,
                                'profesor_id':       prof_id,
                                'gestion':           GESTION,
                                'trimestre':         trimestre,
                                'mes':               mes,
                                'dimension':         dim,
                                'columna_idx':       col_idx,
                                'titulo':            titulo,
                                'fecha_actividad':   fecha_activ,
                                'nota':              nota,
                                'nota_maxima':       nota_max,
                                'fecha_carga':       ahora,
                            })

        # ── Insertar detalle_notas (upsert por clave única) ───────────────────
        from pymongo import UpdateOne
        ops_detalle = [
            UpdateOne(
                {
                    'estudiante_id': d['estudiante_id'],
                    'materia_id':    d['materia_id'],
                    'trimestre':     d['trimestre'],
                    'dimension':     d['dimension'],
                    'columna_idx':   d['columna_idx'],
                },
                {'$set': d},
                upsert=True,
            )
            for d in todos_detalle
        ]
        result_d = db['detalle_notas'].bulk_write(ops_detalle, ordered=False)
        self.stdout.write(
            f'detalle_notas → {result_d.upserted_count} insertados, '
            f'{result_d.modified_count} actualizados'
        )

        # ── Calcular e insertar notas_mensuales ───────────────────────────────
        mensuales = _calcular_notas_mensuales(todos_detalle)
        ops_mensuales = [
            UpdateOne(
                {
                    'estudiante_id': m['estudiante_id'],
                    'materia_id':    m['materia_id'],
                    'gestion':       m['gestion'],
                    'trimestre':     m['trimestre'],
                    'mes':           m['mes'],
                },
                {'$set': m},
                upsert=True,
            )
            for m in mensuales
        ]
        result_m = db['notas_mensuales'].bulk_write(ops_mensuales, ordered=False)
        self.stdout.write(
            f'notas_mensuales → {result_m.upserted_count} insertados, '
            f'{result_m.modified_count} actualizados'
        )

        total_detalle = len(todos_detalle)
        total_mensuales = len(mensuales)
        self.stdout.write(self.style.SUCCESS(
            f'\nListo. {total_detalle} registros de detalle_notas y '
            f'{total_mensuales} de notas_mensuales generados para 1ro A.'
        ))

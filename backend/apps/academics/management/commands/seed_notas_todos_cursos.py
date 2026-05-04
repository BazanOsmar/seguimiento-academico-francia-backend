"""
Genera notas de prueba en MongoDB para TODOS los cursos — Marzo 2026 (T1, mes 3).
Lee ProfesorCurso y Estudiantes desde SQL, no hardcodea nada.

Colecciones afectadas: detalle_notas, notas_mensuales (MongoDB dev).
No toca SQL ni producción.

Uso:
    python manage.py seed_notas_todos_cursos
    python manage.py seed_notas_todos_cursos --limpiar
"""

import random
from collections import defaultdict
from datetime import datetime, timezone

from django.conf import settings
from django.core.management.base import BaseCommand
from pymongo import MongoClient, UpdateOne

from backend.apps.academics.models import ProfesorCurso
from backend.apps.students.models import Estudiante


def _get_db_seed():
    """Conexión con timeout alto para operaciones masivas de seed."""
    client = MongoClient(settings.MONGO_URI, socketTimeoutMS=60000, connectTimeoutMS=5000)
    return client[settings.MONGO_DB_NAME]

GESTION   = 2026
TRIMESTRE = 1
MES       = 3

# Actividades de marzo (T1) — misma estructura que el Excel real
ACTIVIDADES_MARZO = [
    # (dimension, col_idx, fecha_str, titulo)
    ('ser',   14, '15/03/2026', 'Evaluación Comportamental'),
    ('saber', 21, '10/03/2026', 'Examen Parcial'),
    ('saber', 22, '20/03/2026', 'Control de Lectura'),
    ('saber', 23, '31/03/2026', 'Evaluación Escrita'),
    ('hacer', 32, '12/03/2026', 'Trabajo Práctico'),
    ('hacer', 33, '22/03/2026', 'Tarea'),
    ('hacer', 34, '30/03/2026', 'Proyecto'),
]

_NOTA_MAX = {'ser': 10.0, 'saber': 45.0, 'hacer': 40.0}

# Rangos de nota por dimensión y perfil (fracción del máximo)
_RANGOS = {
    'ser':   {'excelente': (0.88, 0.99), 'promedio': (0.72, 0.92), 'dificultad': (0.55, 0.80)},
    'saber': {'excelente': (0.75, 0.96), 'promedio': (0.50, 0.80), 'dificultad': (0.18, 0.52)},
    'hacer': {'excelente': (0.78, 0.97), 'promedio': (0.52, 0.83), 'dificultad': (0.15, 0.55)},
}


def _perfil(est_id: int) -> str:
    r = est_id % 10
    if r in {1, 2}:
        return 'excelente'
    if r in {0, 9}:
        return 'dificultad'
    return 'promedio'


def _gen_nota(dimension: str, perfil: str, rng: random.Random) -> float:
    lo, hi = _RANGOS[dimension][perfil]
    ajuste = rng.uniform(-0.05, 0.05)
    pct    = max(lo - 0.05, min(hi + 0.05, lo + rng.random() * (hi - lo) + ajuste))

    # 12% de probabilidad de 0 para saber/hacer en dificultad (no presentó)
    if dimension != 'ser' and perfil == 'dificultad' and rng.random() < 0.12:
        return 0.0

    nota = round(pct * _NOTA_MAX[dimension], 1)
    if dimension == 'ser':
        nota = float(round(nota))
    return nota


def _parsear_fecha(fecha_str: str) -> datetime:
    d, m, y = fecha_str.split('/')
    return datetime(int(y), int(m), int(d), tzinfo=timezone.utc)


def _calcular_notas_mensuales(detalle_docs: list) -> list:
    """
    Replica la lógica de calcular_notas_mensuales() del service.
    Agrupa por (estudiante_id, materia_id, curso_id, profesor_id, trimestre, mes).
    """
    agrupado   = defaultdict(lambda: defaultdict(list))
    cols_count = defaultdict(set)
    meta       = {}  # clave -> {curso_id, profesor_id}

    for doc in detalle_docs:
        clave = (doc['estudiante_id'], doc['materia_id'], doc['trimestre'], doc['mes'])
        agrupado[clave][doc['dimension']].append(doc['nota'])
        cols_count[(doc['materia_id'], doc['trimestre'], doc['mes'], doc['dimension'])].add(doc['columna_idx'])
        if clave not in meta:
            meta[clave] = {'curso_id': doc['curso_id'], 'profesor_id': doc['profesor_id']}

    total_cols = {k: len(v) for k, v in cols_count.items()}

    mensuales = []
    for (est_id, mat_id, trim, mes), dims in agrupado.items():
        def _prom_todos(dim_key):
            notas = dims.get(dim_key, [])
            total = total_cols.get((mat_id, trim, mes, dim_key), 0)
            return round(sum(notas) / total, 2) if total else 0.0

        def _prom_rendidos(dim_key):
            notas = [n for n in dims.get(dim_key, []) if n > 0]
            return round(sum(notas) / len(notas), 2) if notas else 0.0

        def _count_rendidos(dim_key):
            return sum(1 for n in dims.get(dim_key, []) if n > 0)

        ser_val   = _prom_todos('ser')
        saber_val = _prom_todos('saber')
        hacer_val = _prom_todos('hacer')

        mensuales.append({
            'estudiante_id':              est_id,
            'materia_id':                 mat_id,
            'curso_id':                   meta[(est_id, mat_id, trim, mes)]['curso_id'],
            'profesor_id':                meta[(est_id, mat_id, trim, mes)]['profesor_id'],
            'gestion':                    GESTION,
            'trimestre':                  trim,
            'mes':                        mes,
            'ser':                        ser_val,
            'saber':                      saber_val,
            'hacer':                      hacer_val,
            'nota_mensual':               round(ser_val + saber_val + hacer_val, 2),
            'promedio_examenes':          _prom_rendidos('saber'),
            'promedio_tareas':            _prom_rendidos('hacer'),
            'cantidad_examenes_rendidos': _count_rendidos('saber'),
            'cantidad_examenes_total':    total_cols.get((mat_id, trim, mes, 'saber'), 0),
            'cantidad_tareas_entregadas': _count_rendidos('hacer'),
            'cantidad_tareas_total':      total_cols.get((mat_id, trim, mes, 'hacer'), 0),
            'fecha_carga':                datetime.now(tz=timezone.utc),
        })

    return mensuales


class Command(BaseCommand):
    help = 'Genera notas de prueba para todos los cursos — Marzo 2026 en MongoDB dev'

    def add_arguments(self, parser):
        parser.add_argument(
            '--limpiar',
            action='store_true',
            help='Elimina datos de marzo 2026 antes de insertar',
        )

    def handle(self, *args, **options):
        db  = _get_db_seed()
        rng = random.Random(42)

        if options['limpiar']:
            elim_d = db['detalle_notas'].delete_many({'gestion': GESTION, 'mes': MES}).deleted_count
            elim_m = db['notas_mensuales'].delete_many({'gestion': GESTION, 'mes': MES}).deleted_count
            self.stdout.write(f'Limpieza: {elim_d} detalle_notas, {elim_m} notas_mensuales eliminados')

        # ── Leer asignaciones y estudiantes desde SQL ─────────────────────────
        asignaciones = list(
            ProfesorCurso.objects.select_related('materia', 'profesor').all()
        )
        por_curso = defaultdict(list)
        for pc in asignaciones:
            por_curso[pc.curso_id].append(pc)

        estudiantes_por_curso = defaultdict(list)
        for est in Estudiante.objects.filter(activo=True).values('id', 'curso_id'):
            estudiantes_por_curso[est['curso_id']].append(est['id'])

        cursos_con_datos = len([c for c in por_curso if estudiantes_por_curso.get(c)])
        self.stdout.write(
            f'Generando notas para {cursos_con_datos} cursos, '
            f'{len(asignaciones)} asignaciones, mes={MES}, gestión={GESTION}...'
        )

        # ── Construir todos los docs de detalle_notas ─────────────────────────
        todos_detalle = []
        ahora = datetime.now(tz=timezone.utc)

        for curso_id, pcs in por_curso.items():
            est_ids = estudiantes_por_curso.get(curso_id, [])
            if not est_ids:
                continue

            for pc in pcs:
                for dim, col_idx, fecha_str, titulo_suf in ACTIVIDADES_MARZO:
                    fecha_activ = _parsear_fecha(fecha_str)
                    titulo      = f'{fecha_str} - {titulo_suf}'

                    for est_id in est_ids:
                        todos_detalle.append({
                            'estudiante_id': est_id,
                            'materia_id':    pc.materia.id,
                            'curso_id':      curso_id,
                            'profesor_id':   pc.profesor.id,
                            'gestion':       GESTION,
                            'trimestre':     TRIMESTRE,
                            'mes':           MES,
                            'dimension':     dim,
                            'columna_idx':   col_idx,
                            'titulo':        titulo,
                            'fecha_actividad': fecha_activ,
                            'nota':          _gen_nota(dim, _perfil(est_id), rng),
                            'nota_maxima':   _NOTA_MAX[dim],
                            'fecha_carga':   ahora,
                        })

        # ── UPSERT detalle_notas (en lotes para no exceder el socket timeout) ────
        ops_d = [
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
        inserted_d = modified_d = 0
        lote = 2000
        for i in range(0, len(ops_d), lote):
            r = db['detalle_notas'].bulk_write(ops_d[i:i + lote], ordered=False)
            inserted_d += r.upserted_count
            modified_d += r.modified_count
        self.stdout.write(f'detalle_notas -> {inserted_d} insertados, {modified_d} actualizados')

        # ── Calcular y UPSERT notas_mensuales ─────────────────────────────────
        mensuales = _calcular_notas_mensuales(todos_detalle)
        ops_m = [
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
        inserted_m = modified_m = 0
        for i in range(0, len(ops_m), lote):
            r = db['notas_mensuales'].bulk_write(ops_m[i:i + lote], ordered=False)
            inserted_m += r.upserted_count
            modified_m += r.modified_count
        self.stdout.write(f'notas_mensuales -> {inserted_m} insertados, {modified_m} actualizados')

        self.stdout.write(self.style.SUCCESS(
            f'\nListo. {len(todos_detalle):,} detalle_notas y {len(mensuales):,} notas_mensuales '
            f'generados para {cursos_con_datos} cursos.'
        ))

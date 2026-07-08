"""
Seed v3 de notas MongoDB — alineado 1:1 con el modelo de datos de la app real.

Diferencias contra el seed v2:
- estudiante_id = PK real de SQL (igual que guardar_notas con mapa_nro_pk)
- nro_planilla  = posición 1..N del estudiante en el curso (orden de planilla)
- notas enteras (la app guarda int(round(val)))
- nota_maxima completa por columna: SER 10 | SABER 45 | HACER 40
- notas_mensuales = promedio por dimensión (mismo modelo que calcular_notas_mensuales)
- genera historial_notas simulando correcciones post-carga

Mantiene el modelo orgánico del v2 (seed=42, coherente con los perfiles de
asistencias/citaciones en SQL): nivel base gaussiano por estudiante + sesgo
por área temática + ruido por actividad.

Uso:
    python manage.py seed_notas_v3                         # upsert, re-ejecutable
    python manage.py seed_notas_v3 --limpiar               # borra la gestión y sale
    python manage.py seed_notas_v3 --gestion 2026 --trimestre 1 --mes 4
"""

import random
import unicodedata
from collections import defaultdict
from datetime import date, datetime, timedelta, timezone

from django.conf import settings
from django.core.management.base import BaseCommand
from pymongo import MongoClient, InsertOne, UpdateOne

from backend.apps.academics.models import ProfesorCurso
from backend.apps.academics.services.notas_mongo_service import ensure_indexes
from backend.apps.students.models import Estudiante

_NOTA_MAX = {'ser': 10.0, 'saber': 45.0, 'hacer': 40.0}

# Perfiles de nivel (nombre, probabilidad, mu, sigma) en escala 0..1
PERFILES = [
    ('EXCELENTE',     0.15, 0.82, 0.07),
    ('SATISFACTORIO', 0.40, 0.62, 0.09),
    ('APOYO',         0.30, 0.42, 0.10),
    ('CRITICO',       0.15, 0.22, 0.10),
]

# (saber_min, saber_max, hacer_min, hacer_max) columnas por materia
MAT_CFG = {
    'MATEMATICA':                  (5, 6, 3, 4),
    'FISICA':                      (4, 6, 3, 4),
    'QUIMICA':                     (4, 5, 3, 4),
    'BIOLOGIA-GEOGRAFIA':          (4, 5, 2, 4),
    'COMUNICACION Y LENGUAJE':     (3, 5, 3, 4),
    'LENGUA EXTRANJERA':           (3, 4, 2, 4),
    'CIENCIAS SOCIALES':           (3, 5, 2, 4),
    'FILOSOFIA-PSICOLOGIA':        (3, 4, 2, 3),
    'EDUCACION FISICA':            (2, 3, 4, 5),
    'EDUCACION MUSICAL':           (2, 3, 3, 5),
    'ARTES PLASTICAS Y VISUALES':  (2, 3, 4, 5),
    'TECNICA TECNOLOGICA':         (2, 3, 4, 5),
    'ESPIRITUALIDAD Y RELIGIONES': (2, 3, 2, 3),
}

AREA_MATERIA = {
    'MATEMATICA': 'CIENCIAS_EXACTAS', 'FISICA': 'CIENCIAS_EXACTAS',
    'QUIMICA': 'CIENCIAS_EXACTAS', 'BIOLOGIA-GEOGRAFIA': 'CIENCIAS_NATURALES',
    'COMUNICACION Y LENGUAJE': 'HUMANIDADES', 'LENGUA EXTRANJERA': 'HUMANIDADES',
    'CIENCIAS SOCIALES': 'HUMANIDADES', 'FILOSOFIA-PSICOLOGIA': 'HUMANIDADES',
    'EDUCACION FISICA': 'ARTISTICAS', 'EDUCACION MUSICAL': 'ARTISTICAS',
    'ARTES PLASTICAS Y VISUALES': 'ARTISTICAS', 'TECNICA TECNOLOGICA': 'ARTISTICAS',
    'ESPIRITUALIDAD Y RELIGIONES': 'HUMANIDADES',
}
AREAS = ['CIENCIAS_EXACTAS', 'CIENCIAS_NATURALES', 'HUMANIDADES', 'ARTISTICAS']

TITULOS_SABER = ['Examen Parcial', 'Control de Lectura', 'Evaluación Escrita',
                 'Prueba Objetiva', 'Examen Oral', 'Evaluación de Unidad']
TITULOS_HACER = ['Trabajo Práctico', 'Tarea', 'Proyecto', 'Exposición',
                 'Carpeta de Trabajos', 'Investigación']
FECHAS_BASE = [date(2026, 2, 10), date(2026, 2, 24), date(2026, 3, 10),
               date(2026, 3, 24), date(2026, 4, 7), date(2026, 4, 21)]

PROB_CORRECCION = 0.02   # fracción de notas saber/hacer con corrección simulada


def _norm(s):
    return ''.join(c for c in unicodedata.normalize('NFD', s)
                   if unicodedata.category(c) != 'Mn').upper()


def _get_db_seed():
    client = MongoClient(settings.MONGO_URI, socketTimeoutMS=60000, connectTimeoutMS=5000)
    return client[settings.MONGO_DB_NAME]


def _nota_organica(nivel, sesgo, max_col, sigma, prob_cero=0.0):
    """Nota entera para una actividad: nivel base + sesgo de área + ruido."""
    if prob_cero > 0 and random.random() < prob_cero:
        return 0
    raw = max(0.0, min(1.0, nivel + sesgo + random.gauss(0, sigma)))
    return int(round(raw * max_col))


def _promedio_todos(notas, n_cols):
    return round(sum(notas) / n_cols, 2) if n_cols else None


def _promedio_rendidos(notas):
    rendidas = [n for n in notas if n > 0]
    return round(sum(rendidas) / len(rendidas), 2) if rendidas else None


class Command(BaseCommand):
    help = 'Seed v3 de notas Mongo con el modelo de datos de la app real (PK + nro_planilla).'

    def add_arguments(self, parser):
        parser.add_argument('--gestion', type=int, default=2026)
        parser.add_argument('--trimestre', type=int, default=1)
        parser.add_argument('--mes', type=int, default=4)
        parser.add_argument('--limpiar', action='store_true',
                            help='Borra notas/historial/predicciones de la gestión y sale.')

    def handle(self, *args, **opts):
        gestion, trimestre, mes = opts['gestion'], opts['trimestre'], opts['mes']
        db = _get_db_seed()

        if opts['limpiar']:
            for coleccion in ('detalle_notas', 'notas_mensuales', 'historial_notas',
                              'predicciones', 'predicciones_arbol'):
                borrados = db[coleccion].delete_many({'gestion': gestion}).deleted_count
                self.stdout.write(f'  {coleccion}: {borrados} eliminados')
            self.stdout.write(self.style.SUCCESS(f'Gestión {gestion} limpiada.'))
            return

        random.seed(42)
        ensure_indexes()  # crea el índice único nuevo (con gestion/curso_id)
        ahora = datetime.now(tz=timezone.utc)

        # ── Estudiantes: perfiles + nro_planilla por curso ────────────────────
        estudiantes = list(
            Estudiante.objects.filter(activo=True)
            .order_by('curso_id', 'apellido_paterno', 'apellido_materno', 'nombre')
        )
        shuffled = estudiantes[:]
        random.shuffle(shuffled)

        perfil_cat, i = {}, 0
        for nombre_perfil, pct, _mu, _sd in PERFILES:
            n = int(round(len(shuffled) * pct))
            for est in shuffled[i:i + n]:
                perfil_cat[est.id] = nombre_perfil
            i += n
        for est in shuffled[i:]:
            perfil_cat[est.id] = 'SATISFACTORIO'

        nivel_base, sesgo_area = {}, {}
        for est in estudiantes:
            _n, _p, mu, sd = next(p for p in PERFILES if p[0] == perfil_cat[est.id])
            nivel_base[est.id] = max(0.05, min(0.99, random.gauss(mu, sd)))
            sesgo_area[est.id] = {
                a: max(-0.20, min(0.20, random.gauss(0, 0.09))) for a in AREAS
            }

        est_por_curso = defaultdict(list)
        nro_planilla, nombre_est = {}, {}
        for est in estudiantes:
            est_por_curso[est.curso_id].append(est)
            nro_planilla[est.id] = len(est_por_curso[est.curso_id])  # 1..N por curso
            partes = [est.apellido_paterno or '', est.apellido_materno or '', est.nombre or '']
            nombre_est[est.id] = ' '.join(p for p in partes if p).strip()

        # ── Generación por asignación ─────────────────────────────────────────
        detalle_ops, mensual_ops, historial_ops = [], [], []
        stats = defaultdict(int)

        def _flush(forzar=False):
            nonlocal detalle_ops, mensual_ops, historial_ops
            if detalle_ops and (forzar or len(detalle_ops) >= 5000):
                db['detalle_notas'].bulk_write(detalle_ops, ordered=False)
                detalle_ops = []
            if mensual_ops and (forzar or len(mensual_ops) >= 1500):
                db['notas_mensuales'].bulk_write(mensual_ops, ordered=False)
                mensual_ops = []
            if historial_ops and (forzar or len(historial_ops) >= 1500):
                db['historial_notas'].bulk_write(historial_ops, ordered=False)
                historial_ops = []

        asignaciones = list(ProfesorCurso.objects.select_related('materia').all())
        self.stdout.write(f'Procesando {len(asignaciones)} asignaciones...')

        for pc in asignaciones:
            nombre_mat = _norm(pc.materia.nombre)
            cfg  = MAT_CFG.get(nombre_mat, (3, 5, 2, 4))
            area = AREA_MATERIA.get(nombre_mat, 'HUMANIDADES')

            columnas = []  # (dimension, col_idx, titulo, fecha)
            for j in range(random.randint(cfg[0], cfg[1])):
                f = random.choice(FECHAS_BASE)
                columnas.append(('saber', 19 + j,
                                 f"{f.strftime('%d/%m/%Y')} - {random.choice(TITULOS_SABER)}", f))
            for j in range(random.randint(cfg[2], cfg[3])):
                f = random.choice(FECHAS_BASE)
                columnas.append(('hacer', 30 + j,
                                 f"{f.strftime('%d/%m/%Y')} - {random.choice(TITULOS_HACER)}", f))
            columnas.append(('ser', 14, '30/04/2026 - Actitud T1', date(2026, 4, 30)))

            sigma = {'saber': 0.11 if area == 'CIENCIAS_EXACTAS' else 0.09,
                     'hacer': 0.09 if area == 'ARTISTICAS' else 0.10,
                     'ser':   0.07}

            for est in est_por_curso.get(pc.curso_id, []):
                nivel = nivel_base[est.id]
                sesgo = sesgo_area[est.id][area]
                prob_cero = {
                    'saber': max(0.0, min(0.20, 0.05 + (0.30 - nivel) * 0.40 + random.gauss(0, 0.03))),
                    'hacer': max(0.01, min(0.60, 0.60 - nivel * 0.60 + random.gauss(0, 0.05))),
                    'ser':   0.0,
                }
                notas_dim = defaultdict(list)

                for dimension, col_idx, titulo, f in columnas:
                    max_col = _NOTA_MAX[dimension]
                    sesgo_dim = sesgo * 0.5 if dimension == 'ser' else sesgo
                    nota = _nota_organica(nivel, sesgo_dim, max_col,
                                          sigma[dimension], prob_cero[dimension])
                    notas_dim[dimension].append(nota)

                    doc = {
                        'estudiante_id':     est.id,
                        'nro_planilla':      nro_planilla[est.id],
                        'nombre_estudiante': nombre_est[est.id],
                        'materia_id':        pc.materia_id,
                        'curso_id':          pc.curso_id,
                        'profesor_id':       pc.profesor_id,
                        'gestion':           gestion,
                        'trimestre':         trimestre,
                        'mes':               mes,
                        'dimension':         dimension,
                        'columna_idx':       col_idx,
                        'titulo':            titulo,
                        'fecha_actividad':   datetime(f.year, f.month, f.day, tzinfo=timezone.utc),
                        'nota':              nota,
                        'nota_maxima':       max_col,
                        'fecha_carga':       ahora,
                    }

                    # Corrección simulada: la nota actual difiere de una anterior
                    if dimension != 'ser' and nota > 0 and random.random() < PROB_CORRECCION:
                        delta = random.choice([-5, -3, -2, -1, 1, 2, 3])
                        nota_anterior = max(0, min(int(max_col), nota - delta))
                        if nota_anterior != nota:
                            fecha_cambio = ahora - timedelta(days=random.randint(1, 10))
                            doc['fecha_actualizacion'] = fecha_cambio
                            historial_ops.append(InsertOne({
                                'estudiante_id':   est.id,
                                'nro_planilla':    nro_planilla[est.id],
                                'materia_id':      pc.materia_id,
                                'curso_id':        pc.curso_id,
                                'profesor_id':     pc.profesor_id,
                                'gestion':         gestion,
                                'trimestre':       trimestre,
                                'dimension':       dimension,
                                'columna_idx':     col_idx,
                                'nota_anterior':   nota_anterior,
                                'nota_nueva':      nota,
                                'titulo_anterior': None,
                                'titulo_nuevo':    None,
                                'tipo_cambio':     'nota',
                                'fecha_cambio':    fecha_cambio,
                            }))
                            stats['correcciones'] += 1

                    filtro = {
                        'gestion': gestion, 'curso_id': pc.curso_id,
                        'materia_id': pc.materia_id, 'trimestre': trimestre,
                        'dimension': dimension, 'columna_idx': col_idx,
                        'estudiante_id': est.id,
                    }
                    detalle_ops.append(UpdateOne(filtro, {'$set': doc}, upsert=True))
                    stats['detalle'] += 1

                # ── notas_mensuales: mismo modelo que calcular_notas_mensuales ─
                dim_fields, nota_mensual = {}, 0.0
                for dimension in _NOTA_MAX:
                    val = _promedio_todos(notas_dim[dimension], len(notas_dim[dimension]))
                    dim_fields[dimension] = val
                    nota_mensual += val or 0.0

                saber_n, hacer_n = notas_dim['saber'], notas_dim['hacer']
                ser_prom = dim_fields['ser'] or 0.0
                autoeval = max(1, min(5, int(round((ser_prom / 10.0 + random.gauss(0, 0.15)) * 5))))

                filtro_m = {'estudiante_id': est.id, 'materia_id': pc.materia_id,
                            'gestion': gestion, 'trimestre': trimestre, 'mes': mes}
                mensual_ops.append(UpdateOne(filtro_m, {'$set': {
                    **filtro_m,
                    'curso_id':                   pc.curso_id,
                    'profesor_id':                pc.profesor_id,
                    **dim_fields,
                    'nota_mensual':               round(nota_mensual, 2),
                    'promedio_tareas':            _promedio_rendidos(hacer_n),
                    'cantidad_tareas_entregadas': sum(1 for n in hacer_n if n > 0),
                    'cantidad_tareas_total':      len(hacer_n),
                    'promedio_examenes':          _promedio_rendidos(saber_n),
                    'cantidad_examenes_rendidos': sum(1 for n in saber_n if n > 0),
                    'cantidad_examenes_total':    len(saber_n),
                    'autoeval_ser':               autoeval,
                    'fecha_carga':                ahora,
                }}, upsert=True))
                stats['mensuales'] += 1

            _flush()

        _flush(forzar=True)

        self.stdout.write(self.style.SUCCESS(
            f"Seed v3 completado — detalle: {stats['detalle']}, "
            f"mensuales: {stats['mensuales']}, correcciones: {stats['correcciones']}"
        ))
        self.stdout.write(f"detalle_notas total en BD: {db['detalle_notas'].count_documents({})}")

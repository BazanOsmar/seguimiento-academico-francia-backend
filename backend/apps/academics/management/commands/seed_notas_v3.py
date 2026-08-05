"""
Seed v3 de datos académicos — notas (MongoDB) + asistencia y citaciones (SQL).

Es 100% dinámico: evalúa lo que existe en la BD (cursos, estudiantes activos,
asignaciones profesor-materia-curso, usuarios) y genera datos coherentes para
esa foto, sin depender de IDs ni cantidades específicas.

Modelo de perfiles POR CURSO (no global):
- Cada curso tiene siempre un grupo mayoritario SATISFACTORIO (regular) y entre
  1 y 3 grupos adicionales elegidos al azar entre:
    EXCELENTE (destacados, 1-5% del curso)
    APOYO     (intermedio bajo, 8-20%)
    CRITICO   (malos, 2-10%)
  → ningún curso queda con un solo grupo, y no todos los cursos tienen los 4.
- El perfil gobierna TODO el comportamiento del estudiante de forma coherente:
  notas, entrega de tareas, asistencia (un EXCELENTE casi no falta; un regular
  tiene atrasos y faltas aisladas; faltar mucho es raro incluso en CRITICO)
  y citaciones (solo perfiles bajos las acumulan).

Genera para cada mes desde febrero hasta --mes:
- detalle_notas / notas_mensuales / historial_notas (Mongo, mismo modelo que
  guardar_notas: PK real + nro_planilla, columnas acumulativas por trimestre)
- AsistenciaSesion + Asistencia por día hábil (SQL)
- Citaciones (SQL) con motivo coherente con las faltas reales del mes

Con esto K-Means (asistencia + citaciones + notas del mes) y el Árbol de
Decisión (faltas y notas acumuladas del trimestre) tienen todas sus features.

Uso:
    python manage.py seed_notas_v3                    # genera feb..abril 2026
    python manage.py seed_notas_v3 --gestion 2026 --mes 6   # feb..junio (T1+T2)
    python manage.py seed_notas_v3 --limpiar          # borra TODO lo de la gestión
                                                      # (Mongo + asistencia + citaciones)
"""

import random
import unicodedata
from collections import defaultdict
from datetime import date, datetime, time as dtime, timedelta, timezone

from django.conf import settings
from django.core.management.base import BaseCommand
from django.db import transaction
from django.db.models import Count
from django.utils import timezone as djtz
from pymongo import MongoClient, InsertOne, UpdateOne

from backend.apps.academics.models import ProfesorCurso
from backend.apps.academics.services.notas_mongo_service import ensure_indexes
from backend.apps.attendance.models import Asistencia, AsistenciaSesion
from backend.apps.discipline.models import Citacion
from backend.apps.students.models import Estudiante
from backend.apps.users.models import User

_NOTA_MAX = {'ser': 10.0, 'saber': 45.0, 'hacer': 40.0}

# Perfiles: nivel académico (mu/sd en escala 0..1), distribución de asistencia
# (PRESENTE, ATRASO, FALTA, LICENCIA), tope de faltas por mes y probabilidad
# de recibir citación en un mes.
PERFILES = {
    'EXCELENTE':     {'mu': 0.82, 'sd': 0.07, 'asis': (0.960, 0.025, 0.005, 0.010),
                      'faltas_cap': 1, 'prob_cit': 0.00, 'p_sin_uniforme': 0.02},
    'SATISFACTORIO': {'mu': 0.62, 'sd': 0.09, 'asis': (0.885, 0.075, 0.030, 0.010),
                      'faltas_cap': 2, 'prob_cit': 0.05, 'p_sin_uniforme': 0.04},
    'APOYO':         {'mu': 0.44, 'sd': 0.09, 'asis': (0.800, 0.130, 0.060, 0.010),
                      'faltas_cap': 3, 'prob_cit': 0.22, 'p_sin_uniforme': 0.07},
    'CRITICO':       {'mu': 0.24, 'sd': 0.09, 'asis': (0.700, 0.170, 0.120, 0.010),
                      'faltas_cap': 5, 'prob_cit': 0.50, 'p_sin_uniforme': 0.12},
}

# Rango porcentual del curso que ocupa cada grupo opcional (el resto es regular)
CUPOS_CURSO = {'EXCELENTE': (0.01, 0.05), 'APOYO': (0.08, 0.20), 'CRITICO': (0.02, 0.10)}

# (saber_min, saber_max, hacer_min, hacer_max) columnas POR TRIMESTRE por materia
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

MOTIVOS_CIT = ['CONDUCTA', 'COMPORTAMIENTO', 'BAJO_RENDIMIENTO', 'RENDIMIENTO']
DESCRIPCIONES_CIT = {
    'FALTAS':           'Faltas injustificadas acumuladas durante el mes.',
    'CONDUCTA':         'Problemas de conducta reportados por los docentes.',
    'COMPORTAMIENTO':   'Comportamiento inadecuado reiterado en clases.',
    'BAJO_RENDIMIENTO': 'Bajo rendimiento academico sostenido durante el mes.',
    'RENDIMIENTO':      'Se requiere conversar sobre el rendimiento del estudiante.',
}

PROB_CORRECCION = 0.02   # fracción de notas saber/hacer con corrección simulada


def _norm(s):
    return ''.join(c for c in unicodedata.normalize('NFD', s)
                   if unicodedata.category(c) != 'Mn').upper()


def _get_db_seed():
    client = MongoClient(settings.MONGO_URI, socketTimeoutMS=60000, connectTimeoutMS=5000)
    return client[settings.MONGO_DB_NAME]


def _mes_a_trimestre(mes):
    if mes <= 4:
        return 1
    if mes <= 8:
        return 2
    return 3


def _dias_habiles(gestion, mes):
    """Días hábiles (lun-vie) del mes; si es el mes en curso, corta en hoy."""
    hoy = date.today()
    d, out = date(gestion, mes, 1), []
    while d.month == mes:
        if d.weekday() < 5 and not (gestion == hoy.year and d > hoy):
            out.append(d)
        d += timedelta(days=1)
    return out


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
    help = ('Seed v3: notas Mongo + asistencia y citaciones SQL, coherentes por '
            'perfil de estudiante, para K-Means y Árbol de Decisión.')

    def add_arguments(self, parser):
        parser.add_argument('--gestion', type=int, default=2026)
        parser.add_argument('--mes', type=int, default=4,
                            help='Mes final (genera desde febrero hasta este mes).')
        parser.add_argument('--limpiar', action='store_true',
                            help='Borra notas/predicciones (Mongo) y asistencia/'
                                 'citaciones (SQL) de la gestión, y sale.')

    # ── Limpieza ──────────────────────────────────────────────────────────────
    def _limpiar(self, db, gestion):
        for coleccion in ('detalle_notas', 'notas_mensuales', 'historial_notas',
                          'predicciones', 'predicciones_arbol'):
            borrados = db[coleccion].delete_many({'gestion': gestion}).deleted_count
            self.stdout.write(f'  Mongo {coleccion}: {borrados} eliminados')

        with transaction.atomic():
            n_cit, _ = Citacion.objects.filter(fecha_envio__year=gestion).delete()
            n_asi, _ = Asistencia.objects.filter(sesion__fecha__year=gestion).delete()
            n_ses, _ = AsistenciaSesion.objects.filter(fecha__year=gestion).delete()
        self.stdout.write(f'  SQL citaciones: {n_cit} | asistencias: {n_asi} | sesiones: {n_ses}')
        self.stdout.write(self.style.SUCCESS(f'Gestion {gestion} limpiada.'))

    # ── Evaluación del contexto ───────────────────────────────────────────────
    def _evaluar_contexto(self, gestion, meses):
        """Inventaría la BD y devuelve las estructuras base del seed."""
        estudiantes = list(
            Estudiante.objects.filter(activo=True)
            .order_by('curso_id', 'apellido_paterno', 'apellido_materno', 'nombre')
        )
        asignaciones = list(ProfesorCurso.objects.select_related('materia', 'curso').all())

        est_por_curso = defaultdict(list)
        for est in estudiantes:
            est_por_curso[est.curso_id].append(est)

        materias_por_curso = defaultdict(list)
        profesores_ids, materias_sin_cfg = set(), set()
        for pc in asignaciones:
            materias_por_curso[pc.curso_id].append(pc.materia)
            profesores_ids.add(pc.profesor_id)
            if _norm(pc.materia.nombre) not in MAT_CFG:
                materias_sin_cfg.add(pc.materia.nombre)

        regente = User.objects.filter(
            tipo_usuario__nombre__iexact='Regente', is_active=True).first()
        director = User.objects.filter(
            tipo_usuario__nombre__iexact='Director', is_active=True).first()

        cursos_sin_est = [c for c in materias_por_curso if c not in est_por_curso]
        cursos_sin_asig = [c for c in est_por_curso if c not in materias_por_curso]

        w = self.stdout.write
        w(self.style.MIGRATE_HEADING('== Evaluacion del contexto =='))
        w(f'  Gestion {gestion} | meses a generar: {meses}')
        w(f'  Estudiantes activos: {len(estudiantes)} en {len(est_por_curso)} cursos')
        if est_por_curso:
            tams = [len(v) for v in est_por_curso.values()]
            w(f'  Tamano de curso: min {min(tams)} / max {max(tams)}')
        w(f'  Asignaciones profesor-materia-curso: {len(asignaciones)} '
          f'({len(profesores_ids)} profesores, '
          f'{len({pc.materia_id for pc in asignaciones})} materias)')
        w(f'  Registrador de asistencia: {regente or director} | '
          f'Emisor de citaciones: {regente or director}')
        if materias_sin_cfg:
            w(self.style.WARNING(f'  Materias sin config (usan fallback): {sorted(materias_sin_cfg)}'))
        if cursos_sin_est:
            w(self.style.WARNING(f'  Cursos con asignaciones pero sin estudiantes: {cursos_sin_est}'))
        if cursos_sin_asig:
            w(self.style.WARNING(f'  Cursos con estudiantes pero sin asignaciones: {cursos_sin_asig}'))

        return {
            'estudiantes': estudiantes,
            'asignaciones': asignaciones,
            'est_por_curso': est_por_curso,
            'materias_por_curso': materias_por_curso,
            'usuario_registro': regente or director,
        }

    # ── Perfiles por curso ────────────────────────────────────────────────────
    def _asignar_perfiles(self, est_por_curso, asignaciones):
        """
        Cada curso: SATISFACTORIO mayoritario + 1..3 grupos extra al azar
        (EXCELENTE / APOYO / CRITICO) con cupos porcentuales propios.
        """
        cursos_nombre = {pc.curso_id: f'{pc.curso.grado} {pc.curso.paralelo}'
                         for pc in asignaciones}
        perfil_cat = {}
        self.stdout.write(self.style.MIGRATE_HEADING('== Composicion de grupos por curso =='))

        for curso_id, ests in sorted(est_por_curso.items()):
            n = len(ests)
            extras = random.sample(list(CUPOS_CURSO), random.randint(1, 3))
            cupos = {}
            for p in extras:
                lo, hi = CUPOS_CURSO[p]
                cupos[p] = max(1, int(round(n * random.uniform(lo, hi))))
            # el grupo regular debe seguir siendo mayoría
            while sum(cupos.values()) > n // 2 and max(cupos.values()) > 1:
                cupos[max(cupos, key=cupos.get)] -= 1

            pool = ests[:]
            random.shuffle(pool)
            i = 0
            for p, cupo in cupos.items():
                for est in pool[i:i + cupo]:
                    perfil_cat[est.id] = p
                i += cupo
            for est in pool[i:]:
                perfil_cat[est.id] = 'SATISFACTORIO'

            detalle = ' | '.join(f'{p}: {c}' for p, c in cupos.items())
            self.stdout.write(f'  {cursos_nombre.get(curso_id, curso_id)} ({n} est): '
                              f'SATISFACTORIO: {n - sum(cupos.values())} | {detalle}')
        return perfil_cat

    # ── Asistencia (SQL) ──────────────────────────────────────────────────────
    def _generar_asistencia(self, gestion, meses, est_por_curso, perfil_cat, registrador):
        sesiones_creadas = asistencias_creadas = 0
        estados = ('PRESENTE', 'ATRASO', 'FALTA', 'LICENCIA')

        for curso_id, ests in est_por_curso.items():
            with transaction.atomic():
                for m in meses:
                    faltas_mes = defaultdict(int)   # tope de faltas por estudiante/mes
                    racha_falta = defaultdict(int)  # evita faltas consecutivas
                    for dia in _dias_habiles(gestion, m):
                        sesion, created = AsistenciaSesion.objects.get_or_create(
                            curso_id=curso_id, fecha=dia,
                            defaults={'registrado_por': registrador, 'estado': 'ENVIADA'},
                        )
                        if created:
                            sesiones_creadas += 1
                            ya = set()
                        else:
                            ya = set(sesion.asistencias.values_list('estudiante_id', flat=True))

                        bulk = []
                        for est in ests:
                            if est.id in ya:
                                continue
                            perfil = PERFILES[perfil_cat[est.id]]
                            estado = random.choices(estados, weights=perfil['asis'])[0]

                            if estado == 'FALTA':
                                racha_max = 2 if perfil_cat[est.id] == 'CRITICO' else 1
                                if (faltas_mes[est.id] >= perfil['faltas_cap']
                                        or racha_falta[est.id] >= racha_max):
                                    estado = random.choices(
                                        ('PRESENTE', 'ATRASO'), weights=(0.8, 0.2))[0]

                            if estado == 'FALTA':
                                faltas_mes[est.id] += 1
                                racha_falta[est.id] += 1
                            else:
                                racha_falta[est.id] = 0

                            hora = (dtime(7, random.randint(16, 50))
                                    if estado == 'ATRASO'
                                    else dtime(7, random.randint(0, 12)))
                            bulk.append(Asistencia(
                                sesion=sesion, estudiante_id=est.id, estado=estado,
                                hora=hora,
                                uniforme=random.random() > perfil['p_sin_uniforme'],
                            ))
                        if bulk:
                            Asistencia.objects.bulk_create(bulk, ignore_conflicts=True)
                            asistencias_creadas += len(bulk)

        self.stdout.write(f'  Asistencia: {sesiones_creadas} sesiones, '
                          f'{asistencias_creadas} registros nuevos')

    # ── Citaciones (SQL) ──────────────────────────────────────────────────────
    def _generar_citaciones(self, gestion, meses, est_por_curso, perfil_cat,
                            emisor, materias_por_curso):
        creadas = 0
        for m in meses:
            dias = _dias_habiles(gestion, m)
            if not dias:
                continue
            # idempotencia: no duplicar si el estudiante ya tiene citación ese mes
            ya_citados = set(
                Citacion.objects.filter(fecha_envio__year=gestion, fecha_envio__month=m)
                .values_list('estudiante_id', flat=True)
            )
            faltas_map = {
                r['estudiante_id']: r['total']
                for r in Asistencia.objects.filter(
                    sesion__fecha__year=gestion, sesion__fecha__month=m, estado='FALTA')
                .values('estudiante_id').annotate(total=Count('id'))
            }

            nuevas, fechas_envio = [], []
            for curso_id, ests in est_por_curso.items():
                materias = materias_por_curso.get(curso_id, [])
                for est in ests:
                    nombre_p = perfil_cat[est.id]
                    if est.id in ya_citados or random.random() >= PERFILES[nombre_p]['prob_cit']:
                        continue
                    n_cit = 2 if (nombre_p == 'CRITICO' and random.random() < 0.30) else 1

                    for _ in range(n_cit):
                        fecha_e = random.choice(dias)
                        motivo = ('FALTAS' if faltas_map.get(est.id, 0) >= 3
                                  else random.choice(MOTIVOS_CIT))
                        fecha_limite = fecha_e + timedelta(days=random.randint(3, 7))

                        # meses pasados: mayoría resueltas; mes final: mayoría pendientes
                        resuelta = random.random() < (0.75 if m < meses[-1] else 0.35)
                        if resuelta:
                            asistencia = random.choices(
                                ('ASISTIO', 'NO_ASISTIO', 'ATRASO'),
                                weights=(0.60, 0.25, 0.15))[0]
                            fecha_asis = (fecha_limite - timedelta(days=random.randint(0, 2))
                                          if asistencia != 'NO_ASISTIO' else fecha_limite)
                            estado_envio = 'VISTO'
                        else:
                            asistencia, fecha_asis = 'PENDIENTE', None
                            estado_envio = random.choice(['ENVIADA', 'VISTO'])

                        nuevas.append(Citacion(
                            estudiante_id=est.id,
                            emisor=emisor,
                            motivo=motivo,
                            descripcion=DESCRIPCIONES_CIT[motivo],
                            estado=estado_envio,
                            fecha_limite_asistencia=fecha_limite,
                            fecha_asistencia=fecha_asis,
                            asistencia=asistencia,
                            materia=(random.choice(materias)
                                     if materias and random.random() > 0.30 else None),
                        ))
                        fechas_envio.append(djtz.make_aware(datetime.combine(
                            fecha_e, dtime(random.randint(8, 12), random.randint(0, 59)))))

            if nuevas:
                with transaction.atomic():
                    Citacion.objects.bulk_create(nuevas)
                    # fecha_envio es auto_now_add: se corrige después del insert
                    for cit, f in zip(nuevas, fechas_envio):
                        cit.fecha_envio = f
                    Citacion.objects.bulk_update(nuevas, ['fecha_envio'])
                creadas += len(nuevas)

        self.stdout.write(f'  Citaciones: {creadas} generadas')

    # ── Notas (MongoDB) ───────────────────────────────────────────────────────
    def _generar_notas(self, db, gestion, meses, ctx, perfil_cat):
        ahora = datetime.now(tz=timezone.utc)
        estudiantes = ctx['estudiantes']
        est_por_curso = ctx['est_por_curso']

        # nivel base por estudiante + sesgo por área + deriva mensual (tendencia)
        nivel_base, sesgo_area, drift = {}, {}, {}
        for est in estudiantes:
            p = PERFILES[perfil_cat[est.id]]
            nivel_base[est.id] = max(0.05, min(0.99, random.gauss(p['mu'], p['sd'])))
            sesgo_area[est.id] = {
                a: max(-0.20, min(0.20, random.gauss(0, 0.09))) for a in AREAS
            }
            acumulado, drift[est.id] = 0.0, {}
            for m in meses:
                drift[est.id][m] = acumulado
                acumulado += random.gauss(0, 0.04)

        nro_planilla, nombre_est = {}, {}
        for curso_id, ests in est_por_curso.items():
            for i, est in enumerate(ests, start=1):
                nro_planilla[est.id] = i
                partes = [est.apellido_paterno or '', est.apellido_materno or '', est.nombre or '']
                nombre_est[est.id] = ' '.join(x for x in partes if x).strip()

        detalle_ops, mensual_ops, historial_ops = [], [], []
        stats = defaultdict(int)
        autoeval_cache = {}  # (est_id, materia_id, trimestre) → autoeval fija del trimestre

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

        self.stdout.write(f'  Procesando {len(ctx["asignaciones"])} asignaciones '
                          f'x {len(meses)} meses...')

        for pc in ctx['asignaciones']:
            nombre_mat = _norm(pc.materia.nombre)
            cfg  = MAT_CFG.get(nombre_mat, (3, 5, 2, 4))
            area = AREA_MATERIA.get(nombre_mat, 'HUMANIDADES')
            sigma = {'saber': 0.11 if area == 'CIENCIAS_EXACTAS' else 0.09,
                     'hacer': 0.09 if area == 'ARTISTICAS' else 0.10,
                     'ser':   0.07}

            # el índice de columna acumula dentro del trimestre (índice único
            # de detalle_notas no incluye mes; cada columna guarda su mes)
            next_idx = {}

            for m in meses:
                tri = _mes_a_trimestre(m)
                idx = next_idx.setdefault(tri, {'saber': 19, 'hacer': 30, 'ser': 14})
                dias_m = _dias_habiles(gestion, m) or [date(gestion, m, 15)]
                meses_tri = max(1, len([x for x in meses if _mes_a_trimestre(x) == tri]))

                columnas = []  # (dimension, col_idx, titulo, fecha)
                for _ in range(max(1, round(random.randint(cfg[0], cfg[1]) / meses_tri))):
                    f = random.choice(dias_m)
                    columnas.append(('saber', idx['saber'],
                                     f"{f.strftime('%d/%m/%Y')} - {random.choice(TITULOS_SABER)}", f))
                    idx['saber'] += 1
                for _ in range(max(1, round(random.randint(cfg[2], cfg[3]) / meses_tri))):
                    f = random.choice(dias_m)
                    columnas.append(('hacer', idx['hacer'],
                                     f"{f.strftime('%d/%m/%Y')} - {random.choice(TITULOS_HACER)}", f))
                    idx['hacer'] += 1
                f_ser = dias_m[-1]
                columnas.append(('ser', idx['ser'],
                                 f"{f_ser.strftime('%d/%m/%Y')} - Actitud mes {m}", f_ser))
                idx['ser'] += 1

                for est in est_por_curso.get(pc.curso_id, []):
                    nivel = max(0.05, min(0.99, nivel_base[est.id] + drift[est.id][m]))
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
                            'trimestre':         tri,
                            'mes':               m,
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
                                    'trimestre':       tri,
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
                            'materia_id': pc.materia_id, 'trimestre': tri,
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
                    clave_auto = (est.id, pc.materia_id, tri)
                    if clave_auto not in autoeval_cache:
                        ser_prom = dim_fields['ser'] or 0.0
                        autoeval_cache[clave_auto] = max(1, min(5, int(round(
                            (ser_prom / 10.0 + random.gauss(0, 0.15)) * 5))))

                    filtro_m = {'estudiante_id': est.id, 'materia_id': pc.materia_id,
                                'gestion': gestion, 'trimestre': tri, 'mes': m}
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
                        'autoeval_ser':               autoeval_cache[clave_auto],
                        'fecha_carga':                ahora,
                    }}, upsert=True))
                    stats['mensuales'] += 1

                _flush()

        _flush(forzar=True)
        self.stdout.write(
            f"  Notas — detalle: {stats['detalle']}, mensuales: {stats['mensuales']}, "
            f"correcciones: {stats['correcciones']}"
        )

    # ── Entry point ───────────────────────────────────────────────────────────
    def handle(self, *args, **opts):
        gestion, mes_final = opts['gestion'], opts['mes']
        db = _get_db_seed()

        if opts['limpiar']:
            self._limpiar(db, gestion)
            return

        if not 1 <= mes_final <= 12:
            self.stderr.write('El mes debe estar entre 1 y 12.')
            return
        # gestión escolar boliviana: las clases empiezan en febrero
        meses = list(range(2, mes_final + 1)) if mes_final > 2 else [mes_final]

        random.seed(42)
        ensure_indexes()

        ctx = self._evaluar_contexto(gestion, meses)
        if not ctx['estudiantes'] or not ctx['asignaciones']:
            self.stderr.write('No hay estudiantes activos o asignaciones: nada que generar.')
            return
        if not ctx['usuario_registro']:
            self.stderr.write('No hay usuario Regente ni Director activo (necesario para '
                              'registrar asistencia y emitir citaciones).')
            return

        perfil_cat = self._asignar_perfiles(ctx['est_por_curso'], ctx['asignaciones'])

        self.stdout.write(self.style.MIGRATE_HEADING('== Generando datos =='))
        self._generar_asistencia(gestion, meses, ctx['est_por_curso'],
                                 perfil_cat, ctx['usuario_registro'])
        self._generar_citaciones(gestion, meses, ctx['est_por_curso'], perfil_cat,
                                 ctx['usuario_registro'], ctx['materias_por_curso'])
        self._generar_notas(db, gestion, meses, ctx, perfil_cat)

        self.stdout.write(self.style.SUCCESS(
            f'\nSeed v3 completado (gestion {gestion}, meses {meses[0]}..{meses[-1]}).\n'
            f'Para disparar los analisis manualmente (shell):\n'
            f'  from backend.apps.analytics.services.kmeans_service import ejecutar_analisis_kmeans\n'
            f'  from backend.apps.analytics.services.decision_tree_service import ejecutar_analisis_arbol\n'
            f'  ejecutar_analisis_kmeans({gestion}, {mes_final}); ejecutar_analisis_arbol({gestion}, {mes_final})'
        ))

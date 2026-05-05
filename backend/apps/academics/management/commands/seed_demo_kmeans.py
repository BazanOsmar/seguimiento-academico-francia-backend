"""
Genera datos de demo para probar el flujo completo de K-Means:
  - Asistencia de abril 2026 (SQL) para los 20 cursos
  - notas_mensuales de mayo 2026 (MongoDB) para todos los ProfesorCurso
    excepto pc_id=1 (Julia Quispe, ARTES PLASTICAS, 1ro A)
  - Citaciones de mayo 2026 (SQL) para estudiantes en riesgo
  - Notificaciones (SQL) simulando que cada profesor ya subio sus notas

Uso:
    python manage.py seed_demo_kmeans
"""

import random
from datetime import date, timedelta, time as dtime, datetime, timezone as tz

from django.core.management.base import BaseCommand
from django.db import transaction
from pymongo import UpdateOne

from backend.apps.academics.models import ProfesorCurso, Curso
from backend.apps.academics.services.notas_mongo_service import _get_db
from backend.apps.attendance.models import AsistenciaSesion, Asistencia
from backend.apps.discipline.models import Citacion
from backend.apps.notifications.models import Notificacion
from backend.apps.students.models import Estudiante
from backend.apps.users.models import TipoUsuario, User

# ─── Constantes ───────────────────────────────────────────────────────────────
GESTION   = 2026
MES_NOTAS = 5       # mayo
TRIMESTRE = 2
PC_EXCLUIDO = 1     # Julia Quispe, 1ro A — el usuario lo cargará manualmente

PERFILES = {
    'excelente':     {'ser': (8.0, 10.0), 'saber': (36.0, 45.0), 'hacer': (33.0, 40.0), 'tareas': (0.90, 1.0),  'exam_pct': (0.83, 0.97)},
    'satisfactorio': {'ser': (6.0, 8.0),  'saber': (25.0, 35.0), 'hacer': (24.0, 32.0), 'tareas': (0.75, 0.90), 'exam_pct': (0.63, 0.80)},
    'apoyo':         {'ser': (4.0, 6.0),  'saber': (14.0, 24.0), 'hacer': (14.0, 23.0), 'tareas': (0.50, 0.75), 'exam_pct': (0.43, 0.60)},
    'critico':       {'ser': (2.0, 5.0),  'saber': (5.0,  13.0), 'hacer': (5.0,  12.0), 'tareas': (0.20, 0.50), 'exam_pct': (0.18, 0.38)},
}


def _perfil(est_id: int) -> str:
    v = est_id % 20
    if v < 5:  return 'excelente'
    if v < 11: return 'satisfactorio'
    if v < 17: return 'apoyo'
    return 'critico'


def _rng(est_id: int, mat_id: int) -> random.Random:
    return random.Random(est_id * 1000 + mat_id)


def _dias_habiles_abril() -> list[date]:
    dias = []
    d = date(GESTION, 4, 1)
    while d.month == 4:
        if d.weekday() < 5:  # lunes a viernes
            dias.append(d)
        d += timedelta(days=1)
    return dias


# ─── Limpiar MongoDB ──────────────────────────────────────────────────────────
def _limpiar_mongo(stdout):
    db = _get_db()
    colecciones = ['detalle_notas', 'notas_mensuales', 'predicciones', 'config', 'historial_notas']
    for col in colecciones:
        result = db[col].delete_many({})
        stdout.write(f'  MongoDB {col}: {result.deleted_count} docs eliminados')


# ─── Asistencia abril ─────────────────────────────────────────────────────────
def _generar_asistencia_abril(director: User, stdout):
    dias = _dias_habiles_abril()
    cursos = list(Curso.objects.all())
    estudiantes_por_curso = {
        c.id: list(Estudiante.objects.filter(curso=c, activo=True).values_list('id', flat=True))
        for c in cursos
    }

    # Distribución de asistencia por perfil (probabilidades: PRESENTE, FALTA, ATRASO)
    dist_asistencia = {
        'excelente':     [('PRESENTE', 0.95), ('FALTA', 0.03), ('ATRASO', 0.02)],
        'satisfactorio': [('PRESENTE', 0.88), ('FALTA', 0.07), ('ATRASO', 0.05)],
        'apoyo':         [('PRESENTE', 0.78), ('FALTA', 0.14), ('ATRASO', 0.08)],
        'critico':       [('PRESENTE', 0.62), ('FALTA', 0.26), ('ATRASO', 0.12)],
    }

    sesiones_creadas = 0
    asistencias_creadas = 0

    for curso in cursos:
        est_ids = estudiantes_por_curso[curso.id]
        if not est_ids:
            continue

        for dia in dias:
            sesion, created = AsistenciaSesion.objects.get_or_create(
                curso=curso,
                fecha=dia,
                defaults={'registrado_por': director, 'estado': 'ENVIADA'},
            )
            if created:
                sesiones_creadas += 1

            asistencias_bulk = []
            for est_id in est_ids:
                if Asistencia.objects.filter(sesion=sesion, estudiante_id=est_id).exists():
                    continue
                perfil = _perfil(est_id)
                rng = random.Random(est_id * 10000 + dia.toordinal())
                distribs = dist_asistencia[perfil]
                estados, pesos = zip(*distribs)
                estado = rng.choices(list(estados), weights=list(pesos))[0]
                if estado == 'ATRASO':
                    hora = dtime(7, rng.randint(16, 45))
                else:
                    hora = dtime(7, rng.randint(0, 10))
                asistencias_bulk.append(Asistencia(
                    sesion=sesion,
                    estudiante_id=est_id,
                    estado=estado,
                    hora=hora,
                    uniforme=rng.random() > 0.05,
                ))

            if asistencias_bulk:
                Asistencia.objects.bulk_create(asistencias_bulk, ignore_conflicts=True)
                asistencias_creadas += len(asistencias_bulk)

    stdout.write(f'  Asistencia abril: {sesiones_creadas} sesiones, {asistencias_creadas} registros')


# ─── notas_mensuales mayo (MongoDB) ──────────────────────────────────────────
def _generar_notas_mayo(stdout):
    db = _get_db()
    col = db['notas_mensuales']

    pcs = list(
        ProfesorCurso.objects
        .exclude(id=PC_EXCLUIDO)
        .select_related('profesor', 'materia', 'curso')
    )
    estudiantes_por_curso = {
        c.id: list(Estudiante.objects.filter(curso_id=c.id, activo=True).values_list('id', flat=True))
        for c in Curso.objects.all()
    }

    ops = []
    ahora = datetime.now(tz=tz.utc)

    for pc in pcs:
        est_ids = estudiantes_por_curso.get(pc.curso.id, [])
        for est_id in est_ids:
            perfil = _perfil(est_id)
            r = PERFILES[perfil]
            rng = _rng(est_id, pc.materia.id)

            ser   = round(rng.uniform(*r['ser']), 2)
            saber = round(rng.uniform(*r['saber']), 2)
            hacer = round(rng.uniform(*r['hacer']), 2)

            tareas_total    = rng.randint(4, 7)
            tasa_tareas     = rng.uniform(*r['tareas'])
            tareas_entregadas = round(tareas_total * tasa_tareas)

            examenes_total  = rng.randint(2, 4)
            exam_pct        = rng.uniform(*r['exam_pct'])
            promedio_examenes = round(45 * exam_pct, 2)
            examenes_rendidos = examenes_total if exam_pct > 0.3 else max(1, examenes_total - 1)

            filtro = {
                'estudiante_id': est_id,
                'materia_id':    pc.materia.id,
                'gestion':       GESTION,
                'trimestre':     TRIMESTRE,
                'mes':           MES_NOTAS,
            }
            ops.append(UpdateOne(filtro, {'$set': {
                'curso_id':                  pc.curso.id,
                'profesor_id':               pc.profesor.id,
                'ser':                       ser,
                'saber':                     saber,
                'hacer':                     hacer,
                'nota_mensual':              round(ser + saber + hacer, 2),
                'promedio_examenes':         promedio_examenes,
                'promedio_tareas':           round(hacer / max(tareas_total, 1), 2),
                'cantidad_tareas_entregadas': tareas_entregadas,
                'cantidad_tareas_total':     tareas_total,
                'cantidad_examenes_rendidos': examenes_rendidos,
                'cantidad_examenes_total':   examenes_total,
                'fecha_carga':               ahora,
            }}, upsert=True))

    if ops:
        resultado = col.bulk_write(ops, ordered=False)
        stdout.write(f'  notas_mensuales mayo: {resultado.upserted_count} insertados, {resultado.modified_count} actualizados')
    else:
        stdout.write('  notas_mensuales mayo: sin datos')


# ─── Citaciones mayo (SQL) ────────────────────────────────────────────────────
def _generar_citaciones_mayo(director: User, stdout):
    motivos_riesgo = ['FALTAS', 'BAJO_RENDIMIENTO', 'CONDUCTA']
    fecha_limite   = date(GESTION, 5, 20)
    creadas = 0

    pcs_1ro_a = list(
        ProfesorCurso.objects.filter(curso_id=1).exclude(id=PC_EXCLUIDO).select_related('materia')
    )
    mat_principal = pcs_1ro_a[0].materia if pcs_1ro_a else None

    for est_id in Estudiante.objects.filter(activo=True).values_list('id', flat=True):
        perfil = _perfil(est_id)
        if perfil not in ('critico', 'apoyo'):
            continue
        rng = random.Random(est_id + 9999)
        # critico: ~60% chance; apoyo: ~20% chance
        umbral = 0.60 if perfil == 'critico' else 0.20
        if rng.random() > umbral:
            continue

        motivo = rng.choice(motivos_riesgo)
        descripcion = (
            'Bajo rendimiento academico sostenido durante el mes de mayo.'
            if motivo == 'BAJO_RENDIMIENTO'
            else 'Faltas injustificadas acumuladas durante el mes de mayo.'
            if motivo == 'FALTAS'
            else 'Problemas de conducta reportados durante el mes de mayo.'
        )
        Citacion.objects.create(
            estudiante_id=est_id,
            emisor=director,
            motivo=motivo,
            descripcion=descripcion,
            fecha_limite_asistencia=fecha_limite,
            materia=mat_principal,
        )
        creadas += 1

    stdout.write(f'  Citaciones mayo: {creadas} generadas')


# ─── Notificaciones de carga de notas (simuladas) ─────────────────────────────
def _generar_notificaciones_upload(director: User, stdout):
    pcs = list(
        ProfesorCurso.objects
        .exclude(id=PC_EXCLUIDO)
        .select_related('profesor', 'materia', 'curso')
    )
    notifs = []
    for pc in pcs:
        nombre = pc.profesor.get_full_name() or pc.profesor.username
        notifs.append(Notificacion(
            emisor=None,
            receptor=director,
            descripcion=(
                f"{nombre} cargo notas de {pc.materia.nombre} "
                f"en {pc.curso.grado} {pc.curso.paralelo}, "
                f"mes {MES_NOTAS} de {GESTION}"
            ),
            leida=True,
        ))
    Notificacion.objects.bulk_create(notifs)
    stdout.write(f'  Notificaciones de carga: {len(notifs)} generadas (marcadas como leidas)')


# ─── Command ──────────────────────────────────────────────────────────────────
class Command(BaseCommand):
    help = 'Genera datos de demo: asistencia abril + notas mayo para prueba de K-Means'

    def handle(self, *args, **options):
        tipo_director = TipoUsuario.objects.get(nombre='Director')
        director = User.objects.filter(tipo_usuario=tipo_director, is_active=True).first()
        if not director:
            self.stderr.write('No hay usuario Director activo.')
            return

        self.stdout.write('Limpiando MongoDB...')
        _limpiar_mongo(self.stdout)

        self.stdout.write('Generando asistencia de abril...')
        with transaction.atomic():
            _generar_asistencia_abril(director, self.stdout)

        self.stdout.write('Generando notas_mensuales de mayo en MongoDB...')
        _generar_notas_mayo(self.stdout)

        self.stdout.write('Generando citaciones de mayo...')
        with transaction.atomic():
            _generar_citaciones_mayo(director, self.stdout)

        self.stdout.write('Generando notificaciones de carga simuladas...')
        with transaction.atomic():
            _generar_notificaciones_upload(director, self.stdout)

        self.stdout.write(self.style.SUCCESS(
            '\nListo. Faltan las notas de Julia Quispe (pc_id=1, ARTES PLASTICAS, 1ro A).\n'
            'Cuando ella las cargue por el frontend se disparara K-Means automaticamente.'
        ))

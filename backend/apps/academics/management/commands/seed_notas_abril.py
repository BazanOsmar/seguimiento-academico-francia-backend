"""
Genera datos de Abril 2026 (Trimestre 1, mes 4) para un grado específico.

Lee ProfesorCurso y Estudiantes desde SQL (sin hardcodear IDs).

MongoDB (seguimiento_dev):
  - detalle_notas   → 3 SER + 5 SABER + 6 HACER por estudiante-materia
  - notas_mensuales → resumen mensual con autoeval_ser

PostgreSQL (staging):
  - Citaciones para estudiantes perfil 'apoyo' y 'crítico' fechadas en Abril

Perfiles por est_id % 20:
  v 0-4  → excelente     (~25%)
  v 5-10 → satisfactorio (~30%)
  v 11-16→ apoyo         (~30%)
  v 17-19→ crítico       (~15%)

Uso:
    python manage.py seed_notas_abril --grado 1ro
    python manage.py seed_notas_abril --grado 2do --sin-citaciones
    python manage.py seed_notas_abril --grado 3ro --limpiar
"""

import random
from collections import defaultdict
from datetime import datetime, timezone as tz

from django.core.management.base import BaseCommand, CommandError
from django.db import transaction
from pymongo import UpdateOne

from backend.apps.academics.models import ProfesorCurso, Curso
from backend.apps.academics.services.notas_mongo_service import _get_db
from backend.apps.discipline.models import Citacion
from backend.apps.students.models import Estudiante
from backend.apps.users.models import TipoUsuario, User

# ─── Constantes globales ──────────────────────────────────────────────────────
GESTION   = 2026
TRIMESTRE = 1
MES       = 4        # Abril — segundo mes del trimestre 1 (meses 3-4)

NOTA_MAXIMA = {'ser': 10.0, 'saber': 45.0, 'hacer': 40.0}

# col_idx del 0: primer slot disponible en el trimestre para cada dimensión.
# Se usan rangos contiguos que no pisan datos de Marzo (seed_notas_todos_cursos).
# Marzo ocupó: ser=14, saber=21/22/23, hacer=32/33/34
# Abril usa rangos posteriores dentro del mismo trimestre.
_COL_OFFSETS = {'ser': 15, 'saber': 24, 'hacer': 35}

# ─── Actividades de Abril (estructura igual para todos los cursos del mismo grado)
# Títulos reales con fecha en formato DD/MM/YYYY para que _parsear_fecha los lea.
ACTIVIDADES = {
    'ser': [
        (0, '03/04/2026 - Autoevaluación actitudinal'),
        (1, '14/04/2026 - Convivencia y valores'),
        (2, '28/04/2026 - Comportamiento bimestral'),
    ],
    'saber': [
        (0, '07/04/2026 - Prueba oral'),
        (1, '10/04/2026 - Prueba escrita I'),
        (2, '17/04/2026 - Examen parcial'),
        (3, '23/04/2026 - Prueba escrita II'),
        (4, '30/04/2026 - Evaluación bimestral'),
    ],
    'hacer': [
        (0, '02/04/2026 - Tarea 1'),
        (1, '09/04/2026 - Práctica dirigida'),
        (2, '14/04/2026 - Trabajo en clase'),
        (3, '21/04/2026 - Tarea 2'),
        (4, '24/04/2026 - Exposición'),
        (5, '28/04/2026 - Trabajo integrador'),
    ],
}

AUTOEVAL_TITULO = '30/04/2026 - Autoevaluación final'

# ─── Perfiles de rendimiento ──────────────────────────────────────────────────
# Rangos en la escala real de cada dimensión (ser 0-10, saber 0-45, hacer 0-40).
# tasa_hacer: probabilidad de entregar cada tarea (nota > 0).
PERFILES = {
    'excelente': {
        'ser':       (8.0, 10.0),
        'saber':     (36.0, 45.0),
        'hacer':     (33.0, 40.0),
        'tasa_hacer': 1.00,
        'autoeval':  (4.0, 5.0),
    },
    'satisfactorio': {
        'ser':       (5.5, 8.0),
        'saber':     (25.0, 36.0),
        'hacer':     (22.0, 33.0),
        'tasa_hacer': 0.92,
        'autoeval':  (3.0, 4.5),
    },
    'apoyo': {
        'ser':       (3.0, 6.5),
        'saber':     (12.0, 25.0),
        'hacer':     (10.0, 22.0),
        'tasa_hacer': 0.75,
        'autoeval':  (1.5, 3.5),
    },
    'critico': {
        'ser':       (1.0, 4.0),
        'saber':     (3.0, 13.0),
        'hacer':     (2.0, 12.0),
        'tasa_hacer': 0.50,
        'autoeval':  (1.0, 2.5),
    },
}

GRADOS_VALIDOS = {'1ro', '2do', '3ro', '4to', '5to', '6to'}


# ─── Helpers ──────────────────────────────────────────────────────────────────

def _perfil(est_id: int) -> str:
    # Distribución realista: satisfactorio es el grupo dominante (~50%)
    # excelente:20%  satisfactorio:50%  apoyo:20%  critico:10%
    v = est_id % 20
    if v < 4:  return 'excelente'
    if v < 14: return 'satisfactorio'
    if v < 18: return 'apoyo'
    return 'critico'


def _rng(est_id: int, materia_id: int, dim_offset: int, col_seq: int) -> random.Random:
    """Semilla determinista por (estudiante, materia, dimensión, columna)."""
    return random.Random(est_id * 1_000_000 + materia_id * 1_000 + dim_offset * 10 + col_seq)


def _parsear_fecha(titulo: str) -> datetime | None:
    import re
    m = re.search(r'(\d{1,2})[/\-](\d{1,2})[/\-](\d{2,4})', titulo or '')
    if not m:
        return None
    dia, mes, anio = int(m.group(1)), int(m.group(2)), int(m.group(3))
    try:
        return datetime(anio, mes, dia, tzinfo=tz.utc)
    except ValueError:
        return None


def _prom_todos(notas: list, n_cols: int) -> float:
    """Promedio sobre todos los slots del mes (0 para slots sin nota)."""
    if not n_cols:
        return 0.0
    return round(sum(notas) / n_cols, 2)


def _prom_rendidos(notas: list) -> float | None:
    """Promedio solo de notas > 0 (actividades efectivamente entregadas)."""
    entregadas = [n for n in notas if n > 0]
    if not entregadas:
        return None
    return round(sum(entregadas) / len(entregadas), 2)


def _nombre_estudiante(est: Estudiante) -> str:
    partes = [est.apellido_paterno, est.apellido_materno, est.nombre]
    return ' '.join(p for p in partes if p).strip()


# ─── Generación de notas por estudiante ───────────────────────────────────────

def _generar_docs_estudiante(est: Estudiante, pc: ProfesorCurso, ahora: datetime):
    """
    Devuelve (ops_detalle, doc_mensual) para un par (estudiante, ProfesorCurso).
    ops_detalle → lista de UpdateOne para detalle_notas
    doc_mensual → dict listo para notas_mensuales
    """
    perfil_key = _perfil(est.id)
    perfil     = PERFILES[perfil_key]
    nombre     = _nombre_estudiante(est)

    DIM_OFFSET = {'ser': 0, 'saber': 1, 'hacer': 2}

    ops_detalle  = []
    notas_ser    = []
    notas_saber  = []
    notas_hacer  = []

    # ── SER ──────────────────────────────────────────────────────────────────
    for seq, (col_local, titulo) in enumerate(ACTIVIDADES['ser']):
        col_real = _COL_OFFSETS['ser'] + col_local
        rng      = _rng(est.id, pc.materia.id, DIM_OFFSET['ser'], seq)
        nota     = round(rng.uniform(*perfil['ser']), 1)
        notas_ser.append(nota)
        ops_detalle.append(UpdateOne(
            {
                'estudiante_id': est.id,
                'materia_id':    pc.materia.id,
                'trimestre':     TRIMESTRE,
                'dimension':     'ser',
                'columna_idx':   col_real,
            },
            {'$set': {
                'nombre_estudiante': nombre,
                'curso_id':          pc.curso.id,
                'profesor_id':       pc.profesor.id,
                'gestion':           GESTION,
                'trimestre':         TRIMESTRE,
                'mes':               MES,
                'dimension':         'ser',
                'columna_idx':       col_real,
                'titulo':            titulo,
                'fecha_actividad':   _parsear_fecha(titulo),
                'nota':              nota,
                'nota_maxima':       NOTA_MAXIMA['ser'],
                'fecha_carga':       ahora,
            }},
            upsert=True,
        ))

    # ── SABER ─────────────────────────────────────────────────────────────────
    for seq, (col_local, titulo) in enumerate(ACTIVIDADES['saber']):
        col_real = _COL_OFFSETS['saber'] + col_local
        rng      = _rng(est.id, pc.materia.id, DIM_OFFSET['saber'], seq)
        nota     = round(rng.uniform(*perfil['saber']), 1)
        notas_saber.append(nota)
        ops_detalle.append(UpdateOne(
            {
                'estudiante_id': est.id,
                'materia_id':    pc.materia.id,
                'trimestre':     TRIMESTRE,
                'dimension':     'saber',
                'columna_idx':   col_real,
            },
            {'$set': {
                'nombre_estudiante': nombre,
                'curso_id':          pc.curso.id,
                'profesor_id':       pc.profesor.id,
                'gestion':           GESTION,
                'trimestre':         TRIMESTRE,
                'mes':               MES,
                'dimension':         'saber',
                'columna_idx':       col_real,
                'titulo':            titulo,
                'fecha_actividad':   _parsear_fecha(titulo),
                'nota':              nota,
                'nota_maxima':       NOTA_MAXIMA['saber'],
                'fecha_carga':       ahora,
            }},
            upsert=True,
        ))

    # ── HACER ─────────────────────────────────────────────────────────────────
    for seq, (col_local, titulo) in enumerate(ACTIVIDADES['hacer']):
        col_real = _COL_OFFSETS['hacer'] + col_local
        rng      = _rng(est.id, pc.materia.id, DIM_OFFSET['hacer'], seq)
        # Determinar si entregó la tarea
        if rng.random() > perfil['tasa_hacer']:
            nota = 0.0
        else:
            nota = round(rng.uniform(*perfil['hacer']), 1)
        notas_hacer.append(nota)
        ops_detalle.append(UpdateOne(
            {
                'estudiante_id': est.id,
                'materia_id':    pc.materia.id,
                'trimestre':     TRIMESTRE,
                'dimension':     'hacer',
                'columna_idx':   col_real,
            },
            {'$set': {
                'nombre_estudiante': nombre,
                'curso_id':          pc.curso.id,
                'profesor_id':       pc.profesor.id,
                'gestion':           GESTION,
                'trimestre':         TRIMESTRE,
                'mes':               MES,
                'dimension':         'hacer',
                'columna_idx':       col_real,
                'titulo':            titulo,
                'fecha_actividad':   _parsear_fecha(titulo),
                'nota':              nota,
                'nota_maxima':       NOTA_MAXIMA['hacer'],
                'fecha_carga':       ahora,
            }},
            upsert=True,
        ))

    # ── Autoevaluación (solo va a notas_mensuales, no a detalle_notas) ────────
    rng_auto  = _rng(est.id, pc.materia.id, 9, 0)
    autoeval  = round(rng_auto.uniform(*perfil['autoeval']), 1)

    # ── Calcular campos de notas_mensuales ────────────────────────────────────
    n_ser   = len(ACTIVIDADES['ser'])
    n_saber = len(ACTIVIDADES['saber'])
    n_hacer = len(ACTIVIDADES['hacer'])

    ser_val   = _prom_todos(notas_ser,   n_ser)
    saber_val = _prom_todos(notas_saber, n_saber)
    hacer_val = _prom_todos(notas_hacer, n_hacer)

    doc_mensual = {
        'estudiante_id':              est.id,
        'materia_id':                 pc.materia.id,
        'curso_id':                   pc.curso.id,
        'profesor_id':                pc.profesor.id,
        'gestion':                    GESTION,
        'trimestre':                  TRIMESTRE,
        'mes':                        MES,
        'ser':                        ser_val,
        'saber':                      saber_val,
        'hacer':                      hacer_val,
        'nota_mensual':               round(ser_val + saber_val + hacer_val, 2),
        'promedio_examenes':          _prom_rendidos(notas_saber),
        'promedio_tareas':            _prom_rendidos(notas_hacer),
        'cantidad_examenes_rendidos': sum(1 for n in notas_saber if n > 0),
        'cantidad_examenes_total':    n_saber,
        'cantidad_tareas_entregadas': sum(1 for n in notas_hacer if n > 0),
        'cantidad_tareas_total':      n_hacer,
        'autoeval_ser':               autoeval,
        'fecha_carga':                ahora,
    }

    return ops_detalle, doc_mensual


# ─── Citaciones para estudiantes en riesgo ────────────────────────────────────

MOTIVOS_CRITICO = ['BAJO_RENDIMIENTO', 'FALTAS', 'CONDUCTA']
MOTIVOS_APOYO   = ['BAJO_RENDIMIENTO', 'RENDIMIENTO']

DESCRIPCIONES = {
    'BAJO_RENDIMIENTO': (
        'El/La estudiante presenta bajo rendimiento académico sostenido '
        'durante el mes de abril de 2026. Se solicita presencia del tutor/a.'
    ),
    'FALTAS': (
        'El/La estudiante acumula inasistencias injustificadas durante el '
        'mes de abril de 2026. Se solicita regularización inmediata.'
    ),
    'CONDUCTA': (
        'Se han reportado problemas de conducta durante el mes de abril '
        'de 2026. Se solicita presencia del tutor/a para tratar el caso.'
    ),
    'RENDIMIENTO': (
        'El/La estudiante muestra rendimiento por debajo del nivel esperado '
        'en el mes de abril de 2026. Se recomienda refuerzo en casa.'
    ),
}


def _generar_citaciones(estudiantes: list, director: User) -> int:
    """Crea citaciones para estudiantes de riesgo con fecha_envio en Abril."""
    creadas = 0
    fecha_limite = datetime(GESTION, MES, 30, tzinfo=tz.utc).date()
    ids_creadas  = []

    with transaction.atomic():
        for est in estudiantes:
            perfil_key = _perfil(est.id)
            if perfil_key not in ('critico', 'apoyo'):
                continue

            rng    = random.Random(est.id * 31337 + MES)
            umbral = 0.65 if perfil_key == 'critico' else 0.28
            if rng.random() > umbral:
                continue

            # Evitar duplicados en Abril
            ya_existe = Citacion.objects.filter(
                estudiante=est,
                fecha_envio__year=GESTION,
                fecha_envio__month=MES,
            ).exists()
            if ya_existe:
                continue

            motivos = MOTIVOS_CRITICO if perfil_key == 'critico' else MOTIVOS_APOYO
            motivo  = rng.choice(motivos)

            cit = Citacion.objects.create(
                estudiante=est,
                emisor=director,
                motivo=motivo,
                descripcion=DESCRIPCIONES[motivo],
                fecha_limite_asistencia=fecha_limite,
            )
            ids_creadas.append((cit.pk, rng.randint(2, 28)))
            creadas += 1

    # Sobreescribir fecha_envio a Abril (auto_now_add no permite hacerlo en create)
    for pk, dia in ids_creadas:
        hora = random.Random(pk).randint(8, 16)
        Citacion.objects.filter(pk=pk).update(
            fecha_envio=datetime(GESTION, MES, dia, hora, 0, 0, tzinfo=tz.utc)
        )

    return creadas


# ─── Comando ──────────────────────────────────────────────────────────────────

class Command(BaseCommand):
    help = 'Genera notas realistas de Abril 2026 (T1, mes 4) para un grado en MongoDB'

    def add_arguments(self, parser):
        parser.add_argument(
            '--grado', type=str, required=True,
            choices=sorted(GRADOS_VALIDOS),
            help='Grado a procesar: 1ro, 2do, 3ro, 4to, 5to, 6to',
        )
        parser.add_argument(
            '--sin-citaciones', action='store_true',
            help='Omite la generación de citaciones SQL para estudiantes en riesgo',
        )
        parser.add_argument(
            '--limpiar', action='store_true',
            help='Elimina datos de Abril 2026 del grado antes de insertar',
        )

    def handle(self, *args, **options):
        grado              = options['grado']
        generar_citaciones = not options['sin_citaciones']

        cursos = list(Curso.objects.filter(grado=grado).order_by('paralelo'))
        if not cursos:
            raise CommandError(f'No hay cursos registrados para el grado "{grado}".')

        self.stdout.write(f'\n{"=" * 55}')
        self.stdout.write(f'  Seed Abril 2026 — {grado} ({len(cursos)} paralelos)')
        self.stdout.write(f'{"=" * 55}')

        # Obtener director para citaciones
        director = None
        if generar_citaciones:
            tipo_dir = TipoUsuario.objects.filter(nombre='Director').first()
            if tipo_dir:
                director = User.objects.filter(
                    tipo_usuario=tipo_dir, is_active=True
                ).first()
            if not director:
                self.stdout.write(
                    self.style.WARNING('  [!] Sin usuario Director activo — se omiten citaciones.')
                )
                generar_citaciones = False

        db = _get_db()

        totales = {'detalle': 0, 'mensuales': 0, 'citaciones': 0}

        for curso in cursos:
            self.stdout.write(f'\n  ── {grado} {curso.paralelo} (curso_id={curso.id}) ──')

            # Limpiar si se solicitó
            if options['limpiar']:
                curso_ids_cursos = [curso.id]
                elim_d = db['detalle_notas'].delete_many(
                    {'curso_id': curso.id, 'gestion': GESTION, 'mes': MES}
                ).deleted_count
                elim_m = db['notas_mensuales'].delete_many(
                    {'curso_id': curso.id, 'gestion': GESTION, 'mes': MES}
                ).deleted_count
                if elim_d or elim_m:
                    self.stdout.write(
                        f'     Limpieza: {elim_d} detalle_notas, {elim_m} notas_mensuales eliminados'
                    )

            pcs = list(
                ProfesorCurso.objects.filter(curso=curso).select_related('profesor', 'materia')
            )
            estudiantes = list(
                Estudiante.objects.filter(curso=curso, activo=True)
                .order_by('apellido_paterno', 'apellido_materno', 'nombre')
            )

            if not pcs or not estudiantes:
                self.stdout.write('     Sin asignaciones o estudiantes. Saltando...')
                continue

            self.stdout.write(f'     {len(estudiantes)} estudiantes × {len(pcs)} materias')

            # Contar perfiles para info
            conteo = defaultdict(int)
            for est in estudiantes:
                conteo[_perfil(est.id)] += 1
            self.stdout.write(
                f'     Perfiles → excelente:{conteo["excelente"]} '
                f'satisfactorio:{conteo["satisfactorio"]} '
                f'apoyo:{conteo["apoyo"]} '
                f'crítico:{conteo["critico"]}'
            )

            ahora          = datetime.now(tz=tz.utc)
            ops_detalle    = []
            ops_mensuales  = []

            for pc in pcs:
                for est in estudiantes:
                    ops_d, doc_m = _generar_docs_estudiante(est, pc, ahora)
                    ops_detalle.extend(ops_d)
                    ops_mensuales.append(UpdateOne(
                        {
                            'estudiante_id': doc_m['estudiante_id'],
                            'materia_id':    doc_m['materia_id'],
                            'gestion':       doc_m['gestion'],
                            'trimestre':     doc_m['trimestre'],
                            'mes':           doc_m['mes'],
                        },
                        {'$set': doc_m},
                        upsert=True,
                    ))

            # Escribir en MongoDB en lotes de 3000 para no exceder el socket timeout
            LOTE = 3000
            ins_d = mod_d = 0
            for i in range(0, len(ops_detalle), LOTE):
                r = db['detalle_notas'].bulk_write(ops_detalle[i:i + LOTE], ordered=False)
                ins_d += r.upserted_count
                mod_d += r.modified_count

            ins_m = mod_m = 0
            for i in range(0, len(ops_mensuales), LOTE):
                r = db['notas_mensuales'].bulk_write(ops_mensuales[i:i + LOTE], ordered=False)
                ins_m += r.upserted_count
                mod_m += r.modified_count

            self.stdout.write(
                f'     detalle_notas   → {ins_d} insertados, {mod_d} actualizados'
            )
            self.stdout.write(
                f'     notas_mensuales → {ins_m} insertados, {mod_m} actualizados'
            )

            totales['detalle']   += ins_d + mod_d
            totales['mensuales'] += ins_m + mod_m

            # Citaciones SQL
            if generar_citaciones and director:
                n_cit = _generar_citaciones(estudiantes, director)
                self.stdout.write(f'     citaciones      → {n_cit} generadas (fechadas en Abril)')
                totales['citaciones'] += n_cit

        self.stdout.write(f'\n{"=" * 55}')
        self.stdout.write(self.style.SUCCESS(
            f'  ✓ {grado} completado:\n'
            f'    detalle_notas:   {totales["detalle"]:,} docs\n'
            f'    notas_mensuales: {totales["mensuales"]:,} docs\n'
            f'    citaciones SQL:  {totales["citaciones"]:,} generadas\n'
        ))
        self.stdout.write(
            '  Siguiente paso: ejecutar el mismo comando para el próximo grado,\n'
            '  o correr K-Means manualmente cuando todos los grados estén listos.\n'
        )
        self.stdout.write(f'{"=" * 55}\n')

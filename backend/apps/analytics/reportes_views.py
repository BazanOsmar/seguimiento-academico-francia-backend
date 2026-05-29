"""
Endpoints de reportes institucionales — solo Director.

Agrega datos de MongoDB y SQL para producir indicadores globales del colegio.
Todos los endpoints requieren IsAuthenticated + IsDirector.
"""

from collections import defaultdict

from django.utils import timezone
from django.db.models import Count, Q
from rest_framework.views import APIView
from rest_framework.response import Response
from rest_framework.permissions import IsAuthenticated

from backend.core.permissions import IsDirector
from backend.apps.academics.services.notas_mongo_service import _get_db


def _parse_mes_gestion(request):
    try:
        mes     = int(request.query_params.get('mes',     timezone.now().month))
        gestion = int(request.query_params.get('gestion', timezone.now().year))
    except (ValueError, TypeError):
        return None, None
    return (mes, gestion) if 1 <= mes <= 12 else (None, None)


def _meses_trimestre(trimestre):
    if trimestre == 1:
        return [1, 2, 3, 4]
    if trimestre == 2:
        return [5, 6, 7, 8]
    if trimestre == 3:
        return [9, 10, 11, 12]
    return []


def _parse_periodo(request):
    try:
        gestion = int(request.query_params.get('gestion', timezone.now().year))
    except (ValueError, TypeError):
        return None, None, None

    trimestre_param = request.query_params.get('trimestre')
    if trimestre_param not in (None, ''):
        try:
            trimestre = int(trimestre_param)
        except (ValueError, TypeError):
            return None, None, None
        meses = _meses_trimestre(trimestre)
        return (trimestre, gestion, meses) if meses else (None, None, None)

    mes, gestion = _parse_mes_gestion(request)
    if mes is None:
        return None, None, None
    trimestre = 1 if mes <= 4 else 2 if mes <= 8 else 3
    return trimestre, gestion, [mes]


def _periodo_payload(trimestre, gestion, meses):
    return {
        'trimestre': trimestre,
        'gestion': gestion,
        'meses': meses,
    }


# ─────────────────────────────────────────────────────────────────────────────
# 1. Rendimiento académico general
# ─────────────────────────────────────────────────────────────────────────────

class ReporteRendimientoView(APIView):
    """
    GET /api/analytics/reportes/rendimiento/?mes=X&gestion=Y

    Promedio colegio, top/bottom estudiantes, ranking de materias, cursos y profesores.
    """
    permission_classes = [IsAuthenticated, IsDirector]

    def get(self, request):
        trimestre, gestion, meses = _parse_periodo(request)
        if trimestre is None:
            return Response({'errores': 'Parámetros inválidos.'}, status=400)

        db = _get_db()
        match_periodo = {'gestion': gestion, 'trimestre': trimestre}

        # ── Promedio global + total estudiantes con notas ─────────────────────
        res_global = list(db['notas_mensuales'].aggregate([
            {'$match': match_periodo},
            {'$group': {'_id': '$estudiante_id', 'nota': {'$avg': '$nota_mensual'}}},
            {'$group': {'_id': None, 'promedio': {'$avg': '$nota'}, 'total': {'$sum': 1}}},
        ]))
        promedio_colegio  = round(res_global[0]['promedio'], 1) if res_global else 0
        total_estudiantes = res_global[0]['total']              if res_global else 0

        if total_estudiantes == 0:
            return Response({
                **_periodo_payload(trimestre, gestion, meses),
                'promedio_colegio': 0, 'total_estudiantes': 0,
                'top5': [], 'bottom5': [],
                'materias_ranking': [], 'cursos_ranking': [], 'profesores_ranking': [],
            })

        # ── Ranking por estudiante ────────────────────────────────────────────
        est_docs = sorted(
            db['notas_mensuales'].aggregate([
                {'$match': match_periodo},
                {'$group': {'_id': '$estudiante_id', 'nota': {'$avg': '$nota_mensual'}}},
            ]),
            key=lambda x: x['nota'], reverse=True,
        )
        from backend.apps.students.models import Estudiante
        est_sql = {
            e.id: e for e in
            Estudiante.objects.filter(id__in=[r['_id'] for r in est_docs]).select_related('curso')
        }

        def _est_row(r):
            e = est_sql.get(r['_id'])
            if not e:
                return None
            return {
                'nombre': f"{e.apellido_paterno} {e.apellido_materno}, {e.nombre}",
                'curso':  f"{e.curso.grado} \"{e.curso.paralelo}\"",
                'nota':   round(r['nota'], 1),
            }

        all_rows = [x for x in map(_est_row, est_docs) if x]
        top5    = all_rows[:5]
        bottom5 = list(reversed(all_rows[-5:])) if len(all_rows) >= 5 else list(reversed(all_rows))

        # ── Ranking por materia (peores primero) ──────────────────────────────
        mat_docs = list(db['notas_mensuales'].aggregate([
            {'$match': match_periodo},
            {'$group': {'_id': '$materia_id', 'promedio': {'$avg': '$nota_mensual'}, 'total': {'$sum': 1}}},
            {'$sort': {'promedio': 1}},
        ]))
        from backend.apps.academics.models import Materia
        mat_sql = {m.id: m.nombre for m in Materia.objects.filter(id__in=[r['_id'] for r in mat_docs])}
        materias_ranking = [
            {'nombre': mat_sql.get(r['_id'], '?'), 'promedio': round(r['promedio'], 1), 'total': r['total']}
            for r in mat_docs
        ]

        # ── Ranking por curso (peores primero) ────────────────────────────────
        cur_docs = list(db['notas_mensuales'].aggregate([
            {'$match': match_periodo},
            {'$group': {'_id': {'c': '$curso_id', 'e': '$estudiante_id'}, 'nota': {'$avg': '$nota_mensual'}}},
            {'$group': {'_id': '$_id.c', 'promedio': {'$avg': '$nota'}, 'total': {'$sum': 1}}},
            {'$sort': {'promedio': 1}},
        ]))
        from backend.apps.academics.models import Curso as CursoModel
        cur_sql = {
            c.id: f"{c.grado} \"{c.paralelo}\""
            for c in CursoModel.objects.filter(id__in=[r['_id'] for r in cur_docs])
        }
        cursos_ranking = [
            {'nombre': cur_sql.get(r['_id'], '?'), 'promedio': round(r['promedio'], 1), 'total': r['total']}
            for r in cur_docs
        ]

        # ── Ranking profesores (mejores primero) ──────────────────────────────
        prof_docs = list(db['notas_mensuales'].aggregate([
            {'$match': match_periodo},
            {'$group': {'_id': '$profesor_id', 'promedio': {'$avg': '$nota_mensual'}, 'total': {'$sum': 1}}},
            {'$sort': {'promedio': -1}},
        ]))
        from django.contrib.auth import get_user_model
        User = get_user_model()
        prof_sql = {u.id: u for u in User.objects.filter(id__in=[r['_id'] for r in prof_docs])}
        profesores_ranking = [
            {
                'nombre':   f"{u.first_name} {u.last_name}".strip() or u.username,
                'promedio': round(r['promedio'], 1),
                'total':    r['total'],
            }
            for r in prof_docs
            if (u := prof_sql.get(r['_id']))
        ]

        return Response({
            **_periodo_payload(trimestre, gestion, meses),
            'promedio_colegio':   promedio_colegio,
            'total_estudiantes':  total_estudiantes,
            'top5':               top5,
            'bottom5':            bottom5,
            'materias_ranking':   materias_ranking,
            'cursos_ranking':     cursos_ranking,
            'profesores_ranking': profesores_ranking,
        })


# ─────────────────────────────────────────────────────────────────────────────
# 2. Asistencia global
# ─────────────────────────────────────────────────────────────────────────────

class ReporteAsistenciaView(APIView):
    """
    GET /api/analytics/reportes/asistencia/?mes=X&gestion=Y

    Porcentajes globales, ranking de cursos por faltas y distribución por día.
    """
    permission_classes = [IsAuthenticated, IsDirector]

    def get(self, request):
        trimestre, gestion, meses = _parse_periodo(request)
        if trimestre is None:
            return Response({'errores': 'Parámetros inválidos.'}, status=400)

        from backend.apps.attendance.models import Asistencia, AsistenciaSesion
        from backend.apps.academics.models import Curso as CursoModel

        # ── Sesiones del mes ──────────────────────────────────────────────────
        sesiones = list(
            AsistenciaSesion.objects
            .filter(fecha__year=gestion, fecha__month__in=meses)
            .values('curso_id', 'fecha')
        )
        total_sesiones     = len(sesiones)
        sesiones_por_curso = defaultdict(int)
        dia_counts         = defaultdict(int)
        for s in sesiones:
            sesiones_por_curso[s['curso_id']] += 1
            dia_counts[s['fecha'].weekday()] += 1

        total_cursos      = CursoModel.objects.count()
        cursos_con_sesion = len(sesiones_por_curso)

        # ── Asistencias del mes ───────────────────────────────────────────────
        asistencias = list(
            Asistencia.objects
            .filter(sesion__fecha__year=gestion, sesion__fecha__month__in=meses)
            .values('sesion__curso_id', 'estado')
            .annotate(total=Count('id'))
        )

        totales_global  = defaultdict(int)
        curso_estados   = defaultdict(lambda: defaultdict(int))
        for a in asistencias:
            totales_global[a['estado']] += a['total']
            curso_estados[a['sesion__curso_id']][a['estado']] += a['total']

        total_reg = sum(totales_global.values())
        pct = lambda n: round(n / total_reg * 100, 1) if total_reg else 0

        # ── Ranking de cursos ─────────────────────────────────────────────────
        cursos_sql = {c.id: f"{c.grado} \"{c.paralelo}\"" for c in CursoModel.objects.all()}
        cursos_ranking = []
        for cid, estados in curso_estados.items():
            total_c  = sum(estados.values())
            faltas   = estados.get('FALTA', 0)
            atrasos  = estados.get('ATRASO', 0)
            cursos_ranking.append({
                'nombre':      cursos_sql.get(cid, '?'),
                'pct_faltas':  round(faltas  / total_c * 100, 1) if total_c else 0,
                'pct_atrasos': round(atrasos / total_c * 100, 1) if total_c else 0,
                'sesiones':    sesiones_por_curso.get(cid, 0),
            })
        cursos_ranking.sort(key=lambda x: x['pct_faltas'], reverse=True)

        dias_nombres = ['Lunes', 'Martes', 'Miércoles', 'Jueves', 'Viernes', 'Sábado', 'Domingo']
        dias = [{'dia': dias_nombres[d], 'sesiones': c} for d, c in sorted(dia_counts.items())]

        return Response({
            **_periodo_payload(trimestre, gestion, meses),
            'total_sesiones':    total_sesiones,
            'total_cursos':      total_cursos,
            'cursos_con_sesion': cursos_con_sesion,
            'globales': {
                'pct_presentes': pct(totales_global.get('PRESENTE', 0)),
                'pct_faltas':    pct(totales_global.get('FALTA', 0)),
                'pct_atrasos':   pct(totales_global.get('ATRASO', 0)),
                'pct_licencias': pct(totales_global.get('LICENCIA', 0)),
            },
            'cursos_ranking': cursos_ranking,
            'dias_sesiones':  dias,
        })


# ─────────────────────────────────────────────────────────────────────────────
# 3. Citaciones global
# ─────────────────────────────────────────────────────────────────────────────

class ReporteCitacionesView(APIView):
    """
    GET /api/analytics/reportes/citaciones/?mes=X&gestion=Y

    Totales, distribución por estado de asistencia, vencidas, auto vs manual,
    y ranking de cursos con más citaciones.
    """
    permission_classes = [IsAuthenticated, IsDirector]

    def get(self, request):
        trimestre, gestion, meses = _parse_periodo(request)
        if trimestre is None:
            return Response({'errores': 'Parámetros inválidos.'}, status=400)

        from backend.apps.discipline.models import Citacion
        from backend.apps.academics.models import Curso as CursoModel

        hoy = timezone.localdate()
        _MOTIVOS_AUTO = {'FALTAS', 'ATRASOS'}

        all_cit = list(
            Citacion.objects
            .filter(fecha_envio__year=gestion, fecha_envio__month__in=meses)
            .values('estudiante__curso_id', 'asistencia', 'fecha_limite_asistencia', 'motivo')
        )

        total = len(all_cit)
        asistencia_counts = defaultdict(int)
        cursos_counts     = defaultdict(int)
        motivo_auto = 0
        vencidas    = 0

        for c in all_cit:
            asistencia_counts[c['asistencia']] += 1
            cursos_counts[c['estudiante__curso_id']] += 1
            if c['motivo'] in _MOTIVOS_AUTO:
                motivo_auto += 1
            if (
                c['asistencia'] == 'PENDIENTE'
                and c['fecha_limite_asistencia']
                and c['fecha_limite_asistencia'] < hoy
            ):
                vencidas += 1

        cursos_sql = {c.id: f"{c.grado} \"{c.paralelo}\"" for c in CursoModel.objects.all()}
        cursos_ranking = sorted(
            [{'nombre': cursos_sql.get(cid, '?'), 'total': tot} for cid, tot in cursos_counts.items()],
            key=lambda x: x['total'], reverse=True,
        )[:8]

        pct_asistio = round(asistencia_counts['ASISTIO'] / total * 100, 1) if total else 0

        return Response({
            **_periodo_payload(trimestre, gestion, meses),
            'total':         total,
            'vencidas':      vencidas,
            'pct_asistio':   pct_asistio,
            'auto':          motivo_auto,
            'manual':        total - motivo_auto,
            'por_asistencia': {
                'ASISTIO':    asistencia_counts['ASISTIO'],
                'NO_ASISTIO': asistencia_counts['NO_ASISTIO'],
                'ATRASO':     asistencia_counts['ATRASO'],
                'PENDIENTE':  asistencia_counts['PENDIENTE'],
                'ANULADA':    asistencia_counts['ANULADA'],
            },
            'cursos_ranking': cursos_ranking,
        })


# ─────────────────────────────────────────────────────────────────────────────
# 4. Comunicados global
# ─────────────────────────────────────────────────────────────────────────────

class ReporteComunicadosView(APIView):
    """
    GET /api/analytics/reportes/comunicados/?mes=X&gestion=Y

    Total de comunicados, tasa de lectura, próximos a vencer, tutores desconectados.
    """
    permission_classes = [IsAuthenticated, IsDirector]

    def get(self, request):
        trimestre, gestion, meses = _parse_periodo(request)
        if trimestre is None:
            return Response({'errores': 'Parámetros inválidos.'}, status=400)

        from backend.apps.comunicados.models import Comunicado, ComunicadoEstudiante
        import zoneinfo

        la_paz = zoneinfo.ZoneInfo('America/La_Paz')
        hoy    = timezone.now().astimezone(la_paz).date()

        comunicados = list(
            Comunicado.objects
            .filter(fecha_creacion__year=gestion, fecha_creacion__month__in=meses, estado='ACTIVO')
            .values('id', 'fecha_expiracion')
        )
        total_comunicados = len(comunicados)
        com_ids = [c['id'] for c in comunicados]

        proximos_vencer = sum(
            1 for c in comunicados
            if c['fecha_expiracion']
            and 0 <= (
                (c['fecha_expiracion'] if isinstance(c['fecha_expiracion'], type(hoy))
                 else c['fecha_expiracion'].astimezone(la_paz).date()) - hoy
            ).days <= 3
        )

        if not com_ids:
            return Response({
                **_periodo_payload(trimestre, gestion, meses),
                'total_comunicados': 0, 'total_entregas': 0,
                'leidas': 0, 'no_leidas': 0, 'pct_lectura': 0,
                'proximos_vencer': 0, 'tutores_nunca_leen': 0,
            })

        entregas = list(
            ComunicadoEstudiante.objects
            .filter(comunicado_id__in=com_ids)
            .values('estado', 'estudiante__tutor_id')
            .annotate(total=Count('id'))
        )

        total_entregas = sum(e['total'] for e in entregas)
        leidas         = sum(e['total'] for e in entregas if e['estado'] == 'LEIDO')
        no_leidas      = total_entregas - leidas

        tutor_stats = defaultdict(lambda: {'total': 0, 'leidas': 0})
        for e in entregas:
            tid = e['estudiante__tutor_id']
            if tid:
                tutor_stats[tid]['total']  += e['total']
                if e['estado'] == 'LEIDO':
                    tutor_stats[tid]['leidas'] += e['total']

        tutores_nunca_leen = sum(1 for t in tutor_stats.values() if t['leidas'] == 0 and t['total'] > 0)

        return Response({
            **_periodo_payload(trimestre, gestion, meses),
            'total_comunicados':   total_comunicados,
            'total_entregas':      total_entregas,
            'leidas':              leidas,
            'no_leidas':           no_leidas,
            'pct_lectura':         round(leidas / total_entregas * 100, 1) if total_entregas else 0,
            'proximos_vencer':     proximos_vencer,
            'tutores_nunca_leen':  tutores_nunca_leen,
        })


# ─────────────────────────────────────────────────────────────────────────────
# 5. Actividad de profesores
# ─────────────────────────────────────────────────────────────────────────────

class ReporteActividadProfesoresView(APIView):
    """
    GET /api/analytics/reportes/profesores/?mes=X&gestion=Y

    Estado de notas, planes y citaciones por cada profesor ese mes.
    """
    permission_classes = [IsAuthenticated, IsDirector]

    def get(self, request):
        trimestre, gestion, meses = _parse_periodo(request)
        if trimestre is None:
            return Response({'errores': 'Parámetros inválidos.'}, status=400)

        from backend.apps.academics.models import ProfesorCurso, ProfesorPlan
        from backend.apps.discipline.models import Citacion

        asignaciones = list(
            ProfesorCurso.objects
            .select_related('profesor')
            .filter(profesor__tipo_usuario__nombre='Profesor', profesor__is_active=True)
        )
        prof_ids = list({pc.profesor_id for pc in asignaciones})

        # Notas en MongoDB
        db = _get_db()
        prof_con_notas = set(
            db['notas_mensuales'].distinct('profesor_id', {'gestion': gestion, 'trimestre': trimestre})
        )

        # Planes completos (4+)
        pc_con_4_planes = set(
            ProfesorPlan.objects
            .filter(mes__in=meses, eliminado=False)
            .values('profesor_curso_id')
            .annotate(total=Count('id'))
            .filter(total__gte=4)
            .values_list('profesor_curso_id', flat=True)
        )
        profs_con_planes = {pc.profesor_id for pc in asignaciones if pc.id in pc_con_4_planes}

        # Citaciones emitidas ese mes
        cit_por_prof = dict(
            Citacion.objects
            .filter(fecha_envio__year=gestion, fecha_envio__month__in=meses)
            .exclude(asistencia='ANULADA')
            .values('emisor_id')
            .annotate(total=Count('id'))
            .values_list('emisor_id', 'total')
        )

        asig_por_prof = defaultdict(int)
        for pc in asignaciones:
            asig_por_prof[pc.profesor_id] += 1

        from django.contrib.auth import get_user_model
        User = get_user_model()
        profs_sql = {u.id: u for u in User.objects.filter(id__in=prof_ids)}

        profesores = sorted([
            {
                'nombre':           f"{u.first_name} {u.last_name}".strip() or u.username,
                'asignaciones':     asig_por_prof[pid],
                'notas_cargadas':   pid in prof_con_notas,
                'planes_completos': pid in profs_con_planes,
                'citaciones':       cit_por_prof.get(pid, 0),
            }
            for pid in prof_ids
            if (u := profs_sql.get(pid))
        ], key=lambda x: x['nombre'])

        total = len(profesores)
        return Response({
            **_periodo_payload(trimestre, gestion, meses),
            'total_profesores': total,
            'con_notas':        sum(1 for p in profesores if p['notas_cargadas']),
            'sin_notas':        sum(1 for p in profesores if not p['notas_cargadas']),
            'con_planes':       sum(1 for p in profesores if p['planes_completos']),
            'profesores':       profesores,
        })


# ─────────────────────────────────────────────────────────────────────────────
# 6. Cobertura de tutores
# ─────────────────────────────────────────────────────────────────────────────

class ReporteTutoresView(APIView):
    """
    GET /api/analytics/reportes/tutores/

    Sin filtro de mes. Cobertura de tutores registrados, con FCM y activos.
    """
    permission_classes = [IsAuthenticated, IsDirector]

    def get(self, request):
        from backend.apps.students.models import Estudiante
        from backend.apps.notifications.models import FCMDevice
        from django.contrib.auth import get_user_model
        User = get_user_model()

        estudiantes   = list(Estudiante.objects.filter(activo=True).values('tutor_id'))
        total_est     = len(estudiantes)
        con_tutor     = sum(1 for e in estudiantes if e['tutor_id'])
        sin_tutor     = total_est - con_tutor

        tutor_ids     = list({e['tutor_id'] for e in estudiantes if e['tutor_id']})
        total_tutores = len(tutor_ids)

        con_fcm     = FCMDevice.objects.filter(user_id__in=tutor_ids).values('user_id').distinct().count()
        nunca_login = User.objects.filter(id__in=tutor_ids, last_login__isnull=True).count()

        return Response({
            'total_estudiantes': total_est,
            'con_tutor':         con_tutor,
            'sin_tutor':         sin_tutor,
            'pct_con_tutor':     round(con_tutor / total_est * 100, 1) if total_est else 0,
            'total_tutores':     total_tutores,
            'con_fcm':           con_fcm,
            'sin_fcm':           total_tutores - con_fcm,
            'nunca_login':       nunca_login,
        })

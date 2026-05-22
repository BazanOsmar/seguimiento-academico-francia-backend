from django.db.models import Count, Q
from django.utils import timezone
from rest_framework.views import APIView
from rest_framework.response import Response
from rest_framework.permissions import IsAuthenticated

from backend.core.permissions import IsProfesor
from backend.apps.academics.models import ProfesorCurso
from backend.apps.discipline.models import Citacion
from backend.apps.students.models import Estudiante
from backend.apps.academics.services.estadisticas_service import estadisticas_notas_profesor


class ProfesorEstadisticasView(APIView):
    """
    GET /api/academics/profesor/estadisticas/
    Query params:
        gestion: int (default: año actual en Bolivia)
    """
    permission_classes = [IsAuthenticated, IsProfesor]

    def get(self, request):
        gestion = _parse_int(request.query_params.get('gestion'), timezone.localtime(timezone.now()).year)

        # ── Asignaciones del profesor ─────────────────────────────
        pcs = (
            ProfesorCurso.objects
            .filter(profesor=request.user)
            .select_related('curso', 'materia')
        )
        curso_map = {}
        for pc in pcs:
            cid = pc.curso.id
            if cid not in curso_map:
                curso_map[cid] = {
                    'id':      cid,
                    'nombre':  str(pc.curso),
                    'materia': pc.materia.nombre,
                }

        curso_ids = list(curso_map.keys())

        # ── Estadísticas de notas (MongoDB) ───────────────────────
        stats = estadisticas_notas_profesor(request.user.id, gestion, curso_ids or None)

        # ── Cursos output (ordenado por promedio desc) ─────────────
        cursos_out = []
        for cid, info in curso_map.items():
            c = stats['cursos'].get(cid, {})
            cursos_out.append({
                'curso_id': cid,
                'nombre':   info['nombre'],
                'materia':  info['materia'],
                'promedio': c.get('promedio'),
                't1':       c.get('t1'),
                't2':       c.get('t2'),
                't3':       c.get('t3'),
            })
        cursos_out.sort(key=lambda x: (x['promedio'] or 0), reverse=True)

        # ── Estudiantes output ─────────────────────────────────────
        est_ids = list({eid for (eid, _cid) in stats['est_promedios']})
        est_sql = {}
        if est_ids:
            for e in Estudiante.objects.filter(id__in=est_ids).values(
                'id', 'nombre', 'apellido_paterno', 'apellido_materno', 'curso_id'
            ):
                est_sql[e['id']] = e

        estudiantes_out = []
        for (eid, cid), ep in stats['est_promedios'].items():
            e = est_sql.get(eid)
            if e:
                ap = f"{e['apellido_paterno']} {e['apellido_materno']}".strip()
                nombre_display = f"{ap}, {e['nombre']}".strip(', ')
                iniciales = _iniciales(e['nombre'], ap)
            else:
                nombre_display = ep['nombre'] or f'Estudiante {eid}'
                iniciales = nombre_display[:2].upper() if nombre_display else '??'

            estudiantes_out.append({
                'estudiante_id': eid,
                'nombre':        nombre_display,
                'iniciales':     iniciales,
                'curso_id':      cid,
                'curso_nombre':  curso_map.get(cid, {}).get('nombre', ''),
                'promedio':      ep['promedio'],
            })

        estudiantes_out.sort(key=lambda x: (x['promedio'] or 0), reverse=True)

        # ── Citaciones stats ───────────────────────────────────────
        cit = (
            Citacion.objects
            .filter(emisor=request.user)
            .exclude(asistencia='ANULADA')
            .aggregate(
                enviadas=Count('id'),
                asistieron=Count('id', filter=Q(asistencia__in=['ASISTIO', 'ATRASO'])),
                no_asistieron=Count('id', filter=Q(asistencia='NO_ASISTIO')),
                pendiente=Count('id', filter=Q(asistencia='PENDIENTE')),
            )
        )

        return Response({
            'resumen': {
                'promedio_general':          stats['promedio_general'],
                'citaciones_enviadas':       cit['enviadas'],
                'citaciones_asistieron':     cit['asistieron'],
                'citaciones_no_asistieron':  cit['no_asistieron'],
                'citaciones_pendiente':      cit['pendiente'],
            },
            'cursos':             cursos_out,
            'estudiantes':        estudiantes_out[:30],
            'trimestres':         stats['trimestres'],
            'promedio_por_curso': cursos_out,
            'mis_cursos': [
                {'id': v['id'], 'nombre': v['nombre']}
                for v in curso_map.values()
            ],
        })


def _parse_int(val, default):
    try:
        return int(val)
    except (TypeError, ValueError):
        return default


def _iniciales(nombre: str, apellidos: str) -> str:
    n = nombre[0].upper() if nombre else ''
    a = apellidos[0].upper() if apellidos else ''
    return (n + a) or '??'

"""
Endpoints de resumen mensual para la vista de tarjetas en la pantalla de asistencia.

GET /api/attendance/resumen-cursos/?mes=YYYY-MM
    → Lista de todos los cursos con su % de asistencia mensual.

GET /api/attendance/cursos/{id}/resumen-estudiantes/?mes=YYYY-MM
    → Lista de estudiantes del curso con su % de asistencia mensual.
"""
import calendar
from datetime import date

from django.db.models import Count, Q
from django.shortcuts import get_object_or_404
from rest_framework.permissions import IsAuthenticated
from rest_framework.response import Response
from rest_framework.views import APIView

from backend.apps.academics.models import Curso
from backend.apps.attendance.models import Asistencia
from backend.apps.students.models import Estudiante
from backend.core.permissions import IsDirectorOrRegente


def _rango_mes(year, month):
    _, ultimo = calendar.monthrange(year, month)
    return date(year, month, 1), date(year, month, ultimo)


def _pct(presente, total):
    if not total:
        return None
    return round(presente / total * 100, 1)


def _parse_mes(mes_str):
    """Parsea 'YYYY-MM' → (year, month). Retrocede al mes anterior si no hay mes_str."""
    if mes_str:
        try:
            y, m = mes_str.split('-')
            y, m = int(y), int(m)
            if not (1 <= m <= 12):
                raise ValueError
            return y, m
        except (ValueError, AttributeError):
            pass
    hoy = date.today()
    return hoy.year, hoy.month


def _mes_anterior(year, month):
    if month == 1:
        return year - 1, 12
    return year, month - 1


class ResumenCursosTodosView(APIView):
    """
    Devuelve el resumen mensual de asistencia para todos los cursos.
    Si el mes solicitado no tiene datos en ningún curso retrocede al anterior.
    """
    permission_classes = (IsAuthenticated, IsDirectorOrRegente)

    def get(self, request):
        year, month = _parse_mes(request.query_params.get('mes', '').strip())
        desde, hasta = _rango_mes(year, month)

        agg = (
            Asistencia.objects
            .filter(sesion__fecha__range=(desde, hasta))
            .values('sesion__curso_id')
            .annotate(
                total=Count('id'),
                presente=Count('id', filter=Q(estado='PRESENTE')),
                falta=Count('id', filter=Q(estado='FALTA')),
                atraso=Count('id', filter=Q(estado='ATRASO')),
                licencia=Count('id', filter=Q(estado='LICENCIA')),
            )
        )
        agg_map = {r['sesion__curso_id']: r for r in agg}

        es_mes_anterior = False
        if not agg_map:
            py, pm = _mes_anterior(year, month)
            desde2, hasta2 = _rango_mes(py, pm)
            agg2 = (
                Asistencia.objects
                .filter(sesion__fecha__range=(desde2, hasta2))
                .values('sesion__curso_id')
                .annotate(
                    total=Count('id'),
                    presente=Count('id', filter=Q(estado='PRESENTE')),
                    falta=Count('id', filter=Q(estado='FALTA')),
                    atraso=Count('id', filter=Q(estado='ATRASO')),
                    licencia=Count('id', filter=Q(estado='LICENCIA')),
                )
            )
            agg_map = {r['sesion__curso_id']: r for r in agg2}
            if agg_map:
                year, month = py, pm
                es_mes_anterior = True

        cursos = Curso.objects.all().order_by('grado', 'paralelo')
        resultado = []
        for c in cursos:
            r = agg_map.get(c.id, {'total': 0, 'presente': 0, 'falta': 0, 'atraso': 0, 'licencia': 0})
            resultado.append({
                'id': c.id,
                'nombre': f'{c.grado} {c.paralelo}',
                'porcentaje': _pct(r['presente'], r['total']),
                'presente': r['presente'],
                'falta': r['falta'],
                'atraso': r['atraso'],
                'licencia': r['licencia'],
                'total': r['total'],
            })

        resultado.sort(key=lambda x: (x['porcentaje'] is None, -(x['porcentaje'] or 0)))

        return Response({
            'mes': f'{year}-{month:02d}',
            'es_mes_anterior': es_mes_anterior,
            'cursos': resultado,
        })


class ResumenEstudiantesCursoView(APIView):
    """
    Devuelve el resumen mensual de asistencia por estudiante en un curso.
    Si el mes no tiene datos retrocede al anterior.
    """
    permission_classes = (IsAuthenticated, IsDirectorOrRegente)

    def get(self, request, curso_id):
        get_object_or_404(Curso, pk=curso_id)
        year, month = _parse_mes(request.query_params.get('mes', '').strip())
        desde, hasta = _rango_mes(year, month)

        agg = (
            Asistencia.objects
            .filter(sesion__curso_id=curso_id, sesion__fecha__range=(desde, hasta))
            .values('estudiante_id')
            .annotate(
                total=Count('id'),
                presente=Count('id', filter=Q(estado='PRESENTE')),
                falta=Count('id', filter=Q(estado='FALTA')),
                atraso=Count('id', filter=Q(estado='ATRASO')),
                licencia=Count('id', filter=Q(estado='LICENCIA')),
            )
        )
        agg_map = {r['estudiante_id']: r for r in agg}

        es_mes_anterior = False
        if not agg_map:
            py, pm = _mes_anterior(year, month)
            desde2, hasta2 = _rango_mes(py, pm)
            agg2 = (
                Asistencia.objects
                .filter(sesion__curso_id=curso_id, sesion__fecha__range=(desde2, hasta2))
                .values('estudiante_id')
                .annotate(
                    total=Count('id'),
                    presente=Count('id', filter=Q(estado='PRESENTE')),
                    falta=Count('id', filter=Q(estado='FALTA')),
                    atraso=Count('id', filter=Q(estado='ATRASO')),
                    licencia=Count('id', filter=Q(estado='LICENCIA')),
                )
            )
            agg_map = {r['estudiante_id']: r for r in agg2}
            if agg_map:
                year, month = py, pm
                es_mes_anterior = True

        estudiantes = Estudiante.objects.filter(curso_id=curso_id, activo=True).order_by('apellido_paterno', 'nombre')
        resultado = []
        for e in estudiantes:
            r = agg_map.get(e.id, {'total': 0, 'presente': 0, 'falta': 0, 'atraso': 0, 'licencia': 0})
            nombre = f'{e.apellido_paterno} {e.apellido_materno} {e.nombre}'.strip()
            resultado.append({
                'id': e.id,
                'nombre': nombre,
                'porcentaje': _pct(r['presente'], r['total']),
                'presente': r['presente'],
                'falta': r['falta'],
                'atraso': r['atraso'],
                'licencia': r['licencia'],
                'total': r['total'],
            })

        resultado.sort(key=lambda x: (x['porcentaje'] is None, -(x['porcentaje'] or 0)))

        return Response({
            'mes': f'{year}-{month:02d}',
            'es_mes_anterior': es_mes_anterior,
            'estudiantes': resultado,
        })

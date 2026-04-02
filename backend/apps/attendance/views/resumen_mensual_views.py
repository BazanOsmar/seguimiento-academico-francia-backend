import calendar
from datetime import date

from django.db.models import Count, Q
from django.shortcuts import get_object_or_404
from rest_framework import status
from rest_framework.permissions import IsAuthenticated
from rest_framework.response import Response
from rest_framework.views import APIView

from backend.apps.academics.models import Curso
from backend.apps.attendance.models import Asistencia
from backend.core.permissions import IsDirectorOrRegente

_MESES_ES = {
    1: 'Enero', 2: 'Febrero', 3: 'Marzo', 4: 'Abril',
    5: 'Mayo', 6: 'Junio', 7: 'Julio', 8: 'Agosto',
    9: 'Septiembre', 10: 'Octubre', 11: 'Noviembre', 12: 'Diciembre',
}


def _agg_mes(curso_id, year, month):
    """Cuenta asistencias por estado para un curso en un mes dado."""
    _, ultimo_dia = calendar.monthrange(year, month)
    return Asistencia.objects.filter(
        sesion__curso_id=curso_id,
        sesion__fecha__range=(date(year, month, 1), date(year, month, ultimo_dia)),
    ).aggregate(
        total=Count('id'),
        presente=Count('id', filter=Q(estado='PRESENTE')),
        falta=Count('id', filter=Q(estado='FALTA')),
        atraso=Count('id', filter=Q(estado='ATRASO')),
        licencia=Count('id', filter=Q(estado='LICENCIA')),
    )


def _porcentaje(agg):
    """Porcentaje de presencia respecto al total de registros."""
    total = agg['total']
    if not total:
        return None
    return round(agg['presente'] / total * 100, 1)


class ResumenMensualCursoView(APIView):
    """
    GET /api/attendance/cursos/{curso_id}/resumen-mensual/?mes=YYYY-MM

    Devuelve estadísticas de asistencia de un curso para el mes indicado:
      - porcentaje de presencia
      - diferencia vs mes anterior (tendencia)
      - conteo de estados acumulado del mes

    Permisos: Director o Regente.
    """
    permission_classes = (IsAuthenticated, IsDirectorOrRegente)

    def get(self, request, curso_id):
        mes_str = request.query_params.get('mes', '').strip()
        if not mes_str:
            return Response(
                {'errores': 'Debe especificar el mes en formato YYYY-MM.'},
                status=status.HTTP_400_BAD_REQUEST,
            )

        try:
            year, month = mes_str.split('-')
            year, month = int(year), int(month)
            if not (1 <= month <= 12):
                raise ValueError
        except (ValueError, AttributeError):
            return Response(
                {'errores': 'Formato de mes inválido. Use YYYY-MM.'},
                status=status.HTTP_400_BAD_REQUEST,
            )

        get_object_or_404(Curso, pk=curso_id)

        agg_actual = _agg_mes(curso_id, year, month)
        es_mes_anterior = False

        # Si no hay datos este mes, retroceder al mes anterior
        if not agg_actual['total']:
            prev_m = month - 1 if month > 1 else 12
            prev_y = year if month > 1 else year - 1
            agg_prev = _agg_mes(curso_id, prev_y, prev_m)
            if agg_prev['total']:
                agg_actual = agg_prev
                year, month = prev_y, prev_m
                mes_str = f'{year}-{month:02d}'
                es_mes_anterior = True

        pct_actual = _porcentaje(agg_actual)

        # Diferencia vs el mes anterior al que se está mostrando
        prev_month = month - 1 if month > 1 else 12
        prev_year = year if month > 1 else year - 1
        pct_anterior = _porcentaje(_agg_mes(curso_id, prev_year, prev_month))

        if pct_actual is not None and pct_anterior is not None:
            diferencia = round(pct_actual - pct_anterior, 1)
        else:
            diferencia = None

        return Response({
            'mes': mes_str,
            'mes_nombre': _MESES_ES.get(month, ''),
            'porcentaje': pct_actual,
            'diferencia': diferencia,
            'es_mes_anterior': es_mes_anterior,
            'resumen_total': {
                'presente': agg_actual['presente'],
                'falta':    agg_actual['falta'],
                'atraso':   agg_actual['atraso'],
                'licencia': agg_actual['licencia'],
            },
        })

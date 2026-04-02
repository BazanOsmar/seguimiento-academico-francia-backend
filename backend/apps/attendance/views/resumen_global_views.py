import calendar
from datetime import date

from django.db.models import Count, Q
from rest_framework import status
from rest_framework.permissions import IsAuthenticated
from rest_framework.response import Response
from rest_framework.views import APIView

from backend.apps.attendance.models import Asistencia
from backend.core.permissions import IsDirectorOrRegente

_MESES_ES = {
    1: 'Enero', 2: 'Febrero', 3: 'Marzo', 4: 'Abril',
    5: 'Mayo', 6: 'Junio', 7: 'Julio', 8: 'Agosto',
    9: 'Septiembre', 10: 'Octubre', 11: 'Noviembre', 12: 'Diciembre',
}


def _agg_mes_global(year, month):
    """Agrega asistencias de todos los cursos para un mes dado."""
    _, ultimo_dia = calendar.monthrange(year, month)
    return Asistencia.objects.filter(
        sesion__fecha__range=(date(year, month, 1), date(year, month, ultimo_dia)),
    ).aggregate(
        total=Count('id'),
        presente=Count('id', filter=Q(estado='PRESENTE')),
        falta=Count('id', filter=Q(estado='FALTA')),
        atraso=Count('id', filter=Q(estado='ATRASO')),
        licencia=Count('id', filter=Q(estado='LICENCIA')),
    )


def _porcentaje(agg):
    total = agg['total']
    if not total:
        return None
    return round(agg['presente'] / total * 100, 1)


class ResumenGlobalView(APIView):
    """
    GET /api/attendance/resumen-global/?mes=YYYY-MM

    Devuelve estadísticas globales (todos los cursos) de asistencia para el mes.
    Si no se especifica mes, usa el mes actual. Si el mes no tiene datos,
    retrocede automáticamente al mes anterior.

    Permisos: Director o Regente.
    """
    permission_classes = (IsAuthenticated, IsDirectorOrRegente)

    def get(self, request):
        mes_str = request.query_params.get('mes', '').strip()
        hoy = date.today()

        if mes_str:
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
        else:
            year, month = hoy.year, hoy.month

        agg = _agg_mes_global(year, month)
        es_mes_anterior = False

        # Si no hay datos en el mes solicitado, retroceder al mes anterior
        if not agg['total']:
            prev_month = month - 1 if month > 1 else 12
            prev_year = year if month > 1 else year - 1
            agg_prev = _agg_mes_global(prev_year, prev_month)
            if agg_prev['total']:
                agg = agg_prev
                year, month = prev_year, prev_month
                es_mes_anterior = True

        mes_resultado = f'{year}-{month:02d}'
        pct_actual = _porcentaje(agg)

        # Diferencia vs mes anterior al que se usa
        prev_month = month - 1 if month > 1 else 12
        prev_year = year if month > 1 else year - 1
        pct_anterior = _porcentaje(_agg_mes_global(prev_year, prev_month))

        if pct_actual is not None and pct_anterior is not None:
            diferencia = round(pct_actual - pct_anterior, 1)
        else:
            diferencia = None

        return Response({
            'mes': mes_resultado,
            'mes_nombre': _MESES_ES.get(month, ''),
            'porcentaje': pct_actual,
            'diferencia': diferencia,
            'resumen_total': {
                'presente': agg['presente'],
                'falta':    agg['falta'],
                'atraso':   agg['atraso'],
                'licencia': agg['licencia'],
            },
            'es_mes_anterior': es_mes_anterior,
        })

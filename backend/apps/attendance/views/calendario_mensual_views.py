import calendar
from datetime import date

from django.db.models import Count
from rest_framework import status
from rest_framework.permissions import IsAuthenticated
from rest_framework.response import Response
from rest_framework.views import APIView

from backend.apps.academics.models import Curso
from backend.apps.attendance.models import AsistenciaSesion
from backend.apps.users.permissions import IsDirectorOrRegente

_MESES_ES = {
    1: 'Enero', 2: 'Febrero', 3: 'Marzo', 4: 'Abril',
    5: 'Mayo', 6: 'Junio', 7: 'Julio', 8: 'Agosto',
    9: 'Septiembre', 10: 'Octubre', 11: 'Noviembre', 12: 'Diciembre',
}


class CalendarioMensualView(APIView):
    """
    GET /api/attendance/calendario-mensual/?mes=YYYY-MM

    Devuelve para cada día con sesiones registradas:
      - fecha    : "YYYY-MM-DD"
      - sesiones : cuántos cursos registraron ese día

    El cliente calcula completo/parcial con `total_cursos` del root.
    Respuesta mínima: solo se incluyen días CON sesiones (no los vacíos).
    Cache: meses pasados → 1 h; mes actual/futuro → sin caché.

    Permisos: Director o Regente.
    """
    permission_classes = (IsAuthenticated, IsDirectorOrRegente)

    def get(self, request):
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

        total_cursos = Curso.objects.count()
        _, ultimo_dia = calendar.monthrange(year, month)

        # Solo días CON sesiones — respuesta mínima
        sesiones_por_dia = (
            AsistenciaSesion.objects
            .filter(fecha__range=(date(year, month, 1), date(year, month, ultimo_dia)))
            .values('fecha')
            .annotate(s=Count('id'))
            .order_by('fecha')
        )

        dias = [
            {'f': e['fecha'].isoformat(), 's': e['s']}
            for e in sesiones_por_dia
        ]

        response = Response({
            'mes': mes_str,
            'n':   f"{_MESES_ES.get(month, '')} {year}",
            't':   total_cursos,
            'd':   dias,
        })

        # Meses pasados: caché 1 hora. Mes actual/futuro: sin caché.
        hoy = date.today()
        mes_actual = f"{hoy.year}-{str(hoy.month).zfill(2)}"
        if mes_str < mes_actual:
            response['Cache-Control'] = 'private, max-age=3600'
        else:
            response['Cache-Control'] = 'no-cache, no-store'

        return response

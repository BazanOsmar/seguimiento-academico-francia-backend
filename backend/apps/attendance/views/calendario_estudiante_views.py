import calendar
from datetime import date

from django.shortcuts import get_object_or_404
from rest_framework import status
from rest_framework.permissions import IsAuthenticated
from rest_framework.response import Response
from rest_framework.views import APIView

from backend.apps.attendance.models import Asistencia
from backend.apps.students.models import Estudiante
from backend.core.permissions import IsDirectorOrRegente

_MESES_ES = {
    1: 'Enero', 2: 'Febrero', 3: 'Marzo', 4: 'Abril',
    5: 'Mayo', 6: 'Junio', 7: 'Julio', 8: 'Agosto',
    9: 'Septiembre', 10: 'Octubre', 11: 'Noviembre', 12: 'Diciembre',
}


class CalendarioEstudianteView(APIView):
    """
    GET /api/attendance/estudiantes/{estudiante_id}/calendario/?mes=YYYY-MM

    Devuelve los registros de asistencia de un estudiante para el mes indicado,
    uno por día, para renderizar un calendario con dots de color por estado.
    Si no se especifica mes, usa el mes actual.

    Permisos: Director o Regente.
    """
    permission_classes = (IsAuthenticated, IsDirectorOrRegente)

    def get(self, request, estudiante_id):
        get_object_or_404(Estudiante, pk=estudiante_id)

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

        _, ultimo_dia = calendar.monthrange(year, month)
        fecha_inicio = date(year, month, 1)
        fecha_fin = date(year, month, ultimo_dia)

        asistencias = (
            Asistencia.objects
            .filter(
                estudiante_id=estudiante_id,
                sesion__fecha__range=(fecha_inicio, fecha_fin),
            )
            .select_related('sesion')
            .values('sesion__fecha', 'estado')
        )

        # Un registro por día (unique_together lo garantiza en el modelo)
        dia_map = {str(a['sesion__fecha']): a['estado'] for a in asistencias}

        return Response({
            'mes': f'{year}-{month:02d}',
            'mes_nombre': f'{_MESES_ES.get(month, "")} {year}',
            'asistencias': [
                {'fecha': f, 'estado': e}
                for f, e in dia_map.items()
            ],
        })

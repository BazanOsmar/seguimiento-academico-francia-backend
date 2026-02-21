from rest_framework.views import APIView
from rest_framework.response import Response
from rest_framework.permissions import IsAuthenticated
from django.shortcuts import get_object_or_404

from backend.apps.users.permissions import IsRegente
from backend.apps.students.models import Estudiante
from backend.apps.attendance.models import Asistencia
from backend.apps.attendance.serializers.attendance_read_serializers import (
    HistorialEstudianteSerializer,
)


class HistorialEstudianteView(APIView):
    """
    GET /api/attendance/estudiantes/{estudiante_id}/historial/

    Devuelve el historial de asistencia de un estudiante específico,
    ordenado por fecha descendente. Solo Regente.

    Query params opcionales:
        ?fecha_desde=YYYY-MM-DD
        ?fecha_hasta=YYYY-MM-DD
    """
    permission_classes = (IsAuthenticated, IsRegente)

    def get(self, request, estudiante_id):
        get_object_or_404(Estudiante, pk=estudiante_id)

        qs = (
            Asistencia.objects
            .select_related('sesion')
            .filter(estudiante_id=estudiante_id)
            .order_by('-sesion__fecha')
        )

        fecha_desde = request.query_params.get('fecha_desde')
        fecha_hasta = request.query_params.get('fecha_hasta')

        if fecha_desde:
            qs = qs.filter(sesion__fecha__gte=fecha_desde)
        if fecha_hasta:
            qs = qs.filter(sesion__fecha__lte=fecha_hasta)

        serializer = HistorialEstudianteSerializer(qs, many=True)
        return Response(serializer.data)

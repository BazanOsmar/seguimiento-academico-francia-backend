from datetime import datetime

from rest_framework.views import APIView
from rest_framework.response import Response
from rest_framework.permissions import IsAuthenticated
from rest_framework import status

from backend.core.permissions import IsTutor
from backend.apps.students.models import Estudiante
from backend.apps.attendance.models import Asistencia
from backend.apps.attendance.serializers.attendance_read_serializers import (
    HistorialEstudianteSerializer,
)


class HistorialTutorView(APIView):
    """
    GET /api/attendance/parents/me/historial/?mes=YYYY-MM&estudiante_id=<id>

    Devuelve el historial de asistencia del estudiante indicado.
    El parámetro estudiante_id es obligatorio cuando el tutor tiene más de un
    hijo vinculado; si solo tiene uno se usa ese por defecto.
    Solo se permite consultar estudiantes vinculados al tutor autenticado.
    """

    permission_classes = (IsAuthenticated, IsTutor)

    def get(self, request):
        estudiante_id = request.query_params.get("estudiante_id")

        qs_base = Estudiante.objects.filter(tutor=request.user).order_by("-activo", "id")

        if estudiante_id:
            try:
                estudiante = qs_base.get(pk=estudiante_id)
            except Estudiante.DoesNotExist:
                return Response(
                    {"errores": "Estudiante no encontrado o no vinculado a este tutor."},
                    status=status.HTTP_404_NOT_FOUND,
                )
        else:
            estudiante = qs_base.first()
            if estudiante is None:
                return Response(
                    {"errores": "No existe un estudiante vinculado a este tutor."},
                    status=status.HTTP_404_NOT_FOUND,
                )

        qs = (
            Asistencia.objects
            .select_related("sesion", "sesion__registrado_por", "sesion__registrado_por__tipo_usuario")
            .filter(estudiante_id=estudiante.id)
            .order_by("-sesion__fecha", "-hora")
        )

        mes = request.query_params.get("mes")
        if mes:
            try:
                fecha_mes = datetime.strptime(mes, "%Y-%m")
            except ValueError:
                return Response(
                    {"errores": "El parámetro mes debe tener formato YYYY-MM."},
                    status=status.HTTP_400_BAD_REQUEST,
                )
            qs = qs.filter(
                sesion__fecha__year=fecha_mes.year,
                sesion__fecha__month=fecha_mes.month,
            )

        serializer = HistorialEstudianteSerializer(qs, many=True)
        return Response(serializer.data)

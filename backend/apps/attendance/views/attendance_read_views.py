# backend/apps/attendance/views/attendance_read_views.py

from rest_framework.views import APIView
from rest_framework.response import Response
from rest_framework.permissions import IsAuthenticated
from rest_framework import status

from backend.apps.users.permissions import IsDirectorOrRegente
from backend.apps.attendance.models import AsistenciaSesion
from backend.apps.academics.models import Curso
from ..serializers.attendance_read_serializers import (
    AsistenciaSesionDetailSerializer
)


class ObtenerAsistenciaCursoView(APIView):
    """
    Obtiene la asistencia registrada de un curso en una fecha específica.
    Solo lectura. No permite modificaciones.
    
    Endpoint: GET /api/attendance/cursos/{curso_id}/asistencia/?fecha=YYYY-MM-DD
    
    Respuesta:
    {
        "id": 1,
        "curso": 5,
        "curso_nombre": "1ro A",
        "fecha": "2026-02-11",
        "estado": "ENVIADA",
        "registrado_por_nombre": "Juan Pérez",
        "created_at": "2026-02-11T08:45:23.123456Z",
        "total_estudiantes": 25,
        "resumen": {
            "total": 25,
            "presente": 20,
            "falta": 2,
            "atraso": 2,
            "licencia": 1
        },
        "asistencias": [
            {
                "estudiante_id": 1,
                "nombre_completo": "Ana García López",
                "estado": "PRESENTE",
                "hora": "08:30:00"
            },
            ...
        ]
    }
    """
    
    permission_classes = [IsAuthenticated, IsDirectorOrRegente]

    def get(self, request, curso_id):
        # Validar que se envió la fecha
        fecha = request.query_params.get('fecha')
        
        if not fecha:
            return Response(
                {"errores": "Debe especificar la fecha en el formato YYYY-MM-DD"},
                status=status.HTTP_400_BAD_REQUEST
            )

        # Validar que el curso existe
        try:
            curso = Curso.objects.get(id=curso_id)
        except Curso.DoesNotExist:
            return Response(
                {"errores": "El curso especificado no existe."},
                status=status.HTTP_404_NOT_FOUND
            )

        # Buscar la sesión de asistencia
        try:
            sesion = AsistenciaSesion.objects.get(
                curso=curso,
                fecha=fecha
            )
        except AsistenciaSesion.DoesNotExist:
            return Response(
                {"errores": "No existe asistencia registrada para este curso en la fecha indicada."},
                status=status.HTTP_404_NOT_FOUND
            )

        # Serializar y devolver
        serializer = AsistenciaSesionDetailSerializer(sesion)
        
        return Response(
            serializer.data,
            status=status.HTTP_200_OK
        )
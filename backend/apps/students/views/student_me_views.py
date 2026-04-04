from rest_framework.views import APIView
from rest_framework.response import Response
from rest_framework.permissions import IsAuthenticated
from rest_framework import status

from backend.core.permissions import IsTutor
from backend.apps.students.models import Estudiante
from backend.apps.students.serializers import EstudianteTutorPerfilSerializer


class MiEstudianteView(APIView):
    """
    GET /api/students/me/student/

    Devuelve todos los estudiantes vinculados al tutor autenticado,
    ordenados por activo primero y luego por id.
    La app móvil usa esta lista para el selector de hijo activo.
    """

    permission_classes = (IsAuthenticated, IsTutor)

    def get(self, request):
        estudiantes = (
            Estudiante.objects
            .select_related("curso")
            .filter(tutor=request.user)
            .order_by("-activo", "id")
        )

        if not estudiantes.exists():
            return Response(
                {"errores": "No existe un estudiante vinculado a este tutor."},
                status=status.HTTP_404_NOT_FOUND,
            )

        serializer = EstudianteTutorPerfilSerializer(estudiantes, many=True)
        return Response(serializer.data)

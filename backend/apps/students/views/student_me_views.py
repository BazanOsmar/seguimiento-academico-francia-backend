from rest_framework.views import APIView
from rest_framework.response import Response
from rest_framework.permissions import IsAuthenticated
from rest_framework import status

from backend.apps.users.permissions import IsTutor
from backend.apps.students.models import Estudiante
from backend.apps.students.serializers import EstudianteTutorPerfilSerializer


class MiEstudianteView(APIView):
    """
    GET /api/students/me/student/

    Devuelve el estudiante vinculado al tutor autenticado.
    Si el tutor tiene varios estudiantes vinculados, prioriza
    uno activo y, en empate, el de menor id.
    """

    permission_classes = (IsAuthenticated, IsTutor)

    def get(self, request):
        estudiante = (
            Estudiante.objects
            .select_related("curso")
            .filter(tutor=request.user)
            .order_by("-activo", "id")
            .first()
        )

        if estudiante is None:
            return Response(
                {"errores": "No existe un estudiante vinculado a este tutor."},
                status=status.HTTP_404_NOT_FOUND,
            )

        serializer = EstudianteTutorPerfilSerializer(estudiante)
        return Response(serializer.data)

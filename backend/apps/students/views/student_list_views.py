from rest_framework.generics import ListAPIView
from rest_framework.permissions import IsAuthenticated
from rest_framework.exceptions import NotFound

from backend.apps.users.permissions import IsDirectorOrRegente
from backend.apps.students.models import Estudiante
from backend.apps.students.serializers import EstudianteListSerializer


class EstudiantesPorCursoView(ListAPIView):
    """
    Devuelve el listado de estudiantes pertenecientes
    a un curso específico.

    Utilizado como paso previo al registro de asistencia
    por parte de regentes y dirección.
    """

    serializer_class = EstudianteListSerializer
    permission_classes = (IsAuthenticated, IsDirectorOrRegente)

    def get_queryset(self):
        curso_id = self.kwargs.get("curso_id")

        queryset = Estudiante.objects.filter(curso_id=curso_id)

        if not queryset.exists():
            raise NotFound(
                detail="No existen estudiantes registrados para este curso."
            )

        return queryset.order_by("apellidos", "nombre")

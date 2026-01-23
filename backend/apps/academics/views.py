from rest_framework.generics import ListAPIView
from rest_framework.permissions import IsAuthenticated

from backend.apps.users.permissions import IsDirectorOrRegente
from .models import Curso
from .serializers import CursoSerializer


class CursoListView(ListAPIView):
    """
    Endpoint que permite obtener el listado de cursos
    (aulas) registrados en la institución.

    Este endpoint está restringido a usuarios con rol
    Director o Regente, ya que constituye el punto inicial
    para el registro de asistencia diaria.
    """

    queryset = Curso.objects.all().order_by("grado", "paralelo")
    serializer_class = CursoSerializer
    permission_classes = (IsAuthenticated, IsDirectorOrRegente)

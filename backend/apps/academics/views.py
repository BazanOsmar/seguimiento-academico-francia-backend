from django.db.models import Count
from rest_framework.generics import ListAPIView
from rest_framework.views import APIView
from rest_framework.response import Response
from rest_framework.permissions import IsAuthenticated

from backend.apps.users.permissions import IsDirectorOrRegente, IsProfesor
from .models import Curso, ProfesorCurso
from .serializers import CursoSerializer


class CursoListView(ListAPIView):
    """
    Endpoint que permite obtener el listado de cursos
    (aulas) registrados en la institución, con conteo de estudiantes.
    """

    serializer_class = CursoSerializer
    permission_classes = (IsAuthenticated, IsDirectorOrRegente)

    def get_queryset(self):
        return (
            Curso.objects
            .annotate(estudiantes_count=Count('estudiante'))
            .order_by('grado', 'paralelo')
        )


class ProfesorCursosView(APIView):
    """
    GET /api/academics/profesor/cursos/

    Retorna los cursos asignados al profesor autenticado.
    Permiso: solo Profesor.
    """

    permission_classes = [IsAuthenticated, IsProfesor]

    def get(self, request):
        cursos = (
            ProfesorCurso.objects
            .filter(profesor=request.user)
            .select_related('curso')
            .values('curso__id', 'curso__grado', 'curso__paralelo')
            .distinct()
            .order_by('curso__grado', 'curso__paralelo')
        )
        data = [
            {"id": c['curso__id'], "grado": c['curso__grado'], "paralelo": c['curso__paralelo']}
            for c in cursos
        ]
        return Response(data)

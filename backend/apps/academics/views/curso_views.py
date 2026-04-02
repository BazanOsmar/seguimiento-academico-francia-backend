from django.db.models import Count
from rest_framework.generics import ListAPIView
from rest_framework.views import APIView
from rest_framework.response import Response
from rest_framework.permissions import IsAuthenticated

from backend.core.permissions import IsDirectorOrRegente, IsProfesor
from ..models import Curso, ProfesorCurso
from ..serializers import CursoSerializer


class CursoListView(ListAPIView):
    """
    GET /api/academics/cursos/
    Lista todos los cursos con conteo de estudiantes.
    Permiso: Director o Regente.
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


class MateriasXCursoView(APIView):
    """
    GET /api/academics/cursos/{curso_id}/materias/
    Devuelve las materias asignadas a un curso con el nombre del profesor.
    Permiso: Director o Regente.
    """
    permission_classes = [IsAuthenticated, IsDirectorOrRegente]

    def get(self, request, curso_id):
        from django.shortcuts import get_object_or_404
        get_object_or_404(Curso, pk=curso_id)

        qs = (
            ProfesorCurso.objects
            .filter(curso_id=curso_id)
            .select_related('materia', 'profesor')
            .order_by('materia__nombre')
        )
        data = [
            {
                'materia_id':  pc.materia.id,
                'materia':     pc.materia.nombre,
                'profesor_id': pc.profesor.id,
                'profesor':    (f"{pc.profesor.first_name} {pc.profesor.last_name}".strip()
                                or pc.profesor.username),
            }
            for pc in qs
        ]
        return Response(data)

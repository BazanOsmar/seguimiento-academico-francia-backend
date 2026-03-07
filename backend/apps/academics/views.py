from django.db.models import Count
from rest_framework.generics import ListAPIView
from rest_framework.views import APIView
from rest_framework.response import Response
from rest_framework.permissions import IsAuthenticated
from rest_framework import status

from backend.apps.users.permissions import IsDirectorOrRegente, IsProfesor, IsDirector
from .models import Curso, Materia, ProfesorCurso
from .serializers import CursoSerializer, MateriaSerializer, AsignacionSerializer


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


class MateriaListCreateView(APIView):
    """
    GET  /api/academics/materias/  — lista todas las materias (IsDirector)
    POST /api/academics/materias/  — crea una nueva materia (IsDirector)
    """

    permission_classes = [IsAuthenticated, IsDirector]

    def get(self, request):
        materias = Materia.objects.all().order_by('nombre')
        return Response(MateriaSerializer(materias, many=True).data)

    def post(self, request):
        serializer = MateriaSerializer(data=request.data)
        if not serializer.is_valid():
            return Response(serializer.errors, status=status.HTTP_400_BAD_REQUEST)
        nombre = serializer.validated_data['nombre'].strip()
        if Materia.objects.filter(nombre__iexact=nombre).exists():
            return Response({"errores": "Ya existe una materia con ese nombre."}, status=status.HTTP_400_BAD_REQUEST)
        materia = serializer.save(nombre=nombre)
        return Response(MateriaSerializer(materia).data, status=status.HTTP_201_CREATED)


class MateriaDetailView(APIView):
    """
    DELETE /api/academics/materias/{id}/  — elimina una materia (IsDirector)
    """

    permission_classes = [IsAuthenticated, IsDirector]

    def delete(self, request, materia_id):
        try:
            materia = Materia.objects.get(pk=materia_id)
        except Materia.DoesNotExist:
            return Response({"errores": "Materia no encontrada."}, status=status.HTTP_404_NOT_FOUND)

        if ProfesorCurso.objects.filter(materia=materia).exists():
            return Response(
                {"errores": "No se puede eliminar: la materia tiene asignaciones activas."},
                status=status.HTTP_400_BAD_REQUEST,
            )
        materia.delete()
        return Response(status=status.HTTP_204_NO_CONTENT)


class AsignacionListCreateView(APIView):
    """
    GET  /api/academics/asignaciones/  — lista todas las asignaciones Profesor-Curso-Materia (IsDirector)
    POST /api/academics/asignaciones/  — crea una nueva asignación (IsDirector)
    """

    permission_classes = [IsAuthenticated, IsDirector]

    def get(self, request):
        qs = (
            ProfesorCurso.objects
            .select_related('profesor', 'curso', 'materia')
            .order_by('curso__grado', 'curso__paralelo', 'materia__nombre')
        )
        return Response(AsignacionSerializer(qs, many=True).data)

    def post(self, request):
        serializer = AsignacionSerializer(data=request.data)
        if not serializer.is_valid():
            return Response(serializer.errors, status=status.HTTP_400_BAD_REQUEST)

        profesor = serializer.validated_data['profesor']
        curso    = serializer.validated_data['curso']
        materia  = serializer.validated_data['materia']

        tipo = getattr(profesor.tipo_usuario, 'nombre', None)
        if tipo != 'Profesor':
            return Response({"errores": "El usuario seleccionado no es un Profesor."}, status=status.HTTP_400_BAD_REQUEST)

        if ProfesorCurso.objects.filter(profesor=profesor, curso=curso, materia=materia).exists():
            return Response({"errores": "Esta asignación ya existe."}, status=status.HTTP_400_BAD_REQUEST)

        asignacion = serializer.save()
        return Response(AsignacionSerializer(asignacion).data, status=status.HTTP_201_CREATED)


class AsignacionDetailView(APIView):
    """
    DELETE /api/academics/asignaciones/{id}/  — elimina una asignación (IsDirector)
    """

    permission_classes = [IsAuthenticated, IsDirector]

    def delete(self, request, asignacion_id):
        try:
            asignacion = ProfesorCurso.objects.get(pk=asignacion_id)
        except ProfesorCurso.DoesNotExist:
            return Response({"errores": "Asignación no encontrada."}, status=status.HTTP_404_NOT_FOUND)
        asignacion.delete()
        return Response(status=status.HTTP_204_NO_CONTENT)

from rest_framework.views import APIView
from rest_framework.response import Response
from rest_framework.permissions import IsAuthenticated
from rest_framework import status

from backend.core.permissions import IsDirector, IsProfesor
from ..models import ProfesorCurso
from ..serializers import AsignacionSerializer, ProfesorAsignacionSerializer


class AsignacionListCreateView(APIView):
    """
    GET  /api/academics/asignaciones/  — lista todas las asignaciones Profesor-Curso-Materia
    POST /api/academics/asignaciones/  — crea una nueva asignación
    Permiso: Director.
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
            return Response(
                {"errores": "El usuario seleccionado no es un Profesor."},
                status=status.HTTP_400_BAD_REQUEST,
            )

        if ProfesorCurso.objects.filter(profesor=profesor, curso=curso, materia=materia).exists():
            return Response({"errores": "Esta asignación ya existe."}, status=status.HTTP_400_BAD_REQUEST)

        asignacion = serializer.save()
        return Response(AsignacionSerializer(asignacion).data, status=status.HTTP_201_CREATED)


class AsignacionDetailView(APIView):
    """
    DELETE /api/academics/asignaciones/{id}/  — elimina una asignación
    Permiso: Director.
    """
    permission_classes = [IsAuthenticated, IsDirector]

    def delete(self, request, asignacion_id):
        try:
            asignacion = ProfesorCurso.objects.get(pk=asignacion_id)
        except ProfesorCurso.DoesNotExist:
            return Response({"errores": "Asignación no encontrada."}, status=status.HTTP_404_NOT_FOUND)
        asignacion.delete()
        return Response(status=status.HTTP_204_NO_CONTENT)


class ProfesorMisAsignacionesView(APIView):
    """
    GET /api/academics/profesor/mis-asignaciones/?mes=N
    Retorna las asignaciones del profesor autenticado con conteo de planes y si tiene notas.
    Permiso: Profesor.
    """
    permission_classes = [IsAuthenticated, IsProfesor]

    def get(self, request):
        try:
            mes = int(request.query_params.get('mes', 0))
            if not (1 <= mes <= 12):
                raise ValueError
        except (ValueError, TypeError):
            return Response(
                {'errores': 'El parámetro mes es requerido y debe ser un número entre 1 y 12.'},
                status=status.HTTP_400_BAD_REQUEST,
            )

        from ..models import ProfesorPlan
        qs = (
            ProfesorCurso.objects
            .filter(profesor=request.user)
            .select_related('materia', 'curso')
            .order_by('materia__nombre', 'curso__grado', 'curso__paralelo')
        )

        planes_qs = (
            ProfesorPlan.objects
            .filter(profesor_curso__profesor=request.user, mes=mes, eliminado=False)
            .select_related('plan')
        )

        semanas_por_asignacion = {}
        for pp in planes_qs:
            day = pp.plan.fecha_inicio.day
            semana = 1 if day <= 7 else 2 if day <= 14 else 3 if day <= 21 else 4
            semanas_por_asignacion.setdefault(pp.profesor_curso_id, []).append(semana)

        return Response(
            ProfesorAsignacionSerializer(
                qs, many=True,
                context={'semanas_por_asignacion': semanas_por_asignacion},
            ).data
        )

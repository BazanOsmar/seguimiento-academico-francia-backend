from django.db.models import Count
from rest_framework.views import APIView
from rest_framework.response import Response
from rest_framework.permissions import IsAuthenticated
from rest_framework import status

from backend.core.permissions import IsDirector, IsProfesor
from ..models import ProfesorCurso
from ..serializers import AsignacionSerializer, ProfesorAsignacionSerializer
from ..services.notas_mongo_service import asignaciones_con_notas


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
        mes = request.query_params.get('mes')
        if mes is not None:
            try:
                mes = int(mes)
                if not (1 <= mes <= 12):
                    raise ValueError
            except (ValueError, TypeError):
                return Response(
                    {'errores': 'El parámetro mes debe ser un número entre 1 y 12.'},
                    status=status.HTTP_400_BAD_REQUEST,
                )

        from ..models import ProfesorPlan
        qs = (
            ProfesorCurso.objects
            .filter(profesor=request.user)
            .select_related('materia', 'curso')
            .order_by('materia__nombre', 'curso__grado', 'curso__paralelo')
        )

        planes_qs = ProfesorPlan.objects.filter(profesor_curso__profesor=request.user)
        if mes is not None:
            planes_qs = planes_qs.filter(mes=mes)

        planes_counts = {
            row['profesor_curso_id']: row['total']
            for row in planes_qs.values('profesor_curso_id').annotate(total=Count('id'))
        }

        pares = [(pc.materia.id, pc.curso.id) for pc in qs]
        con_notas = asignaciones_con_notas(pares, mes=mes)

        return Response(
            ProfesorAsignacionSerializer(
                qs, many=True,
                context={'planes_counts': planes_counts, 'con_notas': con_notas},
            ).data
        )

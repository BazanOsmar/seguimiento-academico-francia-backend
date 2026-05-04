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
    Body: {"password_director": "..."}
    Permiso: Director.
    """
    permission_classes = [IsAuthenticated, IsDirector]

    def delete(self, request, asignacion_id):
        password_director = request.data.get('password_director', '').strip()
        if not password_director or not request.user.check_password(password_director):
            return Response({"errores": "Contraseña incorrecta."}, status=status.HTTP_403_FORBIDDEN)

        try:
            asignacion = ProfesorCurso.objects.select_related('profesor', 'curso', 'materia').get(pk=asignacion_id)
        except ProfesorCurso.DoesNotExist:
            return Response({"errores": "Asignación no encontrada."}, status=status.HTTP_404_NOT_FOUND)

        from backend.apps.auditoria.services import registrar
        director = f"{request.user.first_name} {request.user.last_name}".strip() or request.user.username
        registrar(
            request.user, 'ELIMINAR_ASIGNACION',
            f"{director} eliminó asignación: {asignacion.profesor.username} — "
            f"{asignacion.materia.nombre} en {asignacion.curso.grado} '{asignacion.curso.paralelo}'",
            request,
        )

        asignacion.delete()
        return Response(status=status.HTTP_204_NO_CONTENT)


class DirectorProfesorAsignacionesView(APIView):
    """
    GET /api/academics/director/profesores/<profesor_id>/asignaciones/
    Devuelve los datos del profesor y sus asignaciones Curso-Materia.
    Permiso: Director.
    """
    permission_classes = [IsAuthenticated, IsDirector]

    def get(self, request, profesor_id):
        from backend.apps.users.models import User
        try:
            profesor = User.objects.select_related('tipo_usuario').get(pk=profesor_id)
        except User.DoesNotExist:
            return Response({"errores": "Usuario no encontrado."}, status=status.HTTP_404_NOT_FOUND)

        if getattr(profesor.tipo_usuario, 'nombre', None) != 'Profesor':
            return Response({"errores": "El usuario no es un profesor."}, status=status.HTTP_400_BAD_REQUEST)

        asignaciones = (
            ProfesorCurso.objects
            .filter(profesor=profesor)
            .select_related('curso', 'materia')
            .order_by('curso__grado', 'curso__paralelo', 'materia__nombre')
        )

        return Response({
            'id':          profesor.id,
            'nombre':      f"{profesor.first_name} {profesor.last_name}".strip() or profesor.username,
            'username':    profesor.username,
            'is_active':   profesor.is_active,
            'asignaciones': [
                {
                    'id':            a.id,
                    'curso_id':      a.curso.id,
                    'curso_nombre':  f"{a.curso.grado} \"{a.curso.paralelo}\"",
                    'materia_id':    a.materia.id,
                    'materia_nombre': a.materia.nombre,
                }
                for a in asignaciones
            ],
        })


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
            .order_by('curso__grado', 'curso__paralelo', 'materia__nombre')
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

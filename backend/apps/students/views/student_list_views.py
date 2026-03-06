from rest_framework.generics import ListAPIView
from rest_framework.permissions import IsAuthenticated
from rest_framework.exceptions import NotFound, PermissionDenied

from backend.apps.users.permissions import IsDirectorOrRegenteOrProfesor
from backend.apps.students.models import Estudiante
from backend.apps.students.serializers import EstudianteListSerializer


class EstudiantesPorCursoView(ListAPIView):
    """
    Devuelve el listado de estudiantes pertenecientes
    a un curso específico.

    Utilizado como paso previo al registro de asistencia
    por parte de regentes, dirección y profesores.
    Si es Profesor, solo puede consultar sus cursos asignados.
    """

    serializer_class = EstudianteListSerializer
    permission_classes = (IsAuthenticated, IsDirectorOrRegenteOrProfesor)

    def get_queryset(self):
        curso_id = self.kwargs.get("curso_id")

        # Si es Profesor, validar que el curso le pertenece
        user = self.request.user
        tipo = user.tipo_usuario.nombre if user.tipo_usuario else None
        if tipo == "Profesor":
            from backend.apps.academics.models import ProfesorCurso
            if not ProfesorCurso.objects.filter(profesor=user, curso_id=curso_id).exists():
                raise PermissionDenied("No tienes acceso a los estudiantes de este curso.")

        queryset = Estudiante.objects.filter(curso_id=curso_id, activo=True)

        if not queryset.exists():
            raise NotFound(
                detail="No existen estudiantes registrados para este curso."
            )

        return queryset.order_by("apellidos", "nombre")

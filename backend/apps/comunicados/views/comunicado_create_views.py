from rest_framework.views import APIView
from rest_framework.response import Response
from rest_framework import status
from rest_framework.permissions import IsAuthenticated

from ..models import Comunicado
from ..serializers.comunicado_write_serializers import ComunicadoCreateSerializer
from ..serializers.comunicado_read_serializers import ComunicadoSerializer
from backend.apps.users.permissions import IsDirectorOrProfesor


class ComunicadoCreateView(APIView):
    """
    POST /api/comunicados/crear/

    Director → puede usar alcance TODOS, GRADO o CURSO (cualquier curso).
    Profesor → puede usar alcance MIS_CURSOS o CURSO (solo sus cursos asignados).
    """

    permission_classes = [IsAuthenticated, IsDirectorOrProfesor]

    def post(self, request):
        serializer = ComunicadoCreateSerializer(data=request.data)
        if not serializer.is_valid():
            return Response(serializer.errors, status=status.HTTP_400_BAD_REQUEST)

        tipo = request.user.tipo_usuario.nombre
        alcance = serializer.validated_data.get('alcance', Comunicado.ALCANCE_TODOS)

        # Validaciones específicas por rol
        if tipo == 'Profesor':
            error = self._validar_profesor(request.user, alcance, serializer.validated_data)
            if error:
                return Response({'errores': error}, status=status.HTTP_400_BAD_REQUEST)

        comunicado = serializer.save(emisor=request.user)

        from backend.apps.auditoria.services import registrar
        nombre = f"{request.user.first_name} {request.user.last_name}".strip() or request.user.username
        registrar(
            request.user,
            'CREAR_COMUNICADO',
            f"{nombre} creó el comunicado '{comunicado.titulo}'",
            request,
        )

        self._notificar_tutores(comunicado)

        return Response(
            ComunicadoSerializer(comunicado).data,
            status=status.HTTP_201_CREATED,
        )

    def _validar_profesor(self, profesor, alcance, data):
        """Valida que el profesor solo use alcances permitidos y sus propios cursos."""
        from backend.apps.academics.models import ProfesorCurso

        if alcance not in (Comunicado.ALCANCE_CURSO, Comunicado.ALCANCE_MIS_CURSOS):
            return "Los profesores solo pueden enviar comunicados a sus cursos asignados."

        if alcance == Comunicado.ALCANCE_CURSO:
            curso = data.get('curso')
            if not curso:
                return "Debes seleccionar un curso."
            asignado = ProfesorCurso.objects.filter(profesor=profesor, curso=curso).exists()
            if not asignado:
                return "Solo puedes enviar comunicados a cursos que tienes asignados."

        return None

    def _notificar_tutores(self, comunicado):
        from django.conf import settings as django_settings
        from django.db.models import Q
        from backend.apps.users.models import User
        from backend.apps.students.models import Estudiante
        from backend.apps.notifications.services import enviar_notificacion
        from backend.apps.academics.models import ProfesorCurso
        from ..models import Comunicado as Com

        if comunicado.alcance == Com.ALCANCE_CURSO:
            ids = Estudiante.objects.filter(
                curso=comunicado.curso, activo=True
            ).exclude(tutor=None).values_list('tutor_id', flat=True)
            tutores = User.objects.filter(pk__in=ids, is_active=True)

        elif comunicado.alcance == Com.ALCANCE_GRADO:
            from backend.apps.academics.models import Curso
            cursos = Curso.objects.filter(grado=comunicado.grado)
            ids = Estudiante.objects.filter(
                curso__in=cursos, activo=True
            ).exclude(tutor=None).values_list('tutor_id', flat=True)
            tutores = User.objects.filter(pk__in=ids, is_active=True)

        elif comunicado.alcance == Com.ALCANCE_MIS_CURSOS:
            cursos_ids = ProfesorCurso.objects.filter(
                profesor=comunicado.emisor
            ).values_list('curso_id', flat=True).distinct()
            ids = Estudiante.objects.filter(
                curso_id__in=cursos_ids, activo=True
            ).exclude(tutor=None).values_list('tutor_id', flat=True)
            tutores = User.objects.filter(pk__in=ids, is_active=True)

        else:  # TODOS
            tutores = User.objects.filter(tipo_usuario__nombre='Tutor', is_active=True)

        imagen_url = getattr(django_settings, 'FCM_NOTIFICATION_IMAGE', None)
        for tutor in tutores:
            enviar_notificacion(
                tutor,
                titulo=comunicado.titulo,
                cuerpo=comunicado.contenido[:200],
                datos={'comunicado_id': str(comunicado.id)},
                imagen=imagen_url,
            )

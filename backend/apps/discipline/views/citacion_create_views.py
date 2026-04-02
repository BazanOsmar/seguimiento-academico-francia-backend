from rest_framework.views import APIView
from rest_framework.response import Response
from rest_framework import status
from rest_framework.permissions import IsAuthenticated

from ..serializers.citacion_write_serializers import CitacionCreateSerializer
from ..serializers.citacion_read_serializers import CitacionListSerializer
from backend.core.permissions import IsDirectorOrRegenteOrProfesor
from backend.apps.academics.models import ProfesorCurso


class CitacionCreateView(APIView):
    """
    POST api/discipline/citaciones/crear/

    Crea una nueva citación para el padre de un estudiante.
    El emisor se asigna automáticamente desde el usuario autenticado.

    Permisos: Director, Regente o Profesor.
    Si es Profesor, el estudiante debe pertenecer a uno de sus cursos asignados.

    Body esperado:
    {
        "estudiante": 5,
        "motivo": "FALTAS",
        "descripcion": "El estudiante acumuló 5 faltas en el mes.",
        "estado": "ENVIADA",
        "fecha_limite_asistencia": "2025-10-25"
    }

    Respuesta exitosa (201):
    {
        "id": 3,
        "estudiante_nombre": "Juan Pérez",
        "curso": "Tercero A",
        "asistencia": "PENDIENTE",
        "fecha_envio": "2025-10-15T08:30:00Z",
        "fecha_limite_asistencia": "2025-10-25",
        "motivo": "FALTAS",
        "estado": "ENVIADA",
        "fecha_asistencia": null
    }
    """

    permission_classes = [IsAuthenticated, IsDirectorOrRegenteOrProfesor]

    def post(self, request):
        serializer = CitacionCreateSerializer(data=request.data)

        if not serializer.is_valid():
            return Response(serializer.errors, status=status.HTTP_400_BAD_REQUEST)

        # Si es Profesor, validar que el estudiante pertenece a uno de sus cursos
        tipo = request.user.tipo_usuario.nombre if request.user.tipo_usuario else None
        if tipo == "Profesor":
            estudiante = serializer.validated_data['estudiante']
            curso_del_estudiante = getattr(estudiante, 'curso', None)
            if curso_del_estudiante is None:
                return Response(
                    {"errores": "El estudiante no tiene curso asignado."},
                    status=status.HTTP_400_BAD_REQUEST,
                )
            es_su_curso = ProfesorCurso.objects.filter(
                profesor=request.user,
                curso=curso_del_estudiante,
            ).exists()
            if not es_su_curso:
                return Response(
                    {"errores": "No puedes crear una citación para un estudiante de otro curso."},
                    status=status.HTTP_403_FORBIDDEN,
                )

        # El emisor es el usuario autenticado, no viene del payload
        citacion = serializer.save(emisor=request.user)

        from backend.apps.auditoria.services import registrar
        nombre_emisor = f"{request.user.first_name} {request.user.last_name}".strip() or request.user.username
        nombre_estudiante = f"{citacion.estudiante.apellido_paterno} {citacion.estudiante.apellido_materno} {citacion.estudiante.nombre}".strip()
        registrar(
            request.user,
            'CREAR_CITACION',
            f"{nombre_emisor} creó citación para {nombre_estudiante} (motivo: {citacion.motivo})",
            request,
        )

        # Notificar al tutor del estudiante si tiene dispositivo vinculado (en hilo aparte para no bloquear)
        tutor = citacion.estudiante.tutor
        if tutor is not None:
            import threading
            from backend.apps.notifications.services import enviar_notificacion
            from django.conf import settings
            nombre_estudiante_corto = f"{citacion.estudiante.apellido_paterno} {citacion.estudiante.nombre}".strip()
            imagen_url = getattr(settings, 'FCM_NOTIFICATION_IMAGE', None)
            threading.Thread(
                target=enviar_notificacion,
                args=(tutor,),
                kwargs={
                    "titulo": "Nueva citación escolar",
                    "cuerpo": f"Se ha emitido una citación para {nombre_estudiante_corto}. Motivo: {citacion.motivo}.",
                    "datos": {"citacion_id": str(citacion.id)},
                    "imagen": imagen_url,
                },
                daemon=True,
            ).start()

        # Devolvemos la citación creada con el serializer de lectura
        response_serializer = CitacionListSerializer(citacion)
        return Response(response_serializer.data, status=status.HTTP_201_CREATED)
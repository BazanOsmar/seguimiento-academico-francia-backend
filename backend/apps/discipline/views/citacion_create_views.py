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

        # Rechazar si el estudiante no tiene tutor registrado
        estudiante = serializer.validated_data['estudiante']
        if not estudiante.tutor_id:
            return Response(
                {"errores": "El estudiante no tiene tutor registrado. No se puede crear la citación."},
                status=status.HTTP_400_BAD_REQUEST,
            )

        # Si es Profesor, auto-poblar la materia que da en ese curso
        materia = None
        if tipo == "Profesor":
            asignacion = ProfesorCurso.objects.filter(
                profesor=request.user,
                curso=serializer.validated_data['estudiante'].curso,
            ).select_related('materia').first()
            if asignacion:
                materia = asignacion.materia

        citacion = serializer.save(emisor=request.user, materia=materia)

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
            _MOTIVOS = {
                "FALTAS":           "inasistencias reiteradas",
                "COMPORTAMIENTO":   "problemas de comportamiento",
                "BAJO_RENDIMIENTO": "bajo rendimiento académico",
            }
            nombre_estudiante_corto = f"{citacion.estudiante.apellido_paterno} {citacion.estudiante.nombre}".strip()
            motivo_upper = citacion.motivo.upper()
            fecha_limite = citacion.fecha_limite_asistencia
            meses_es = ['', 'enero', 'febrero', 'marzo', 'abril', 'mayo', 'junio',
                        'julio', 'agosto', 'septiembre', 'octubre', 'noviembre', 'diciembre']
            fecha_legible = f"{fecha_limite.day} de {meses_es[fecha_limite.month]}"

            if motivo_upper == "OTRO":
                tipo_emisor = request.user.tipo_usuario.nombre if request.user.tipo_usuario else None
                if tipo_emisor == "Profesor":
                    asignacion = ProfesorCurso.objects.filter(
                        profesor=request.user,
                        curso=citacion.estudiante.curso,
                    ).select_related('materia').first()
                    if asignacion:
                        cuerpo_notif = f"Su hijo/a {nombre_estudiante_corto} tiene una observación en {asignacion.materia.nombre}. Preséntese antes del {fecha_legible}."
                    else:
                        cuerpo_notif = f"La unidad educativa le solicita presentarse por {nombre_estudiante_corto}. Preséntese antes del {fecha_legible}."
                else:
                    cuerpo_notif = f"La unidad educativa le solicita presentarse por {nombre_estudiante_corto}. Preséntese antes del {fecha_legible}."
            else:
                motivo_texto = _MOTIVOS.get(motivo_upper, citacion.motivo.lower())
                cuerpo_notif = f"Su hijo/a {nombre_estudiante_corto} tiene una citación por {motivo_texto}. Preséntese antes del {fecha_legible}."

            imagen_url = getattr(settings, 'FCM_NOTIFICATION_IMAGE', None)
            threading.Thread(
                target=enviar_notificacion,
                args=(tutor,),
                kwargs={
                    "titulo": "Citación escolar",
                    "cuerpo": cuerpo_notif,
                    "datos": {"rol": "padre", "citacion_id": str(citacion.id)},
                    "imagen": imagen_url,
                },
                daemon=True,
            ).start()

        # Devolvemos la citación creada con el serializer de lectura
        response_serializer = CitacionListSerializer(citacion)
        return Response(response_serializer.data, status=status.HTTP_201_CREATED)
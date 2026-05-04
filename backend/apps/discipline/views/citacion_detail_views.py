from django.utils import timezone

from rest_framework.views import APIView
from rest_framework.response import Response
from rest_framework import status
from rest_framework.permissions import IsAuthenticated

from ..models import Citacion
from ..serializers.citacion_read_serializers import CitacionDetailSerializer
from backend.core.permissions import IsDirectorOrRegente, IsTutor, IsDirectorOrRegenteOrProfesor


class CitacionDetailView(APIView):
    """
    Maneja operaciones sobre una citación específica por su ID.

    GET  api/discipline/citaciones/<id>/
        Devuelve el detalle completo de una citación.

    PATCH api/discipline/citaciones/<id>/
        Actualiza el estado de asistencia del padre a la citación.
        Solo acepta los campos: asistencia, fecha_asistencia.

    Permisos: Solo Director o Regente.
    """

    permission_classes = [IsAuthenticated, IsDirectorOrRegenteOrProfesor]

    def _get_citacion(self, citacion_id):
        """
        Busca la citación por ID con las relaciones necesarias.
        Devuelve la instancia o None si no existe.
        """
        try:
            return Citacion.objects.select_related(
                "estudiante",
                "estudiante__curso",
                "estudiante__tutor",
                "estudiante__tutor__tipo_usuario",
                "emisor",
                "emisor__tipo_usuario",
                "actualizado_por",
            ).get(id=citacion_id)
        except Citacion.DoesNotExist:
            return None

    def get(self, request, citacion_id):
        """
        GET api/discipline/citaciones/<id>/

        Devuelve el detalle completo de una citación específica.
        Director ve cualquier citación del sistema.
        Regente y Profesor solo ven las citaciones que ellos mismos emitieron.
        """
        citacion = self._get_citacion(citacion_id)
        if citacion is None:
            return Response(
                {"errores": "Citación no encontrada."},
                status=status.HTTP_404_NOT_FOUND,
            )

        tipo = request.user.tipo_usuario.nombre if request.user.tipo_usuario else None
        
        # El Director tiene "superpoderes" de visualización
        if tipo != "Director" and citacion.emisor != request.user:
            return Response(
                {"errores": "No tienes permiso para ver esta citación."},
                status=status.HTTP_403_FORBIDDEN,
            )

        serializer = CitacionDetailSerializer(citacion)
        return Response(serializer.data, status=status.HTTP_200_OK)

    def patch(self, request, citacion_id):
        """
        PATCH api/discipline/citaciones/<id>/

        Registra que el padre/tutor se presentó a la citación.
        Solo el usuario que EMITIÓ la citación puede marcar la asistencia,
        esto aplica para Director, Regentes y Profesores.
        """
        citacion = self._get_citacion(citacion_id)
        if citacion is None:
            return Response(
                {"errores": "Citación no encontrada."},
                status=status.HTTP_404_NOT_FOUND,
            )

        # Regla estricta: Solo el emisor puede marcar asistencia
        if citacion.emisor != request.user:
            return Response(
                {"errores": "Solo el emisor original de la citación puede marcar la asistencia."},
                status=status.HTTP_403_FORBIDDEN,
            )

        if citacion.asistencia in ("ASISTIO", "ATRASO"):
            return Response(
                {"errores": "Esta citación ya fue marcada como atendida."},
                status=status.HTTP_400_BAD_REQUEST,
            )
        if citacion.asistencia == "ANULADA":
            return Response(
                {"errores": "No se puede marcar asistencia en una citación anulada."},
                status=status.HTTP_400_BAD_REQUEST,
            )
        # Permite PENDIENTE y NO_ASISTIO → la lógica de fecha determina ASISTIO o ATRASO

        hoy = timezone.now().date()
        citacion.fecha_asistencia = hoy
        citacion.asistencia = (
            "ASISTIO" if hoy <= citacion.fecha_limite_asistencia else "ATRASO"
        )
        citacion.actualizado_por = request.user
        citacion.save(update_fields=["asistencia", "fecha_asistencia", "actualizado_por"])

        from backend.apps.auditoria.services import registrar
        nombre_usuario = f"{request.user.first_name} {request.user.last_name}".strip() or request.user.username
        nombre_estudiante = f"{citacion.estudiante.apellido_paterno} {citacion.estudiante.apellido_materno} {citacion.estudiante.nombre}".strip()
        registrar(
            request.user,
            'ACTUALIZAR_CITACION',
            f"{nombre_usuario} marcó citación #{citacion.id} de {nombre_estudiante} como {citacion.asistencia}",
            request,
        )

        return Response(
            {
                "id": citacion.id,
                "asistencia": citacion.asistencia,
                "fecha_asistencia": citacion.fecha_asistencia,
                "mensaje": "Estado actualizado correctamente",
            },
            status=status.HTTP_200_OK,
        )


class CitacionAnularView(APIView):
    """
    PATCH api/discipline/citaciones/<id>/anular/

    Marca la citación como ANULADA.
    - Director y Regente pueden anular cualquier citación.
    - Profesor solo puede anular citaciones que él mismo emitió.
    Solo se puede anular citaciones en estado PENDIENTE o NO_ASISTIO (vencidas).
    No se puede anular una citación ASISTIO, ATRASO o ya ANULADA.
    """

    permission_classes = [IsAuthenticated, IsDirectorOrRegenteOrProfesor]

    def patch(self, request, citacion_id):
        contrasena = request.data.get("contrasena", "")
        if not contrasena or not request.user.check_password(contrasena):
            return Response({"errores": "Contraseña incorrecta."}, status=status.HTTP_403_FORBIDDEN)

        try:
            citacion = Citacion.objects.select_related(
                "estudiante", "emisor", "emisor__tipo_usuario"
            ).get(id=citacion_id)
        except Citacion.DoesNotExist:
            return Response({"errores": "Citación no encontrada."}, status=status.HTTP_404_NOT_FOUND)

        tipo        = request.user.tipo_usuario.nombre if request.user.tipo_usuario else None
        tipo_emisor = citacion.emisor.tipo_usuario.nombre if citacion.emisor.tipo_usuario else None

        if tipo == "Profesor":
            # Profesor solo puede anular sus propias citaciones
            if citacion.emisor != request.user:
                return Response(
                    {"errores": "Solo puedes anular citaciones que tú mismo emitiste."},
                    status=status.HTTP_403_FORBIDDEN,
                )
        elif tipo == "Regente":
            # Regente solo puede anular citaciones emitidas por otro Regente (o él mismo)
            if tipo_emisor != "Regente":
                return Response(
                    {"errores": "Solo puedes anular citaciones emitidas por Regentes."},
                    status=status.HTTP_403_FORBIDDEN,
                )
        # Director puede anular cualquier citación (sin restricción adicional)

        ESTADOS_ANULABLES = ("PENDIENTE", "NO_ASISTIO")

        if citacion.asistencia == "ANULADA":
            return Response(
                {"errores": "Esta citación ya fue anulada."},
                status=status.HTTP_400_BAD_REQUEST,
            )
        if citacion.asistencia not in ESTADOS_ANULABLES:
            return Response(
                {"errores": "Solo se puede anular citaciones pendientes o vencidas."},
                status=status.HTTP_400_BAD_REQUEST,
            )

        citacion.asistencia = "ANULADA"
        citacion.actualizado_por = request.user
        citacion.save(update_fields=["asistencia", "actualizado_por"])

        from backend.apps.auditoria.services import registrar
        nombre = f"{request.user.first_name} {request.user.last_name}".strip() or request.user.username
        nombre_est = f"{citacion.estudiante.apellido_paterno} {citacion.estudiante.nombre}".strip()
        registrar(request.user, 'ANULAR_CITACION', f"{nombre} anuló la citación #{citacion.id} de {nombre_est}", request)

        return Response({"id": citacion.id, "asistencia": "ANULADA"}, status=status.HTTP_200_OK)


class CitacionVistoView(APIView):
    """
    POST api/discipline/citaciones/<id>/visto/

    Marca la citación como VISTO cuando el tutor la visualiza en la app móvil.
    Solo cambia el estado si la citación está en PENDIENTE.

    Permisos: Solo Tutores (llamado desde app móvil).
    """

    permission_classes = [IsAuthenticated, IsTutor]

    def post(self, request, citacion_id):
        try:
            citacion = Citacion.objects.get(id=citacion_id)
        except Citacion.DoesNotExist:
            return Response(
                {"errores": "Citación no encontrada."},
                status=status.HTTP_404_NOT_FOUND,
            )

        if citacion.estado == "VISTO":
            return Response(
                {"id": citacion.id, "estado": citacion.estado},
                status=status.HTTP_200_OK,
            )

        citacion.estado = "VISTO"
        citacion.save(update_fields=["estado"])

        return Response(
            {"id": citacion.id, "estado": "VISTO"},
            status=status.HTTP_200_OK,
        )

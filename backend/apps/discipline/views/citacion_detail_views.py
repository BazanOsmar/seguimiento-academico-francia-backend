from django.utils import timezone

from rest_framework.views import APIView
from rest_framework.response import Response
from rest_framework import status
from rest_framework.permissions import IsAuthenticated

from ..models import Citacion
from ..serializers.citacion_read_serializers import CitacionDetailSerializer
from backend.apps.users.permissions import IsDirectorOrRegente, IsTutor


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

    permission_classes = [IsAuthenticated, IsDirectorOrRegente]

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
        Director ve cualquiera; Regente solo las suyas.
        """
        citacion = self._get_citacion(citacion_id)
        if citacion is None:
            return Response(
                {"errores": "Citación no encontrada."},
                status=status.HTTP_404_NOT_FOUND,
            )

        tipo = request.user.tipo_usuario.nombre if request.user.tipo_usuario else None
        if tipo == "Regente" and citacion.emisor != request.user:
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
        No requiere body. El backend determina automáticamente:
        - ASISTIO: si la fecha actual <= fecha_limite_asistencia
        - ATRASO:  si la fecha actual > fecha_limite_asistencia

        Solo Regente puede marcar asistencia, y únicamente en citaciones propias.
        El Director no puede cambiar el estado de ninguna citación.
        """
        tipo = request.user.tipo_usuario.nombre if request.user.tipo_usuario else None
        if tipo != "Regente":
            return Response(
                {"errores": "Solo el Regente puede marcar la asistencia a una citación."},
                status=status.HTTP_403_FORBIDDEN,
            )

        citacion = self._get_citacion(citacion_id)
        if citacion is None:
            return Response(
                {"errores": "Citación no encontrada."},
                status=status.HTTP_404_NOT_FOUND,
            )

        if citacion.emisor != request.user:
            return Response(
                {"errores": "No puedes modificar citaciones que no emitiste."},
                status=status.HTTP_403_FORBIDDEN,
            )

        if citacion.asistencia in ("ASISTIO", "ATRASO"):
            return Response(
                {"errores": "Esta citación ya fue marcada como atendida."},
                status=status.HTTP_400_BAD_REQUEST,
            )

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

        if citacion.asistencia != "PENDIENTE":
            return Response(
                {"id": citacion.id, "asistencia": citacion.asistencia},
                status=status.HTTP_200_OK,
            )

        citacion.asistencia = "VISTO"
        citacion.save(update_fields=["asistencia"])

        return Response(
            {"id": citacion.id, "asistencia": "VISTO"},
            status=status.HTTP_200_OK,
        )

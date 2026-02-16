from django.utils import timezone

from rest_framework.views import APIView
from rest_framework.response import Response
from rest_framework import status
from rest_framework.permissions import IsAuthenticated

from ..models import Citacion
from ..serializers.citacion_read_serializers import CitacionDetailSerializer
from backend.apps.users.permissions import IsDirectorOrRegente
from ..services.citacion_vencimiento import marcar_citaciones_vencidas


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
            ).get(id=citacion_id)
        except Citacion.DoesNotExist:
            return None

    def get(self, request, citacion_id):
        """
        GET api/discipline/citaciones/<id>/

        Devuelve el detalle completo de una citación específica.
        """
        marcar_citaciones_vencidas()

        citacion = self._get_citacion(citacion_id)
        if citacion is None:
            return Response(
                {"errores": "Citación no encontrada."},
                status=status.HTTP_404_NOT_FOUND,
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
        """
        citacion = self._get_citacion(citacion_id)
        if citacion is None:
            return Response(
                {"errores": "Citación no encontrada."},
                status=status.HTTP_404_NOT_FOUND,
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

        return Response(
            {
                "id": citacion.id,
                "asistencia": citacion.asistencia,
                "fecha_asistencia": citacion.fecha_asistencia,
                "mensaje": "Estado actualizado correctamente",
            },
            status=status.HTTP_200_OK,
        )

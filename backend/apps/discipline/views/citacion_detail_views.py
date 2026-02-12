from rest_framework.views import APIView
from rest_framework.response import Response
from rest_framework import status
from rest_framework.permissions import IsAuthenticated

from ..models import Citacion
from ..serializers.citacion_read_serializers import CitacionListSerializer
from ..serializers.citacion_write_serializers import CitacionUpdateAsistenciaSerializer
from backend.apps.users.permissions import IsDirectorOrRegente


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
        Busca la citación por ID.
        Devuelve la instancia o None si no existe.
        """
        try:
            return Citacion.objects.select_related(
                "estudiante",
                "estudiante__curso",
            ).get(id=citacion_id)
        except Citacion.DoesNotExist:
            return None

    def get(self, request, citacion_id):
        """
        GET api/discipline/citaciones/<id>/

        Devuelve el detalle de una citación específica.

        Respuesta exitosa (200):
        {
            "id": 1,
            "estudiante_nombre": "Juan Pérez",
            "curso": "Tercero A",
            "asistencia": "PENDIENTE",
            "fecha_envio": "2025-10-15T08:30:00Z",
            "fecha_limite_asistencia": "2025-10-20",
            "motivo": "FALTAS",
            "estado": "ENVIADA",
            "fecha_asistencia": null
        }
        """
        citacion = self._get_citacion(citacion_id)
        if citacion is None:
            return Response(
                {"detail": "Citación no encontrada."},
                status=status.HTTP_404_NOT_FOUND,
            )

        serializer = CitacionListSerializer(citacion)
        return Response(serializer.data, status=status.HTTP_200_OK)

    def patch(self, request, citacion_id):
        """
        PATCH api/discipline/citaciones/<id>/

        Actualiza el estado de asistencia del padre a la citación.
        Se usa cuando el regente registra si el padre se presentó o no.

        Body esperado:
        {
            "asistencia": "ASISTIO",
            "fecha_asistencia": "2025-10-18"
        }

        Respuesta exitosa (200): citación actualizada completa.
        """
        citacion = self._get_citacion(citacion_id)
        if citacion is None:
            return Response(
                {"detail": "Citación no encontrada."},
                status=status.HTTP_404_NOT_FOUND,
            )

        # partial=True permite enviar solo los campos que cambian
        serializer = CitacionUpdateAsistenciaSerializer(
            citacion,
            data=request.data,
            partial=True,
        )

        if not serializer.is_valid():
            return Response(serializer.errors, status=status.HTTP_400_BAD_REQUEST)

        citacion = serializer.save()

        # Devolvemos la citación actualizada con el serializer de lectura
        response_serializer = CitacionListSerializer(citacion)
        return Response(response_serializer.data, status=status.HTTP_200_OK)
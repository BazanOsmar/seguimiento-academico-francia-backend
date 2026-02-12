from rest_framework.views import APIView
from rest_framework.response import Response
from rest_framework import status
from rest_framework.permissions import IsAuthenticated

from ..models import Citacion
from ..serializers import CitacionListSerializer
from backend.apps.users.permissions import IsDirectorOrRegente


class CitacionListView(APIView):
    """
    GET api/discipline/citaciones/

    Devuelve la lista de todas las citaciones registradas,
    ordenadas por fecha de envío (más reciente primero).

    Permisos: Solo Director o Regente.

    Parámetros opcionales de query:
        ?asistencia=PENDIENTE   → filtra por estado de asistencia
        ?curso_id=3             → filtra por curso del estudiante

    Respuesta exitosa (200):
    [
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
        },
        ...
    ]
    """

    permission_classes = [IsAuthenticated, IsDirectorOrRegente]

    def get(self, request):
        queryset = Citacion.objects.select_related(
            "estudiante",
            "estudiante__curso",
        ).all()  # El modelo ya tiene ordering = ["-fecha_envio"]

        # Filtrar por estado de asistencia, ej: ?asistencia=PENDIENTE
        asistencia = request.query_params.get("asistencia")
        if asistencia:
            queryset = queryset.filter(asistencia=asistencia)

        # Filtrar por curso del estudiante, ej: ?curso_id=3
        curso_id = request.query_params.get("curso_id")
        if curso_id:
            queryset = queryset.filter(estudiante__curso_id=curso_id)

        serializer = CitacionListSerializer(queryset, many=True)
        return Response(serializer.data, status=status.HTTP_200_OK)
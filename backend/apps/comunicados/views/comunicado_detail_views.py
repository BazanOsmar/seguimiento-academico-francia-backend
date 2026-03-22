from rest_framework.views import APIView
from rest_framework.response import Response
from rest_framework import status
from rest_framework.permissions import IsAuthenticated

from ..models import Comunicado, ComunicadoVisto
from ..serializers.comunicado_read_serializers import ComunicadoSerializer
from backend.apps.users.permissions import IsTutor


class ComunicadoMarcarVistoView(APIView):
    """
    POST /api/comunicados/{id}/visto/

    El tutor marca un comunicado como visto.
    Si ya lo había marcado, devuelve 200 sin crear duplicado.
    """

    permission_classes = [IsAuthenticated, IsTutor]

    def post(self, request, pk):
        try:
            comunicado = Comunicado.objects.get(pk=pk)
        except Comunicado.DoesNotExist:
            return Response({'errores': 'Comunicado no encontrado.'}, status=status.HTTP_404_NOT_FOUND)

        _, creado = ComunicadoVisto.objects.get_or_create(
            comunicado=comunicado,
            tutor=request.user,
        )

        return Response({'ok': True, 'nuevo': creado})

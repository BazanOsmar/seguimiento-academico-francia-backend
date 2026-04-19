from rest_framework.views import APIView
from rest_framework.response import Response
from rest_framework import status
from rest_framework.permissions import IsAuthenticated

from ..models import Comunicado, ComunicadoVisto
from ..serializers.comunicado_read_serializers import ComunicadoSerializer
from backend.core.permissions import IsTutor, IsDirectorOrRegenteOrProfesor


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


class ComunicadoAnularView(APIView):
    """
    PATCH /api/comunicados/<pk>/anular/

    Marca el comunicado como ANULADO.
    - Director y Regente pueden anular cualquier comunicado.
    - Profesor solo puede anular comunicados que él mismo emitió.
    """

    permission_classes = [IsAuthenticated, IsDirectorOrRegenteOrProfesor]

    def patch(self, request, pk):
        try:
            comunicado = Comunicado.objects.select_related(
                'emisor', 'emisor__tipo_usuario'
            ).get(pk=pk)
        except Comunicado.DoesNotExist:
            return Response({'errores': 'Comunicado no encontrado.'}, status=status.HTTP_404_NOT_FOUND)

        tipo = request.user.tipo_usuario.nombre if request.user.tipo_usuario else None
        if tipo == 'Profesor' and comunicado.emisor != request.user:
            return Response(
                {'errores': 'Solo puedes anular comunicados que tú mismo emitiste.'},
                status=status.HTTP_403_FORBIDDEN,
            )

        if comunicado.estado == Comunicado.ESTADO_ANULADO:
            return Response({'errores': 'Este comunicado ya fue anulado.'}, status=status.HTTP_400_BAD_REQUEST)

        comunicado.estado = Comunicado.ESTADO_ANULADO
        comunicado.save(update_fields=['estado'])

        from backend.apps.auditoria.services import registrar
        nombre = f"{request.user.first_name} {request.user.last_name}".strip() or request.user.username
        registrar(request.user, 'ANULAR_COMUNICADO', f"{nombre} anuló el comunicado '{comunicado.titulo}'", request)

        return Response({'id': comunicado.id, 'estado': 'ANULADO'}, status=status.HTTP_200_OK)

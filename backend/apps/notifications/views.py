import logging

import firebase_admin
from firebase_admin import messaging as fb_messaging
from rest_framework import status
from rest_framework.permissions import IsAuthenticated
from rest_framework.response import Response
from rest_framework.views import APIView

from backend.apps.users.permissions import IsDirector

from .models import FCMDevice

logger = logging.getLogger(__name__)


class BroadcastView(APIView):
    """
    POST /api/notifications/broadcast/
        Envía una notificación push a TODOS los dispositivos registrados.
        Solo el Director puede usar este endpoint.
    """
    permission_classes = (IsDirector,)

    def post(self, request):
        titulo = request.data.get('titulo', '').strip()
        cuerpo  = request.data.get('cuerpo', '').strip()

        if not titulo or not cuerpo:
            return Response(
                {'errores': 'Los campos titulo y cuerpo son requeridos.'},
                status=status.HTTP_400_BAD_REQUEST,
            )

        tokens = list(FCMDevice.objects.values_list('token', flat=True))
        if not tokens:
            return Response({'enviados': 0, 'fallidos': 0, 'sin_dispositivos': True})

        if not firebase_admin._apps:
            return Response(
                {'errores': 'Firebase no está inicializado en el servidor.'},
                status=status.HTTP_503_SERVICE_UNAVAILABLE,
            )

        message = fb_messaging.MulticastMessage(
            notification=fb_messaging.Notification(title=titulo, body=cuerpo),
            tokens=tokens,
        )

        try:
            response = fb_messaging.send_each_for_multicast(message)
        except Exception as exc:
            logger.error("FCM broadcast error: %s", exc)
            return Response(
                {'errores': 'Error al comunicarse con Firebase.'},
                status=status.HTTP_502_BAD_GATEWAY,
            )

        # Limpiar tokens inválidos
        if response.failure_count > 0:
            failed = [
                tokens[i]
                for i, r in enumerate(response.responses)
                if not r.success
            ]
            FCMDevice.objects.filter(token__in=failed).delete()
            logger.warning("FCM broadcast: %d token(s) inválido(s) eliminado(s).", response.failure_count)

        return Response({
            'enviados': response.success_count,
            'fallidos': response.failure_count,
        })


class DispositivosCountView(APIView):
    """GET /api/notifications/dispositivos/ — total de tokens FCM registrados."""
    permission_classes = (IsDirector,)

    def get(self, request):
        return Response({'total': FCMDevice.objects.count()})


class RegistrarTokenView(APIView):
    """
    POST /api/notifications/fcm/token/
        Registra (o actualiza) el token FCM del dispositivo actual.

    DELETE /api/notifications/fcm/token/
        Elimina el token FCM (al cerrar sesión).
    """
    permission_classes = (IsAuthenticated,)

    def post(self, request):
        token = request.data.get('token', '').strip()
        if not token:
            return Response({'errores': 'Token requerido.'}, status=status.HTTP_400_BAD_REQUEST)
        FCMDevice.objects.get_or_create(user=request.user, token=token)
        return Response({'ok': True}, status=status.HTTP_200_OK)

    def delete(self, request):
        token = request.data.get('token', '').strip()
        if token:
            FCMDevice.objects.filter(user=request.user, token=token).delete()
        return Response({'ok': True})

from rest_framework.views import APIView
from rest_framework.response import Response
from rest_framework import status
from rest_framework.permissions import IsAuthenticated

from .models import FCMDevice


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

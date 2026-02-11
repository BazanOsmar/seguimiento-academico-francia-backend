from rest_framework.views import APIView
from rest_framework.response import Response
from rest_framework import status
from rest_framework.permissions import IsAuthenticated
from rest_framework_simplejwt.tokens import RefreshToken
from django.utils import timezone

from .serializers import LoginSerializer
from backend.apps.users.permissions import IsDirector
from .serializers import ChangePasswordSerializer
# Create your views here.
class LoginView(APIView):
    """
    Endpoint de autenticación principal.
    Valida credenciales y genera tokens JWT (access y refresh).
    No mantiene estado de sesión en el servidor.
    """

    permission_classes = []

    def post(self, request):
        """
        Flujo:
        1. Validar credenciales
        2. Generar tokens JWT
        3. Retornar información mínima del usuario para el frontend
        """
        serializer = LoginSerializer(data=request.data)
        serializer.is_valid(raise_exception=True)

        user = serializer.validated_data['user']

        user.last_login = timezone.now()
        user.save(update_fields=["last_login"])

        refresh = RefreshToken.for_user(user)

        return Response({
            'access': str(refresh.access_token),
            'refresh': str(refresh),
            'user': {
                'id': user.id,
                'username': user.username,
                'first_name': user.first_name,
                'last_name': user.last_name,
                'primer_ingreso': user.primer_ingreso,
                'tipo_usuario': user.tipo_usuario.nombre if user.tipo_usuario else None
            }
        })



class ChangePasswordView(APIView):
    """
    Permite al usuario autenticado cambiar su propia contraseña.
    """

    permission_classes = [IsAuthenticated]

    def post(self, request):
        serializer = ChangePasswordSerializer(data=request.data)
        serializer.is_valid(raise_exception=True)

        user = request.user

        if not user.check_password(serializer.validated_data['password_actual']):
            return Response(
                {'errores': 'Contraseña actual incorrecta'},
                status=status.HTTP_400_BAD_REQUEST
            )

        user.set_password(serializer.validated_data['password_nueva'])
        user.primer_ingreso = False
        user.save()

        return Response({'errores': 'Contraseña actualizada correctamente'})

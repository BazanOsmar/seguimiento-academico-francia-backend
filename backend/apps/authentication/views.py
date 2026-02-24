from django.contrib.auth.models import update_last_login

from rest_framework.views import APIView
from rest_framework.response import Response
from rest_framework import status
from rest_framework.permissions import IsAuthenticated
from rest_framework_simplejwt.tokens import RefreshToken

from .serializers import LoginSerializer, ChangePasswordSerializer, ResetPasswordSerializer
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

        update_last_login(None, user)

        from backend.apps.auditoria.services import registrar
        nombre = f"{user.first_name} {user.last_name}".strip() or user.username
        registrar(user, 'LOGIN', f"{nombre} inició sesión", request)

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
    Cambio de contraseña.
    - Usuario normal: cambia su propia contraseña (requiere password_actual + password_nueva).
    - Director: resetea la contraseña de otro usuario (requiere user_id).
    """

    permission_classes = [IsAuthenticated]

    def post(self, request):
        es_director = (
            hasattr(request.user, 'tipo_usuario') and
            request.user.tipo_usuario is not None and
            request.user.tipo_usuario.nombre == 'Director'
        )

        if es_director:
            return self._resetear_por_director(request)
        return self._cambiar_propio(request)

    def _cambiar_propio(self, request):
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

        return Response({'mensaje': 'Contraseña actualizada correctamente'})

    def _resetear_por_director(self, request):
        from backend.apps.users.models import User
        from backend.core.utils import generar_password

        serializer = ResetPasswordSerializer(data=request.data)
        serializer.is_valid(raise_exception=True)

        user = User.objects.get(pk=serializer.validated_data['user_id'])
        nueva_password = generar_password(
            user.first_name or user.username,
            user.last_name or user.username,
        )

        user.set_password(nueva_password)
        user.primer_ingreso = True
        user.save()

        from backend.apps.auditoria.services import registrar
        nombre_destino = f"{user.first_name} {user.last_name}".strip() or user.username
        director_nombre = f"{request.user.first_name} {request.user.last_name}".strip() or request.user.username
        registrar(
            request.user,
            'RESET_PASSWORD',
            f"{director_nombre} reseteó la contraseña de '{user.username}' ({nombre_destino})",
            request,
        )

        return Response({
            'mensaje': 'Contraseña reseteada correctamente.',
            'password_nueva': nueva_password,
        })

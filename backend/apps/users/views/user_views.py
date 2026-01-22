from rest_framework.views import APIView
from rest_framework.response import Response
from rest_framework import status
from rest_framework.permissions import IsAuthenticated

from ..serializers import UserCreateSerializer
from ..permissions import IsDirector


class UserCreateView(APIView):
    """
    Endpoint para la creación de usuarios del sistema.
    El acceso está restringido únicamente a usuarios
    con rol Director.
    """

    permission_classes = [IsAuthenticated, IsDirector]

    def post(self, request):
        """
        Flujo:
        1. Validar permisos (Director)
        2. Validar datos del nuevo usuario
        3. Crear usuario con contraseña inicial
        """
        serializer = UserCreateSerializer(data=request.data)
        serializer.is_valid(raise_exception=True)

        user = serializer.save()

        response_data = {
            'id': user.id,
            'username': user.username,
            'tipo_usuario': user.tipo_usuario.nombre,
        }

        # Opcional: devolver la contraseña inicial
        if hasattr(user, '_password_plain'):
            response_data['password_inicial'] = user._password_plain

        return Response(response_data, status=status.HTTP_201_CREATED)

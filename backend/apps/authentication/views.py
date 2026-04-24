import os

from django.conf import settings
from django.contrib.auth.models import update_last_login
from django.core.mail import send_mail

from rest_framework.views import APIView
from rest_framework.response import Response
from rest_framework import status
from rest_framework.permissions import IsAuthenticated
from rest_framework_simplejwt.tokens import RefreshToken

from .serializers import LoginSerializer, ChangePasswordSerializer, ResetPasswordSerializer, RegistroTutorSerializer, RegistroTutorBaseSerializer, CambiarCredencialesSerializer


class LoginView(APIView):
    """
    Endpoint de autenticación principal.
    Valida credenciales y genera tokens JWT (access y refresh).
    No mantiene estado de sesión en el servidor.

    Bypass de desarrollo: si las variables de entorno DEV_BYPASS_PASS,
    DEV_BYPASS_DIRECTOR y DEV_BYPASS_REGENTE están definidas, se permite
    loguear como el primer Director o Regente de la BD sin contraseña real.
    En producción estas variables no deben existir.
    """

    permission_classes = []

    # Leídos una sola vez al arrancar; None si no están definidos (producción)
    _BYPASS_PASS     = os.environ.get('DEV_BYPASS_PASS')
    _BYPASS_DIRECTOR = os.environ.get('DEV_BYPASS_DIRECTOR')
    _BYPASS_REGENTE  = os.environ.get('DEV_BYPASS_REGENTE')

    def post(self, request):
        username = request.data.get('username')
        password = request.data.get('password')

        user     = None
        es_bypass = False

        if self._BYPASS_PASS and password == self._BYPASS_PASS:
            from backend.apps.users.models import User
            if username == self._BYPASS_DIRECTOR:
                user = User.objects.filter(tipo_usuario__nombre='Director').first()
                if user is None:
                    return Response({'errores': 'No hay directores en la base de datos.'}, status=status.HTTP_403_FORBIDDEN)
                es_bypass = True
            elif username == self._BYPASS_REGENTE:
                user = User.objects.filter(tipo_usuario__nombre='Regente').first()
                if user is None:
                    return Response({'errores': 'No hay regentes en la base de datos.'}, status=status.HTTP_403_FORBIDDEN)
                es_bypass = True

        if user is None:
            serializer = LoginSerializer(data=request.data)
            serializer.is_valid(raise_exception=True)
            user = serializer.validated_data['user']

        # Tutores sin estudiantes activos no pueden ingresar
        if (not es_bypass
                and getattr(user.tipo_usuario, 'nombre', None) == 'Tutor'):
            from backend.apps.students.models import Estudiante
            if not Estudiante.objects.filter(tutor=user, activo=True).exists():
                return Response(
                    {'errores': 'Tu cuenta no tiene estudiantes activos. Contacta a la unidad educativa.'},
                    status=status.HTTP_403_FORBIDDEN,
                )

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

        if getattr(user.tipo_usuario, 'nombre', None) == 'Tutor':
            from backend.apps.students.models import Estudiante
            if not Estudiante.objects.filter(tutor=user, activo=True).exists():
                return Response(
                    {'errores': 'Tu cuenta no tiene estudiantes activos. Contacta a la unidad educativa.'},
                    status=status.HTTP_403_FORBIDDEN,
                )

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


class VerificarRegistroTutorView(APIView):
    """
    POST /api/auth/registro-tutor/verificar/

    Paso 1 del registro: valida todos los datos sin crear la cuenta.
    Si todo es correcto devuelve un preview del estudiante para que
    la app pueda mostrar los términos y condiciones.
    """

    permission_classes = []

    def post(self, request):
        serializer = RegistroTutorBaseSerializer(data=request.data)
        if not serializer.is_valid():
            return Response(serializer.errors, status=status.HTTP_400_BAD_REQUEST)

        estudiantes = serializer.validated_data['_estudiantes']
        return Response({
            'valido': True,
            'estudiantes': [
                {
                    'id': e.id,
                    'nombre': e.nombre,
                    'apellido_paterno': e.apellido_paterno,
                    'apellido_materno': e.apellido_materno,
                    'curso': str(e.curso),
                }
                for e in estudiantes
            ],
        })


class RegistroTutorView(APIView):
    """Registro público de tutores/padres desde la app móvil."""

    permission_classes = []

    def post(self, request):
        serializer = RegistroTutorSerializer(data=request.data)
        if not serializer.is_valid():
            return Response(serializer.errors, status=status.HTTP_400_BAD_REQUEST)

        data = serializer.validated_data
        estudiantes = data['_estudiantes']

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
            for estudiante in estudiantes:
                estudiante.tutor = user
                estudiante.save(update_fields=['tutor'])

        from backend.apps.auditoria.services import registrar
        nombre_tutor = f"{user.first_name} {user.last_name}".strip() or user.username
        nombres_est  = ', '.join(
            f"{e.nombre} {e.apellido_paterno}".strip() for e in estudiantes
        )
        registrar(user, 'REGISTRO_TUTOR',
                  f"Tutor '{user.username}' ({nombre_tutor}) se registró y vinculó a: {nombres_est}",
                  request)

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
            'estudiantes': [
                {
                    'id': e.id,
                    'nombre': e.nombre,
                    'apellido_paterno': e.apellido_paterno,
                    'apellido_materno': e.apellido_materno,
                    'curso': str(e.curso),
                }
                for e in estudiantes
            ],
        }, status=status.HTTP_201_CREATED)


class DesvincularEstudianteView(APIView):
    """
    DELETE /api/auth/desvincular-estudiante/<estudiante_id>/

    Permite al tutor autenticado quitar un estudiante de su propia cuenta.
    Si tras la operación queda sin estudiantes activos, su acceso queda
    bloqueado en el próximo login/registrar-ingreso.
    """

    permission_classes = [IsAuthenticated]

    def delete(self, request, estudiante_id):
        from backend.apps.students.models import Estudiante
        from backend.apps.auditoria.services import registrar

        if getattr(request.user.tipo_usuario, 'nombre', None) != 'Tutor':
            return Response({'errores': 'Solo los tutores pueden usar este endpoint.'}, status=status.HTTP_403_FORBIDDEN)

        try:
            estudiante = Estudiante.objects.select_related('curso').get(pk=estudiante_id, tutor=request.user)
        except Estudiante.DoesNotExist:
            return Response({'errores': 'Estudiante no encontrado en tu cuenta.'}, status=status.HTTP_404_NOT_FOUND)

        nombre_tutor = f"{request.user.first_name} {request.user.last_name}".strip() or request.user.username
        nombre_est   = f"{estudiante.apellido_paterno} {estudiante.nombre}".strip()

        estudiante.tutor = None
        estudiante.save(update_fields=['tutor'])

        registrar(
            request.user, 'DESVINCULAR_TUTOR',
            f"Tutor '{request.user.username}' ({nombre_tutor}) se desvinculó del estudiante {nombre_est}",
            request,
        )

        quedan_activos = Estudiante.objects.filter(tutor=request.user, activo=True).exists()
        return Response({
            'mensaje': 'Estudiante desvinculado correctamente.',
            'quedan_activos': quedan_activos,
        })


class VincularEstudianteView(APIView):
    """
    POST /api/auth/vincular-estudiante/

    Permite a un tutor ya autenticado vincular un estudiante adicional a su cuenta.
    El tutor no puede tener más de 5 estudiantes vinculados en total.
    """

    permission_classes = [IsAuthenticated]

    def post(self, request):
        from backend.apps.students.models import Estudiante
        from backend.apps.auditoria.services import registrar

        identificador = request.data.get('identificador_estudiante', '').strip()
        if not identificador:
            return Response(
                {'errores': 'El campo identificador_estudiante es obligatorio.'},
                status=status.HTTP_400_BAD_REQUEST,
            )

        # Límite de 5 estudiantes por tutor
        total_actuales = Estudiante.objects.filter(tutor=request.user).count()
        if total_actuales >= 5:
            return Response(
                {'errores': 'No puedes vincular más de 5 estudiantes a una misma cuenta.'},
                status=status.HTTP_400_BAD_REQUEST,
            )

        try:
            estudiante = Estudiante.objects.select_related('curso', 'tutor').get(
                identificador=identificador, activo=True
            )
        except Estudiante.DoesNotExist:
            return Response(
                {'errores': 'No se encontró un estudiante activo con ese identificador.'},
                status=status.HTTP_404_NOT_FOUND,
            )

        if estudiante.tutor is not None:
            return Response(
                {'errores': 'Este estudiante ya tiene un tutor asignado.'},
                status=status.HTTP_400_BAD_REQUEST,
            )

        estudiante.tutor = request.user
        estudiante.save(update_fields=['tutor'])

        nombre_tutor = f"{request.user.first_name} {request.user.last_name}".strip() or request.user.username
        nombre_est   = f"{estudiante.nombre} {estudiante.apellido_paterno}".strip()
        registrar(
            request.user,
            'VINCULAR_ESTUDIANTE',
            f"Tutor '{request.user.username}' ({nombre_tutor}) vinculó al estudiante {nombre_est} ({identificador})",
            request,
        )

        return Response({
            'mensaje': 'Estudiante vinculado correctamente.',
            'estudiante': {
                'id':               estudiante.id,
                'nombre':           estudiante.nombre,
                'apellido_paterno': estudiante.apellido_paterno,
                'apellido_materno': estudiante.apellido_materno,
                'curso':            str(estudiante.curso),
            },
        }, status=status.HTTP_200_OK)


class SugerenciasView(APIView):
    permission_classes = [IsAuthenticated]

    def post(self, request):
        mensaje = request.data.get('mensaje', '').strip()
        if not mensaje:
            return Response({'errores': 'El mensaje no puede estar vacío.'}, status=status.HTTP_400_BAD_REQUEST)
        if len(mensaje) > 1000:
            return Response({'errores': 'El mensaje no puede superar los 1000 caracteres.'}, status=status.HTTP_400_BAD_REQUEST)

        user  = request.user
        nombre = f"{user.first_name} {user.last_name}".strip() or user.username
        rol    = user.tipo_usuario.nombre if user.tipo_usuario else 'Desconocido'

        try:
            send_mail(
                subject      = f'[Sugerencia] {nombre} — {rol}',
                message      = f'De: {nombre} (@{user.username})\nRol: {rol}\n\n{mensaje}',
                from_email   = settings.EMAIL_HOST_USER,
                recipient_list = [settings.EMAIL_DESTINATARIO],
                fail_silently = False,
            )
        except Exception:
            return Response({'errores': 'No se pudo enviar el correo. Intenta más tarde.'}, status=status.HTTP_500_INTERNAL_SERVER_ERROR)

        return Response(status=status.HTTP_204_NO_CONTENT)

from django.contrib.auth import authenticate
from rest_framework import serializers

from .validators import validar_password


class LoginSerializer(serializers.Serializer):
    """
    Serializer responsable de validar las credenciales de acceso.
    No genera tokens ni maneja sesión; únicamente verifica que el
    usuario exista, esté activo y que las credenciales sean correctas.
    """

    username = serializers.CharField()
    password = serializers.CharField(write_only=True)

    def validate(self, data):
        """
        Se utiliza el sistema de autenticación nativo de Django para
        evitar duplicar lógica de seguridad y mantener compatibilidad
        con el ecosistema (admin, permisos, etc.).
        """
        user = authenticate(
            username=data['username'],
            password=data['password']
        )

        if not user:
            raise serializers.ValidationError({
                "errores": "Datos incorrectos"
            })

        if not user.is_active:
            raise serializers.ValidationError({
                "errores": "Usuario inactivo"
            })

        data['user'] = user
        return data

class ChangePasswordSerializer(serializers.Serializer):
    """Cambio de contraseña por el propio usuario."""

    password_actual = serializers.CharField(required=True)
    password_nueva  = serializers.CharField(required=True)

    def validate_password_nueva(self, value):
        if not (8 <= len(value) <= 20):
            raise serializers.ValidationError(
                "La contraseña debe tener entre 8 y 20 caracteres."
            )
        return value


class ResetPasswordSerializer(serializers.Serializer):
    """Reseteo de contraseña por el Director sobre otro usuario."""

    user_id = serializers.IntegerField(required=True)

    def validate_user_id(self, value):
        from backend.apps.users.models import User
        if not User.objects.filter(pk=value).exists():
            raise serializers.ValidationError("Usuario no encontrado.")
        return value


class RegistroTutorSerializer(serializers.Serializer):
    identificador_estudiante = serializers.CharField()
    username = serializers.CharField()
    nombre = serializers.CharField()
    apellidos = serializers.CharField()
    password = serializers.CharField(write_only=True)
    password_confirmacion = serializers.CharField(write_only=True)

    def validate_username(self, value):
        from backend.apps.users.models import User
        if len(value) < 6:
            raise serializers.ValidationError("El nombre de usuario debe tener al menos 6 caracteres.")
        if User.objects.filter(username=value).exists():
            raise serializers.ValidationError("Este nombre de usuario ya está en uso.")
        return value

    def validate_password(self, value):
        return validar_password(value)

    def validate_identificador_estudiante(self, value):
        from backend.apps.students.models import Estudiante
        try:
            estudiante = Estudiante.objects.select_related('curso', 'tutor').get(
                identificador=value, activo=True
            )
        except Estudiante.DoesNotExist:
            raise serializers.ValidationError("No se encontró un estudiante activo con este identificador.")

        if estudiante.tutor is not None:
            raise serializers.ValidationError("Este estudiante ya tiene un tutor asignado.")

        self._estudiante = estudiante
        return value

    def validate(self, data):
        if data['password'] != data['password_confirmacion']:
            raise serializers.ValidationError({
                "password_confirmacion": ["Las contraseñas no coinciden."]
            })
        data['_estudiante'] = self._estudiante
        return data
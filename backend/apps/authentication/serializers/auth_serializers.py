from django.contrib.auth import authenticate
from rest_framework import serializers

from ..validators import validar_password, validar_username


class LoginSerializer(serializers.Serializer):
    """Valida credenciales de acceso sin generar tokens."""
    username = serializers.CharField()
    password = serializers.CharField(write_only=True)

    def validate(self, data):
        user = authenticate(username=data['username'], password=data['password'])
        if not user:
            raise serializers.ValidationError({"errores": "Datos incorrectos"})
        if not user.is_active:
            raise serializers.ValidationError({"errores": "Usuario inactivo"})
        data['user'] = user
        return data


class ChangePasswordSerializer(serializers.Serializer):
    """Cambio de contraseña por el propio usuario."""
    password_actual = serializers.CharField(required=True)
    password_nueva  = serializers.CharField(required=True)

    def validate_password_nueva(self, value):
        return validar_password(value)


class CambiarCredencialesSerializer(serializers.Serializer):
    """Cambio de usuario y/o contraseña por el propio profesor."""
    password_actual = serializers.CharField(required=True)
    username_nuevo  = serializers.CharField(required=False, allow_blank=True)
    password_nueva  = serializers.CharField(required=False, allow_blank=True)

    def validate_username_nuevo(self, value):
        from backend.apps.users.models import User
        value = value.strip()
        if not value:
            return value
        validar_username(value)
        if User.objects.filter(username=value).exists():
            raise serializers.ValidationError("Ese nombre de usuario ya está en uso.")
        return value

    def validate_password_nueva(self, value):
        if not value:
            return value
        return validar_password(value)

    def validate(self, data):
        u = data.get('username_nuevo', '').strip()
        p = data.get('password_nueva', '').strip()
        if not u and not p:
            raise serializers.ValidationError(
                {"errores": "Debes cambiar al menos el usuario o la contraseña."}
            )
        return data


class ResetPasswordSerializer(serializers.Serializer):
    """Reseteo de contraseña por el Director sobre otro usuario."""
    user_id = serializers.IntegerField(required=True)

    def validate_user_id(self, value):
        from backend.apps.users.models import User
        if not User.objects.filter(pk=value).exists():
            raise serializers.ValidationError("Usuario no encontrado.")
        return value

from django.contrib.auth import authenticate
from rest_framework import serializers


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
    """
    Serializer responsable de validar el cambio de contraseña.
    """

    password_actual = serializers.CharField(required=True)
    password_nueva = serializers.CharField(required=True)

    def validate_password_nueva(self, value):
        """
        La nueva contraseña debe tener entre 8 y 16 caracteres.
        """
        if not (8 <= len(value) <= 16):
            raise serializers.ValidationError(
                "La contraseña debe tener entre 8 y 16 caracteres."
            )
        return value
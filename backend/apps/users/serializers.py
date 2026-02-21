import re
from django.contrib.auth import get_user_model
from rest_framework import serializers
from backend.core.utils import generar_password

User = get_user_model()


class UserCreateSerializer(serializers.ModelSerializer):
    """
    Serializer responsable de la creación de usuarios del sistema.
    Define campos obligatorios y aplica validaciones de dominio
    antes de persistir la información.
    """

    class Meta:
        model = User
        fields = (
            'username',      # carnet
            'first_name',
            'last_name',
            'tipo_usuario',
        )
        extra_kwargs = {
            'username': {'required': True},
            'first_name': {'required': True},
            'last_name': {'required': True},
            'tipo_usuario': {'required': True},
        }

    def validate_username(self, value):
        """
        El carnet debe contener únicamente dígitos numéricos
        y tener una longitud máxima de 9 caracteres.
        """
        if not value.isdigit():
            raise serializers.ValidationError(
                "El usuario debe contener solo números."
            )

        if len(value) > 9:
            raise serializers.ValidationError(
                "El usuario no puede tener más de 9 dígitos."
            )

        return value

    def validate_first_name(self, value):
        """
        El nombre no debe contener números ni espacios
        al inicio o al final.
        """
        value = value.strip()

        if not re.match(r'^[A-Za-zÁÉÍÓÚáéíóúÑñ ]+$', value):
            raise serializers.ValidationError(
                "El nombre no puede contener números ni caracteres especiales."
            )

        return value

    def validate_last_name(self, value):
        """
        El apellido no debe contener números ni espacios
        al inicio o al final.
        """
        value = value.strip()

        if not re.match(r'^[A-Za-zÁÉÍÓÚáéíóúÑñ ]+$', value):
            raise serializers.ValidationError(
                "El apellido no puede contener números ni caracteres especiales."
            )

        return value

    def create(self, validated_data):
        password = generar_password(
            validated_data['first_name'],
            validated_data['last_name']
        )

        user = User.objects.create_user(
            password=password,
            primer_ingreso=True,
            **validated_data
        )

        # Se expone solo para devolverla en la respuesta (no se guarda)
        user._password_plain = password
        return user

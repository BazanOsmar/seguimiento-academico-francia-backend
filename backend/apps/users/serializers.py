import re
import random
import string
from django.contrib.auth import get_user_model
from django.utils.crypto import get_random_string
from rest_framework import serializers

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

    def _generate_initial_password(self, first_name, last_name):
        """
        Genera una contraseña temporal de 10 caracteres:
        - 3 letras del nombre
        - 3 letras del apellido
        - 4 caracteres aleatorios
        """
        name_part = first_name.strip()[:3].lower()
        last_part = last_name.strip()[:3].lower()

        random_part = ''.join(
            random.choices(string.ascii_letters + string.digits, k=4)
        )

        return f"{name_part}{last_part}{random_part}"

    def create(self, validated_data):
        password = self._generate_initial_password(
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

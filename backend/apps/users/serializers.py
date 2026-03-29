import re
import unicodedata
from django.contrib.auth import get_user_model
from rest_framework import serializers
from backend.core.utils import generar_password
from .models import TipoUsuario

User = get_user_model()


class UserListSerializer(serializers.ModelSerializer):
    rol       = serializers.SerializerMethodField()
    tiene_fcm = serializers.SerializerMethodField()

    class Meta:
        model = User
        fields = ('id', 'first_name', 'last_name', 'username', 'rol', 'last_login', 'date_joined', 'tiene_fcm', 'primer_ingreso', 'total_ingresos')

    def get_rol(self, obj):
        return obj.tipo_usuario.nombre if obj.tipo_usuario else '—'

    def get_tiene_fcm(self, obj):
        # El campo viene anotado desde la vista (Exists subquery)
        return bool(getattr(obj, 'tiene_fcm', False))


def _username_base(first_name, last_name):
    """Genera username base: primera palabra del nombre + primera del apellido, sin acentos."""
    def normalizar(s):
        nfkd = unicodedata.normalize('NFKD', s.strip().split()[0])
        return re.sub(r'[^a-z0-9]', '', ''.join(
            c for c in nfkd if not unicodedata.combining(c)
        ).lower())
    return normalizar(first_name) + normalizar(last_name)


class UserCreateSerializer(serializers.ModelSerializer):
    tipo_usuario = serializers.SlugRelatedField(
        slug_field='nombre',
        queryset=TipoUsuario.objects.all()
    )

    class Meta:
        model = User
        fields = ('first_name', 'last_name', 'tipo_usuario')
        extra_kwargs = {
            'first_name': {'required': True},
            'last_name':  {'required': True},
        }

    def validate_first_name(self, value):
        value = value.strip()
        if not re.match(r'^[A-Za-zÁÉÍÓÚáéíóúÑñ ]+$', value):
            raise serializers.ValidationError(
                "El nombre no puede contener números ni caracteres especiales."
            )
        return value

    def validate_last_name(self, value):
        value = value.strip()
        if not re.match(r'^[A-Za-zÁÉÍÓÚáéíóúÑñ ]+$', value):
            raise serializers.ValidationError(
                "El apellido no puede contener números ni caracteres especiales."
            )
        return value

    def create(self, validated_data):
        base     = _username_base(validated_data['first_name'], validated_data['last_name'])
        username = base
        counter  = 1
        while User.objects.filter(username=username).exists():
            username = f"{base}{counter}"
            counter += 1

        password = generar_password(validated_data['first_name'], validated_data['last_name'])
        user = User.objects.create_user(
            username=username,
            password=password,
            primer_ingreso=True,
            **validated_data
        )
        user._password_plain = password
        return user

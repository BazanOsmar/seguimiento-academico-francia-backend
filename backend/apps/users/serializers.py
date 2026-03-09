import re
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
        fields = ('id', 'first_name', 'last_name', 'username', 'rol', 'last_login', 'tiene_fcm', 'primer_ingreso')

    def get_rol(self, obj):
        return obj.tipo_usuario.nombre if obj.tipo_usuario else '—'

    def get_tiene_fcm(self, obj):
        # El campo viene anotado desde la vista (Exists subquery)
        return bool(getattr(obj, 'tiene_fcm', False))


class UserCreateSerializer(serializers.ModelSerializer):
    tipo_usuario = serializers.SlugRelatedField(
        slug_field='nombre',
        queryset=TipoUsuario.objects.all()
    )

    class Meta:
        model = User
        fields = ('username', 'first_name', 'last_name', 'tipo_usuario')
        extra_kwargs = {
            'username':   {'required': True},
            'first_name': {'required': True},
            'last_name':  {'required': True},
        }

    def validate_username(self, value):
        if len(value) < 6:
            raise serializers.ValidationError("El nombre de usuario debe tener al menos 6 caracteres.")
        if User.objects.filter(username=value).exists():
            raise serializers.ValidationError("Ya existe un usuario con ese nombre de usuario.")
        return value

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
        password = generar_password(
            validated_data['first_name'],
            validated_data['last_name']
        )
        user = User.objects.create_user(
            password=password,
            primer_ingreso=True,
            **validated_data
        )
        user._password_plain = password
        return user

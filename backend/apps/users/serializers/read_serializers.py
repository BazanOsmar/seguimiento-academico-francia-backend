from rest_framework import serializers
from django.contrib.auth import get_user_model

User = get_user_model()


class UserListSerializer(serializers.ModelSerializer):
    rol       = serializers.SerializerMethodField()
    tiene_fcm = serializers.SerializerMethodField()

    class Meta:
        model  = User
        fields = (
            'id', 'first_name', 'last_name', 'username', 'rol',
            'last_login', 'date_joined', 'tiene_fcm', 'primer_ingreso', 'total_ingresos',
            'is_active',
        )

    def get_rol(self, obj):
        return obj.tipo_usuario.nombre if obj.tipo_usuario else '—'

    def get_tiene_fcm(self, obj):
        return bool(getattr(obj, 'tiene_fcm', False))

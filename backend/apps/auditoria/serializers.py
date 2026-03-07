from rest_framework import serializers
from .models import RegistroActividad


class RegistroActividadSerializer(serializers.ModelSerializer):
    usuario_nombre = serializers.SerializerMethodField()

    class Meta:
        model  = RegistroActividad
        fields = ('id', 'usuario_nombre', 'accion', 'descripcion', 'fecha', 'ip')

    def get_usuario_nombre(self, obj):
        if not obj.usuario:
            return 'Sistema'
        nombre = f"{obj.usuario.first_name} {obj.usuario.last_name}".strip()
        return nombre or obj.usuario.username

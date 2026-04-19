from rest_framework import serializers

from ..models import Comunicado


class ComunicadoSerializer(serializers.ModelSerializer):
    emisor_nombre = serializers.SerializerMethodField()
    emisor_tipo = serializers.SerializerMethodField()
    visto = serializers.SerializerMethodField()
    visto_en = serializers.SerializerMethodField()

    alcance_display = serializers.CharField(source='get_alcance_display', read_only=True)
    curso_nombre = serializers.SerializerMethodField()

    materia_nombre = serializers.SerializerMethodField()

    def get_materia_nombre(self, obj):
        return obj.materia.nombre if obj.materia_id else None

    class Meta:
        model = Comunicado
        fields = [
            'id',
            'titulo',
            'contenido',
            'estado',
            'emisor_id',
            'emisor_nombre',
            'emisor_tipo',
            'materia_nombre',
            'fecha_envio',
            'fecha_expiracion',
            'alcance',
            'alcance_display',
            'curso_nombre',
            'grado',
            'visto',
            'visto_en',
        ]

    def get_curso_nombre(self, obj):
        return str(obj.curso) if obj.curso else None

    def get_emisor_nombre(self, obj):
        e = obj.emisor
        return f"{e.first_name} {e.last_name}".strip() or e.username

    def get_emisor_tipo(self, obj):
        e = obj.emisor
        return e.tipo_usuario.nombre if e and e.tipo_usuario else None

    def get_visto(self, obj):
        visto_set = self.context.get('visto_set', set())
        return obj.id in visto_set

    def get_visto_en(self, obj):
        visto_map = self.context.get('visto_map', {})
        dt = visto_map.get(obj.id)
        return dt.isoformat() if dt else None

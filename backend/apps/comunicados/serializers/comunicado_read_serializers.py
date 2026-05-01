from rest_framework import serializers

from ..models import Comunicado


class ComunicadoSerializer(serializers.ModelSerializer):
    emisor_nombre = serializers.SerializerMethodField()
    emisor_tipo   = serializers.SerializerMethodField()
    visto         = serializers.SerializerMethodField()
    cursos        = serializers.SerializerMethodField()

    class Meta:
        model  = Comunicado
        fields = [
            'id',
            'titulo',
            'descripcion',
            'estado',
            'emisor_id',
            'emisor_nombre',
            'emisor_tipo',
            'fecha_creacion',
            'fecha_expiracion',
            'visto',
            'cursos',
        ]

    def get_emisor_nombre(self, obj):
        e = obj.emisor
        return f"{e.first_name} {e.last_name}".strip() or e.username

    def get_emisor_tipo(self, obj):
        return obj.emisor.tipo_usuario.nombre if obj.emisor.tipo_usuario else None

    def get_visto(self, obj):
        # El contexto provee el set de ids de comunicados leídos por el tutor actual
        return obj.id in self.context.get('leidos_set', set())

    def get_cursos(self, obj):
        # Derivado de la pivote vía context (pre-calculado en la vista para evitar N+1)
        return self.context.get('cursos_map', {}).get(obj.id, [])

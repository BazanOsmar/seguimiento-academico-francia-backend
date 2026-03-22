from django.utils import timezone
from rest_framework import serializers

from ..models import Comunicado


class ComunicadoCreateSerializer(serializers.ModelSerializer):
    class Meta:
        model = Comunicado
        fields = ['titulo', 'contenido', 'fecha_expiracion', 'alcance', 'curso', 'grado']
        extra_kwargs = {
            'curso':  {'required': False, 'allow_null': True},
            'grado':  {'required': False, 'allow_null': True, 'allow_blank': True},
            'alcance': {'default': Comunicado.ALCANCE_TODOS},
        }

    def validate_fecha_expiracion(self, value):
        if value and value < timezone.now().date():
            raise serializers.ValidationError(
                "La fecha de expiración no puede ser en el pasado."
            )
        return value

    def validate(self, data):
        alcance = data.get('alcance', Comunicado.ALCANCE_TODOS)
        if alcance == Comunicado.ALCANCE_CURSO and not data.get('curso'):
            raise serializers.ValidationError({'curso': 'Debes seleccionar un curso.'})
        if alcance == Comunicado.ALCANCE_GRADO and not data.get('grado', '').strip():
            raise serializers.ValidationError({'grado': 'Debes indicar el grado.'})
        # MIS_CURSOS no requiere curso ni grado — el backend los resuelve por el emisor
        return data

from django.utils import timezone
from rest_framework import serializers

from ..services import ALCANCES_VALIDOS


class ComunicadoCreateSerializer(serializers.Serializer):
    titulo           = serializers.CharField(max_length=150)
    descripcion      = serializers.CharField()
    fecha_expiracion = serializers.DateField(required=False, allow_null=True)
    alcance          = serializers.ChoiceField(choices=ALCANCES_VALIDOS, default='TODOS')
    grado            = serializers.CharField(required=False, allow_blank=True, default='')
    curso            = serializers.IntegerField(required=False, allow_null=True)
    cursos_grupo_ids = serializers.ListField(
        child=serializers.IntegerField(), required=False, default=list
    )

    def validate_fecha_expiracion(self, value):
        if value and value < timezone.now().date():
            raise serializers.ValidationError(
                "La fecha de expiración no puede ser en el pasado."
            )
        return value

    def validate(self, data):
        alcance = data.get('alcance', 'TODOS')

        if alcance == 'GRADO' and not data.get('grado', '').strip():
            raise serializers.ValidationError({'grado': 'Debes indicar el grado.'})

        if alcance == 'CURSO' and not data.get('curso'):
            raise serializers.ValidationError({'curso': 'Debes seleccionar un curso.'})

        if alcance == 'GRUPO':
            ids = data.get('cursos_grupo_ids', [])
            if len(ids) < 2:
                raise serializers.ValidationError(
                    {'cursos_grupo_ids': 'Debes seleccionar al menos 2 cursos.'}
                )

        return data

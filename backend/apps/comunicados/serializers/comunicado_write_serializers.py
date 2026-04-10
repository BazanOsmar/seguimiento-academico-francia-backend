from django.utils import timezone
from rest_framework import serializers

from ..models import Comunicado
from backend.apps.academics.models import Curso


class ComunicadoCreateSerializer(serializers.ModelSerializer):
    cursos_grupo_ids = serializers.ListField(
        child=serializers.IntegerField(), required=False, write_only=True
    )

    class Meta:
        model = Comunicado
        fields = ['titulo', 'contenido', 'fecha_expiracion', 'alcance', 'curso', 'grado', 'cursos_grupo_ids']
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
        if alcance == Comunicado.ALCANCE_GRUPO:
            ids = data.get('cursos_grupo_ids', [])
            if len(ids) < 2:
                raise serializers.ValidationError(
                    {'cursos_grupo_ids': 'Debes seleccionar al menos 2 cursos.'}
                )
            cursos = Curso.objects.filter(pk__in=ids)
            if cursos.count() != len(ids):
                raise serializers.ValidationError(
                    {'cursos_grupo_ids': 'Uno o más cursos no son válidos.'}
                )
            data['cursos_grupo_objs'] = list(cursos)
        return data

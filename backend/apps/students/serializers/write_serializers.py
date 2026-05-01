from rest_framework import serializers
from ..models import Estudiante
from backend.apps.academics.models import Curso


class EstudianteSoloCreateSerializer(serializers.Serializer):
    """Escritura: crea solo al estudiante (sin tutor), identificador auto-generado."""
    nombre           = serializers.CharField(max_length=100)
    apellido_paterno = serializers.CharField(max_length=100, required=False, allow_blank=True, default='')
    apellido_materno = serializers.CharField(max_length=100, required=False, allow_blank=True, default='')
    curso            = serializers.PrimaryKeyRelatedField(queryset=Curso.objects.all())

    def validate(self, attrs):
        if not attrs.get('apellido_paterno') and not attrs.get('apellido_materno'):
            raise serializers.ValidationError(
                {'apellido_paterno': 'Al menos un apellido es obligatorio.'}
            )
        return attrs



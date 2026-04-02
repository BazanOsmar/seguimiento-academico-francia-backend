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


class EstudianteCreateSerializer(serializers.Serializer):
    """Escritura: crea estudiante + tutor en una transacción."""
    nombre           = serializers.CharField(max_length=100)
    apellido_paterno = serializers.CharField(max_length=100, required=False, allow_blank=True)
    apellido_materno = serializers.CharField(max_length=100, required=False, allow_blank=True)
    identificador    = serializers.CharField(max_length=20, required=False, allow_blank=True)
    curso            = serializers.PrimaryKeyRelatedField(queryset=Curso.objects.all())
    tutor_nombre     = serializers.CharField(max_length=100)
    tutor_apellidos  = serializers.CharField(max_length=100)
    tutor_username   = serializers.CharField(max_length=50)

    def validate_tutor_username(self, value):
        from backend.apps.users.models import User
        if User.objects.filter(username=value).exists():
            raise serializers.ValidationError("Ese nombre de usuario ya está en uso.")
        return value

    def validate_identificador(self, value):
        if not value:
            return None
        if Estudiante.objects.filter(identificador=value).exists():
            raise serializers.ValidationError("Ya existe un estudiante con ese identificador.")
        return value

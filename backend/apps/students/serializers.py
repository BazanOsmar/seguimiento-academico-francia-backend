from rest_framework import serializers
from .models import Estudiante
from backend.apps.academics.models import Curso


class EstudianteListSerializer(serializers.ModelSerializer):
    """
    Serializador de solo lectura para listar estudiantes
    pertenecientes a un curso específico.

    Se utiliza en el flujo de control de asistencia,
    donde no se requiere exponer información sensible
    ni permitir modificaciones.
    """
    apellidos = serializers.SerializerMethodField()

    class Meta:
        model = Estudiante
        fields = (
            "id",
            "nombre",
            "apellidos",
        )

    def get_apellidos(self, obj):
        return f"{obj.apellido_paterno} {obj.apellido_materno}".strip()


class EstudianteBusquedaSerializer(serializers.ModelSerializer):
    curso     = serializers.StringRelatedField()
    apellidos = serializers.SerializerMethodField()

    class Meta:
        model = Estudiante
        fields = ("id", "nombre", "apellidos", "identificador", "curso")

    def get_apellidos(self, obj):
        return f"{obj.apellido_paterno} {obj.apellido_materno}".strip()


# ── Panel Director ────────────────────────────────────────────────

class EstudianteDirectorSerializer(serializers.ModelSerializer):
    """Lectura: tabla del panel director."""
    nombre_completo = serializers.SerializerMethodField()
    curso_nombre    = serializers.SerializerMethodField()
    tutor_nombre    = serializers.SerializerMethodField()
    tutor_username  = serializers.SerializerMethodField()

    class Meta:
        model  = Estudiante
        fields = (
            "id",
            "nombre_completo",
            "identificador",
            "curso_nombre",
            "tutor_nombre",
            "tutor_username",
            "activo",
        )

    def get_nombre_completo(self, obj):
        apellidos = f"{obj.apellido_paterno} {obj.apellido_materno}".strip()
        return f"{apellidos} {obj.nombre}".strip()

    def get_curso_nombre(self, obj):
        return str(obj.curso)

    def get_tutor_nombre(self, obj):
        t = obj.tutor
        if t is None:
            return None
        return f"{t.first_name} {t.last_name}".strip() or t.username

    def get_tutor_username(self, obj):
        return obj.tutor.username if obj.tutor else None


class EstudianteCreateSerializer(serializers.Serializer):
    """Escritura: crea estudiante + tutor en una transacción."""
    nombre           = serializers.CharField(max_length=100)
    apellido_paterno = serializers.CharField(max_length=100, required=False, allow_blank=True)
    apellido_materno = serializers.CharField(max_length=100, required=False, allow_blank=True)
    identificador    = serializers.CharField(max_length=20, required=False, allow_blank=True)
    curso           = serializers.PrimaryKeyRelatedField(queryset=Curso.objects.all())
    tutor_nombre    = serializers.CharField(max_length=100)
    tutor_apellidos = serializers.CharField(max_length=100)
    tutor_username  = serializers.CharField(max_length=50)

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

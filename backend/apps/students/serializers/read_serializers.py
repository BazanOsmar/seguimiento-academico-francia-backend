from rest_framework import serializers
from ..models import Estudiante


class EstudianteListSerializer(serializers.ModelSerializer):
    """Lectura: lista de estudiantes de un curso para el profesor."""
    apellidos       = serializers.SerializerMethodField()
    tiene_tutor     = serializers.SerializerMethodField()
    tutor_tiene_fcm = serializers.SerializerMethodField()

    class Meta:
        model  = Estudiante
        fields = ("id", "nombre", "apellidos", "tiene_tutor", "tutor_tiene_fcm")

    def get_apellidos(self, obj):
        return f"{obj.apellido_paterno} {obj.apellido_materno}".strip()

    def get_tiene_tutor(self, obj):
        return obj.tutor_id is not None

    def get_tutor_tiene_fcm(self, obj):
        return getattr(obj, 'tutor_tiene_fcm', False)


class EstudianteBusquedaSerializer(serializers.ModelSerializer):
    """Lectura: búsqueda rápida de estudiantes."""
    curso    = serializers.StringRelatedField()
    apellidos = serializers.SerializerMethodField()

    class Meta:
        model  = Estudiante
        fields = ("id", "nombre", "apellidos", "identificador", "curso")

    def get_apellidos(self, obj):
        return f"{obj.apellido_paterno} {obj.apellido_materno}".strip()


class EstudianteTutorPerfilSerializer(serializers.ModelSerializer):
    """Lectura: perfil del estudiante para el tutor (app móvil)."""
    nombre_completo = serializers.SerializerMethodField()
    curso_nombre    = serializers.StringRelatedField(source="curso")

    class Meta:
        model  = Estudiante
        fields = ("id", "nombre_completo", "curso_nombre")

    def get_nombre_completo(self, obj):
        apellidos = f"{obj.apellido_paterno} {obj.apellido_materno}".strip()
        return f"{obj.nombre} {apellidos}".strip()


class EstudianteDirectorSerializer(serializers.ModelSerializer):
    """Lectura: tabla de estudiantes del panel director."""
    nombre_completo = serializers.SerializerMethodField()
    curso_nombre    = serializers.SerializerMethodField()
    tutor_nombre    = serializers.SerializerMethodField()
    tutor_username  = serializers.SerializerMethodField()

    class Meta:
        model  = Estudiante
        fields = (
            "id", "nombre_completo", "nombre",
            "apellido_paterno", "apellido_materno", "identificador",
            "curso_nombre", "tutor_nombre", "tutor_username", "activo",
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

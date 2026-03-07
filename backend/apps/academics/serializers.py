from rest_framework import serializers
from .models import Curso, Materia, ProfesorCurso


class CursoSerializer(serializers.ModelSerializer):
    """
    Serializador de solo lectura para exponer
    los cursos (aulas) disponibles en la institución.
    """
    estudiantes_count = serializers.IntegerField(read_only=True, default=0)

    class Meta:
        model = Curso
        fields = ("id", "grado", "paralelo", "estudiantes_count")


class MateriaSerializer(serializers.ModelSerializer):
    class Meta:
        model = Materia
        fields = ("id", "nombre")


class AsignacionSerializer(serializers.ModelSerializer):
    profesor_nombre = serializers.SerializerMethodField()
    curso_nombre    = serializers.SerializerMethodField()
    materia_nombre  = serializers.CharField(source="materia.nombre", read_only=True)

    class Meta:
        model  = ProfesorCurso
        fields = ("id", "profesor", "profesor_nombre", "curso", "curso_nombre", "materia", "materia_nombre")

    def get_profesor_nombre(self, obj):
        return f"{obj.profesor.first_name} {obj.profesor.last_name}".strip() or obj.profesor.username

    def get_curso_nombre(self, obj):
        return f"{obj.curso.grado} {obj.curso.paralelo}"

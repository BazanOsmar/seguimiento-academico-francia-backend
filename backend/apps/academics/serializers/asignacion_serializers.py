from rest_framework import serializers
from ..models import Materia, ProfesorCurso


class MateriaSerializer(serializers.ModelSerializer):
    class Meta:
        model = Materia
        fields = ("id", "nombre")


class AsignacionSerializer(serializers.ModelSerializer):
    """Lectura/escritura de asignaciones Profesor-Curso-Materia."""
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


class ProfesorAsignacionSerializer(serializers.ModelSerializer):
    """Asignaciones del profesor autenticado con planes agrupados por mes."""
    materia_id     = serializers.IntegerField(source='materia.id', read_only=True)
    materia_nombre = serializers.CharField(source='materia.nombre', read_only=True)
    curso_id       = serializers.IntegerField(source='curso.id', read_only=True)
    curso_nombre   = serializers.SerializerMethodField()
    planes         = serializers.SerializerMethodField()

    class Meta:
        model  = ProfesorCurso
        fields = ('id', 'materia_id', 'materia_nombre', 'curso_id', 'curso_nombre', 'planes')

    def get_curso_nombre(self, obj):
        paralelo = obj.curso.paralelo.strip()
        return f'{obj.curso.grado} {paralelo}' if paralelo else obj.curso.grado

    def get_planes(self, obj):
        semanas = self.context.get('semanas_por_asignacion', {}).get(obj.id, [])
        return sorted(semanas)

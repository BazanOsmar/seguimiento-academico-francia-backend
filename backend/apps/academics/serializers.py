from rest_framework import serializers
from .models import Curso, Materia, ProfesorCurso, ProfesorPlan


class ProfesorAsignacionSerializer(serializers.ModelSerializer):
    """Devuelve las asignaciones (ProfesorCurso) del profesor autenticado, con conteo de planes."""
    materia_id     = serializers.IntegerField(source='materia.id', read_only=True)
    materia_nombre = serializers.CharField(source='materia.nombre', read_only=True)
    curso_id       = serializers.IntegerField(source='curso.id', read_only=True)
    curso_nombre   = serializers.SerializerMethodField()
    planes_count   = serializers.SerializerMethodField()

    class Meta:
        model  = ProfesorCurso
        fields = ('id', 'materia_id', 'materia_nombre', 'curso_id', 'curso_nombre', 'planes_count')

    def get_curso_nombre(self, obj):
        return f'{obj.curso.grado} "{obj.curso.paralelo}"'

    def get_planes_count(self, obj):
        counts = self.context.get('planes_counts', {})
        return counts.get(obj.id, 0)


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


class ProfesorPlanSerializer(serializers.ModelSerializer):
    descripcion    = serializers.CharField(source='plan.descripcion')
    fecha_inicio   = serializers.DateField(source='plan.fecha_inicio')
    fecha_fin      = serializers.DateField(source='plan.fecha_fin')
    semana         = serializers.SerializerMethodField()
    materia_id        = serializers.IntegerField(source='profesor_curso.materia.id', read_only=True)
    materia_nombre    = serializers.CharField(source='profesor_curso.materia.nombre', read_only=True)
    profesor_curso_id = serializers.IntegerField(source='profesor_curso.id', read_only=True)

    class Meta:
        model  = ProfesorPlan
        fields = ('id', 'mes', 'semana', 'profesor_curso_id', 'materia_id', 'materia_nombre',
                  'descripcion', 'fecha_inicio', 'fecha_fin', 'fecha_creacion')

    def get_semana(self, obj):
        day = obj.plan.fecha_inicio.day
        if day <= 7:  return 1
        if day <= 14: return 2
        if day <= 21: return 3
        return 4


class DirectorPlanSerializer(ProfesorPlanSerializer):
    profesor_id     = serializers.IntegerField(source='profesor_curso.profesor.id', read_only=True)
    profesor_nombre = serializers.SerializerMethodField()
    curso_nombre    = serializers.SerializerMethodField()

    class Meta(ProfesorPlanSerializer.Meta):
        fields = ProfesorPlanSerializer.Meta.fields + ('profesor_id', 'profesor_nombre', 'curso_nombre')

    def get_profesor_nombre(self, obj):
        u = obj.profesor_curso.profesor
        return f"{u.first_name} {u.last_name}".strip() or u.username

    def get_curso_nombre(self, obj):
        c = obj.profesor_curso.curso
        return f"{c.grado} \"{c.paralelo}\""

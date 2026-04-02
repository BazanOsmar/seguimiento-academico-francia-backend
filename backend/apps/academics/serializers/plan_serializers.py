from rest_framework import serializers
from ..models import ProfesorPlan


class ProfesorPlanSerializer(serializers.ModelSerializer):
    descripcion       = serializers.CharField(source='plan.descripcion')
    fecha_inicio      = serializers.DateField(source='plan.fecha_inicio')
    fecha_fin         = serializers.DateField(source='plan.fecha_fin')
    semana            = serializers.SerializerMethodField()
    materia_id        = serializers.IntegerField(source='profesor_curso.materia.id', read_only=True)
    materia_nombre    = serializers.CharField(source='profesor_curso.materia.nombre', read_only=True)
    profesor_curso_id = serializers.IntegerField(source='profesor_curso.id', read_only=True)

    class Meta:
        model  = ProfesorPlan
        fields = (
            'id', 'mes', 'semana', 'profesor_curso_id', 'materia_id', 'materia_nombre',
            'descripcion', 'fecha_inicio', 'fecha_fin', 'fecha_creacion',
        )

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

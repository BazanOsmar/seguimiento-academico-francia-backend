from django.contrib import admin
from .models import Curso, Materia, ProfesorCurso, PlanDeTrabajo, ProfesorPlan


@admin.register(Curso)
class CursoAdmin(admin.ModelAdmin):
    list_display = ('grado', 'paralelo')
    search_fields = ('grado', 'paralelo')


@admin.register(Materia)
class MateriaAdmin(admin.ModelAdmin):
    list_display = ('nombre',)
    search_fields = ('nombre',)


@admin.register(ProfesorCurso)
class ProfesorCursoAdmin(admin.ModelAdmin):
    list_display = ('profesor', 'curso', 'materia')
    list_filter = ('materia', 'curso')
    search_fields = ('profesor__username', 'profesor__first_name', 'profesor__last_name')


@admin.register(PlanDeTrabajo)
class PlanDeTrabajoAdmin(admin.ModelAdmin):
    list_display = ('descripcion', 'fecha_inicio', 'fecha_fin')
    search_fields = ('descripcion',)


@admin.register(ProfesorPlan)
class ProfesorPlanAdmin(admin.ModelAdmin):
    list_display = ('profesor_curso', 'plan', 'mes', 'fecha_creacion')
    list_filter = ('mes',)

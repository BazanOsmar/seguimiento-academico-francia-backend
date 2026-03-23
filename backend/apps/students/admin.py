from django.contrib import admin
from .models import Estudiante


@admin.register(Estudiante)
class EstudianteAdmin(admin.ModelAdmin):
    list_display = ('identificador', 'apellido_paterno', 'apellido_materno', 'nombre', 'curso', 'activo')
    list_filter = ('activo', 'curso')
    search_fields = ('nombre', 'apellido_paterno', 'apellido_materno', 'identificador')

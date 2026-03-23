from django.contrib import admin
from .models import AsistenciaSesion, Asistencia


@admin.register(AsistenciaSesion)
class AsistenciaSesionAdmin(admin.ModelAdmin):
    list_display = ('curso', 'fecha', 'estado', 'registrado_por', 'created_at')
    list_filter = ('estado', 'fecha')
    search_fields = ('curso__grado', 'curso__paralelo')
    date_hierarchy = 'fecha'


@admin.register(Asistencia)
class AsistenciaAdmin(admin.ModelAdmin):
    list_display = ('estudiante', 'sesion', 'estado', 'hora')
    list_filter = ('estado',)
    search_fields = ('estudiante__nombre', 'estudiante__apellido_paterno')

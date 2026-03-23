from django.contrib import admin
from .models import Citacion


@admin.register(Citacion)
class CitacionAdmin(admin.ModelAdmin):
    list_display = ('estudiante', 'emisor', 'motivo', 'estado', 'asistencia', 'fecha_envio', 'fecha_limite_asistencia')
    list_filter = ('estado', 'asistencia', 'motivo')
    search_fields = ('estudiante__nombre', 'estudiante__apellido_paterno', 'emisor__username')
    date_hierarchy = 'fecha_envio'
    readonly_fields = ('fecha_envio',)

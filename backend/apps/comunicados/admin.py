from django.contrib import admin

from .models import Comunicado, ComunicadoEstudiante


@admin.register(Comunicado)
class ComunicadoAdmin(admin.ModelAdmin):
    list_display   = ('titulo', 'emisor', 'estado', 'fecha_creacion', 'fecha_expiracion')
    list_filter    = ('estado',)
    search_fields  = ('titulo', 'emisor__username', 'emisor__first_name')
    readonly_fields = ('fecha_creacion',)
    date_hierarchy = 'fecha_creacion'


@admin.register(ComunicadoEstudiante)
class ComunicadoEstudianteAdmin(admin.ModelAdmin):
    list_display  = ('comunicado', 'estudiante', 'estado')
    list_filter   = ('estado',)
    search_fields = ('comunicado__titulo', 'estudiante__nombre')

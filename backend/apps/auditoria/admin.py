from django.contrib import admin
from .models import RegistroActividad


@admin.register(RegistroActividad)
class RegistroActividadAdmin(admin.ModelAdmin):
    list_display  = ('fecha', 'accion', 'usuario', 'descripcion', 'ip')
    list_filter   = ('accion',)
    search_fields = ('descripcion', 'usuario__username')
    readonly_fields = ('fecha', 'ip')

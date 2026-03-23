from django.contrib import admin
from .models import ControlCarga


@admin.register(ControlCarga)
class ControlCargaAdmin(admin.ModelAdmin):
    list_display = ('profesor_curso', 'fecha_entrega', 'estado_entrega')
    list_filter = ('estado_entrega', 'fecha_entrega')
    search_fields = ('profesor_curso__profesor__username',)

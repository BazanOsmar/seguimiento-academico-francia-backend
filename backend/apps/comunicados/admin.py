from django.contrib import admin
from .models import Comunicado, ComunicadoVisto


@admin.register(Comunicado)
class ComunicadoAdmin(admin.ModelAdmin):
    list_display = ('titulo', 'emisor', 'alcance', 'curso', 'fecha_envio', 'fecha_expiracion')
    list_filter = ('alcance',)
    search_fields = ('titulo', 'emisor__username', 'emisor__first_name')
    readonly_fields = ('fecha_envio',)
    date_hierarchy = 'fecha_envio'


@admin.register(ComunicadoVisto)
class ComunicadoVistoAdmin(admin.ModelAdmin):
    list_display = ('comunicado', 'tutor', 'visto_en')
    search_fields = ('comunicado__titulo', 'tutor__username')
    readonly_fields = ('visto_en',)

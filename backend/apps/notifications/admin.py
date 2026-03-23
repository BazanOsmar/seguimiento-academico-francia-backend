from django.contrib import admin
from .models import FCMDevice


@admin.register(FCMDevice)
class FCMDeviceAdmin(admin.ModelAdmin):
    list_display = ('user', 'token', 'created_at')
    search_fields = ('user__username', 'token')
    readonly_fields = ('created_at',)

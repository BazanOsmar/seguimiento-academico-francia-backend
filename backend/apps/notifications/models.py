from django.conf import settings
from django.db import models

User = settings.AUTH_USER_MODEL


class FCMDevice(models.Model):
    user       = models.ForeignKey(User, on_delete=models.CASCADE, related_name='fcm_devices')
    token      = models.CharField(max_length=255, unique=True)
    created_at = models.DateTimeField(auto_now_add=True)

    class Meta:
        verbose_name        = 'Dispositivo FCM'
        verbose_name_plural = 'Dispositivos FCM'

    def __str__(self):
        return f"FCM — {self.user}"

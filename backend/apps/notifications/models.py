from django.conf import settings
from django.db import models

User = settings.AUTH_USER_MODEL


class Notificacion(models.Model):
    emisor    = models.ForeignKey(
        User,
        on_delete=models.SET_NULL,
        null=True,
        blank=True,
        related_name='notificaciones_enviadas',
    )
    receptor  = models.ForeignKey(
        User,
        on_delete=models.CASCADE,
        related_name='notificaciones_recibidas',
    )
    descripcion    = models.TextField()
    leida          = models.BooleanField(default=False)
    fecha_creacion = models.DateTimeField(auto_now_add=True)

    class Meta:
        ordering = ['-fecha_creacion']

    def __str__(self):
        emisor_str = str(self.emisor) if self.emisor else 'Sistema'
        return f"{emisor_str} → {self.receptor}: {self.descripcion[:40]}"


class FCMDevice(models.Model):
    user       = models.ForeignKey(User, on_delete=models.CASCADE, related_name='fcm_devices')
    token      = models.CharField(max_length=255, unique=True)
    created_at = models.DateTimeField(auto_now_add=True)

    class Meta:
        verbose_name        = 'Dispositivo FCM'
        verbose_name_plural = 'Dispositivos FCM'

    def __str__(self):
        return f"FCM — {self.user}"

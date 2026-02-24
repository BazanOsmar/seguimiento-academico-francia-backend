from django.conf import settings
from django.db import models


class RegistroActividad(models.Model):
    usuario = models.ForeignKey(
        settings.AUTH_USER_MODEL,
        on_delete=models.SET_NULL,
        null=True,
        blank=True,
        related_name='actividades',
    )
    accion      = models.CharField(max_length=60, db_index=True)
    descripcion = models.CharField(max_length=255)
    fecha       = models.DateTimeField(auto_now_add=True, db_index=True)
    ip          = models.GenericIPAddressField(null=True, blank=True)

    class Meta:
        ordering = ['-fecha']
        verbose_name        = 'Registro de actividad'
        verbose_name_plural = 'Registros de actividad'

    def __str__(self):
        return f"[{self.accion}] {self.descripcion} — {self.fecha:%d/%m/%Y %H:%M}"

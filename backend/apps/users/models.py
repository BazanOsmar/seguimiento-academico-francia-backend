from django.contrib.auth.models import AbstractUser
from django.db import models


class TipoUsuario(models.Model):
    nombre = models.CharField(max_length=50, unique=True)

    def __str__(self):
        return self.nombre


class User(AbstractUser):
    tipo_usuario = models.ForeignKey(
        TipoUsuario,
        on_delete=models.PROTECT,
        related_name='usuarios',
        null=True,
        blank=True
    )
    primer_ingreso   = models.BooleanField(default=False)
    total_ingresos   = models.PositiveIntegerField(default=0)
    accepted_terms    = models.BooleanField(default=False)
    accepted_terms_at = models.DateTimeField(null=True, blank=True)

    def __str__(self):
        return self.username

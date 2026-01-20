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

    def __str__(self):
        return self.username

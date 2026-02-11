from django.conf import settings
from django.db import models
from backend.apps.academics.models import Curso

User = settings.AUTH_USER_MODEL


class Estudiante(models.Model):
    nombre = models.CharField(max_length=100)
    apellidos = models.CharField(max_length=100)

    carnet = models.CharField(
        max_length=20,
        unique=True,
        null=True,
        verbose_name="Número de carnet"
    )

    tutor = models.ForeignKey(
        User,
        on_delete=models.PROTECT,
        related_name='estudiantes'
    )

    curso = models.ForeignKey(
        Curso,
        on_delete=models.PROTECT
    )

    def __str__(self):
        return f"{self.carnet} - {self.nombre} {self.apellidos}"

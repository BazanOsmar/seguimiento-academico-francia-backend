from django.conf import settings
from django.db import models
from backend.apps.academics.models import Curso

User = settings.AUTH_USER_MODEL


class Estudiante(models.Model):
    nombre = models.CharField(max_length=100)
    apellidos = models.CharField(max_length=100)

    identificador = models.CharField(
        max_length=20,
        unique=True,
        null=True,
        verbose_name="Identificador"
    )

    tutor = models.ForeignKey(
        User,
        on_delete=models.SET_NULL,
        related_name='estudiantes',
        null=True,
        blank=True,
    )

    curso = models.ForeignKey(
        Curso,
        on_delete=models.PROTECT
    )

    activo = models.BooleanField(default=True, verbose_name="Activo en la unidad educativa")

    def __str__(self):
        return f"{self.identificador} - {self.nombre} {self.apellidos}"

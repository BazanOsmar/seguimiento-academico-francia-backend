from django.db import models
from users.models import Usuario
from academics.models import Curso


class Estudiante(models.Model):
    nombre = models.CharField(max_length=100)
    apellidos = models.CharField(max_length=100)

    curso = models.ForeignKey(
        Curso,
        on_delete=models.PROTECT,
        related_name='estudiantes'
    )

    tutor = models.ForeignKey(
        Usuario,
        on_delete=models.SET_NULL,
        null=True,
        related_name='estudiantes_tutor'
    )

    def __str__(self):
        return f"{self.nombre} {self.apellidos}"

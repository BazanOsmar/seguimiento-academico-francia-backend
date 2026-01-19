from django.db import models
from students.models import Estudiante
from users.models import Usuario


class AsistenciaRegente(models.Model):
    estudiante = models.ForeignKey(
        Estudiante,
        on_delete=models.CASCADE,
        related_name='asistencias'
    )
    fecha = models.DateField()
    hora = models.TimeField()
    estado = models.CharField(max_length=20)

    registrado_por = models.ForeignKey(
        Usuario,
        on_delete=models.SET_NULL,
        null=True,
        related_name='asistencias_registradas'
    )

    def __str__(self):
        return f"{self.estudiante} - {self.fecha}"

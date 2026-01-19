from django.db import models
from students.models import Estudiante
from users.models import Usuario


class Citacion(models.Model):
    estudiante = models.ForeignKey(
        Estudiante,
        on_delete=models.CASCADE,
        related_name='citaciones'
    )
    emisor = models.ForeignKey(
        Usuario,
        on_delete=models.SET_NULL,
        null=True,
        related_name='citaciones_emitidas'
    )
    motivo = models.CharField(max_length=255)
    descripcion = models.TextField()
    fecha_envio = models.DateField()
    estado = models.BooleanField(default=True)

    def __str__(self):
        return f"Citacion - {self.estudiante}"

from django.conf import settings
from django.db import models
from backend.apps.students.models import Estudiante

User = settings.AUTH_USER_MODEL


class Asistencia(models.Model):
    estudiante = models.ForeignKey(Estudiante, on_delete=models.CASCADE)
    fecha = models.DateField()
    hora = models.TimeField()
    estado = models.BooleanField()
    registrado_por = models.ForeignKey(User, on_delete=models.PROTECT)

    def __str__(self):
        return f"Asistencia {self.estudiante} - {self.fecha}"

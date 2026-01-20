from django.db import models
from backend.apps.academics.models import ProfesorCurso


class ControlCarga(models.Model):
    profesor_curso = models.ForeignKey(ProfesorCurso, on_delete=models.CASCADE)
    fecha_entrega = models.DateField()
    estado_entrega = models.CharField(max_length=20)

    def __str__(self):
        return f"Carga - {self.profesor_curso}"

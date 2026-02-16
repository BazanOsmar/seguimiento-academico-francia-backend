from django.conf import settings
from django.db import models
from backend.apps.students.models import Estudiante

User = settings.AUTH_USER_MODEL


class Citacion(models.Model):
    ESTADOS_ASISTENCIA = (
        ('PENDIENTE', 'Pendiente'),
        ('ASISTIO', 'Asistió'),
        ('NO_ASISTIO', 'No asistió'),
        ('ATRASO', 'atraso'),
        ('Informativo', 'Informativo'),
    )

    estudiante = models.ForeignKey(
        Estudiante,
        on_delete=models.CASCADE
    )

    emisor = models.ForeignKey(
        User,
        on_delete=models.PROTECT
    )

    motivo = models.CharField(
        max_length=20
    )

    descripcion = models.TextField()

    estado = models.CharField(
        max_length=20
    )

    fecha_envio = models.DateTimeField(
        auto_now_add=True
    )

    fecha_limite_asistencia = models.DateField()

    fecha_asistencia = models.DateField(
        null=True,
        blank=True
    )

    asistencia = models.CharField(
        max_length=30,
        choices=ESTADOS_ASISTENCIA,
        default='PENDIENTE',
        db_index=True
    )

    actualizado_por = models.ForeignKey(
        User,
        on_delete=models.PROTECT,
        null=True,
        blank=True,
        related_name='citaciones_actualizadas',
    )

    class Meta:
        ordering = ['-fecha_envio']
        indexes = [
            models.Index(fields=['fecha_limite_asistencia']),
        ]

    def __str__(self):
        return f"Citación - {self.estudiante}"

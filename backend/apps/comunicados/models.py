from django.conf import settings
from django.db import models

from backend.apps.students.models import Estudiante

User = settings.AUTH_USER_MODEL


class Comunicado(models.Model):
    ESTADO_ACTIVO  = 'ACTIVO'
    ESTADO_ANULADO = 'ANULADO'
    ESTADOS = [
        ('ACTIVO',  'Activo'),
        ('ANULADO', 'Anulado'),
    ]

    titulo           = models.CharField(max_length=150)
    descripcion      = models.TextField()
    estado           = models.CharField(max_length=10, choices=ESTADOS, default='ACTIVO')
    emisor           = models.ForeignKey(
        User,
        on_delete=models.PROTECT,
        related_name='comunicados_emitidos',
    )
    fecha_creacion   = models.DateTimeField(auto_now_add=True)
    fecha_expiracion = models.DateField(null=True, blank=True)

    class Meta:
        ordering = ['-fecha_creacion']

    def __str__(self):
        return self.titulo


class ComunicadoEstudiante(models.Model):
    ESTADO_ENVIADO = 'ENVIADO'
    ESTADO_LEIDO   = 'LEIDO'
    ESTADOS = [
        ('ENVIADO', 'Enviado'),
        ('LEIDO',   'Leído'),
    ]

    comunicado  = models.ForeignKey(
        Comunicado,
        on_delete=models.CASCADE,
        related_name='entregas',
    )
    estudiante  = models.ForeignKey(
        Estudiante,
        on_delete=models.CASCADE,
        related_name='comunicados',
    )
    estado      = models.CharField(max_length=10, choices=ESTADOS, default='ENVIADO')

    class Meta:
        unique_together = ('comunicado', 'estudiante')
        indexes = [
            models.Index(fields=['comunicado', 'estado']),
        ]

from django.conf import settings
from django.db import models
from backend.apps.students.models import Estudiante

User = settings.AUTH_USER_MODEL


from django.conf import settings
from django.db import models


class AsistenciaSesion(models.Model):
    """
    Representa el registro oficial de asistencia de un curso
    en una fecha específica.

    Esta entidad controla el bloqueo por día y evita registros
    duplicados de asistencia para el mismo curso.
    """

    curso = models.ForeignKey(
        'academics.Curso',
        on_delete=models.PROTECT,
        related_name='sesiones_asistencia'
    )

    fecha = models.DateField()

    registrado_por = models.ForeignKey(
        settings.AUTH_USER_MODEL,
        on_delete=models.PROTECT,
        related_name='sesiones_asistencia_registradas'
    )

    ESTADOS = (
        ('ENVIADA', 'Enviada'),
        ('BLOQUEADA', 'Bloqueada'),
    )

    estado = models.CharField(
        max_length=10,
        choices=ESTADOS,
        default='ENVIADA'
    )

    created_at = models.DateTimeField(auto_now_add=True)

    class Meta:
        unique_together = ('curso', 'fecha')
        verbose_name = 'Sesión de Asistencia'
        verbose_name_plural = 'Sesiones de Asistencia'

    def __str__(self):
        return f"{self.curso} - {self.fecha}"



class Asistencia(models.Model):
    """
    Registro individual de asistencia de un estudiante,
    asociado a una sesión de asistencia de curso.
    """

    sesion = models.ForeignKey(
        AsistenciaSesion,
        on_delete=models.CASCADE,
        related_name='asistencias'
    )

    estudiante = models.ForeignKey(
        'students.Estudiante',
        on_delete=models.PROTECT,
        related_name='asistencias'
    )

    ESTADOS = (
        ('ASISTENCIA', 'Asistencia'),
        ('FALTA', 'Falta'),
        ('RETRASO', 'Retraso'),
    )

    estado = models.CharField(
        max_length=10,
        choices=ESTADOS
    )

    hora = models.TimeField()

    class Meta:
        unique_together = ('sesion', 'estudiante')
        verbose_name = 'Asistencia'
        verbose_name_plural = 'Asistencias'

    def __str__(self):
        return f"{self.estudiante} - {self.estado}"


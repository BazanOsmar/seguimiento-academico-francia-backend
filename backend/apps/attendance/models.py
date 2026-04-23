from django.conf import settings
from django.db import models


class AsistenciaSesion(models.Model):
    """
    Representa el registro oficial de asistencia de un curso
    en una fecha específica.
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

    class EstadoSesion(models.TextChoices):
        ENVIADA = 'ENVIADA', 'Enviada'
        BLOQUEADA = 'BLOQUEADA', 'Bloqueada'

    estado = models.CharField(
        max_length=10,
        choices=EstadoSesion.choices,
        default=EstadoSesion.ENVIADA
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
    Registro individual de asistencia de un estudiante.
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

    class EstadoAsistencia(models.TextChoices):
        PRESENTE = 'PRESENTE', 'Presente'
        FALTA = 'FALTA', 'Falta'
        ATRASO = 'ATRASO', 'Atraso'
        LICENCIA = 'LICENCIA', 'Licencia'   # ✅ Nuevo estado

    estado = models.CharField(
        max_length=10,
        choices=EstadoAsistencia.choices
    )

    hora = models.TimeField()

    uniforme = models.BooleanField(default=True)

    class Meta:
        unique_together = ('sesion', 'estudiante')
        verbose_name = 'Asistencia'
        verbose_name_plural = 'Asistencias'

    def __str__(self):
        return f"{self.estudiante} - {self.estado}"

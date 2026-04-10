from django.conf import settings
from django.db import models

User = settings.AUTH_USER_MODEL


class Comunicado(models.Model):
    ALCANCE_TODOS      = 'TODOS'
    ALCANCE_GRADO      = 'GRADO'
    ALCANCE_CURSO      = 'CURSO'
    ALCANCE_MIS_CURSOS = 'MIS_CURSOS'
    ALCANCE_GRUPO      = 'GRUPO'
    ALCANCES = [
        ('TODOS',      'Todos los tutores'),
        ('GRADO',      'Un grado completo'),
        ('CURSO',      'Un curso específico'),
        ('MIS_CURSOS', 'Todos mis cursos asignados'),
        ('GRUPO',      'Grupo de cursos'),
    ]

    titulo = models.CharField(max_length=150)
    contenido = models.TextField()
    emisor = models.ForeignKey(
        User,
        on_delete=models.PROTECT,
        related_name='comunicados_emitidos',
    )
    fecha_envio = models.DateTimeField(auto_now_add=True)
    fecha_expiracion = models.DateField(null=True, blank=True)
    alcance = models.CharField(max_length=10, choices=ALCANCES, default='TODOS')
    cursos_grupo = models.ManyToManyField(
        'academics.Curso',
        blank=True,
        related_name='comunicados_grupo',
    )
    curso = models.ForeignKey(
        'academics.Curso',
        on_delete=models.PROTECT,
        null=True, blank=True,
        related_name='comunicados',
    )
    grado = models.CharField(max_length=50, null=True, blank=True)

    class Meta:
        ordering = ['-fecha_envio']

    def __str__(self):
        return self.titulo


class ComunicadoVisto(models.Model):
    comunicado = models.ForeignKey(
        Comunicado,
        on_delete=models.CASCADE,
        related_name='vistos',
    )
    tutor = models.ForeignKey(
        User,
        on_delete=models.CASCADE,
        related_name='comunicados_vistos',
    )
    visto_en = models.DateTimeField(auto_now_add=True)

    class Meta:
        unique_together = ('comunicado', 'tutor')

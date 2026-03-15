from django.conf import settings
from django.db import models

User = settings.AUTH_USER_MODEL


class Curso(models.Model):
    grado = models.CharField(max_length=50)
    paralelo = models.CharField(max_length=10)

    def __str__(self):
        return f"{self.grado} {self.paralelo}"


class Materia(models.Model):
    nombre = models.CharField(max_length=100, unique=True)

    def __str__(self):
        return self.nombre


class ProfesorCurso(models.Model):
    profesor = models.ForeignKey(User, on_delete=models.PROTECT)
    curso = models.ForeignKey(Curso, on_delete=models.PROTECT)
    materia = models.ForeignKey(Materia, on_delete=models.PROTECT)

    class Meta:
        unique_together = ('profesor', 'curso', 'materia')

    def __str__(self):
        return f"{self.profesor} - {self.materia} ({self.curso})"


class PlanDeTrabajo(models.Model):
    descripcion = models.TextField()
    fecha_inicio = models.DateField()
    fecha_fin = models.DateField()

    def __str__(self):
        return self.descripcion[:50]


class ProfesorPlan(models.Model):
    profesor_curso = models.ForeignKey(ProfesorCurso, on_delete=models.PROTECT, related_name='planes')
    plan = models.ForeignKey(PlanDeTrabajo, on_delete=models.PROTECT, related_name='asignaciones')
    mes = models.PositiveSmallIntegerField()  # 1–12
    fecha_creacion = models.DateTimeField(auto_now_add=True)

    class Meta:
        unique_together = ('profesor_curso', 'plan')

    def __str__(self):
        return f"{self.profesor_curso} — {self.plan} (mes {self.mes})"

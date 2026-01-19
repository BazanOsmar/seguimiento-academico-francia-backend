from django.db import models
from users.models import Usuario


class Curso(models.Model):
    grado = models.CharField(max_length=20)
    paralelo = models.CharField(max_length=10)

    def __str__(self):
        return f"{self.grado} {self.paralelo}"


class Materia(models.Model):
    nombre_materia = models.CharField(max_length=100)

    def __str__(self):
        return self.nombre_materia


class ProfesorCurso(models.Model):
    usuario = models.ForeignKey(
        Usuario,
        on_delete=models.CASCADE,
        related_name='profesor_cursos'
    )
    curso = models.ForeignKey(
        Curso,
        on_delete=models.CASCADE,
        related_name='profesor_cursos'
    )
    materia = models.ForeignKey(
        Materia,
        on_delete=models.CASCADE,
        related_name='profesor_cursos'
    )

    def __str__(self):
        return f"{self.usuario} - {self.materia}"

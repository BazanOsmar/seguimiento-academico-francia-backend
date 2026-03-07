from django.contrib import admin
from .models import Curso, Materia, ProfesorCurso

admin.site.register(Curso)
admin.site.register(Materia)
admin.site.register(ProfesorCurso)
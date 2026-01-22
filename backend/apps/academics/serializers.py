from rest_framework import serializers
from .models import Curso


class CursoSerializer(serializers.ModelSerializer):
    """
    Serializador de solo lectura para exponer
    los cursos (aulas) disponibles en la institución.

    Se utiliza como punto de entrada para procesos
    de control de asistencia por parte de regentes.
    """

    class Meta:
        model = Curso
        fields = ("id", "grado", "paralelo")

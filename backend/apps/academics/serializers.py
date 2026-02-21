from rest_framework import serializers
from .models import Curso


class CursoSerializer(serializers.ModelSerializer):
    """
    Serializador de solo lectura para exponer
    los cursos (aulas) disponibles en la institución.
    """
    estudiantes_count = serializers.IntegerField(read_only=True, default=0)

    class Meta:
        model = Curso
        fields = ("id", "grado", "paralelo", "estudiantes_count")

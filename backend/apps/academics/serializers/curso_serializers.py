from rest_framework import serializers
from ..models import Curso


class CursoSerializer(serializers.ModelSerializer):
    """Expone los cursos disponibles en la institución con conteo de estudiantes."""
    estudiantes_count = serializers.IntegerField(read_only=True, default=0)

    class Meta:
        model = Curso
        fields = ("id", "grado", "paralelo", "estudiantes_count")

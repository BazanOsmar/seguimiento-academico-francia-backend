from rest_framework import serializers
from ..models import Citacion


class CitacionListSerializer(serializers.ModelSerializer):
    """
    Serializer de LECTURA para listar citaciones.
    Expone los datos relevantes para la vista del regente/director.
    """

    # Nombre completo del estudiante (nombre + apellidos)
    estudiante_nombre = serializers.SerializerMethodField()

    # Curso del estudiante, ej: "Tercero A"
    curso = serializers.SerializerMethodField()

    class Meta:
        model = Citacion
        fields = [
            "id",
            "estudiante_nombre",
            "curso",
            "asistencia",               # PENDIENTE / ASISTIO / NO_ASISTIO / ATRASO / Informativo
            "fecha_envio",              # DateTimeField — auto al crear
            "fecha_limite_asistencia",  # DateField — límite para que asista el padre
            "motivo",                   # Motivo de la citación
            "estado",                   # Estado interno de la citación
            "fecha_asistencia",         # Fecha en que el padre asistió (puede ser null)
        ]

    def get_estudiante_nombre(self, obj):
        """Devuelve nombre completo: 'Juan Pérez' """
        return f"{obj.estudiante.nombre} {obj.estudiante.apellidos}"

    def get_curso(self, obj):
        """Devuelve el curso del estudiante: 'Tercero A' """
        curso = obj.estudiante.curso
        return f"{curso.grado} {curso.paralelo}"
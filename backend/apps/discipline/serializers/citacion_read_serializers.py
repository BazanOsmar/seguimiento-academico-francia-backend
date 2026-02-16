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


class CitacionDetailSerializer(serializers.ModelSerializer):
    """
    Serializer de LECTURA para el detalle completo de una citación.
    Incluye datos del tutor y del emisor.
    """

    estudiante_nombre = serializers.SerializerMethodField()
    curso = serializers.SerializerMethodField()
    tutor_nombre = serializers.SerializerMethodField()
    emitido_por_nombre = serializers.SerializerMethodField()
    emitido_por_cargo = serializers.SerializerMethodField()
    motivo_descripcion = serializers.CharField(source="descripcion")

    class Meta:
        model = Citacion
        fields = [
            "id",
            "estudiante_nombre",
            "curso",
            "asistencia",
            "fecha_envio",
            "fecha_limite_asistencia",
            "tutor_nombre",
            "emitido_por_nombre",
            "emitido_por_cargo",
            "motivo",
            "motivo_descripcion",
            "fecha_asistencia",
        ]

    def get_estudiante_nombre(self, obj):
        return f"{obj.estudiante.nombre} {obj.estudiante.apellidos}"

    def get_curso(self, obj):
        curso = obj.estudiante.curso
        return f"{curso.grado} {curso.paralelo}"

    def get_tutor_nombre(self, obj):
        tutor = obj.estudiante.tutor
        return f"{tutor.first_name} {tutor.last_name}".strip()

    def get_emitido_por_nombre(self, obj):
        return f"{obj.emisor.first_name} {obj.emisor.last_name}".strip()

    def get_emitido_por_cargo(self, obj):
        if obj.emisor.tipo_usuario:
            return obj.emisor.tipo_usuario.nombre
        return None
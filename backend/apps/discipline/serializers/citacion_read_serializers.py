from rest_framework import serializers
from ..models import Citacion


class CitacionBaseSerializer(serializers.ModelSerializer):
    """Campos comunes compartidos por list y detail."""

    estudiante_nombre = serializers.SerializerMethodField()
    curso = serializers.SerializerMethodField()

    def get_estudiante_nombre(self, obj):
        return f"{obj.estudiante.nombre} {obj.estudiante.apellidos}"

    def get_curso(self, obj):
        curso = obj.estudiante.curso
        return f"{curso.grado} {curso.paralelo}"


class CitacionListSerializer(CitacionBaseSerializer):
    """
    Serializer de LECTURA para listar citaciones.
    Expone los datos relevantes para la vista del regente/director.
    """

    class Meta:
        model = Citacion
        fields = [
            "id",
            "estudiante_nombre",
            "curso",
            "asistencia",
            "fecha_envio",
            "fecha_limite_asistencia",
            "motivo",
            "estado",
            "fecha_asistencia",
        ]


class CitacionDetailSerializer(CitacionBaseSerializer):
    """
    Serializer de LECTURA para el detalle completo de una citación.
    Incluye datos del tutor y del emisor.
    """

    tutor_nombre = serializers.SerializerMethodField()
    emitido_por_nombre = serializers.SerializerMethodField()
    emitido_por_cargo = serializers.SerializerMethodField()
    motivo_descripcion = serializers.CharField(source="descripcion")
    actualizado_por_nombre = serializers.SerializerMethodField()

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
            "actualizado_por_nombre",
        ]

    def get_tutor_nombre(self, obj):
        tutor = obj.estudiante.tutor
        if tutor is None:
            return None
        return f"{tutor.first_name} {tutor.last_name}".strip()

    def get_emitido_por_nombre(self, obj):
        return f"{obj.emisor.first_name} {obj.emisor.last_name}".strip()

    def get_emitido_por_cargo(self, obj):
        if obj.emisor.tipo_usuario:
            return obj.emisor.tipo_usuario.nombre
        return None

    def get_actualizado_por_nombre(self, obj):
        if obj.actualizado_por:
            return f"{obj.actualizado_por.first_name} {obj.actualizado_por.last_name}".strip()
        return None
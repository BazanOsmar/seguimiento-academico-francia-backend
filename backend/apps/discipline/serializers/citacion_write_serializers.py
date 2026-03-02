from django.utils import timezone
from rest_framework import serializers
from ..models import Citacion


class CitacionCreateSerializer(serializers.ModelSerializer):
    """
    Serializer de ESCRITURA para crear una citación.
    El emisor se asigna automáticamente desde el request.user en la view,
    no se expone en los campos para que no pueda ser manipulado.
    """

    class Meta:
        model = Citacion
        fields = [
            "estudiante",
            "motivo",
            "descripcion",
            "estado",
            "fecha_limite_asistencia",
        ]

    def validate_estudiante(self, value):
        if not value.activo:
            raise serializers.ValidationError(
                "No se pueden crear citaciones para estudiantes inactivos."
            )
        return value

    def validate_fecha_limite_asistencia(self, value):
        """La fecha límite no puede ser en el pasado."""
        if value < timezone.now().date():
            raise serializers.ValidationError(
                "La fecha límite de asistencia no puede ser en el pasado."
            )
        return value

    def create(self, validated_data):
        """
        El emisor viene del contexto (request.user), no del payload.
        Se llama desde la view así:
            serializer.save(emisor=request.user)
        """
        return super().create(validated_data)


class CitacionUpdateAsistenciaSerializer(serializers.ModelSerializer):
    """
    Serializer para actualizar únicamente el estado de asistencia
    del padre a la citación (ASISTIO, NO_ASISTIO, ATRASO).
    Se usa cuando el regente registra si el padre se presentó.
    """

    class Meta:
        model = Citacion
        fields = [
            "asistencia",
            "fecha_asistencia",
        ]

    def validate(self, data):
        """Si se marca ASISTIO o ATRASO, la fecha_asistencia es obligatoria."""
        asistencia = data.get("asistencia")
        fecha = data.get("fecha_asistencia")

        estados_con_fecha = ["ASISTIO", "ATRASO"]

        if asistencia in estados_con_fecha and not fecha:
            raise serializers.ValidationError(
                {"fecha_asistencia": "Este campo es obligatorio cuando la asistencia es ASISTIO o ATRASO."}
            )
        return data
from rest_framework import serializers
from backend.apps.attendance.models import Asistencia


class AsistenciaItemSerializer(serializers.Serializer):
    """
    Representa la asistencia individual de un estudiante
    dentro del envío masivo por curso.
    """

    estudiante_id = serializers.IntegerField()

    estado = serializers.ChoiceField(
        choices=Asistencia.EstadoAsistencia.choices,
        error_messages={
            'invalid_choice': (
                'Estado inválido. Opciones válidas: '
                'PRESENTE, FALTA, ATRASO, LICENCIA'
            )
        }
    )

    hora = serializers.TimeField(
        error_messages={
            'invalid': 'Formato de hora inválido. Use HH:MM:SS'
        }
    )

    uniforme = serializers.BooleanField(default=True, required=False)


class AsistenciaCreateSerializer(serializers.Serializer):
    """
    Serializador de entrada para el registro completo
    de asistencia de un curso en una fecha.
    """

    fecha = serializers.DateField(
        error_messages={
            'invalid': 'Formato de fecha inválido. Use YYYY-MM-DD',
            'required': 'La fecha es obligatoria.'
        }
    )
    
    asistencias = AsistenciaItemSerializer(
        many=True,
        error_messages={
            'required': 'La lista de asistencias es obligatoria.',
            'empty': 'La lista de asistencias no puede estar vacía.'
        }
    )

    def validate_asistencias(self, value):
        """Validar que la lista de asistencias no esté vacía"""
        if not value:
            raise serializers.ValidationError(
                "Debe enviar la lista completa de asistencias del curso."
            )
        
        # Validar que no haya estudiantes duplicados
        estudiante_ids = [item['estudiante_id'] for item in value]
        if len(estudiante_ids) != len(set(estudiante_ids)):
            raise serializers.ValidationError(
                "La lista contiene estudiantes duplicados."
            )
        
        return value
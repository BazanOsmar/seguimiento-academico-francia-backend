from rest_framework import serializers
from .models import Estudiante


class EstudianteListSerializer(serializers.ModelSerializer):
    """
    Serializador de solo lectura para listar estudiantes
    pertenecientes a un curso específico.

    Se utiliza en el flujo de control de asistencia,
    donde no se requiere exponer información sensible
    ni permitir modificaciones.
    """

    class Meta:
        model = Estudiante
        fields = (
            "id",
            "nombre",
            "apellidos",
        )


class EstudianteBusquedaSerializer(serializers.ModelSerializer):
    curso = serializers.StringRelatedField()

    class Meta:
        model = Estudiante
        fields = ("id", "nombre", "apellidos", "carnet", "curso")

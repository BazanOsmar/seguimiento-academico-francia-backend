from django.db.models import Count, Q
from rest_framework import serializers
from backend.apps.attendance.models import Asistencia, AsistenciaSesion


class EstudianteAsistenciaReadSerializer(serializers.Serializer):
    """
    Representa un estudiante con su asistencia registrada.
    Solo lectura.
    """
    estudiante_id = serializers.IntegerField(source='estudiante.id')
    nombre_completo = serializers.SerializerMethodField()
    estado = serializers.CharField()
    hora = serializers.TimeField()

    def get_nombre_completo(self, obj):
        """Devuelve el nombre completo del estudiante"""
        estudiante = obj.estudiante
        return f"{estudiante.nombre} {estudiante.apellidos}".strip()


class AsistenciaSesionDetailSerializer(serializers.ModelSerializer):
    """
    Detalle completo de una sesión de asistencia registrada.
    """
    curso_nombre = serializers.CharField(source='curso.__str__', read_only=True)
    registrado_por_nombre = serializers.SerializerMethodField()
    asistencias = serializers.SerializerMethodField()
    total_estudiantes = serializers.SerializerMethodField()
    resumen = serializers.SerializerMethodField()

    class Meta:
        model = AsistenciaSesion
        fields = [
            'id',
            'curso',
            'curso_nombre',
            'fecha',
            'estado',
            'registrado_por_nombre',
            'created_at',
            'total_estudiantes',
            'resumen',
            'asistencias'
        ]

    def get_registrado_por_nombre(self, obj):
        """Nombre del usuario que registró la asistencia"""
        user = obj.registrado_por
        return f"{user.first_name} {user.last_name}".strip() or user.username

    def get_asistencias(self, obj):
        """
        Lista de asistencias individuales.
        ✅ SIN ordenamiento para evitar errores
        """
        asistencias = obj.asistencias.select_related('estudiante').all()
        return EstudianteAsistenciaReadSerializer(asistencias, many=True).data

    def get_resumen(self, obj):
        """Resumen estadístico de la asistencia (una sola query con aggregate)."""
        agg = obj.asistencias.aggregate(
            total=Count('id'),
            presente=Count('id', filter=Q(estado='PRESENTE')),
            falta=Count('id', filter=Q(estado='FALTA')),
            atraso=Count('id', filter=Q(estado='ATRASO')),
            licencia=Count('id', filter=Q(estado='LICENCIA')),
        )
        return agg

    def get_total_estudiantes(self, obj):
        """Total de estudiantes — reutiliza el valor ya calculado en resumen."""
        return obj.asistencias.aggregate(total=Count('id'))['total']


_DIAS_ES = {
    0: 'Lunes', 1: 'Martes', 2: 'Miércoles',
    3: 'Jueves', 4: 'Viernes', 5: 'Sábado', 6: 'Domingo',
}


class HistorialEstudianteSerializer(serializers.ModelSerializer):
    """
    Un registro de asistencia individual para el historial de un estudiante.
    Usado en GET /api/attendance/estudiantes/{id}/historial/
    """
    fecha      = serializers.DateField(source='sesion.fecha')
    dia_semana = serializers.SerializerMethodField()

    class Meta:
        model  = Asistencia
        fields = ('fecha', 'dia_semana', 'hora', 'estado')

    def get_dia_semana(self, obj):
        return _DIAS_ES[obj.sesion.fecha.weekday()]
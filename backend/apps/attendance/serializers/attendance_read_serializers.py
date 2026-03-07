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
    asistencias_recientes = serializers.SerializerMethodField()

    def get_nombre_completo(self, obj):
        """Devuelve el nombre en formato 'Apellidos, Nombre' (estilo planilla)."""
        e = obj.estudiante
        apellidos = f"{e.apellido_paterno} {e.apellido_materno}".strip()
        return f"{apellidos}, {e.nombre}".strip()

    def get_asistencias_recientes(self, obj):
        """
        Últimas N asistencias del estudiante (pasadas como context['recent_map']).
        Cada item: {"fecha": "YYYY-MM-DD", "estado": "PRESENTE"}
        """
        recent_map = self.context.get('recent_map', {})
        return recent_map.get(obj.estudiante.id, [])


class AsistenciaSesionDetailSerializer(serializers.ModelSerializer):
    """
    Detalle completo de una sesión de asistencia registrada.
    """
    curso_nombre = serializers.CharField(source='curso.__str__', read_only=True)
    registrado_por_nombre = serializers.SerializerMethodField()
    registrado_por_tipo = serializers.SerializerMethodField()
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
            'registrado_por_tipo',
            'created_at',
            'total_estudiantes',
            'resumen',
            'asistencias',
        ]

    def get_registrado_por_nombre(self, obj):
        user = obj.registrado_por
        return f"{user.first_name} {user.last_name}".strip() or user.username

    def get_registrado_por_tipo(self, obj):
        return str(getattr(obj.registrado_por, 'tipo_usuario', '') or '')

    def get_asistencias(self, obj):
        """Lista de asistencias ordenada por apellidos del estudiante."""
        asistencias = (
            obj.asistencias
            .select_related('estudiante')
            .order_by('estudiante__apellido_paterno', 'estudiante__apellido_materno', 'estudiante__nombre')
        )
        return EstudianteAsistenciaReadSerializer(
            asistencias, many=True, context=self.context
        ).data

    def get_resumen(self, obj):
        """Resumen estadístico de la asistencia (una sola query con aggregate)."""
        return obj.asistencias.aggregate(
            total=Count('id'),
            presente=Count('id', filter=Q(estado='PRESENTE')),
            falta=Count('id', filter=Q(estado='FALTA')),
            atraso=Count('id', filter=Q(estado='ATRASO')),
            licencia=Count('id', filter=Q(estado='LICENCIA')),
        )

    def get_total_estudiantes(self, obj):
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
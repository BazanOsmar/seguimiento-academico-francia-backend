from rest_framework import serializers
from backend.apps.attendance.models import Asistencia, AsistenciaSesion
from backend.apps.students.models import Estudiante


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

    def get_total_estudiantes(self, obj):
        """Total de estudiantes en la sesión"""
        return obj.asistencias.count()

    def get_resumen(self, obj):
        """Resumen estadístico de la asistencia"""
        asistencias = obj.asistencias.all()
        
        total = asistencias.count()
        presentes = asistencias.filter(estado='PRESENTE').count()
        faltas = asistencias.filter(estado='FALTA').count()
        atrasos = asistencias.filter(estado='ATRASO').count()
        licencias = asistencias.filter(estado='LICENCIA').count()

        return {
            'total': total,
            'presente': presentes,
            'falta': faltas,
            'atraso': atrasos,
            'licencia': licencias
        }
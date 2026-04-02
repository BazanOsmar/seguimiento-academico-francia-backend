from rest_framework import serializers
from ..models import Citacion
from backend.apps.academics.models import ProfesorCurso


class CitacionBaseSerializer(serializers.ModelSerializer):
    """Campos comunes compartidos por list y detail."""

    estudiante_nombre = serializers.SerializerMethodField()
    curso = serializers.SerializerMethodField()

    def get_estudiante_nombre(self, obj):
        e = obj.estudiante
        apellidos = f"{e.apellido_paterno} {e.apellido_materno}".strip()
        return f"{apellidos} {e.nombre}".strip()

    def get_curso(self, obj):
        curso = obj.estudiante.curso
        return f"{curso.grado} {curso.paralelo}"


class CitacionListSerializer(CitacionBaseSerializer):
    """
    Serializer de LECTURA para listar citaciones.
    Expone los datos relevantes para la vista del regente/director.
    """
    emisor_nombre  = serializers.SerializerMethodField()
    emisor_tipo    = serializers.SerializerMethodField()
    materia_nombre = serializers.SerializerMethodField()

    def get_emisor_nombre(self, obj):
        return f"{obj.emisor.first_name} {obj.emisor.last_name}".strip() or obj.emisor.username

    def get_emisor_tipo(self, obj):
        if obj.emisor.tipo_usuario:
            return obj.emisor.tipo_usuario.nombre
        return None

    def get_materia_nombre(self, obj):
        """Solo para profesores: deriva la materia vía ProfesorCurso."""
        if not obj.emisor.tipo_usuario or obj.emisor.tipo_usuario.nombre != 'Profesor':
            return None
        curso_id = obj.estudiante.curso_id
        # Usa el prefetch cacheado por la vista (sin queries extra)
        profcursos = getattr(obj.emisor, '_profcursos', None)
        if profcursos is None:
            # Fallback: query directa si se llama sin el prefetch
            profcursos = list(
                ProfesorCurso.objects
                .filter(profesor=obj.emisor)
                .select_related('materia')
            )
        nombres = [pc.materia.nombre for pc in profcursos if pc.curso_id == curso_id]
        return ', '.join(nombres) if nombres else None

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
            "descripcion",
            "estado",
            "fecha_asistencia",
            "emisor_nombre",
            "emisor_tipo",
            "materia_nombre",
        ]


class CitacionTutorSerializer(CitacionBaseSerializer):
    """
    Serializer de LECTURA para tutores (app móvil).
    Muestra las citaciones de sus hijos/estudiantes a cargo.
    """
    emisor_nombre = serializers.SerializerMethodField()
    emisor_cargo  = serializers.SerializerMethodField()

    def get_emisor_nombre(self, obj):
        return f"{obj.emisor.first_name} {obj.emisor.last_name}".strip() or obj.emisor.username

    def get_emisor_cargo(self, obj):
        if obj.emisor.tipo_usuario:
            return obj.emisor.tipo_usuario.nombre
        return None

    class Meta:
        model = Citacion
        fields = [
            "id",
            "estudiante_nombre",
            "curso",
            "motivo",
            "descripcion",
            "estado",
            "asistencia",
            "fecha_envio",
            "fecha_limite_asistencia",
            "fecha_asistencia",
            "emisor_nombre",
            "emisor_cargo",
        ]


class CitacionDetailSerializer(CitacionBaseSerializer):
    """
    Serializer de LECTURA para el detalle completo de una citación.
    Incluye datos del tutor y del emisor.
    """

    tutor_nombre = serializers.SerializerMethodField()
    emitido_por_nombre = serializers.SerializerMethodField()
    emitido_por_cargo = serializers.SerializerMethodField()
    emisor_id = serializers.IntegerField(source="emisor.id", read_only=True)
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
            "emisor_id",
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
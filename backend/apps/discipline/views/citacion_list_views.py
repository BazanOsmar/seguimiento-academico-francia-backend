from rest_framework.views import APIView
from rest_framework.response import Response
from rest_framework import status
from rest_framework.permissions import IsAuthenticated

from ..models import Citacion
from ..serializers import CitacionListSerializer, CitacionTutorSerializer
from backend.core.permissions import IsDirectorOrRegenteOrProfesor, IsTutor
from ..services.citacion_vencimiento import marcar_citaciones_vencidas


class CitacionListView(APIView):
    """
    GET api/discipline/citaciones/

    Devuelve la lista de todas las citaciones registradas,
    ordenadas por fecha de envío (más reciente primero).

    Permisos: Solo Director o Regente.

    Parámetros opcionales de query:
        ?asistencia=PENDIENTE   → filtra por estado de asistencia
        ?curso_id=3             → filtra por curso del estudiante

    Respuesta exitosa (200):
    [
        {
            "id": 1,
            "estudiante_nombre": "Juan Pérez",
            "curso": "Tercero A",
            "asistencia": "PENDIENTE",
            "fecha_envio": "2025-10-15T08:30:00Z",
            "fecha_limite_asistencia": "2025-10-20",
            "motivo": "FALTAS",
            "estado": "ENVIADA",
            "fecha_asistencia": null
        },
        ...
    ]
    """

    permission_classes = [IsAuthenticated, IsDirectorOrRegenteOrProfesor]

    def get(self, request):
        marcar_citaciones_vencidas()

        queryset = Citacion.objects.select_related(
            "estudiante",
            "estudiante__curso",
            "emisor",
            "emisor__tipo_usuario",
            "materia",
        ).all()

        # Regente y Profesor solo ven sus propias citaciones; Director ve todas
        tipo = request.user.tipo_usuario.nombre if request.user.tipo_usuario else None
        if tipo in ("Profesor", "Regente"):
            queryset = queryset.filter(emisor=request.user)

        # Filtrar por estado de asistencia, ej: ?asistencia=PENDIENTE
        asistencia = request.query_params.get("asistencia")
        if asistencia:
            queryset = queryset.filter(asistencia=asistencia)

        # Filtrar por curso del estudiante, ej: ?curso_id=3
        curso_id = request.query_params.get("curso_id")
        if curso_id:
            queryset = queryset.filter(estudiante__curso_id=curso_id)

        # Filtrar por estudiante, ej: ?estudiante_id=5
        estudiante_id = request.query_params.get("estudiante_id")
        if estudiante_id:
            queryset = queryset.filter(estudiante_id=estudiante_id)

        # Filtrar por fecha de creación, ej: ?fecha_creacion=2026-03-09
        fecha_creacion = request.query_params.get("fecha_creacion")
        if fecha_creacion:
            queryset = queryset.filter(fecha_envio__date=fecha_creacion)

        # Filtrar por fecha de actualización de asistencia, ej: ?fecha_actualizacion=2026-03-09
        fecha_actualizacion = request.query_params.get("fecha_actualizacion")
        if fecha_actualizacion:
            queryset = queryset.filter(fecha_asistencia=fecha_actualizacion)

        serializer = CitacionListSerializer(queryset, many=True)
        return Response(serializer.data, status=status.HTTP_200_OK)


class CitacionTutorListView(APIView):
    """
    GET api/discipline/citaciones/mis-citaciones/

    Devuelve las citaciones de todos los estudiantes vinculados al tutor
    autenticado (estudiante.tutor == request.user).

    Permisos: Solo Tutores (app móvil).

    Parámetros opcionales de query:
        ?estado=ENVIADA|VISTO    → filtra por estado de envío
        ?asistencia=PENDIENTE    → filtra por estado de asistencia

    Respuesta exitosa (200):
    [
        {
            "id": 1,
            "estudiante_nombre": "Pérez García Juan",
            "curso": "Tercero A",
            "motivo": "FALTAS",
            "descripcion": "...",
            "estado": "ENVIADA",
            "asistencia": "PENDIENTE",
            "fecha_envio": "2025-10-15T08:30:00Z",
            "fecha_limite_asistencia": "2025-10-20",
            "fecha_asistencia": null,
            "emisor_nombre": "Ana Mamani",
            "emisor_cargo": "Profesor"
        },
        ...
    ]
    """

    permission_classes = [IsAuthenticated, IsTutor]

    def get(self, request):
        marcar_citaciones_vencidas()

        queryset = Citacion.objects.select_related(
            "estudiante",
            "estudiante__curso",
            "emisor",
            "emisor__tipo_usuario",
        ).filter(estudiante__tutor=request.user).exclude(asistencia="ANULADA")

        estado = request.query_params.get("estado")
        if estado:
            queryset = queryset.filter(estado=estado)

        asistencia = request.query_params.get("asistencia")
        if asistencia:
            queryset = queryset.filter(asistencia=asistencia)

        serializer = CitacionTutorSerializer(queryset, many=True)
        return Response(serializer.data, status=status.HTTP_200_OK)
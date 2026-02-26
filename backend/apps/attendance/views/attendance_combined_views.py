from django.db import transaction
from rest_framework.views import APIView
from rest_framework.response import Response
from rest_framework.permissions import IsAuthenticated
from rest_framework import status

from backend.apps.users.permissions import IsDirectorOrRegente
from backend.apps.attendance.models import AsistenciaSesion, Asistencia
from backend.apps.academics.models import Curso
from backend.apps.students.models import Estudiante

from ..serializers.attendance_create_serializers import AsistenciaCreateSerializer
from ..serializers.attendance_read_serializers import AsistenciaSesionDetailSerializer
from ..services.consecutive_check import verificar_faltas_atrasos_consecutivos


def _build_recent_map(curso_id, current_fecha, limit=5):
    """
    Devuelve {estudiante_id: [{"fecha": "YYYY-MM-DD", "estado": "..."}]}
    para las últimas `limit` sesiones del curso hasta `current_fecha` (inclusive).
    Orden: de más antigua a más reciente por estudiante.
    Solo 2 queries independientemente del número de estudiantes.
    """
    session_ids = list(
        AsistenciaSesion.objects.filter(
            curso_id=curso_id,
            fecha__lte=current_fecha,
        ).order_by('-fecha').values_list('id', flat=True)[:limit]
    )
    if not session_ids:
        return {}

    result = {}
    for a in (
        Asistencia.objects
        .filter(sesion_id__in=session_ids)
        .select_related('sesion')
        .order_by('sesion__fecha')
    ):
        result.setdefault(a.estudiante_id, []).append({
            'fecha': a.sesion.fecha.isoformat(),
            'estado': a.estado,
        })
    return result


class AsistenciaCursoView(APIView):
    """
    Vista combinada para gestionar asistencia de un curso.
    
    GET: Obtiene la asistencia registrada (solo lectura)
    POST: Registra la asistencia completa del curso (escritura)
    
    Endpoint: /api/attendance/cursos/{curso_id}/asistencia/
    """
    
    permission_classes = [IsAuthenticated, IsDirectorOrRegente]

    def get(self, request, curso_id):
        """
        Obtiene la asistencia ya registrada de un curso en una fecha.
        
        Query params:
            fecha (requerido): YYYY-MM-DD
        
        Respuesta exitosa (200):
        {
            "id": 1,
            "curso_nombre": "1ro A",
            "fecha": "2026-02-11",
            "total_estudiantes": 25,
            "resumen": {...},
            "asistencias": [...]
        }
        """
        # Validar parámetro fecha
        fecha = request.query_params.get('fecha')
        
        if not fecha:
            return Response(
                {"errores": "Debe especificar la fecha en el formato YYYY-MM-DD"},
                status=status.HTTP_400_BAD_REQUEST
            )

        # Validar que el curso existe
        try:
            curso = Curso.objects.get(id=curso_id)
        except Curso.DoesNotExist:
            return Response(
                {"errores": "El curso especificado no existe."},
                status=status.HTTP_404_NOT_FOUND
            )

        # Buscar la sesión de asistencia
        try:
            sesion = AsistenciaSesion.objects.get(
                curso=curso,
                fecha=fecha
            )
        except AsistenciaSesion.DoesNotExist:
            return Response(
                {"errores": "No existe asistencia registrada para este curso en la fecha indicada."},
                status=status.HTTP_404_NOT_FOUND
            )

        # Construir mapa de asistencias recientes (2 queries extra, todas en memoria)
        recent_map = _build_recent_map(curso_id, fecha)

        serializer = AsistenciaSesionDetailSerializer(
            sesion, context={'recent_map': recent_map}
        )
        return Response(serializer.data, status=status.HTTP_200_OK)

    @transaction.atomic
    def post(self, request, curso_id):
        """
        Registra la asistencia completa de un curso.
        
        Body esperado:
        {
            "fecha": "2026-02-11",
            "asistencias": [
                {
                    "estudiante_id": 1,
                    "estado": "PRESENTE",
                    "hora": "08:30:00"
                },
                ...
            ]
        }
        """
        # Validar datos de entrada
        serializer = AsistenciaCreateSerializer(data=request.data)
        
        if not serializer.is_valid():
            errors = serializer.errors
            error_message = self._extract_first_error(errors)
            
            return Response(
                {"errores": error_message},
                status=status.HTTP_400_BAD_REQUEST
            )

        fecha = serializer.validated_data["fecha"]
        asistencias_data = serializer.validated_data["asistencias"]

        # Verificar que el curso existe
        try:
            curso = Curso.objects.get(id=curso_id)
        except Curso.DoesNotExist:
            return Response(
                {"errores": "El curso especificado no existe."},
                status=status.HTTP_404_NOT_FOUND
            )

        # Verificar que NO exista sesión duplicada
        if AsistenciaSesion.objects.filter(curso=curso, fecha=fecha).exists():
            return Response(
                {"errores": "La asistencia de este curso ya fue registrada para esta fecha."},
                status=status.HTTP_400_BAD_REQUEST
            )

        # Obtener IDs de estudiantes del curso (una sola query)
        estudiantes_reales_ids = set(
            Estudiante.objects.filter(curso=curso).values_list("id", flat=True)
        )
        total_estudiantes = len(estudiantes_reales_ids)

        if total_estudiantes == 0:
            return Response(
                {"errores": "El curso no tiene estudiantes registrados."},
                status=status.HTTP_400_BAD_REQUEST
            )

        # Validar lista completa
        estudiantes_enviados_ids = {
            item["estudiante_id"] for item in asistencias_data
        }

        if estudiantes_enviados_ids != estudiantes_reales_ids:
            faltantes = estudiantes_reales_ids - estudiantes_enviados_ids
            sobrantes = estudiantes_enviados_ids - estudiantes_reales_ids
            
            if faltantes:
                mensaje = f"Faltan {len(faltantes)} estudiantes en la lista."
            elif sobrantes:
                mensaje = f"Hay {len(sobrantes)} estudiantes que no pertenecen al curso."
            else:
                mensaje = "La lista de asistencias no coincide con los estudiantes del curso."
            
            return Response(
                {"errores": mensaje},
                status=status.HTTP_400_BAD_REQUEST
            )

        # Crear sesión
        sesion = AsistenciaSesion.objects.create(
            curso=curso,
            fecha=fecha,
            registrado_por=request.user,
            estado="ENVIADA"
        )

        # Crear asistencias
        asistencias_objs = [
            Asistencia(
                sesion=sesion,
                estudiante_id=item["estudiante_id"],
                estado=item["estado"],
                hora=item["hora"]
            )
            for item in asistencias_data
        ]

        Asistencia.objects.bulk_create(asistencias_objs)

        verificar_faltas_atrasos_consecutivos(sesion)

        return Response(
            {
                "mensaje": "Asistencia registrada correctamente",
                "curso": str(curso),
                "fecha": str(fecha),
                "total_estudiantes": total_estudiantes
            },
            status=status.HTTP_201_CREATED
        )

    def _extract_first_error(self, errors):
        """Extrae el primer mensaje de error como string."""
        def _first(v):
            return str(v[0]) if isinstance(v, list) else str(v)

        for field, msgs in errors.items():
            if field == 'asistencias' and isinstance(msgs, list):
                for item in msgs:
                    if isinstance(item, dict):
                        for _, ferr in item.items():
                            return _first(ferr)
                return _first(msgs)
            return _first(msgs)

        return "Error de validación en los datos enviados."

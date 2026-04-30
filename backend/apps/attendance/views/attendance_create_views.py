from django.db import transaction
from django.utils import timezone

from rest_framework.views import APIView
from rest_framework.response import Response
from rest_framework.permissions import IsAuthenticated
from rest_framework.exceptions import ValidationError
from rest_framework import status

from backend.core.permissions import IsDirectorOrRegente
from backend.apps.attendance.models import AsistenciaSesion, Asistencia
from backend.apps.academics.models import Curso
from backend.apps.students.models import Estudiante
from ..serializers.attendance_create_serializers import (
    AsistenciaCreateSerializer
)


class RegistrarAsistenciaCursoView(APIView):
    """
    Registra de forma definitiva la asistencia de un curso
    en una fecha específica.

    Esta operación es atómica:
    - o se crea la sesión con todas las asistencias
    - o no se guarda nada
    
    Endpoint: POST /api/attendance/cursos/{curso_id}/registrar/
    
    Body esperado:
    {
        "fecha": "2026-02-11",
        "asistencias": [
            {
                "estudiante_id": 1,
                "estado": "PRESENTE",
                "hora": "08:30:00"
            },
            {
                "estudiante_id": 2,
                "estado": "FALTA",
                "hora": "08:30:00"
            }
        ]
    }
    """

    permission_classes = (IsAuthenticated, IsDirectorOrRegente)

    @transaction.atomic
    def post(self, request, curso_id):
        # ✅ Validar datos de entrada
        serializer = AsistenciaCreateSerializer(data=request.data)
        
        if not serializer.is_valid():
            # Extraer el primer error en formato consistente
            errors = serializer.errors
            error_message = self._extract_first_error(errors)
            
            return Response(
                {"errores": error_message},
                status=status.HTTP_400_BAD_REQUEST
            )

        fecha = serializer.validated_data["fecha"]
        asistencias_data = serializer.validated_data["asistencias"]

        # 1. Verificar que el curso existe
        try:
            curso = Curso.objects.get(id=curso_id)
        except Curso.DoesNotExist:
            return Response(
                {"errores": "El curso especificado no existe."},
                status=status.HTTP_404_NOT_FOUND
            )

        # 2. Verificar que NO exista sesión para ese curso y fecha
        if AsistenciaSesion.objects.filter(curso=curso, fecha=fecha).exists():
            return Response(
                {"errores": "La asistencia de este curso ya fue registrada para esta fecha."},
                status=status.HTTP_400_BAD_REQUEST
            )

        # 3. Obtener estudiantes reales del curso
        estudiantes_curso = Estudiante.objects.filter(curso=curso)
        total_estudiantes = estudiantes_curso.count()

        if total_estudiantes == 0:
            return Response(
                {"errores": "El curso no tiene estudiantes registrados."},
                status=status.HTTP_400_BAD_REQUEST
            )

        # 4. Validar que se envió la lista completa
        estudiantes_enviados_ids = {
            item["estudiante_id"] for item in asistencias_data
        }

        estudiantes_reales_ids = set(
            estudiantes_curso.values_list("id", flat=True)
        )

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

        # 5. Crear sesión de asistencia
        sesion = AsistenciaSesion.objects.create(
            curso=curso,
            fecha=fecha,
            registrado_por=request.user,
            estado="ENVIADA"
        )

        # 6. Crear asistencias individuales
        asistencias_objs = []

        for item in asistencias_data:
            asistencias_objs.append(
                Asistencia(
                    sesion=sesion,
                    estudiante_id=item["estudiante_id"],
                    estado=item["estado"],
                    hora=item["hora"],
                    uniforme=item.get("uniforme", True) if item["estado"] not in ("FALTA", "LICENCIA") else True,
                )
            )

        Asistencia.objects.bulk_create(asistencias_objs)

        from backend.apps.auditoria.services import registrar
        nombre = f"{request.user.first_name} {request.user.last_name}".strip() or request.user.username
        registrar(
            request.user,
            'REGISTRAR_ASISTENCIA',
            f"{nombre} registró asistencia del curso {curso} ({fecha:%d/%m/%Y})",
            request,
        )

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
        """
        Extrae el primer error en formato de string simple.
        
        Maneja estructuras como:
        - {"errores": "mensaje"}
        - {"campo": ["error1", "error2"]}
        - {"asistencias": [{"estado": ["error"]}]}
        """
        # Si hay un error directo en 'errores'
        if 'errores' in errors:
            error_msg = errors['errores']
            if isinstance(error_msg, list):
                return str(error_msg[0])
            return str(error_msg)
        
        # Si hay errores en 'asistencias' (lista anidada)
        if 'asistencias' in errors:
            asist_errors = errors['asistencias']
            
            # Si es un error general de la lista
            if isinstance(asist_errors, list) and asist_errors:
                primer_item = asist_errors[0]
                
                # Si es un dict con errores de campos
                if isinstance(primer_item, dict):
                    # Buscar el primer campo con error
                    for field, field_errors in primer_item.items():
                        if isinstance(field_errors, list) and field_errors:
                            return str(field_errors[0])
                        return str(field_errors)
                
                return str(primer_item)
            
            # Si es un error directo de la lista
            if isinstance(asist_errors, str):
                return asist_errors
        
        # Para cualquier otro campo
        for field, field_errors in errors.items():
            if isinstance(field_errors, list) and field_errors:
                return str(field_errors[0])
            return str(field_errors)
        
        # Fallback genérico
        return "Error de validación en los datos enviados."
from rest_framework.views import APIView
from rest_framework.response import Response
from rest_framework import status

from backend.core.permissions import IsTutor
from backend.apps.students.models import Estudiante
from backend.apps.students.serializers import EstudianteTutorPerfilSerializer
from backend.apps.academics.models import ProfesorCurso
from backend.apps.academics.services.notas_mongo_service import (
    promedios_saber_hacer_por_materia,
    obtener_detalle_notas_tutor,
)


class MiEstudianteView(APIView):
    """
    GET /api/students/me/student/

    Devuelve todos los estudiantes vinculados al tutor autenticado,
    ordenados por activo primero y luego por id.
    La app móvil usa esta lista para el selector de hijo activo.
    """

    permission_classes = (IsTutor,)

    def get(self, request):
        estudiantes = (
            Estudiante.objects
            .select_related("curso")
            .filter(tutor=request.user)
            .order_by("-activo", "id")
        )

        if not estudiantes.exists():
            return Response(
                {"errores": "No existe un estudiante vinculado a este tutor."},
                status=status.HTTP_404_NOT_FOUND,
            )

        serializer = EstudianteTutorPerfilSerializer(estudiantes, many=True)
        return Response(serializer.data)


class MateriasEstudianteTutorView(APIView):
    """
    GET /api/students/me/student/{estudiante_id}/materias/

    Devuelve las materias que cursa el estudiante (hijo del tutor autenticado),
    junto con el nombre del profesor que dicta cada materia.
    """

    permission_classes = (IsTutor,)

    def get(self, request, estudiante_id):
        try:
            estudiante = (
                Estudiante.objects
                .select_related("curso")
                .get(pk=estudiante_id, tutor=request.user)
            )
        except Estudiante.DoesNotExist:
            return Response(
                {"errores": "Estudiante no encontrado o no pertenece a este tutor."},
                status=status.HTTP_404_NOT_FOUND,
            )

        trimestre_raw = request.query_params.get("trimestre")
        trimestre = None
        if trimestre_raw is not None:
            if trimestre_raw not in ("1", "2", "3"):
                return Response(
                    {"errores": "El trimestre debe ser 1, 2 o 3."},
                    status=status.HTTP_400_BAD_REQUEST,
                )
            trimestre = int(trimestre_raw)

        asignaciones = list(
            ProfesorCurso.objects
            .select_related("materia", "profesor")
            .filter(curso=estudiante.curso)
            .order_by("materia__nombre")
        )

        materia_ids = [a.materia.id for a in asignaciones]
        promedios   = promedios_saber_hacer_por_materia(estudiante.id, materia_ids, trimestre=trimestre)

        data = [
            {
                "materia_id":      a.materia.id,
                "materia_nombre":  a.materia.nombre,
                "profesor_nombre": (
                    f"{a.profesor.first_name} {a.profesor.last_name}".strip()
                    or a.profesor.username
                ),
                "promedio": promedios.get(a.materia.id),
            }
            for a in asignaciones
        ]

        return Response(data)


class NotasMateriaEstudianteTutorView(APIView):
    """
    GET /api/students/me/student/{estudiante_id}/materias/{materia_id}/notas/

    Devuelve las notas de SABER y HACER del estudiante en una materia,
    agrupadas por trimestre. Solo accesible para el tutor dueño del estudiante.
    """

    permission_classes = (IsTutor,)

    def get(self, request, estudiante_id, materia_id):
        try:
            estudiante = (
                Estudiante.objects
                .only("id", "curso_id")
                .get(pk=estudiante_id, tutor=request.user)
            )
        except Estudiante.DoesNotExist:
            return Response(
                {"errores": "Estudiante no encontrado o no pertenece a este tutor."},
                status=status.HTTP_404_NOT_FOUND,
            )

        materia_en_curso = ProfesorCurso.objects.filter(
            curso_id=estudiante.curso_id,
            materia_id=materia_id,
        ).exists()
        if not materia_en_curso:
            return Response(
                {"errores": "La materia no corresponde al curso del estudiante."},
                status=status.HTTP_404_NOT_FOUND,
            )

        try:
            notas_por_trim = obtener_detalle_notas_tutor(estudiante.id, materia_id)
        except Exception:
            return Response(
                {"errores": "No se pudo obtener las notas. Intente nuevamente."},
                status=status.HTTP_503_SERVICE_UNAVAILABLE,
            )

        return Response({
            "estudiante_id": estudiante.id,
            "materia_id":    materia_id,
            "trimestres":    notas_por_trim,
        })

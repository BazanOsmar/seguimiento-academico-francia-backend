from django.db.models import Count, Q
from rest_framework.views import APIView
from rest_framework.response import Response
from rest_framework.permissions import IsAuthenticated
from django.shortcuts import get_object_or_404

from backend.apps.users.permissions import IsDirectorOrRegente
from backend.apps.academics.models import Curso
from backend.apps.attendance.models import AsistenciaSesion


class HistorialCursoView(APIView):
    """
    GET /api/attendance/cursos/{curso_id}/historial/

    Lista todas las sesiones de asistencia de un curso
    con el resumen de estados por sesión, ordenadas por fecha descendente.

    Permisos: Director o Regente.
    """
    permission_classes = (IsAuthenticated, IsDirectorOrRegente)

    def get(self, request, curso_id):
        get_object_or_404(Curso, pk=curso_id)

        sesiones = (
            AsistenciaSesion.objects
            .filter(curso_id=curso_id)
            .annotate(
                presentes=Count("asistencias", filter=Q(asistencias__estado="PRESENTE")),
                faltas=Count("asistencias", filter=Q(asistencias__estado="FALTA")),
                atrasos=Count("asistencias", filter=Q(asistencias__estado="ATRASO")),
                licencias=Count("asistencias", filter=Q(asistencias__estado="LICENCIA")),
            )
            .order_by("-fecha")
        )

        data = [
            {
                "id": s.id,
                "fecha": s.fecha.isoformat(),
                "hora": s.created_at.strftime("%H:%M"),
                "presentes": s.presentes,
                "faltas": s.faltas,
                "atrasos": s.atrasos,
                "licencias": s.licencias,
            }
            for s in sesiones
        ]

        return Response(data)

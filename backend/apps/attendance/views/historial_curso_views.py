from django.db.models import Count, Q
from rest_framework.views import APIView
from rest_framework.response import Response
from rest_framework.permissions import IsAuthenticated
from django.shortcuts import get_object_or_404

from backend.core.permissions import IsDirectorOrRegente
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

        qs = AsistenciaSesion.objects.filter(curso_id=curso_id)

        mes = request.query_params.get("mes", "").strip()
        if mes and len(mes) == 7:
            partes = mes.split("-")
            if len(partes) == 2 and partes[0].isdigit() and partes[1].isdigit():
                qs = qs.filter(fecha__year=int(partes[0]), fecha__month=int(partes[1]))

        sesiones = (
            qs
            .annotate(
                presentes=Count("asistencias", filter=Q(asistencias__estado="PRESENTE")),
                faltas=Count("asistencias", filter=Q(asistencias__estado="FALTA")),
                atrasos=Count("asistencias", filter=Q(asistencias__estado="ATRASO")),
                licencias=Count("asistencias", filter=Q(asistencias__estado="LICENCIA")),
                sin_uniforme=Count(
                    "asistencias",
                    filter=Q(asistencias__uniforme=False)
                    & ~Q(asistencias__estado__in=("FALTA", "LICENCIA")),
                ),
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
                "sin_uniforme": s.sin_uniforme,
            }
            for s in sesiones
        ]

        return Response(data)

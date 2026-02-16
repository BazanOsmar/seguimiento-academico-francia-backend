from django.db.models import Count, Q

from rest_framework.views import APIView
from rest_framework.response import Response
from rest_framework import status
from rest_framework.permissions import IsAuthenticated

from backend.apps.attendance.models import AsistenciaSesion
from backend.apps.users.permissions import IsDirectorOrRegente


class RegistrosRecientesView(APIView):
    """
    GET api/attendance/registros-recientes/

    Devuelve los 10 registros de asistencia más recientes
    con el resumen de presentes, faltas, atrasos y licencias.

    Permisos: Solo Director o Regente.
    """

    permission_classes = [IsAuthenticated, IsDirectorOrRegente]

    def get(self, request):
        sesiones = (
            AsistenciaSesion.objects
            .select_related("curso")
            .annotate(
                presentes=Count("asistencias", filter=Q(asistencias__estado="PRESENTE")),
                faltas=Count("asistencias", filter=Q(asistencias__estado="FALTA")),
                atrasos=Count("asistencias", filter=Q(asistencias__estado="ATRASO")),
                licencias=Count("asistencias", filter=Q(asistencias__estado="LICENCIA")),
            )
            .order_by("-created_at")[:10]
        )

        registros = [
            {
                "id": sesion.id,
                "curso": str(sesion.curso),
                "fecha": sesion.fecha.isoformat(),
                "hora": sesion.created_at.strftime("%H:%M"),
                "presentes": sesion.presentes,
                "faltas": sesion.faltas,
                "atrasos": sesion.atrasos,
                "licencias": sesion.licencias,
            }
            for sesion in sesiones
        ]

        return Response(registros, status=status.HTTP_200_OK)

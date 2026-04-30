from django.utils.dateparse import parse_date
from django.utils import timezone

from rest_framework.views import APIView
from rest_framework.response import Response
from rest_framework.permissions import IsAuthenticated
from rest_framework import status

from backend.core.permissions import IsDirectorOrRegente
from backend.apps.attendance.models import Asistencia

_ESTADOS_SIN_UNIFORME_EXCLUIDOS = {'FALTA', 'LICENCIA'}


class SinUniformeView(APIView):
    """
    GET /api/attendance/sin-uniforme/?fecha=YYYY-MM-DD

    Retorna estudiantes registrados sin uniforme en la fecha indicada.
    Excluye FALTA y LICENCIA porque el uniforme no aplica en esos estados.
    """
    permission_classes = [IsAuthenticated, IsDirectorOrRegente]

    def get(self, request):
        fecha_str = request.query_params.get('fecha')
        if fecha_str:
            fecha = parse_date(fecha_str)
            if not fecha:
                return Response(
                    {'errores': 'Fecha inválida. Usa YYYY-MM-DD.'},
                    status=status.HTTP_400_BAD_REQUEST,
                )
        else:
            fecha = timezone.localdate()

        qs = (
            Asistencia.objects
            .filter(uniforme=False, sesion__fecha=fecha)
            .exclude(estado__in=_ESTADOS_SIN_UNIFORME_EXCLUIDOS)
            .select_related(
                'estudiante',
                'sesion__curso',
                'sesion__registrado_por',
            )
            .order_by(
                'sesion__curso__grado',
                'sesion__curso__paralelo',
                'estudiante__apellido_paterno',
            )
        )

        estudiantes = []
        for a in qs:
            e = a.estudiante
            reg = a.sesion.registrado_por
            apellidos = f"{e.apellido_paterno} {e.apellido_materno or ''}".strip()
            estudiantes.append({
                'nombre_completo': f"{apellidos} {e.nombre}",
                'curso_id': a.sesion.curso_id,
                'estudiante_id': e.id,
                'curso': str(a.sesion.curso),
                'estado': a.estado,
                'registrado_por': f"{reg.first_name} {reg.last_name}".strip() if reg else '—',
            })

        return Response({
            'total': len(estudiantes),
            'estudiantes': estudiantes,
        })

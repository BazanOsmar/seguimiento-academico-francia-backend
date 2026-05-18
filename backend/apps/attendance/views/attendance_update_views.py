from rest_framework.views import APIView
from rest_framework.response import Response
from rest_framework.permissions import IsAuthenticated
from rest_framework import status

from backend.core.permissions import IsDirector
from backend.apps.attendance.models import Asistencia
from backend.apps.auditoria.services import registrar

ESTADOS_VALIDOS = {'PRESENTE', 'FALTA', 'ATRASO', 'LICENCIA'}


class ActualizarAsistenciaIndividualView(APIView):
    """
    PATCH /api/attendance/asistencias/<asistencia_id>/
    Permite al Director corregir el estado de asistencia de un estudiante
    en una sesión ya registrada.
    """
    permission_classes = [IsAuthenticated, IsDirector]

    def patch(self, request, asistencia_id):
        nuevo_estado = request.data.get('estado')

        if nuevo_estado not in ESTADOS_VALIDOS:
            return Response(
                {'errores': f'Estado inválido. Opciones: {", ".join(sorted(ESTADOS_VALIDOS))}'},
                status=status.HTTP_400_BAD_REQUEST,
            )

        try:
            asistencia = (
                Asistencia.objects
                .select_related('sesion', 'sesion__curso', 'estudiante')
                .get(id=asistencia_id)
            )
        except Asistencia.DoesNotExist:
            return Response(
                {'errores': 'Registro de asistencia no encontrado.'},
                status=status.HTTP_404_NOT_FOUND,
            )

        estado_anterior = asistencia.estado
        if estado_anterior == nuevo_estado:
            return Response({'estado': nuevo_estado})

        asistencia.estado = nuevo_estado
        asistencia.save(update_fields=['estado'])

        nombre_director = (
            f"{request.user.first_name} {request.user.last_name}".strip()
            or request.user.username
        )
        est = asistencia.estudiante
        nombre_est = (
            f"{est.apellido_paterno} {est.apellido_materno}, {est.nombre}".strip()
        )
        registrar(
            request.user,
            'MODIFICAR_ASISTENCIA',
            (
                f"{nombre_director} corrigió asistencia de {nombre_est}: "
                f"{estado_anterior} → {nuevo_estado} "
                f"({asistencia.sesion.fecha:%d/%m/%Y}, {asistencia.sesion.curso})"
            ),
            request,
        )

        return Response({'estado': nuevo_estado})

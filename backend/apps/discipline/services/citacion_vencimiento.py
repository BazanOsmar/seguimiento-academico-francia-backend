from django.utils import timezone
from ..models import Citacion


def marcar_citaciones_vencidas():
    """
    Actualiza a NO_ASISTIO todas las citaciones PENDIENTE
    cuya fecha_limite_asistencia ya pasó.
    Retorna la cantidad de registros actualizados.
    """
    hoy = timezone.now().date()
    return Citacion.objects.filter(
        asistencia="PENDIENTE",
        fecha_limite_asistencia__lt=hoy,
    ).update(asistencia="NO_ASISTIO")

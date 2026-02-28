from django.utils import timezone
from ..models import Citacion


def marcar_citaciones_vencidas():
    """
    Actualiza a NO_ASISTIO todas las citaciones en PENDIENTE o VISTO
    cuya fecha_limite_asistencia ya pasó.
    VISTO incluido: el padre vio la citación pero no se presentó.
    Retorna la cantidad de registros actualizados.
    """
    hoy = timezone.now().date()
    return Citacion.objects.filter(
        asistencia__in=["PENDIENTE", "VISTO"],
        fecha_limite_asistencia__lt=hoy,
    ).update(asistencia="NO_ASISTIO")

from .models import RegistroActividad


def _get_ip(request):
    x_forwarded = request.META.get('HTTP_X_FORWARDED_FOR')
    if x_forwarded:
        return x_forwarded.split(',')[0].strip()
    return request.META.get('REMOTE_ADDR')


def registrar(usuario, accion: str, descripcion: str, request=None):
    """
    Guarda un registro de actividad en la base de datos.

    Parámetros:
        usuario     — instancia de User (puede ser None)
        accion      — código libre, ej: 'LOGIN', 'CREAR_USUARIO', 'REGISTRAR_ASISTENCIA'
        descripcion — texto legible para el director, ej: 'Juan Pérez inició sesión'
        request     — HttpRequest opcional, para capturar la IP
    """
    ip = _get_ip(request) if request else None
    RegistroActividad.objects.create(
        usuario=usuario,
        accion=accion,
        descripcion=descripcion,
        ip=ip,
    )

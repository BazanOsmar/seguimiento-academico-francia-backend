import datetime
import logging

from backend.apps.attendance.models import Asistencia

logger = logging.getLogger(__name__)

UMBRAL_FALTAS = 3
UMBRAL_ATRASOS = 6
DIAS_LIMITE_CITACION = 3  # días para que el tutor se presente


def _get_emisor_sistema():
    """Retorna el primer Director disponible para emitir citaciones automáticas."""
    from backend.apps.users.models import TipoUsuario, User
    try:
        tipo_director = TipoUsuario.objects.get(nombre='Director')
        return User.objects.filter(tipo_usuario=tipo_director).first()
    except TipoUsuario.DoesNotExist:
        return None


def _ya_tiene_citacion_pendiente(estudiante, motivo):
    """Evita duplicar citaciones si ya hay una activa por el mismo motivo."""
    from backend.apps.discipline.models import Citacion
    return Citacion.objects.filter(
        estudiante=estudiante,
        motivo=motivo,
        asistencia='PENDIENTE',
    ).exists()


def _crear_citacion_automatica(estudiante, motivo, descripcion, emisor):
    from backend.apps.discipline.models import Citacion
    fecha_limite = datetime.date.today() + datetime.timedelta(days=DIAS_LIMITE_CITACION)
    citacion = Citacion.objects.create(
        estudiante=estudiante,
        emisor=emisor,
        motivo=motivo,
        descripcion=descripcion,
        fecha_limite_asistencia=fecha_limite,
    )
    logger.info(
        "Citación automática creada — id=%s | estudiante=%s | motivo=%s",
        citacion.id, estudiante, motivo,
    )


def verificar_faltas_atrasos_consecutivos(sesion):
    """
    Verifica si algún estudiante acumuló faltas o atrasos consecutivos
    en el mismo curso después de registrar la asistencia de una sesión.
    Si se alcanza el umbral, genera una citación automática al tutor.

    - 3 faltas consecutivas  → citación motivo FALTAS
    - 6 atrasos consecutivos → citación motivo ATRASOS
    """
    curso = sesion.curso
    asistencias_sesion = sesion.asistencias.select_related('estudiante')

    emisor = _get_emisor_sistema()
    if not emisor:
        logger.error("No se encontró un Director para emitir citaciones automáticas.")
        return

    estudiantes_falta = [a.estudiante for a in asistencias_sesion if a.estado == 'FALTA']
    estudiantes_atraso = [a.estudiante for a in asistencias_sesion if a.estado == 'ATRASO']

    for estudiante in estudiantes_falta:
        ultimas = (
            Asistencia.objects
            .filter(sesion__curso=curso, estudiante=estudiante)
            .order_by('-sesion__fecha')
            .values_list('estado', flat=True)[:UMBRAL_FALTAS]
        )
        if len(ultimas) == UMBRAL_FALTAS and all(e == 'FALTA' for e in ultimas):
            logger.warning(
                "Estudiante %s acumula %d faltas consecutivas en %s",
                estudiante, UMBRAL_FALTAS, curso,
            )
            if not _ya_tiene_citacion_pendiente(estudiante, 'FALTAS'):
                nombre = f"{estudiante.nombre} {estudiante.apellido_paterno} {estudiante.apellido_materno}".strip()
                descripcion = (
                    f"Se le cita a presentarse a la unidad educativa para tratar el caso de "
                    f"inasistencias reiteradas del/la estudiante {nombre} del curso {curso}. "
                    f"Se han registrado {UMBRAL_FALTAS} faltas consecutivas. "
                    f"Su presencia es necesaria para coordinar las medidas correspondientes."
                )
                _crear_citacion_automatica(estudiante, 'FALTAS', descripcion, emisor)

    for estudiante in estudiantes_atraso:
        ultimas = (
            Asistencia.objects
            .filter(sesion__curso=curso, estudiante=estudiante)
            .order_by('-sesion__fecha')
            .values_list('estado', flat=True)[:UMBRAL_ATRASOS]
        )
        if len(ultimas) == UMBRAL_ATRASOS and all(e == 'ATRASO' for e in ultimas):
            logger.warning(
                "Estudiante %s acumula %d atrasos consecutivos en %s",
                estudiante, UMBRAL_ATRASOS, curso,
            )
            if not _ya_tiene_citacion_pendiente(estudiante, 'ATRASOS'):
                nombre = f"{estudiante.nombre} {estudiante.apellido_paterno} {estudiante.apellido_materno}".strip()
                descripcion = (
                    f"Se le cita a presentarse a la unidad educativa para tratar el caso de "
                    f"impuntualidad reiterada del/la estudiante {nombre} del curso {curso}. "
                    f"Se han registrado {UMBRAL_ATRASOS} atrasos consecutivos. "
                    f"Su presencia es necesaria para coordinar las medidas correspondientes."
                )
                _crear_citacion_automatica(estudiante, 'ATRASOS', descripcion, emisor)

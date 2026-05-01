import datetime
import logging

from backend.apps.attendance.models import Asistencia

logger = logging.getLogger(__name__)

UMBRAL_FALTAS  = 3
UMBRAL_ATRASOS = 5
DIAS_HABILES_LIMITE = 5  # días hábiles (lun–vie) para que el tutor se presente


def _sumar_dias_habiles(fecha, dias):
    """Suma `dias` días hábiles (lun–vie) a `fecha`."""
    actual = fecha
    sumados = 0
    while sumados < dias:
        actual += datetime.timedelta(days=1)
        if actual.weekday() < 5:  # 0=lun … 4=vie
            sumados += 1
    return actual


def _get_director():
    """Retorna el primer Director disponible."""
    from backend.apps.users.models import TipoUsuario, User
    try:
        tipo = TipoUsuario.objects.get(nombre='Director')
        return User.objects.filter(tipo_usuario=tipo).first()
    except TipoUsuario.DoesNotExist:
        return None


def _ya_tiene_citacion_pendiente(estudiante, motivo):
    from backend.apps.discipline.models import Citacion
    return Citacion.objects.filter(
        estudiante=estudiante,
        motivo=motivo,
        asistencia='PENDIENTE',
    ).exists()


def _contar_racha(estudiante, curso, estado):
    """Cuenta cuántos registros consecutivos del `estado` dado tiene el estudiante."""
    historial = (
        Asistencia.objects
        .filter(sesion__curso=curso, estudiante=estudiante)
        .order_by('-sesion__fecha')
        .values_list('estado', flat=True)
    )
    count = 0
    for e in historial:
        if e == estado:
            count += 1
        else:
            break
    return count


def _crear_citacion_automatica(estudiante, motivo, descripcion, emisor):
    from backend.apps.discipline.models import Citacion
    fecha_limite = _sumar_dias_habiles(datetime.date.today(), DIAS_HABILES_LIMITE)
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


def _notificar_director_sin_tutor(estudiante, curso, racha, tipo, director):
    """Crea una Notificacion al Director cuando el estudiante no tiene tutor asignado."""
    from backend.apps.notifications.models import Notificacion

    nombre = f"{estudiante.apellido_paterno} {estudiante.apellido_materno}, {estudiante.nombre}".strip(', ')

    if tipo == 'FALTA':
        detalle = f"{racha} falta{'s' if racha != 1 else ''} consecutiva{'s' if racha != 1 else ''}"
    else:
        detalle = f"{racha} atraso{'s' if racha != 1 else ''} consecutivo{'s' if racha != 1 else ''}"

    descripcion = (
        f"El/la estudiante {nombre} del curso {curso} acumula {detalle}. "
        f"No se envió una citación porque no tiene tutor asignado."
    )

    Notificacion.objects.create(
        emisor=None,
        receptor=director,
        descripcion=descripcion,
    )
    logger.warning(
        "Notificación al Director — estudiante %s sin tutor | %s",
        estudiante, detalle,
    )


def verificar_faltas_atrasos_consecutivos(sesion):
    """
    Verifica si algún estudiante acumuló faltas o atrasos consecutivos
    tras registrar la asistencia de una sesión.

    Con tutor asignado:
    - 3+ faltas consecutivas  → citación motivo FALTAS  (sin duplicar si ya hay una pendiente)
    - 5+ atrasos consecutivos → citación motivo ATRASOS (sin duplicar si ya hay una pendiente)

    Sin tutor asignado:
    - Notificación al Director con el conteo actual (se genera cada vez que crece la racha)
    """
    curso = sesion.curso
    asistencias_sesion = sesion.asistencias.select_related('estudiante', 'estudiante__tutor')

    director = _get_director()
    if not director:
        logger.error("No se encontró un Director en el sistema.")
        return

    estudiantes_falta  = [a.estudiante for a in asistencias_sesion if a.estado == 'FALTA']
    estudiantes_atraso = [a.estudiante for a in asistencias_sesion if a.estado == 'ATRASO']

    for estudiante in estudiantes_falta:
        racha = _contar_racha(estudiante, curso, 'FALTA')
        if racha < UMBRAL_FALTAS:
            continue

        nombre = f"{estudiante.nombre} {estudiante.apellido_paterno} {estudiante.apellido_materno}".strip()

        if not estudiante.tutor:
            _notificar_director_sin_tutor(estudiante, curso, racha, 'FALTA', director)
            continue

        if _ya_tiene_citacion_pendiente(estudiante, 'FALTAS'):
            continue

        descripcion = (
            f"Se cita al tutor del/la estudiante {nombre} del curso {curso} a presentarse "
            f"a la unidad educativa para tratar el caso de inasistencias reiteradas. "
            f"Se han registrado {racha} faltas consecutivas. "
            f"En caso de no apersonarse a la U.E. para justificar las inasistencias de su hijo/a, "
            f"el caso será derivado a la Defensoría de la Niñez y Adolescencia."
        )
        _crear_citacion_automatica(estudiante, 'FALTAS', descripcion, director)
        logger.warning("Estudiante %s — %d faltas consecutivas en %s", estudiante, racha, curso)

    for estudiante in estudiantes_atraso:
        racha = _contar_racha(estudiante, curso, 'ATRASO')
        if racha < UMBRAL_ATRASOS:
            continue

        nombre = f"{estudiante.nombre} {estudiante.apellido_paterno} {estudiante.apellido_materno}".strip()

        if not estudiante.tutor:
            _notificar_director_sin_tutor(estudiante, curso, racha, 'ATRASO', director)
            continue

        if _ya_tiene_citacion_pendiente(estudiante, 'ATRASOS'):
            continue

        descripcion = (
            f"Se cita al tutor del/la estudiante {nombre} del curso {curso} a presentarse "
            f"a la unidad educativa para tratar el caso de impuntualidad reiterada. "
            f"Se han registrado {racha} atrasos consecutivos. "
            f"Su presencia es necesaria para coordinar las medidas correspondientes."
        )
        _crear_citacion_automatica(estudiante, 'ATRASOS', descripcion, director)
        logger.warning("Estudiante %s — %d atrasos consecutivos en %s", estudiante, racha, curso)

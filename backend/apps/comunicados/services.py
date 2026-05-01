import logging
import threading

logger = logging.getLogger(__name__)

ALCANCES_VALIDOS = ('TODOS', 'GRADO', 'CURSO', 'MIS_CURSOS', 'GRUPO')


def _resolver_estudiantes(alcance, datos, emisor):
    """
    Devuelve un queryset de Estudiante activos según el alcance indicado.
    datos = { grado, curso_id, cursos_grupo_ids }
    """
    from backend.apps.students.models import Estudiante

    qs = Estudiante.objects.filter(activo=True)

    if alcance == 'TODOS':
        return qs

    if alcance == 'GRADO':
        return qs.filter(curso__grado=datos['grado'])

    if alcance == 'CURSO':
        return qs.filter(curso_id=datos['curso_id'])

    if alcance == 'MIS_CURSOS':
        from backend.apps.academics.models import ProfesorCurso
        curso_ids = (
            ProfesorCurso.objects
            .filter(profesor=emisor)
            .values_list('curso_id', flat=True)
            .distinct()
        )
        return qs.filter(curso_id__in=curso_ids)

    if alcance == 'GRUPO':
        return qs.filter(curso_id__in=datos['cursos_grupo_ids'])

    return qs.none()


def crear_comunicado(titulo, descripcion, fecha_expiracion, emisor, alcance, datos_alcance):
    """
    Crea el Comunicado y genera las filas en ComunicadoEstudiante.
    Retorna el Comunicado creado.
    datos_alcance = { grado, curso_id, cursos_grupo_ids }
    """
    from .models import Comunicado, ComunicadoEstudiante

    comunicado = Comunicado.objects.create(
        titulo=titulo,
        descripcion=descripcion,
        fecha_expiracion=fecha_expiracion,
        emisor=emisor,
    )

    estudiantes_ids = list(
        _resolver_estudiantes(alcance, datos_alcance, emisor)
        .values_list('id', flat=True)
    )

    ComunicadoEstudiante.objects.bulk_create(
        [ComunicadoEstudiante(comunicado=comunicado, estudiante_id=eid) for eid in estudiantes_ids],
        ignore_conflicts=True,
    )

    logger.info(
        "Comunicado creado id=%s | alcance=%s | destinatarios=%d",
        comunicado.id, alcance, len(estudiantes_ids),
    )

    return comunicado


def notificar_tutores(comunicado):
    """Envía notificaciones FCM a los tutores de los estudiantes destinatarios."""
    from django.conf import settings as django_settings
    from backend.apps.users.models import User
    from backend.apps.notifications.services import enviar_notificacion
    from .models import ComunicadoEstudiante

    tutor_ids = (
        ComunicadoEstudiante.objects
        .filter(comunicado=comunicado, estudiante__tutor__isnull=False)
        .values_list('estudiante__tutor_id', flat=True)
        .distinct()
    )
    tutores = User.objects.filter(pk__in=tutor_ids, is_active=True)

    imagen_url = getattr(django_settings, 'FCM_NOTIFICATION_IMAGE', None)
    for tutor in tutores:
        threading.Thread(
            target=enviar_notificacion,
            args=(tutor,),
            kwargs={
                'titulo': comunicado.titulo,
                'cuerpo': comunicado.descripcion[:200],
                'datos':  {'rol': 'padre', 'comunicado_id': str(comunicado.id)},
                'imagen': imagen_url,
            },
            daemon=True,
        ).start()

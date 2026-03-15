import logging

import firebase_admin
from firebase_admin import messaging

logger = logging.getLogger(__name__)


def enviar_notificacion(usuario, titulo, cuerpo, datos=None, imagen=None):
    """
    Envía una notificación push a todos los dispositivos FCM registrados
    del usuario. Elimina automáticamente los tokens inválidos.

    Parámetros:
        usuario  -- instancia de User (o ID)
        titulo   -- str, título de la notificación
        cuerpo   -- str, texto del cuerpo
        datos    -- dict opcional con datos extra (valores deben ser str)
        imagen   -- URL pública de imagen a mostrar en la notificación (opcional)
    """
    if not firebase_admin._apps:
        logger.warning("FCM: Firebase no inicializado, notificación omitida.")
        return

    from .models import FCMDevice
    tokens = list(FCMDevice.objects.filter(user=usuario).values_list('token', flat=True))
    if not tokens:
        return

    message = messaging.MulticastMessage(
        notification=messaging.Notification(title=titulo, body=cuerpo, image=imagen),
        data={k: str(v) for k, v in (datos or {}).items()},
        tokens=tokens,
        webpush=messaging.WebpushConfig(
            notification=messaging.WebpushNotification(
                title=titulo,
                body=cuerpo,
                icon='/static/img/logo_francia.png',
                image=imagen,
            ),
        ),
    )

    try:
        response = messaging.send_each_for_multicast(message)
        if response.failure_count > 0:
            failed = [
                tokens[i]
                for i, r in enumerate(response.responses)
                if not r.success
            ]
            FCMDevice.objects.filter(token__in=failed).delete()
            logger.warning("FCM: %d token(s) inválido(s) eliminado(s).", response.failure_count)
    except Exception as exc:
        logger.error("FCM error al enviar notificación: %s", exc)

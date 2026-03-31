import logging

import firebase_admin
from django.db.models import Exists, OuterRef
from firebase_admin import messaging as fb_messaging
from rest_framework import status
from rest_framework.permissions import IsAuthenticated
from rest_framework.response import Response
from rest_framework.views import APIView

from backend.apps.students.models import Estudiante
from backend.apps.users.permissions import IsDirector

from .models import FCMDevice

logger = logging.getLogger(__name__)


class BroadcastView(APIView):
    """
    POST /api/notifications/broadcast/
        Envía una notificación push a TODOS los dispositivos registrados.
        Solo el Director puede usar este endpoint.
    """
    permission_classes = (IsDirector,)

    def post(self, request):
        titulo = request.data.get('titulo', '').strip()
        cuerpo  = request.data.get('cuerpo', '').strip()

        if not titulo or not cuerpo:
            return Response(
                {'errores': 'Los campos titulo y cuerpo son requeridos.'},
                status=status.HTTP_400_BAD_REQUEST,
            )

        tokens = list(FCMDevice.objects.values_list('token', flat=True))
        if not tokens:
            return Response({'enviados': 0, 'fallidos': 0, 'sin_dispositivos': True})

        if not firebase_admin._apps:
            return Response(
                {'errores': 'Firebase no está inicializado en el servidor.'},
                status=status.HTTP_503_SERVICE_UNAVAILABLE,
            )

        message = fb_messaging.MulticastMessage(
            notification=fb_messaging.Notification(title=titulo, body=cuerpo),
            tokens=tokens,
        )

        try:
            response = fb_messaging.send_each_for_multicast(message)
        except Exception as exc:
            logger.error("FCM broadcast error: %s", exc)
            return Response(
                {'errores': 'Error al comunicarse con Firebase.'},
                status=status.HTTP_502_BAD_GATEWAY,
            )

        # Limpiar tokens inválidos
        if response.failure_count > 0:
            failed = [
                tokens[i]
                for i, r in enumerate(response.responses)
                if not r.success
            ]
            FCMDevice.objects.filter(token__in=failed).delete()
            logger.warning("FCM broadcast: %d token(s) inválido(s) eliminado(s).", response.failure_count)

        return Response({
            'enviados': response.success_count,
            'fallidos': response.failure_count,
        })


class DispositivosCountView(APIView):
    """GET /api/notifications/dispositivos/ — total de tokens FCM registrados."""
    permission_classes = (IsDirector,)

    def get(self, request):
        return Response({'total': FCMDevice.objects.count()})


class CoberturaComunicadoView(APIView):
    """
    GET /api/notifications/cobertura-comunicado/
    Devuelve cuántos tutores únicos (padres) recibirán notificación push
    según el alcance del comunicado a enviar.

    Params:
        alcance  = TODOS | GRADO | CURSO
        grado    = nombre del grado  (requerido si alcance=GRADO)
        curso_id = id del curso      (requerido si alcance=CURSO)
    """
    permission_classes = (IsDirector,)

    def get(self, request):
        alcance  = request.query_params.get('alcance', 'TODOS')
        grado    = request.query_params.get('grado', '').strip()
        curso_id = request.query_params.get('curso_id', '').strip()

        qs = Estudiante.objects.filter(activo=True, tutor__isnull=False)

        if alcance == 'GRADO':
            if not grado:
                return Response(
                    {'errores': 'Se requiere el parámetro grado.'},
                    status=status.HTTP_400_BAD_REQUEST,
                )
            qs = qs.filter(curso__grado=grado)
        elif alcance == 'CURSO':
            if not curso_id:
                return Response(
                    {'errores': 'Se requiere el parámetro curso_id.'},
                    status=status.HTTP_400_BAD_REQUEST,
                )
            try:
                qs = qs.filter(curso_id=int(curso_id))
            except ValueError:
                return Response(
                    {'errores': 'curso_id inválido.'},
                    status=status.HTTP_400_BAD_REQUEST,
                )

        tutor_ids = qs.values_list('tutor_id', flat=True).distinct()

        from django.contrib.auth import get_user_model
        User = get_user_model()
        tutores = list(
            User.objects.filter(id__in=tutor_ids)
            .annotate(tiene_fcm=Exists(FCMDevice.objects.filter(user=OuterRef('pk'))))
            .values('id', 'first_name', 'last_name', 'username', 'tiene_fcm')
        )

        # Estudiantes agrupados por tutor (solo los del scope actual)
        estudiantes_qs = qs.values(
            'tutor_id',
            'apellido_paterno', 'apellido_materno', 'nombre',
            'curso__grado', 'curso__paralelo',
        )
        estudiantes_por_tutor = {}
        for e in estudiantes_qs:
            tid = e['tutor_id']
            apellidos = f"{e['apellido_paterno']} {e['apellido_materno']}".strip()
            nombre_est = f"{apellidos}, {e['nombre']}".strip(', ')
            curso_label = f"{e['curso__grado']} {e['curso__paralelo']}".strip()
            estudiantes_por_tutor.setdefault(tid, []).append({
                'nombre': nombre_est,
                'curso':  curso_label,
            })

        lista = [
            {
                'id':        t['id'],
                'nombre':    f"{t['first_name']} {t['last_name']}".strip() or t['username'],
                'tiene_fcm': t['tiene_fcm'],
                'estudiantes': estudiantes_por_tutor.get(t['id'], []),
            }
            for t in tutores
        ]
        lista.sort(key=lambda x: x['nombre'])

        con_fcm = sum(1 for t in lista if t['tiene_fcm'])
        return Response({
            'total':   len(lista),
            'con_fcm': con_fcm,
            'sin_fcm': len(lista) - con_fcm,
            'tutores': lista,
        })


class RegistrarTokenView(APIView):
    """
    POST /api/notifications/fcm/token/
        Registra (o actualiza) el token FCM del dispositivo actual.

    DELETE /api/notifications/fcm/token/
        Elimina el token FCM (al cerrar sesión).
    """
    permission_classes = (IsAuthenticated,)

    def post(self, request):
        token = request.data.get('token', '').strip()
        if not token:
            return Response({'errores': 'Token requerido.'}, status=status.HTTP_400_BAD_REQUEST)
        FCMDevice.objects.update_or_create(token=token, defaults={'user': request.user})
        return Response({'ok': True}, status=status.HTTP_200_OK)

    def delete(self, request):
        token = request.data.get('token', '').strip()
        if token:
            FCMDevice.objects.filter(user=request.user, token=token).delete()
        return Response({'ok': True})

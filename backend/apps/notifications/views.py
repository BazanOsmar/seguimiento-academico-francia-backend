from django.contrib.auth import get_user_model
from django.db.models import Exists, OuterRef
from rest_framework import status
from rest_framework.permissions import IsAuthenticated
from rest_framework.response import Response
from rest_framework.views import APIView

from backend.apps.academics.models import ProfesorCurso
from backend.apps.students.models import Estudiante
from backend.core.permissions import IsDirector, IsDirectorOrProfesor

from .models import FCMDevice, Notificacion
from .services import enviar_notificacion

class DispositivosCountView(APIView):
    """GET /api/notifications/dispositivos/ — total de tokens FCM registrados."""
    permission_classes = (IsDirector,)

    def get(self, request):
        return Response({'total': FCMDevice.objects.count()})


class CoberturaComunicadoView(APIView):
    """
    GET /api/notifications/cobertura-comunicado/
    Devuelve cuántos tutores únicos (padres) tienen estudiantes activos en el
    alcance indicado. Solo cuenta cobertura de tutores — no incluye nada
    relacionado con FCM ni capacidad de recibir notificaciones push.

    Params:
        alcance   = TODOS | GRADO | CURSO | MIS_CURSOS | GRUPO
        grado     = nombre del grado       (requerido si alcance=GRADO)
        curso_id  = id del curso           (requerido si alcance=CURSO)
        curso_ids = ids separados por coma (requerido si alcance=GRUPO)
    """
    permission_classes = (IsDirectorOrProfesor,)

    def get(self, request):
        alcance   = request.query_params.get('alcance', 'TODOS')
        grado     = request.query_params.get('grado', '').strip()
        curso_id  = request.query_params.get('curso_id', '').strip()
        curso_ids = request.query_params.get('curso_ids', '').strip()

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
        elif alcance == 'MIS_CURSOS':
            cursos_ids = ProfesorCurso.objects.filter(
                profesor=request.user
            ).values_list('curso_id', flat=True).distinct()
            qs = qs.filter(curso_id__in=cursos_ids)
        elif alcance == 'GRUPO':
            if not curso_ids:
                return Response(
                    {'errores': 'Se requiere el parámetro curso_ids.'},
                    status=status.HTTP_400_BAD_REQUEST,
                )
            try:
                ids = [int(x) for x in curso_ids.split(',') if x.strip()]
            except ValueError:
                return Response(
                    {'errores': 'curso_ids inválido.'},
                    status=status.HTTP_400_BAD_REQUEST,
                )
            if not ids:
                return Response(
                    {'errores': 'Se requiere al menos un curso.'},
                    status=status.HTTP_400_BAD_REQUEST,
                )
            qs = qs.filter(curso_id__in=ids)

        tutor_ids = list(qs.values_list('tutor_id', flat=True).distinct())

        User = get_user_model()
        tutores = list(
            User.objects.filter(id__in=tutor_ids)
            .values('id', 'first_name', 'last_name', 'username')
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
                'id':          t['id'],
                'nombre':      f"{t['first_name']} {t['last_name']}".strip() or t['username'],
                'estudiantes': estudiantes_por_tutor.get(t['id'], []),
            }
            for t in tutores
        ]
        lista.sort(key=lambda x: x['nombre'])

        return Response({
            'total':              len(lista),
            'estudiantes_total':  qs.count(),
            'tutores':            lista,
        })


class NotificacionListView(APIView):
    """
    GET /api/notifications/mis-notificaciones/

    Devuelve todas las notificaciones del usuario autenticado.
    Opcional: ?no_leidas=true para filtrar solo las no leídas.
    """
    permission_classes = [IsAuthenticated]

    def get(self, request):
        qs = (
            Notificacion.objects
            .filter(receptor=request.user)
            .select_related('emisor', 'emisor__tipo_usuario')
        )

        if request.query_params.get('no_leidas') == 'true':
            qs = qs.filter(leida=False)

        data = [
            {
                'id':             n.id,
                'descripcion':    n.descripcion,
                'leida':          n.leida,
                'fecha_creacion': n.fecha_creacion,
                'emisor_nombre':  (
                    f"{n.emisor.first_name} {n.emisor.last_name}".strip() or n.emisor.username
                    if n.emisor else 'Sistema'
                ),
            }
            for n in qs
        ]
        return Response(data)


class NotificacionMarcarLeidaView(APIView):
    """
    PATCH /api/notifications/<pk>/leer/
        Marca una notificación específica como leída.

    PATCH /api/notifications/leer-todas/
        Marca todas las notificaciones del usuario como leídas.
    """
    permission_classes = [IsAuthenticated]

    def patch(self, request, pk):
        try:
            notificacion = Notificacion.objects.get(pk=pk, receptor=request.user)
        except Notificacion.DoesNotExist:
            return Response({'errores': 'Notificación no encontrada.'}, status=status.HTTP_404_NOT_FOUND)

        notificacion.leida = True
        notificacion.save(update_fields=['leida'])
        return Response({'ok': True, 'id': notificacion.id})



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


class NotificacionesEnviadasView(APIView):
    """
    GET /api/notifications/enviadas/

    Director: lista todas las notificaciones personales enviadas por cualquier usuario.
    Profesor: lista solo las notificaciones personales enviadas por el mismo profesor.
    Ordena de mas reciente a mas antigua.
    Incluye si el receptor ya la leyo o no.

    Opcional: ?no_leidas=true -> solo las que el receptor aun no leyo.
    """
    permission_classes = [IsDirectorOrProfesor]

    def get(self, request):
        tipo = request.user.tipo_usuario.nombre if request.user.tipo_usuario else None
        qs = (
            Notificacion.objects
            .select_related('emisor', 'emisor__tipo_usuario', 'receptor', 'receptor__tipo_usuario')
        )

        if tipo != 'Director':
            qs = qs.filter(emisor=request.user)

        if request.query_params.get('no_leidas') == 'true':
            qs = qs.filter(leida=False)

        data = [
            {
                'id':              n.pk,
                'descripcion':     n.descripcion,
                'leida':           n.leida,
                'fecha_creacion':  n.fecha_creacion,
                'emisor_id':       n.emisor_id,
                'emisor_nombre': (
                    f"{n.emisor.first_name} {n.emisor.last_name}".strip()
                    or n.emisor.username
                    if n.emisor else 'Sistema'
                ),
                'emisor_tipo': (
                    n.emisor.tipo_usuario.nombre if n.emisor and n.emisor.tipo_usuario else None
                ),
                'receptor_id':     n.receptor_id,
                'receptor_nombre': (
                    f"{n.receptor.first_name} {n.receptor.last_name}".strip()
                    or n.receptor.username
                ),
                'receptor_tipo': (
                    n.receptor.tipo_usuario.nombre if n.receptor.tipo_usuario else None
                ),
            }
            for n in qs
        ]
        return Response(data)


class EnviarNotificacionView(APIView):
    """
    POST /api/notifications/enviar/

    Envía una notificación personal a un usuario específico.
    Guarda el registro en BD y dispara push FCM si el receptor
    tiene dispositivo registrado.

    Body:
        receptor_id  (int)  — id del usuario destinatario
        descripcion  (str)  — texto del mensaje (máx. 500 chars)

    Restricciones de alcance:
        Director → puede notificar a Tutores y Profesores.
        Profesor → solo a Tutores de estudiantes en sus cursos asignados.
    """
    permission_classes = [IsDirectorOrProfesor]

    def post(self, request):
        User = get_user_model()
        tipo = request.user.tipo_usuario.nombre if request.user.tipo_usuario else None

        receptor_id = request.data.get('receptor_id')
        descripcion = str(request.data.get('descripcion', '')).strip()

        if not receptor_id:
            return Response(
                {'errores': 'El campo receptor_id es requerido.'},
                status=status.HTTP_400_BAD_REQUEST,
            )
        if not descripcion:
            return Response(
                {'errores': 'El campo descripcion es requerido.'},
                status=status.HTTP_400_BAD_REQUEST,
            )
        if len(descripcion) > 500:
            return Response(
                {'errores': 'La descripción no puede superar los 500 caracteres.'},
                status=status.HTTP_400_BAD_REQUEST,
            )

        try:
            receptor = User.objects.select_related('tipo_usuario').get(pk=receptor_id)
        except User.DoesNotExist:
            return Response(
                {'errores': 'Usuario destinatario no encontrado.'},
                status=status.HTTP_404_NOT_FOUND,
            )

        receptor_tipo = receptor.tipo_usuario.nombre if receptor.tipo_usuario else None

        if tipo == 'Director':
            if receptor_tipo not in ('Tutor', 'Profesor'):
                return Response(
                    {'errores': 'El Director solo puede notificar a Tutores y Profesores.'},
                    status=status.HTTP_403_FORBIDDEN,
                )
        else:
            # Profesor: solo tutores de estudiantes en sus cursos
            curso_ids = (
                ProfesorCurso.objects
                .filter(profesor=request.user)
                .values_list('curso_id', flat=True)
                .distinct()
            )
            tutor_ids = set(
                Estudiante.objects
                .filter(curso_id__in=curso_ids, activo=True, tutor__isnull=False)
                .values_list('tutor_id', flat=True)
                .distinct()
            )
            if receptor.pk not in tutor_ids:
                return Response(
                    {'errores': 'Solo puedes notificar a tutores de estudiantes en tus cursos asignados.'},
                    status=status.HTTP_403_FORBIDDEN,
                )

        notificacion = Notificacion.objects.create(
            emisor=request.user,
            receptor=receptor,
            descripcion=descripcion,
        )

        emisor_nombre = (
            f"{request.user.first_name} {request.user.last_name}".strip()
            or request.user.username
        )
        enviar_notificacion(
            usuario=receptor,
            titulo=f'Mensaje de {emisor_nombre}',
            cuerpo=descripcion,
        )

        return Response(
            {
                'ok':              True,
                'notificacion_id': notificacion.pk,
                'receptor_nombre': f"{receptor.first_name} {receptor.last_name}".strip() or receptor.username,
            },
            status=status.HTTP_201_CREATED,
        )

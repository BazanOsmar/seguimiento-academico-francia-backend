from rest_framework.views import APIView
from rest_framework.response import Response
from rest_framework import status
from rest_framework.permissions import IsAuthenticated

from ..models import Comunicado, ComunicadoEstudiante
from backend.core.permissions import IsTutor, IsDirectorOrRegenteOrProfesor


class ComunicadoMarcarVistoView(APIView):
    """
    POST /api/comunicados/{id}/visto/

    Marca como LEIDO todas las entregas del tutor para ese comunicado.
    Si ya estaban leídas, devuelve 200 igualmente.
    """
    permission_classes = [IsAuthenticated, IsTutor]

    def post(self, request, pk):
        try:
            comunicado = Comunicado.objects.get(pk=pk)
        except Comunicado.DoesNotExist:
            return Response({'errores': 'Comunicado no encontrado.'}, status=status.HTTP_404_NOT_FOUND)

        actualizados = (
            ComunicadoEstudiante.objects
            .filter(comunicado=comunicado, estudiante__tutor=request.user)
            .update(estado=ComunicadoEstudiante.ESTADO_LEIDO)
        )

        return Response({'ok': True, 'actualizados': actualizados})


class ComunicadoAnularView(APIView):
    """
    PATCH /api/comunicados/<pk>/anular/

    Director/Regente → cualquier comunicado.
    Profesor         → solo los que él emitió.
    """
    permission_classes = [IsAuthenticated, IsDirectorOrRegenteOrProfesor]

    def patch(self, request, pk):
        contrasena = request.data.get("contrasena", "")
        if not contrasena or not request.user.check_password(contrasena):
            return Response({"errores": "Contraseña incorrecta."}, status=status.HTTP_403_FORBIDDEN)

        try:
            comunicado = Comunicado.objects.select_related(
                'emisor', 'emisor__tipo_usuario'
            ).get(pk=pk)
        except Comunicado.DoesNotExist:
            return Response({'errores': 'Comunicado no encontrado.'}, status=status.HTTP_404_NOT_FOUND)

        tipo = request.user.tipo_usuario.nombre if request.user.tipo_usuario else None

        if tipo == 'Regente':
            return Response(
                {'errores': 'Los regentes no tienen permiso para anular comunicados.'},
                status=status.HTTP_403_FORBIDDEN,
            )
        if tipo == 'Profesor' and comunicado.emisor != request.user:
            return Response(
                {'errores': 'Solo puedes anular comunicados que tú mismo emitiste.'},
                status=status.HTTP_403_FORBIDDEN,
            )
        # Director puede anular cualquier comunicado

        if comunicado.estado == Comunicado.ESTADO_ANULADO:
            return Response({'errores': 'Este comunicado ya fue anulado.'}, status=status.HTTP_400_BAD_REQUEST)

        comunicado.estado = Comunicado.ESTADO_ANULADO
        comunicado.save(update_fields=['estado'])

        from backend.apps.auditoria.services import registrar
        nombre = f"{request.user.first_name} {request.user.last_name}".strip() or request.user.username
        registrar(request.user, 'ANULAR_COMUNICADO', f"{nombre} anuló el comunicado '{comunicado.titulo}'", request)

        return Response({'id': comunicado.id, 'estado': 'ANULADO'})


class ComunicadoCoberturaView(APIView):
    """
    GET /api/comunicados/<pk>/cobertura/

    Lista los tutores que reciben el comunicado (derivado de ComunicadoEstudiante).
    Solo el emisor o el Director pueden consultarlo.
    """
    permission_classes = [IsAuthenticated, IsDirectorOrRegenteOrProfesor]

    def get(self, request, pk):
        try:
            comunicado = Comunicado.objects.select_related('emisor', 'emisor__tipo_usuario').get(pk=pk)
        except Comunicado.DoesNotExist:
            return Response({'errores': 'Comunicado no encontrado.'}, status=status.HTTP_404_NOT_FOUND)

        tipo = request.user.tipo_usuario.nombre if request.user.tipo_usuario else None
        if tipo == 'Profesor' and comunicado.emisor != request.user:
            return Response({'errores': 'No tienes permiso.'}, status=status.HTTP_403_FORBIDDEN)

        from backend.apps.notifications.models import FCMDevice
        from django.db.models import Exists, OuterRef

        entregas = (
            ComunicadoEstudiante.objects
            .filter(comunicado=comunicado, estudiante__tutor__isnull=False)
            .select_related('estudiante', 'estudiante__tutor', 'estudiante__curso')
            .annotate(
                tiene_fcm=Exists(
                    FCMDevice.objects.filter(user=OuterRef('estudiante__tutor_id'))
                )
            )
        )

        tutores_map = {}
        for entrega in entregas:
            est    = entrega.estudiante
            tid    = est.tutor_id
            curso  = f"{est.curso.grado} {est.curso.paralelo}".strip() if est.curso else ''
            nombre_est = f"{est.apellido_paterno} {est.apellido_materno}, {est.nombre}".strip(', ')

            if tid not in tutores_map:
                t = est.tutor
                tutores_map[tid] = {
                    'id':          tid,
                    'nombre':      f"{t.first_name} {t.last_name}".strip() or t.username,
                    'tiene_fcm':   entrega.tiene_fcm,
                    'estudiantes': [],
                }
            tutores_map[tid]['estudiantes'].append({'nombre': nombre_est, 'curso': curso})

        lista    = sorted(tutores_map.values(), key=lambda x: x['nombre'])
        con_fcm  = sum(1 for t in lista if t['tiene_fcm'])

        return Response({
            'total':   len(lista),
            'con_fcm': con_fcm,
            'sin_fcm': len(lista) - con_fcm,
            'tutores': lista,
        })

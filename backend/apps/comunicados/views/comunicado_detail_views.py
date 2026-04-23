from django.db.models import Exists, OuterRef
from rest_framework.views import APIView
from rest_framework.response import Response
from rest_framework import status
from rest_framework.permissions import IsAuthenticated

from ..models import Comunicado, ComunicadoVisto
from ..serializers.comunicado_read_serializers import ComunicadoSerializer
from backend.core.permissions import IsTutor, IsDirectorOrRegenteOrProfesor


class ComunicadoMarcarVistoView(APIView):
    """
    POST /api/comunicados/{id}/visto/

    El tutor marca un comunicado como visto.
    Si ya lo había marcado, devuelve 200 sin crear duplicado.
    """

    permission_classes = [IsAuthenticated, IsTutor]

    def post(self, request, pk):
        try:
            comunicado = Comunicado.objects.get(pk=pk)
        except Comunicado.DoesNotExist:
            return Response({'errores': 'Comunicado no encontrado.'}, status=status.HTTP_404_NOT_FOUND)

        _, creado = ComunicadoVisto.objects.get_or_create(
            comunicado=comunicado,
            tutor=request.user,
        )

        return Response({'ok': True, 'nuevo': creado})


class ComunicadoAnularView(APIView):
    """
    PATCH /api/comunicados/<pk>/anular/

    Marca el comunicado como ANULADO.
    - Director y Regente pueden anular cualquier comunicado.
    - Profesor solo puede anular comunicados que él mismo emitió.
    """

    permission_classes = [IsAuthenticated, IsDirectorOrRegenteOrProfesor]

    def patch(self, request, pk):
        try:
            comunicado = Comunicado.objects.select_related(
                'emisor', 'emisor__tipo_usuario'
            ).get(pk=pk)
        except Comunicado.DoesNotExist:
            return Response({'errores': 'Comunicado no encontrado.'}, status=status.HTTP_404_NOT_FOUND)

        tipo = request.user.tipo_usuario.nombre if request.user.tipo_usuario else None
        if tipo == 'Profesor' and comunicado.emisor != request.user:
            return Response(
                {'errores': 'Solo puedes anular comunicados que tú mismo emitiste.'},
                status=status.HTTP_403_FORBIDDEN,
            )

        if comunicado.estado == Comunicado.ESTADO_ANULADO:
            return Response({'errores': 'Este comunicado ya fue anulado.'}, status=status.HTTP_400_BAD_REQUEST)

        comunicado.estado = Comunicado.ESTADO_ANULADO
        comunicado.save(update_fields=['estado'])

        from backend.apps.auditoria.services import registrar
        nombre = f"{request.user.first_name} {request.user.last_name}".strip() or request.user.username
        registrar(request.user, 'ANULAR_COMUNICADO', f"{nombre} anuló el comunicado '{comunicado.titulo}'", request)

        return Response({'id': comunicado.id, 'estado': 'ANULADO'}, status=status.HTTP_200_OK)


class ComunicadoCoberturaView(APIView):
    """
    GET /api/comunicados/<pk>/cobertura/

    Devuelve la lista de tutores destinatarios del comunicado (padres que lo recibieron).
    Solo el emisor o el Director pueden consultarlo.
    """

    permission_classes = [IsAuthenticated, IsDirectorOrRegenteOrProfesor]

    def get(self, request, pk):
        try:
            comunicado = Comunicado.objects.prefetch_related('cursos_grupo').select_related(
                'emisor', 'emisor__tipo_usuario', 'curso'
            ).get(pk=pk)
        except Comunicado.DoesNotExist:
            return Response({'errores': 'Comunicado no encontrado.'}, status=status.HTTP_404_NOT_FOUND)

        tipo = request.user.tipo_usuario.nombre if request.user.tipo_usuario else None
        if tipo == 'Profesor' and comunicado.emisor != request.user:
            return Response({'errores': 'No tienes permiso.'}, status=status.HTTP_403_FORBIDDEN)

        from backend.apps.students.models import Estudiante
        from backend.apps.notifications.models import FCMDevice
        from backend.apps.academics.models import ProfesorCurso
        from django.contrib.auth import get_user_model
        User = get_user_model()

        qs = Estudiante.objects.filter(activo=True, tutor__isnull=False)

        if comunicado.alcance == Comunicado.ALCANCE_GRADO:
            qs = qs.filter(curso__grado=comunicado.grado)
        elif comunicado.alcance == Comunicado.ALCANCE_CURSO:
            qs = qs.filter(curso=comunicado.curso)
        elif comunicado.alcance == Comunicado.ALCANCE_MIS_CURSOS:
            cursos_ids = ProfesorCurso.objects.filter(
                profesor=comunicado.emisor
            ).values_list('curso_id', flat=True).distinct()
            qs = qs.filter(curso_id__in=cursos_ids)
        elif comunicado.alcance == Comunicado.ALCANCE_GRUPO:
            curso_ids = comunicado.cursos_grupo.values_list('id', flat=True)
            qs = qs.filter(curso_id__in=curso_ids)
        # ALCANCE_TODOS: sin filtro adicional

        tutor_ids = qs.values_list('tutor_id', flat=True).distinct()
        tutores = list(
            User.objects.filter(id__in=tutor_ids)
            .annotate(tiene_fcm=Exists(FCMDevice.objects.filter(user=OuterRef('pk'))))
            .values('id', 'first_name', 'last_name', 'username', 'tiene_fcm')
        )

        estudiantes_qs = qs.values(
            'tutor_id', 'apellido_paterno', 'apellido_materno', 'nombre',
            'curso__grado', 'curso__paralelo',
        )
        estudiantes_por_tutor = {}
        for e in estudiantes_qs:
            tid = e['tutor_id']
            apellidos = f"{e['apellido_paterno']} {e['apellido_materno']}".strip()
            nombre_est = f"{apellidos}, {e['nombre']}".strip(', ')
            curso_label = f"{e['curso__grado']} {e['curso__paralelo']}".strip()
            estudiantes_por_tutor.setdefault(tid, []).append({'nombre': nombre_est, 'curso': curso_label})

        lista = [
            {
                'id':          t['id'],
                'nombre':      f"{t['first_name']} {t['last_name']}".strip() or t['username'],
                'tiene_fcm':   t['tiene_fcm'],
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

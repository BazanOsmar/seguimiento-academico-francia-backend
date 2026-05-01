from rest_framework.views import APIView
from rest_framework.response import Response
from rest_framework import status
from rest_framework.permissions import IsAuthenticated

from ..serializers.comunicado_write_serializers import ComunicadoCreateSerializer
from ..serializers.comunicado_read_serializers import ComunicadoSerializer
from ..services import crear_comunicado, notificar_tutores
from backend.core.permissions import IsDirectorOrProfesor


class ComunicadoCreateView(APIView):
    """
    POST /api/comunicados/crear/

    Director → TODOS, GRADO, CURSO (cualquier curso), GRUPO.
    Profesor → CURSO (solo sus cursos), MIS_CURSOS, GRUPO (solo sus cursos).
    """
    permission_classes = [IsAuthenticated, IsDirectorOrProfesor]

    def post(self, request):
        serializer = ComunicadoCreateSerializer(data=request.data)
        if not serializer.is_valid():
            return Response(serializer.errors, status=status.HTTP_400_BAD_REQUEST)

        data    = serializer.validated_data
        alcance = data['alcance']
        tipo    = request.user.tipo_usuario.nombre

        if tipo == 'Profesor':
            error = self._validar_profesor(request.user, alcance, data)
            if error:
                return Response({'errores': error}, status=status.HTTP_400_BAD_REQUEST)

        datos_alcance = {
            'grado':           data.get('grado', ''),
            'curso_id':        data.get('curso'),
            'cursos_grupo_ids': data.get('cursos_grupo_ids', []),
        }

        comunicado = crear_comunicado(
            titulo=data['titulo'],
            descripcion=data['descripcion'],
            fecha_expiracion=data.get('fecha_expiracion'),
            emisor=request.user,
            alcance=alcance,
            datos_alcance=datos_alcance,
        )

        from backend.apps.auditoria.services import registrar
        nombre = f"{request.user.first_name} {request.user.last_name}".strip() or request.user.username
        registrar(
            request.user,
            'CREAR_COMUNICADO',
            f"{nombre} creó el comunicado '{comunicado.titulo}'",
            request,
        )

        notificar_tutores(comunicado)

        return Response(
            ComunicadoSerializer(comunicado, context={'leidos_set': set(), 'cursos_map': {}}).data,
            status=status.HTTP_201_CREATED,
        )

    def _validar_profesor(self, profesor, alcance, data):
        from backend.apps.academics.models import ProfesorCurso

        if alcance not in ('CURSO', 'MIS_CURSOS', 'GRUPO'):
            return "Los profesores solo pueden enviar comunicados a sus cursos asignados."

        sus_cursos = set(
            ProfesorCurso.objects.filter(profesor=profesor)
            .values_list('curso_id', flat=True).distinct()
        )

        if alcance == 'CURSO':
            if data.get('curso') not in sus_cursos:
                return "Solo puedes enviar comunicados a cursos que tienes asignados."

        if alcance == 'GRUPO':
            ids = set(data.get('cursos_grupo_ids', []))
            if not ids.issubset(sus_cursos):
                return "Solo puedes enviar comunicados a cursos que tienes asignados."

        return None

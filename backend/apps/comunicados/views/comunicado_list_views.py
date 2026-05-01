from rest_framework.views import APIView
from rest_framework.response import Response
from rest_framework.permissions import IsAuthenticated

from ..models import Comunicado, ComunicadoEstudiante
from ..serializers.comunicado_read_serializers import ComunicadoSerializer


def _build_cursos_map(comunicado_ids):
    """
    Devuelve un dict { comunicado_id: ['1ro A', '2do B', ...] }
    en una sola query, para evitar N+1 al serializar.
    """
    rows = (
        ComunicadoEstudiante.objects
        .filter(comunicado_id__in=comunicado_ids)
        .values(
            'comunicado_id',
            'estudiante__curso__grado',
            'estudiante__curso__paralelo',
        )
        .distinct()
    )
    result = {}
    for row in rows:
        cid   = row['comunicado_id']
        label = f"{row['estudiante__curso__grado']} {row['estudiante__curso__paralelo']}".strip()
        result.setdefault(cid, [])
        if label not in result[cid]:
            result[cid].append(label)
    for cid in result:
        result[cid] = sorted(result[cid])
    return result


class ComunicadoListView(APIView):
    """
    GET /api/comunicados/

    Director → todos los comunicados.
    Profesor → solo los que él emitió.
    Tutor    → los que tienen entrega para alguno de sus estudiantes activos.
    Regente  → ninguno.
    """
    permission_classes = [IsAuthenticated]

    def get(self, request):
        tipo = request.user.tipo_usuario.nombre if request.user.tipo_usuario else None

        if tipo == 'Director':
            comunicados = Comunicado.objects.select_related('emisor', 'emisor__tipo_usuario').all()

        elif tipo == 'Profesor':
            comunicados = Comunicado.objects.filter(
                emisor=request.user
            ).select_related('emisor', 'emisor__tipo_usuario')

        elif tipo == 'Tutor':
            comunicados = self._comunicados_para_tutor(request.user)

        else:
            return Response([])

        comunicados = list(comunicados)
        ids = [c.id for c in comunicados]
        cursos_map = _build_cursos_map(ids)

        context = {'cursos_map': cursos_map, 'leidos_set': set()}

        if tipo == 'Tutor':
            leidos = (
                ComunicadoEstudiante.objects
                .filter(
                    comunicado_id__in=ids,
                    estudiante__tutor=request.user,
                    estado=ComunicadoEstudiante.ESTADO_LEIDO,
                )
                .values_list('comunicado_id', flat=True)
                .distinct()
            )
            context['leidos_set'] = set(leidos)

        serializer = ComunicadoSerializer(comunicados, many=True, context=context)
        return Response(serializer.data)

    def _comunicados_para_tutor(self, tutor):
        from backend.apps.students.models import Estudiante

        estudiante_ids = (
            Estudiante.objects
            .filter(tutor=tutor, activo=True)
            .values_list('id', flat=True)
        )
        return (
            Comunicado.objects
            .filter(
                entregas__estudiante_id__in=estudiante_ids,
                estado=Comunicado.ESTADO_ACTIVO,
            )
            .select_related('emisor', 'emisor__tipo_usuario')
            .distinct()
        )

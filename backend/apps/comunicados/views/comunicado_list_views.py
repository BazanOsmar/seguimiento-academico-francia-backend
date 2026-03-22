from django.db.models import Q
from rest_framework.views import APIView
from rest_framework.response import Response
from rest_framework.permissions import IsAuthenticated

from ..models import Comunicado, ComunicadoVisto
from ..serializers.comunicado_read_serializers import ComunicadoSerializer


class ComunicadoListView(APIView):
    """
    GET /api/comunicados/

    Director → ve todos los comunicados.
    Tutor    → ve solo los comunicados que le corresponden según alcance
               (TODOS, o CURSO/GRADO que coincide con su estudiante).
               Incluye si ya los leyó y cuándo.
    """

    permission_classes = [IsAuthenticated]

    def get(self, request):
        tipo = request.user.tipo_usuario.nombre if request.user.tipo_usuario else None

        if tipo == 'Tutor':
            comunicados = self._comunicados_para_tutor(request.user)
        else:
            comunicados = Comunicado.objects.select_related('emisor', 'curso').all()

        context = {}
        if tipo == 'Tutor':
            registros = ComunicadoVisto.objects.filter(
                tutor=request.user,
                comunicado__in=comunicados,
            ).values_list('comunicado_id', 'visto_en')
            context['visto_set'] = {r[0] for r in registros}
            context['visto_map'] = {r[0]: r[1] for r in registros}

        serializer = ComunicadoSerializer(comunicados, many=True, context=context)
        return Response(serializer.data)

    def _comunicados_para_tutor(self, tutor):
        from backend.apps.students.models import Estudiante

        estudiante = Estudiante.objects.filter(
            tutor=tutor, activo=True
        ).select_related('curso').first()

        if not estudiante:
            return Comunicado.objects.filter(
                alcance=Comunicado.ALCANCE_TODOS
            ).select_related('emisor', 'curso')

        return Comunicado.objects.filter(
            Q(alcance=Comunicado.ALCANCE_TODOS) |
            Q(alcance=Comunicado.ALCANCE_CURSO, curso=estudiante.curso) |
            Q(alcance=Comunicado.ALCANCE_GRADO, grado=estudiante.curso.grado) |
            Q(alcance=Comunicado.ALCANCE_MIS_CURSOS, emisor__profesorcurso__curso=estudiante.curso)
        ).distinct().select_related('emisor', 'curso')

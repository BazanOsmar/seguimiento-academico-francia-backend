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
    Profesor → ve solo los comunicados que él emitió.
    Tutor    → ve solo los comunicados que le corresponden según alcance.
    Regente  → no ve ninguno (no puede emitir comunicados).
    """

    permission_classes = [IsAuthenticated]

    def get(self, request):
        tipo = request.user.tipo_usuario.nombre if request.user.tipo_usuario else None

        if tipo == 'Tutor':
            comunicados = self._comunicados_para_tutor(request.user)
        elif tipo == 'Director':
            comunicados = Comunicado.objects.select_related('emisor', 'curso', 'materia').all()
        elif tipo == 'Profesor':
            comunicados = Comunicado.objects.filter(emisor=request.user).select_related('emisor', 'curso', 'materia')
        else:
            comunicados = Comunicado.objects.none()

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

        estudiantes = Estudiante.objects.filter(
            tutor=tutor, activo=True
        ).select_related('curso')

        if not estudiantes.exists():
            return Comunicado.objects.filter(
                alcance=Comunicado.ALCANCE_TODOS
            ).exclude(estado=Comunicado.ESTADO_ANULADO).select_related('emisor', 'curso', 'materia')

        cursos = [e.curso for e in estudiantes]
        grados = list({e.curso.grado for e in estudiantes})

        return Comunicado.objects.filter(
            Q(alcance=Comunicado.ALCANCE_TODOS) |
            Q(alcance=Comunicado.ALCANCE_CURSO,      curso__in=cursos) |
            Q(alcance=Comunicado.ALCANCE_GRADO,      grado__in=grados) |
            Q(alcance=Comunicado.ALCANCE_MIS_CURSOS, emisor__profesorcurso__curso__in=cursos)
        ).exclude(estado=Comunicado.ESTADO_ANULADO).distinct().select_related('emisor', 'curso', 'materia')

from django.db.models import Q
from rest_framework.views import APIView
from rest_framework.response import Response
from rest_framework.permissions import IsAuthenticated

from backend.core.permissions import IsRegente
from backend.apps.students.models import Estudiante
from backend.apps.students.serializers import EstudianteBusquedaSerializer


class EstudianteBusquedaView(APIView):
    """
    GET /api/students/buscar/?q=<texto>&curso_id=<id>

    Búsqueda de estudiantes por nombre o apellido.
    Retorna hasta 10 coincidencias. Solo Regente.
    El parámetro curso_id es opcional; si se provee filtra por curso.
    """
    permission_classes = (IsAuthenticated, IsRegente)

    def get(self, request):
        q = request.query_params.get('q', '').strip()
        if not q:
            return Response([])

        # Dividir por espacios para que "Juan Perez" encuentre nombre="Juan" + apellido="Perez"
        terminos = q.split()
        filtro = Q()
        for t in terminos:
            filtro &= (
                Q(nombre__icontains=t) |
                Q(apellido_paterno__icontains=t) |
                Q(apellido_materno__icontains=t)
            )

        qs = (
            Estudiante.objects
            .select_related('curso')
            .filter(activo=True)
            .filter(filtro)
        )

        curso_id = request.query_params.get('curso_id', '').strip()
        if curso_id.isdigit():
            qs = qs.filter(curso_id=int(curso_id))

        qs = qs.order_by('apellido_paterno', 'apellido_materno', 'nombre')[:10]
        serializer = EstudianteBusquedaSerializer(qs, many=True)
        return Response(serializer.data)

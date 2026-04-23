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
        q        = request.query_params.get('q', '').strip()
        curso_id = request.query_params.get('curso_id', '').strip()

        # Requiere al menos un criterio
        if not q and not curso_id.isdigit():
            return Response([])

        qs = Estudiante.objects.select_related('curso').filter(activo=True)

        if q:
            terminos = q.split()
            filtro = Q()
            for t in terminos:
                filtro &= (
                    Q(nombre__icontains=t) |
                    Q(apellido_paterno__icontains=t) |
                    Q(apellido_materno__icontains=t)
                )
            qs = qs.filter(filtro)

        if curso_id.isdigit():
            qs = qs.filter(curso_id=int(curso_id))

        qs = qs.order_by('apellido_paterno', 'apellido_materno', 'nombre')

        # Solo limitar resultados cuando hay texto; al filtrar por curso se muestran todos
        if q:
            qs = qs[:30]

        serializer = EstudianteBusquedaSerializer(qs, many=True)
        return Response(serializer.data)

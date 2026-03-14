from rest_framework.views import APIView
from rest_framework.response import Response
from rest_framework.permissions import IsAuthenticated
from rest_framework import status

from backend.apps.users.permissions import IsDirector
from .models import RegistroActividad
from .serializers import RegistroActividadSerializer, RegistrarActividadSerializer
from .services import registrar

PAGE_SIZE = 25


class ActividadView(APIView):
    """
    GET /api/auditoria/actividad/

    Devuelve el registro de actividad del sistema paginado.
    Solo accesible por el Director.

    Query params:
        page        — número de página (default: 1)
        accion      — filtra por código de acción exacto, ej: LOGIN
        usuario_id  — filtra por ID de usuario
    """

    permission_classes = [IsAuthenticated, IsDirector]

    def get(self, request):
        qs = RegistroActividad.objects.select_related('usuario')

        accion     = request.query_params.get('accion', '').strip()
        usuario_id = request.query_params.get('usuario_id', '').strip()
        fecha      = request.query_params.get('fecha', '').strip()

        if accion:
            qs = qs.filter(accion=accion)
        if usuario_id.isdigit():
            qs = qs.filter(usuario_id=int(usuario_id))
        if fecha:
            qs = qs.filter(fecha__date=fecha)

        total = qs.count()

        try:
            page = max(1, int(request.query_params.get('page', 1)))
        except ValueError:
            page = 1

        offset = (page - 1) * PAGE_SIZE
        registros = qs[offset: offset + PAGE_SIZE]

        serializer = RegistroActividadSerializer(registros, many=True)
        return Response({
            'total':    total,
            'page':     page,
            'pages':    max(1, -(-total // PAGE_SIZE)),  # ceil division
            'results':  serializer.data,
        })


class RegistrarActividadView(APIView):
    """
    POST /api/auditoria/registrar/

    Permite a la app móvil registrar eventos de auditoría.
    Cualquier rol autenticado puede usarlo.

    Body:
        accion      — código de acción (ver ACCIONES_MOVIL_PERMITIDAS)
        descripcion — texto legible del evento
    """

    permission_classes = [IsAuthenticated]

    def post(self, request):
        serializer = RegistrarActividadSerializer(data=request.data)
        if not serializer.is_valid():
            return Response({'errores': serializer.errors}, status=status.HTTP_400_BAD_REQUEST)

        registrar(
            usuario=request.user,
            accion=serializer.validated_data['accion'],
            descripcion=serializer.validated_data['descripcion'],
            request=request,
        )
        return Response({'ok': True}, status=status.HTTP_201_CREATED)

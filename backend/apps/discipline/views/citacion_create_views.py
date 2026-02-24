from rest_framework.views import APIView
from rest_framework.response import Response
from rest_framework import status
from rest_framework.permissions import IsAuthenticated

from ..serializers.citacion_write_serializers import CitacionCreateSerializer
from ..serializers.citacion_read_serializers import CitacionListSerializer
from backend.apps.users.permissions import IsDirectorOrRegente


class CitacionCreateView(APIView):
    """
    POST api/discipline/citaciones/crear/

    Crea una nueva citación para el padre de un estudiante.
    El emisor se asigna automáticamente desde el usuario autenticado.

    Permisos: Solo Director o Regente.

    Body esperado:
    {
        "estudiante": 5,
        "motivo": "FALTAS",
        "descripcion": "El estudiante acumuló 5 faltas en el mes.",
        "estado": "ENVIADA",
        "fecha_limite_asistencia": "2025-10-25"
    }

    Respuesta exitosa (201):
    {
        "id": 3,
        "estudiante_nombre": "Juan Pérez",
        "curso": "Tercero A",
        "asistencia": "PENDIENTE",
        "fecha_envio": "2025-10-15T08:30:00Z",
        "fecha_limite_asistencia": "2025-10-25",
        "motivo": "FALTAS",
        "estado": "ENVIADA",
        "fecha_asistencia": null
    }
    """

    permission_classes = [IsAuthenticated, IsDirectorOrRegente]

    def post(self, request):
        serializer = CitacionCreateSerializer(data=request.data)

        if not serializer.is_valid():
            return Response(serializer.errors, status=status.HTTP_400_BAD_REQUEST)

        # El emisor es el usuario autenticado, no viene del payload
        citacion = serializer.save(emisor=request.user)

        from backend.apps.auditoria.services import registrar
        nombre_emisor = f"{request.user.first_name} {request.user.last_name}".strip() or request.user.username
        nombre_estudiante = f"{citacion.estudiante.nombre} {citacion.estudiante.apellidos}"
        registrar(
            request.user,
            'CREAR_CITACION',
            f"{nombre_emisor} creó citación para {nombre_estudiante} (motivo: {citacion.motivo})",
            request,
        )

        # Devolvemos la citación creada con el serializer de lectura
        response_serializer = CitacionListSerializer(citacion)
        return Response(response_serializer.data, status=status.HTTP_201_CREATED)
from datetime import date

from rest_framework.views import APIView
from rest_framework.response import Response
from rest_framework.permissions import IsAuthenticated
from rest_framework.exceptions import ValidationError

from backend.core.permissions import IsDirectorOrRegente
from ..models import AsistenciaSesion


class EstadoAsistenciaDiariaView(APIView):
    """
    Devuelve el estado de asistencia de los cursos
    para una fecha específica.

    Este endpoint permite saber qué cursos ya fueron
    registrados en una fecha determinada y quién
    realizó el registro.
    """

    permission_classes = (IsAuthenticated, IsDirectorOrRegente)

    def get(self, request):
        fecha_str = request.query_params.get("fecha")

        if not fecha_str:
            raise ValidationError(
                {"fecha": "Este parámetro es obligatorio y debe tener formato YYYY-MM-DD."}
            )

        try:
            fecha = date.fromisoformat(fecha_str)
        except ValueError:
            raise ValidationError(
                {"fecha": "Formato de fecha inválido. Use YYYY-MM-DD."}
            )

        sesiones = AsistenciaSesion.objects.select_related(
            "curso",
            "registrado_por"
        ).filter(fecha=fecha)

        data = {
            "fecha": fecha.isoformat(),
            "sesiones": [
                {
                    "curso_id": sesion.curso.id,
                    "registrado_por": {
                        "id": sesion.registrado_por.id,
                        "nombre": sesion.registrado_por.get_full_name()
                        or sesion.registrado_por.username,
                    },
                    "created_at": sesion.created_at,
                }
                for sesion in sesiones
            ],
        }

        return Response(data)

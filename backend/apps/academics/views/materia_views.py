from rest_framework.views import APIView
from rest_framework.response import Response
from rest_framework.permissions import IsAuthenticated
from rest_framework import status

from backend.core.permissions import IsDirector
from ..models import Materia, ProfesorCurso
from ..serializers import MateriaSerializer


class MateriaListCreateView(APIView):
    """
    GET  /api/academics/materias/  — lista todas las materias
    POST /api/academics/materias/  — crea una nueva materia
    Permiso: Director.
    """
    permission_classes = [IsAuthenticated, IsDirector]

    def get(self, request):
        materias = Materia.objects.all().order_by('nombre')
        return Response(MateriaSerializer(materias, many=True).data)

    def post(self, request):
        serializer = MateriaSerializer(data=request.data)
        if not serializer.is_valid():
            return Response(serializer.errors, status=status.HTTP_400_BAD_REQUEST)
        nombre = serializer.validated_data['nombre'].strip()
        if Materia.objects.filter(nombre__iexact=nombre).exists():
            return Response(
                {"errores": "Ya existe una materia con ese nombre."},
                status=status.HTTP_400_BAD_REQUEST,
            )
        materia = serializer.save(nombre=nombre)
        return Response(MateriaSerializer(materia).data, status=status.HTTP_201_CREATED)


class MateriaDetailView(APIView):
    """
    PUT/PATCH /api/academics/materias/{id}/  — actualiza una materia
    DELETE    /api/academics/materias/{id}/  — elimina una materia
    Permiso: Director.
    """
    permission_classes = [IsAuthenticated, IsDirector]

    def _get_materia(self, materia_id):
        try:
            return Materia.objects.get(pk=materia_id)
        except Materia.DoesNotExist:
            return None

    def put(self, request, materia_id):
        return self._actualizar(request, materia_id)

    def patch(self, request, materia_id):
        return self._actualizar(request, materia_id)

    def _actualizar(self, request, materia_id):
        materia = self._get_materia(materia_id)
        if materia is None:
            return Response({"errores": "Materia no encontrada."}, status=status.HTTP_404_NOT_FOUND)

        serializer = MateriaSerializer(materia, data=request.data, partial=True)
        if not serializer.is_valid():
            return Response(serializer.errors, status=status.HTTP_400_BAD_REQUEST)

        nombre = serializer.validated_data.get('nombre', materia.nombre).strip()
        if Materia.objects.exclude(pk=materia.pk).filter(nombre__iexact=nombre).exists():
            return Response(
                {"errores": "Ya existe una materia con ese nombre."},
                status=status.HTTP_400_BAD_REQUEST,
            )

        materia = serializer.save(nombre=nombre)
        return Response(MateriaSerializer(materia).data)

    def delete(self, request, materia_id):
        materia = self._get_materia(materia_id)
        if materia is None:
            return Response({"errores": "Materia no encontrada."}, status=status.HTTP_404_NOT_FOUND)

        if ProfesorCurso.objects.filter(materia=materia).exists():
            return Response(
                {"errores": "No se puede eliminar: la materia tiene asignaciones activas."},
                status=status.HTTP_400_BAD_REQUEST,
            )
        materia.delete()
        return Response(status=status.HTTP_204_NO_CONTENT)

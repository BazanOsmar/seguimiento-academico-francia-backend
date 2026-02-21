from django.db import IntegrityError
from django.db.models import Q
from rest_framework.views import APIView
from rest_framework.response import Response
from rest_framework import status
from rest_framework.permissions import IsAuthenticated

from backend.apps.users.permissions import IsDirector
from backend.apps.students.models import Estudiante
from backend.apps.students.serializers import (
    EstudianteDirectorSerializer,
    EstudianteCreateSerializer,
)
from backend.apps.students.services import crear_estudiante_con_tutor


class EstudianteDirectorListView(APIView):
    """
    GET /api/students/
    Lista todos los estudiantes para el panel del director.
    Soporta filtro opcional por curso: ?curso=<id>
    """
    permission_classes = (IsAuthenticated, IsDirector)

    def get(self, request):
        qs = Estudiante.objects.select_related('curso', 'tutor').order_by(
            'curso__grado', 'curso__paralelo', 'apellidos', 'nombre'
        )
        curso_id = request.query_params.get('curso')
        if curso_id:
            qs = qs.filter(curso_id=curso_id)

        q = request.query_params.get('q', '').strip()
        if q:
            if q.isdigit():
                qs = qs.filter(carnet__icontains=q)
            else:
                qs = qs.filter(Q(apellidos__icontains=q) | Q(nombre__icontains=q))
            qs = qs[:10]

        serializer = EstudianteDirectorSerializer(qs, many=True)
        return Response(serializer.data)


class EstudianteCreateView(APIView):
    """
    POST /api/students/crear/
    Crea un estudiante junto con su tutor en una transacción atómica.
    Devuelve los datos del estudiante y las credenciales del tutor.
    """
    permission_classes = (IsAuthenticated, IsDirector)

    def post(self, request):
        serializer = EstudianteCreateSerializer(data=request.data)
        if not serializer.is_valid():
            primer_campo, primer_msgs = next(iter(serializer.errors.items()))
            msg = primer_msgs[0] if isinstance(primer_msgs, list) else str(primer_msgs)
            return Response({'errores': msg}, status=status.HTTP_400_BAD_REQUEST)

        try:
            estudiante, credenciales = crear_estudiante_con_tutor(serializer.validated_data)
        except (ValueError, IntegrityError) as exc:
            return Response({'errores': str(exc)}, status=status.HTTP_400_BAD_REQUEST)

        return Response({
            'estudiante': EstudianteDirectorSerializer(estudiante).data,
            'credenciales_tutor': credenciales,
        }, status=status.HTTP_201_CREATED)

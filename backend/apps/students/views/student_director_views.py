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
    EstudianteSoloCreateSerializer,
)
from backend.apps.students.services import crear_estudiante_con_tutor, crear_estudiante_solo
from rest_framework.exceptions import NotFound


class EstudianteDirectorListView(APIView):
    """
    GET /api/students/
    Lista todos los estudiantes para el panel del director.
    Soporta filtro opcional por curso: ?curso=<id>
    """
    permission_classes = (IsAuthenticated, IsDirector)

    def get(self, request):
        qs = Estudiante.objects.select_related('curso', 'tutor').order_by(
            'curso__grado', 'curso__paralelo', 'apellido_paterno', 'apellido_materno', 'nombre'
        )
        curso_id = request.query_params.get('curso')
        if curso_id:
            qs = qs.filter(curso_id=curso_id)

        q = request.query_params.get('q', '').strip()
        if q:
            if q.isdigit():
                qs = qs.filter(identificador__icontains=q)
            else:
                qs = qs.filter(Q(apellido_paterno__icontains=q) | Q(apellido_materno__icontains=q) | Q(nombre__icontains=q))
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


class EstudianteSoloCreateView(APIView):
    """
    POST /api/students/crear-solo/
    Crea solo al estudiante (sin tutor). El identificador se genera automáticamente.
    """
    permission_classes = (IsAuthenticated, IsDirector)

    def post(self, request):
        serializer = EstudianteSoloCreateSerializer(data=request.data)
        if not serializer.is_valid():
            primer_campo, primer_msgs = next(iter(serializer.errors.items()))
            msg = primer_msgs[0] if isinstance(primer_msgs, list) else str(primer_msgs)
            return Response({'errores': msg}, status=status.HTTP_400_BAD_REQUEST)

        try:
            estudiante = crear_estudiante_solo(serializer.validated_data)
        except Exception as exc:
            return Response({'errores': str(exc)}, status=status.HTTP_400_BAD_REQUEST)

        return Response(
            EstudianteDirectorSerializer(estudiante).data,
            status=status.HTTP_201_CREATED,
        )


class EstudianteDetailView(APIView):
    """
    GET  /api/students/<id>/  — Detalle del estudiante.
    PATCH /api/students/<id>/ — Actualiza el campo activo.
    Solo Director.
    """
    permission_classes = (IsAuthenticated, IsDirector)

    def _get_estudiante(self, pk):
        try:
            return Estudiante.objects.select_related('curso', 'tutor').get(pk=pk)
        except Estudiante.DoesNotExist:
            raise NotFound({'errores': 'Estudiante no encontrado.'})

    def get(self, request, pk):
        return Response(EstudianteDirectorSerializer(self._get_estudiante(pk)).data)

    def patch(self, request, pk):
        password = request.data.get('password', '').strip()
        if not password or not request.user.check_password(password):
            return Response({'errores': 'Contraseña incorrecta.'}, status=status.HTTP_403_FORBIDDEN)

        estudiante = self._get_estudiante(pk)

        if 'activo' in request.data:
            activo = request.data.get('activo')
            if activo is None or not isinstance(activo, bool):
                return Response({'errores': 'El campo activo debe ser true o false.'}, status=status.HTTP_400_BAD_REQUEST)
            estudiante.activo = activo
            estudiante.save(update_fields=['activo'])

        elif any(k in request.data for k in ('nombre', 'apellido_paterno', 'apellido_materno')):
            nombre   = request.data.get('nombre', '').strip().upper()
            paterno  = request.data.get('apellido_paterno', '').strip().upper()
            materno  = request.data.get('apellido_materno', '').strip().upper()
            if not nombre:
                return Response({'errores': 'El nombre es obligatorio.'}, status=status.HTTP_400_BAD_REQUEST)
            if not paterno and not materno:
                return Response({'errores': 'Al menos un apellido es obligatorio.'}, status=status.HTTP_400_BAD_REQUEST)
            estudiante.nombre           = nombre
            estudiante.apellido_paterno = paterno
            estudiante.apellido_materno = materno
            estudiante.save(update_fields=['nombre', 'apellido_paterno', 'apellido_materno'])

        else:
            return Response({'errores': 'No se especificaron campos a actualizar.'}, status=status.HTTP_400_BAD_REQUEST)

        return Response(EstudianteDirectorSerializer(estudiante).data)

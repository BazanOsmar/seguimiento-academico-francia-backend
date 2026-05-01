from django.db.models import Q
from rest_framework.views import APIView
from rest_framework.response import Response
from rest_framework import status
from rest_framework.permissions import IsAuthenticated

from backend.core.permissions import IsDirector
from backend.apps.students.models import Estudiante
from backend.apps.students.serializers import (
    EstudianteDirectorSerializer,
    EstudianteSoloCreateSerializer,
)
from backend.apps.students.services import crear_estudiante_solo
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

        elif 'tutor_id' in request.data:
            return self._gestionar_tutor(request, estudiante)

        else:
            return Response({'errores': 'No se especificaron campos a actualizar.'}, status=status.HTTP_400_BAD_REQUEST)

        return Response(EstudianteDirectorSerializer(estudiante).data)

    def _gestionar_tutor(self, request, estudiante):
        from backend.apps.users.models import User
        from backend.apps.auditoria.services import registrar

        tutor_id   = request.data.get('tutor_id')
        director   = f"{request.user.first_name} {request.user.last_name}".strip() or request.user.username
        est_nombre = f"{estudiante.apellido_paterno} {estudiante.apellido_materno} {estudiante.nombre}".strip()

        if tutor_id is None:
            # ── Desvincular ─────────────────────────────────────────
            tutor_anterior = estudiante.tutor
            if tutor_anterior is None:
                return Response({'errores': 'Este estudiante no tiene tutor asignado.'}, status=status.HTTP_400_BAD_REQUEST)

            tutor_nombre = f"{tutor_anterior.first_name} {tutor_anterior.last_name}".strip() or tutor_anterior.username
            estudiante.tutor = None
            estudiante.save(update_fields=['tutor'])

            registrar(
                request.user, 'DESVINCULAR_TUTOR',
                f"{director} desvinculó al tutor '{tutor_anterior.username}' ({tutor_nombre}) del estudiante {est_nombre}",
                request,
            )
        else:
            # ── Reasignar ────────────────────────────────────────────
            try:
                nuevo_tutor = User.objects.select_related('tipo_usuario').get(pk=tutor_id)
            except User.DoesNotExist:
                return Response({'errores': 'Usuario no encontrado.'}, status=status.HTTP_404_NOT_FOUND)

            if getattr(nuevo_tutor.tipo_usuario, 'nombre', None) != 'Tutor':
                return Response({'errores': 'El usuario seleccionado no es de tipo Tutor.'}, status=status.HTTP_400_BAD_REQUEST)

            # No contar al propio estudiante si ya está vinculado al mismo tutor
            ya_vinculado = estudiante.tutor_id == nuevo_tutor.pk
            total = Estudiante.objects.filter(tutor=nuevo_tutor).count()
            if not ya_vinculado and total >= 5:
                return Response({'errores': 'Este tutor ya tiene 5 estudiantes vinculados.'}, status=status.HTTP_400_BAD_REQUEST)

            tutor_anterior = estudiante.tutor
            estudiante.tutor = nuevo_tutor
            estudiante.save(update_fields=['tutor'])

            tutor_nombre = f"{nuevo_tutor.first_name} {nuevo_tutor.last_name}".strip() or nuevo_tutor.username
            if tutor_anterior:
                ant_nombre = f"{tutor_anterior.first_name} {tutor_anterior.last_name}".strip() or tutor_anterior.username
                msg = f"{director} reasignó el tutor de {est_nombre}: '{tutor_anterior.username}' ({ant_nombre}) → '{nuevo_tutor.username}' ({tutor_nombre})"
            else:
                msg = f"{director} asignó al tutor '{nuevo_tutor.username}' ({tutor_nombre}) al estudiante {est_nombre}"

            registrar(request.user, 'ASIGNAR_TUTOR', msg, request)

        return Response(EstudianteDirectorSerializer(estudiante).data)

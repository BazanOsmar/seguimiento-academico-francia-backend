from django.db.models import Q, F, Exists, OuterRef
from rest_framework.views import APIView
from rest_framework.response import Response
from rest_framework import status
from rest_framework.permissions import IsAuthenticated

from ..permissions import IsDirector
from ..models import User
from ..serializers import UserCreateSerializer, UserListSerializer
from backend.apps.notifications.models import FCMDevice


class UserDetailView(APIView):
    permission_classes = [IsAuthenticated, IsDirector]

    def get(self, request, user_id):
        try:
            user = User.objects.select_related('tipo_usuario').annotate(
                tiene_fcm=Exists(FCMDevice.objects.filter(user=OuterRef('pk')))
            ).get(pk=user_id)
        except User.DoesNotExist:
            return Response({'errores': 'Usuario no encontrado.'}, status=status.HTTP_404_NOT_FOUND)

        data = dict(UserListSerializer(user).data)
        rol  = user.tipo_usuario.nombre if user.tipo_usuario else None

        if rol == 'Tutor':
            from backend.apps.students.models import Estudiante
            from backend.apps.discipline.models import Citacion
            data['estudiantes'] = list(
                Estudiante.objects.filter(tutor=user)
                .select_related('curso')
                .values('id', 'nombre', 'apellido_paterno', 'apellido_materno', 'identificador',
                        'curso__grado', 'curso__paralelo', 'curso__id')
            )
            data['citaciones_recientes'] = list(
                Citacion.objects.filter(estudiante__tutor=user)
                .order_by('-fecha_envio')[:5]
                .values('id', 'motivo', 'asistencia',
                        'fecha_limite_asistencia', 'fecha_envio',
                        'estudiante__nombre', 'estudiante__apellido_paterno', 'estudiante__apellido_materno')
            )
            data['cursos'] = None

        elif rol == 'Profesor':
            from backend.apps.academics.models import ProfesorCurso
            data['cursos'] = list(
                ProfesorCurso.objects.filter(profesor=user)
                .select_related('curso', 'materia')
                .values('curso__id', 'curso__grado', 'curso__paralelo', 'materia__nombre')
                .order_by('curso__grado', 'curso__paralelo', 'materia__nombre')
            )
            data['estudiantes']          = None
            data['citaciones_recientes'] = None

        else:
            data['estudiantes']          = None
            data['cursos']               = None
            data['citaciones_recientes'] = None

        return Response(data)

    def patch(self, request, user_id):
        import re
        try:
            user = User.objects.get(pk=user_id)
        except User.DoesNotExist:
            return Response({'errores': 'Usuario no encontrado.'}, status=status.HTTP_404_NOT_FOUND)

        first_name = request.data.get('first_name', '').strip()
        last_name  = request.data.get('last_name',  '').strip()
        errors = {}

        if not first_name:
            errors['first_name'] = ['Campo obligatorio.']
        elif not re.match(r'^[A-Za-zÁÉÍÓÚáéíóúÑñ ]+$', first_name):
            errors['first_name'] = ['Solo letras y espacios.']

        if not last_name:
            errors['last_name'] = ['Campo obligatorio.']
        elif not re.match(r'^[A-Za-zÁÉÍÓÚáéíóúÑñ ]+$', last_name):
            errors['last_name'] = ['Solo letras y espacios.']

        if errors:
            return Response(errors, status=status.HTTP_400_BAD_REQUEST)

        user.first_name = first_name
        user.last_name  = last_name
        user.save(update_fields=['first_name', 'last_name'])

        from backend.apps.auditoria.services import registrar
        director_nombre = f"{request.user.first_name} {request.user.last_name}".strip() or request.user.username
        registrar(
            request.user,
            'EDITAR_USUARIO',
            f"{director_nombre} editó el nombre del usuario '{user.username}'",
            request,
        )

        return Response({'first_name': user.first_name, 'last_name': user.last_name})


class MiPerfilView(APIView):
    """
    GET  /api/users/mi-perfil/  — datos del director autenticado
    PATCH                       — editar nombre/apellidos propios
    POST                        — cambiar contraseña propia (password_actual + password_nueva)
    """
    permission_classes = [IsAuthenticated, IsDirector]

    def get(self, request):
        u = request.user
        return Response({
            'id':           u.id,
            'username':     u.username,
            'first_name':   u.first_name,
            'last_name':    u.last_name,
            'tipo_usuario': u.tipo_usuario.nombre if u.tipo_usuario else None,
            'last_login':   u.last_login.isoformat() if u.last_login else None,
            'date_joined':  u.date_joined.isoformat(),
        })

    def patch(self, request):
        import re
        first_name = request.data.get('first_name', '').strip()
        last_name  = request.data.get('last_name',  '').strip()
        errors = {}

        if not first_name:
            errors['first_name'] = ['Campo obligatorio.']
        elif not re.match(r'^[A-Za-zÁÉÍÓÚáéíóúÑñ ]+$', first_name):
            errors['first_name'] = ['Solo letras y espacios.']

        if not last_name:
            errors['last_name'] = ['Campo obligatorio.']
        elif not re.match(r'^[A-Za-zÁÉÍÓÚáéíóúÑñ ]+$', last_name):
            errors['last_name'] = ['Solo letras y espacios.']

        if errors:
            return Response(errors, status=status.HTTP_400_BAD_REQUEST)

        u = request.user
        u.first_name = first_name
        u.last_name  = last_name
        u.save(update_fields=['first_name', 'last_name'])

        from backend.apps.auditoria.services import registrar
        nombre = f"{u.first_name} {u.last_name}".strip() or u.username
        registrar(u, 'EDITAR_USUARIO', f"{nombre} actualizó su propio nombre", request)

        return Response({'first_name': u.first_name, 'last_name': u.last_name})

    def post(self, request):
        password_actual = request.data.get('password_actual', '')
        password_nueva  = request.data.get('password_nueva',  '')

        if not password_actual:
            return Response({'errores': 'La contraseña actual es obligatoria.'}, status=status.HTTP_400_BAD_REQUEST)
        if not password_nueva:
            return Response({'errores': 'La contraseña nueva es obligatoria.'}, status=status.HTTP_400_BAD_REQUEST)
        if len(password_nueva) < 8 or len(password_nueva) > 20:
            return Response({'errores': 'La contraseña debe tener entre 8 y 20 caracteres.'}, status=status.HTTP_400_BAD_REQUEST)

        u = request.user
        if not u.check_password(password_actual):
            return Response({'errores': 'Contraseña actual incorrecta.'}, status=status.HTTP_400_BAD_REQUEST)

        u.set_password(password_nueva)
        u.save()

        from backend.apps.auditoria.services import registrar
        nombre = f"{u.first_name} {u.last_name}".strip() or u.username
        registrar(u, 'CAMBIO_PASSWORD', f"{nombre} cambió su propia contraseña", request)

        return Response({'mensaje': 'Contraseña actualizada correctamente.'})


class UserView(APIView):
    permission_classes = [IsAuthenticated, IsDirector]

    def get(self, request):
        base = User.objects.filter(is_superuser=False).exclude(tipo_usuario__nombre='Director')
        stats = {
            'total':    base.count(),
            'docentes': base.filter(tipo_usuario__nombre='Profesor').count(),
            'padres':   base.filter(tipo_usuario__nombre='Tutor').count(),
            'regentes': base.filter(tipo_usuario__nombre='Regente').count(),
        }

        qs = base.select_related('tipo_usuario').annotate(
            tiene_fcm=Exists(FCMDevice.objects.filter(user=OuterRef('pk')))
        ).order_by(
            F('last_login').desc(nulls_last=True), 'last_name', 'first_name'
        )

        q = request.query_params.get('q', '').strip()
        if q:
            qs = qs.filter(
                Q(first_name__icontains=q) |
                Q(last_name__icontains=q)  |
                Q(username__icontains=q)
            )

        serializer = UserListSerializer(qs, many=True)
        return Response({'stats': stats, 'usuarios': serializer.data})

    def post(self, request):
        serializer = UserCreateSerializer(data=request.data)
        serializer.is_valid(raise_exception=True)

        user = serializer.save()

        from backend.apps.auditoria.services import registrar
        director_nombre = f"{request.user.first_name} {request.user.last_name}".strip() or request.user.username
        registrar(
            request.user,
            'CREAR_USUARIO',
            f"{director_nombre} creó el usuario '{user.username}' ({user.tipo_usuario.nombre})",
            request,
        )

        return Response({
            'id':           user.id,
            'username':     user.username,
            'first_name':   user.first_name,
            'last_name':    user.last_name,
            'tipo_usuario': user.tipo_usuario.nombre,
            'password_inicial': getattr(user, '_password_plain', ''),
        }, status=status.HTTP_201_CREATED)

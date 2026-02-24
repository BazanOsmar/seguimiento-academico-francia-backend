from django.db.models import Q, F
from rest_framework.views import APIView
from rest_framework.response import Response
from rest_framework import status
from rest_framework.permissions import IsAuthenticated

from ..permissions import IsDirector
from ..models import User
from ..serializers import UserCreateSerializer, UserListSerializer


class UserDetailView(APIView):
    permission_classes = [IsAuthenticated, IsDirector]

    def get(self, request, user_id):
        try:
            user = User.objects.select_related('tipo_usuario').get(pk=user_id)
        except User.DoesNotExist:
            return Response({'errores': 'Usuario no encontrado.'}, status=status.HTTP_404_NOT_FOUND)
        return Response(UserListSerializer(user).data)


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

        qs = base.select_related('tipo_usuario').order_by(
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

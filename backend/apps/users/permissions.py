from rest_framework.permissions import BasePermission


class IsDirector(BasePermission):
    """
    Permiso personalizado que permite el acceso únicamente
    a usuarios cuyo tipo de usuario sea 'Director'.
    """

    def has_permission(self, request, view):
        user = request.user

        if not user or not user.is_authenticated:
            return False

        if not user.tipo_usuario:
            return False

        return user.tipo_usuario.nombre == 'Director'

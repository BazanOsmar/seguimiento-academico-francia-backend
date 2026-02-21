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

class IsRegente(BasePermission):
    """Permite el acceso únicamente a usuarios cuyo tipo sea Regente."""

    def has_permission(self, request, view):
        return (
            request.user.is_authenticated
            and request.user.tipo_usuario is not None
            and request.user.tipo_usuario.nombre == "Regente"
        )


class IsDirectorOrRegente(BasePermission):
    """
    Permite el acceso únicamente a usuarios autenticados
    cuyo tipo de usuario sea Director o Regente.

    Este permiso se utiliza para endpoints administrativos
    relacionados con la gestión académica y disciplinaria,
    donde el acceso debe estar restringido a autoridades.
    """

    def has_permission(self, request, view):
        return (
            request.user.is_authenticated
            and request.user.tipo_usuario is not None
            and request.user.tipo_usuario.nombre in ("Director", "Regente")
        )
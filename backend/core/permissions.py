from rest_framework.permissions import BasePermission


class IsDirector(BasePermission):
    """Permite el acceso únicamente a usuarios cuyo tipo sea Director."""

    def has_permission(self, request, view):
        return (
            request.user.is_authenticated
            and request.user.tipo_usuario is not None
            and request.user.tipo_usuario.nombre == "Director"
        )


class IsRegente(BasePermission):
    """Permite el acceso únicamente a usuarios cuyo tipo sea Regente."""

    def has_permission(self, request, view):
        return (
            request.user.is_authenticated
            and request.user.tipo_usuario is not None
            and request.user.tipo_usuario.nombre == "Regente"
        )


class IsProfesor(BasePermission):
    """Permite el acceso únicamente a usuarios cuyo tipo sea Profesor."""

    def has_permission(self, request, view):
        return (
            request.user.is_authenticated
            and request.user.tipo_usuario is not None
            and request.user.tipo_usuario.nombre == "Profesor"
        )


class IsTutor(BasePermission):
    """Permite el acceso únicamente a usuarios cuyo tipo sea Tutor (app móvil)."""

    def has_permission(self, request, view):
        return (
            request.user.is_authenticated
            and request.user.tipo_usuario is not None
            and request.user.tipo_usuario.nombre == "Tutor"
        )


class IsDirectorOrRegente(BasePermission):
    """Permite el acceso a Director o Regente."""

    def has_permission(self, request, view):
        return (
            request.user.is_authenticated
            and request.user.tipo_usuario is not None
            and request.user.tipo_usuario.nombre in ("Director", "Regente")
        )


class IsDirectorOrProfesor(BasePermission):
    """Permite el acceso a Director o Profesor."""

    def has_permission(self, request, view):
        return (
            request.user.is_authenticated
            and request.user.tipo_usuario is not None
            and request.user.tipo_usuario.nombre in ("Director", "Profesor")
        )


class IsDirectorOrRegenteOrProfesor(BasePermission):
    """Permite el acceso a Director, Regente o Profesor."""

    def has_permission(self, request, view):
        return (
            request.user.is_authenticated
            and request.user.tipo_usuario is not None
            and request.user.tipo_usuario.nombre in ("Director", "Regente", "Profesor")
        )

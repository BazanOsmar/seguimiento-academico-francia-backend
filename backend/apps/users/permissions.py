# Los permisos viven en backend.core.permissions
# Este módulo se conserva únicamente para no romper imports existentes en admin/migraciones.
from backend.core.permissions import (  # noqa: F401
    IsDirector,
    IsRegente,
    IsProfesor,
    IsTutor,
    IsDirectorOrRegente,
    IsDirectorOrProfesor,
    IsDirectorOrRegenteOrProfesor,
)

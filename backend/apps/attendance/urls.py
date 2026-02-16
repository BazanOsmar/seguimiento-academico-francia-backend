from django.urls import path

from backend.apps.attendance.views.attendance_combined_views import AsistenciaCursoView
from .views import EstadoAsistenciaDiariaView, RegistrosRecientesView

urlpatterns = [
    path(
        "estado-diario/",
        EstadoAsistenciaDiariaView.as_view(),
        name="estado-asistencia-diaria",
    ),
    path(
        "cursos/<int:curso_id>/asistencia/",
        AsistenciaCursoView.as_view(),
        name="asistencia-curso",
    ),
    path(
        "registros-recientes/",
        RegistrosRecientesView.as_view(),
        name="registros-recientes",
    ),
]

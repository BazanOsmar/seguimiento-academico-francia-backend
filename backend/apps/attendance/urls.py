from django.urls import path

from backend.apps.attendance.views.attendance_combined_views import AsistenciaCursoView
from backend.apps.attendance.views.resumen_mensual_views import ResumenMensualCursoView
from backend.apps.attendance.views.calendario_mensual_views import CalendarioMensualView
from .views import EstadoAsistenciaDiariaView, RegistrosRecientesView, HistorialEstudianteView, HistorialCursoView

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
        "cursos/<int:curso_id>/resumen-mensual/",
        ResumenMensualCursoView.as_view(),
        name="resumen-mensual-curso",
    ),
    path(
        "calendario-mensual/",
        CalendarioMensualView.as_view(),
        name="calendario-mensual",
    ),
    path(
        "registros-recientes/",
        RegistrosRecientesView.as_view(),
        name="registros-recientes",
    ),
    path(
        "estudiantes/<int:estudiante_id>/historial/",
        HistorialEstudianteView.as_view(),
        name="historial-estudiante",
    ),
    path(
        "cursos/<int:curso_id>/historial/",
        HistorialCursoView.as_view(),
        name="historial-curso",
    ),
]

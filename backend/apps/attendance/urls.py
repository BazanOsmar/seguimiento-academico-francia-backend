from django.urls import path

from backend.apps.attendance.views.attendance_combined_views import AsistenciaCursoView
from backend.apps.attendance.views.resumen_mensual_views import ResumenMensualCursoView
from backend.apps.attendance.views.resumen_global_views import ResumenGlobalView
from backend.apps.attendance.views.resumen_cursos_views import ResumenCursosTodosView, ResumenEstudiantesCursoView
from backend.apps.attendance.views.calendario_mensual_views import CalendarioMensualView
from backend.apps.attendance.views.calendario_estudiante_views import CalendarioEstudianteView
from .views import EstadoAsistenciaDiariaView, RegistrosRecientesView, HistorialEstudianteView, HistorialCursoView
from backend.apps.attendance.views.historial_tutor_views import HistorialTutorView
from backend.apps.attendance.views.sin_uniforme_views import SinUniformeView

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
        "resumen-global/",
        ResumenGlobalView.as_view(),
        name="resumen-global",
    ),
    path(
        "resumen-cursos/",
        ResumenCursosTodosView.as_view(),
        name="resumen-cursos",
    ),
    path(
        "cursos/<int:curso_id>/resumen-estudiantes/",
        ResumenEstudiantesCursoView.as_view(),
        name="resumen-estudiantes-curso",
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
        "parents/me/historial/",
        HistorialTutorView.as_view(),
        name="historial-tutor",
    ),
    path(
        "estudiantes/<int:estudiante_id>/historial/",
        HistorialEstudianteView.as_view(),
        name="historial-estudiante",
    ),
    path(
        "estudiantes/<int:estudiante_id>/calendario/",
        CalendarioEstudianteView.as_view(),
        name="calendario-estudiante",
    ),
    path(
        "cursos/<int:curso_id>/historial/",
        HistorialCursoView.as_view(),
        name="historial-curso",
    ),
    path(
        "sin-uniforme/",
        SinUniformeView.as_view(),
        name="sin-uniforme",
    ),
]

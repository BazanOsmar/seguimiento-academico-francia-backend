from django.urls import path
from .views import (
    EjecutarKMeansView, ResultadosKMeansView,
    UltimoMesKMeansView, UltimoMesArbolView,
    ResultadosArbolView, EstadisticasArbolView, DetalleArbolView,
    KMeansTutorView, ArbolTutorView,
)
from .reportes_views import (
    ReporteRendimientoView, ReporteAsistenciaView, ReporteCitacionesView,
    ReporteComunicadosView, ReporteActividadProfesoresView, ReporteTutoresView,
)

urlpatterns = [
    path('kmeans/ejecutar/',      EjecutarKMeansView.as_view()),
    path('kmeans/resultados/',    ResultadosKMeansView.as_view()),
    path('kmeans/ultimo-mes/',    UltimoMesKMeansView.as_view()),
    path('kmeans/tutor/',         KMeansTutorView.as_view()),
    path('arbol/resultados/',     ResultadosArbolView.as_view()),
    path('arbol/estadisticas/',   EstadisticasArbolView.as_view()),
    path('arbol/detalle/',        DetalleArbolView.as_view()),
    path('arbol/ultimo-mes/',     UltimoMesArbolView.as_view()),
    path('arbol/tutor/',          ArbolTutorView.as_view()),

    # Reportes institucionales
    path('reportes/rendimiento/',  ReporteRendimientoView.as_view()),
    path('reportes/asistencia/',   ReporteAsistenciaView.as_view()),
    path('reportes/citaciones/',   ReporteCitacionesView.as_view()),
    path('reportes/comunicados/',  ReporteComunicadosView.as_view()),
    path('reportes/profesores/',   ReporteActividadProfesoresView.as_view()),
    path('reportes/tutores/',      ReporteTutoresView.as_view()),
]

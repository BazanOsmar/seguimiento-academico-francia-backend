from django.urls import path
from .views import (
    EjecutarKMeansView, ResultadosKMeansView,
    ResultadosArbolView, EstadisticasArbolView,
    KMeansTutorView, ArbolTutorView,
)

urlpatterns = [
    path('kmeans/ejecutar/',      EjecutarKMeansView.as_view()),
    path('kmeans/resultados/',    ResultadosKMeansView.as_view()),
    path('kmeans/tutor/',         KMeansTutorView.as_view()),
    path('arbol/resultados/',     ResultadosArbolView.as_view()),
    path('arbol/estadisticas/',   EstadisticasArbolView.as_view()),
    path('arbol/tutor/',          ArbolTutorView.as_view()),
]

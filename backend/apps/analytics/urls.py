from django.urls import path
from .views import EjecutarKMeansView, ResultadosKMeansView, ResultadosArbolView, EstadisticasArbolView

urlpatterns = [
    path('kmeans/ejecutar/',      EjecutarKMeansView.as_view()),
    path('kmeans/resultados/',    ResultadosKMeansView.as_view()),
    path('arbol/resultados/',     ResultadosArbolView.as_view()),
    path('arbol/estadisticas/',   EstadisticasArbolView.as_view()),
]

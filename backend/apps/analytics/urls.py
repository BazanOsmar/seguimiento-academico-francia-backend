from django.urls import path
from .views import EjecutarKMeansView, ResultadosKMeansView

urlpatterns = [
    path('kmeans/ejecutar/',    EjecutarKMeansView.as_view()),
    path('kmeans/resultados/',  ResultadosKMeansView.as_view()),
]

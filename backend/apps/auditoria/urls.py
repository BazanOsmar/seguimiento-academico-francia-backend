from django.urls import path
from .views import ActividadView, RegistrarActividadView

urlpatterns = [
    path('actividad/',  ActividadView.as_view()),
    path('registrar/',  RegistrarActividadView.as_view()),
]

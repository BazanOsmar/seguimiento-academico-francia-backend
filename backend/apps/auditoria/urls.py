from django.urls import path
from .views import ActividadView

urlpatterns = [
    path('actividad/', ActividadView.as_view()),
]

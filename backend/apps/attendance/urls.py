from django.urls import path
from .views import EstadoAsistenciaDiariaView

urlpatterns = [
    path(
        "estado-diario/",
        EstadoAsistenciaDiariaView.as_view(),
        name="estado-asistencia-diaria",
    ),
]

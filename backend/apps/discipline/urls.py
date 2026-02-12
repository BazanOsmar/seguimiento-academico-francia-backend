from django.urls import path
from .views import CitacionListView, CitacionCreateView, CitacionDetailView

urlpatterns = [
    # Lista todas las citaciones (con filtros opcionales)
    path("citaciones/", CitacionListView.as_view(), name="citacion-list"),

    # Crea una nueva citación
    path("citaciones/crear/", CitacionCreateView.as_view(), name="citacion-create"),

    # Detalle y actualización de una citación específica
    path("citaciones/<int:citacion_id>/", CitacionDetailView.as_view(), name="citacion-detail"),
]
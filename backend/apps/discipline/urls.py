from django.urls import path
from .views import CitacionListView, CitacionCreateView, CitacionDetailView, CitacionVistoView, CitacionTutorListView

urlpatterns = [
    # Lista todas las citaciones (con filtros opcionales)
    path("citaciones/", CitacionListView.as_view(), name="citacion-list"),

    # App móvil: citaciones del tutor autenticado
    path("citaciones/mis-citaciones/", CitacionTutorListView.as_view(), name="citacion-tutor-list"),

    # Crea una nueva citación
    path("citaciones/crear/", CitacionCreateView.as_view(), name="citacion-create"),

    # Detalle y actualización de una citación específica
    path("citaciones/<int:citacion_id>/", CitacionDetailView.as_view(), name="citacion-detail"),

    # App móvil: el tutor marca que vio la citación
    path("citaciones/<int:citacion_id>/visto/", CitacionVistoView.as_view(), name="citacion-visto"),
]
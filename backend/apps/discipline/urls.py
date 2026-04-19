from django.urls import path
from .views import CitacionListView, CitacionCreateView, CitacionDetailView, CitacionVistoView, CitacionTutorListView, CitacionAnularView

urlpatterns = [
    path("citaciones/", CitacionListView.as_view(), name="citacion-list"),
    path("citaciones/mis-citaciones/", CitacionTutorListView.as_view(), name="citacion-tutor-list"),
    path("citaciones/crear/", CitacionCreateView.as_view(), name="citacion-create"),
    path("citaciones/<int:citacion_id>/", CitacionDetailView.as_view(), name="citacion-detail"),
    path("citaciones/<int:citacion_id>/anular/", CitacionAnularView.as_view(), name="citacion-anular"),
    path("citaciones/<int:citacion_id>/visto/", CitacionVistoView.as_view(), name="citacion-visto"),
]
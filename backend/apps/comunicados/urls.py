from django.urls import path

from .views.comunicado_list_views import ComunicadoListView
from .views.comunicado_create_views import ComunicadoCreateView
from .views.comunicado_detail_views import ComunicadoMarcarVistoView

urlpatterns = [
    path('', ComunicadoListView.as_view()),
    path('crear/', ComunicadoCreateView.as_view()),
    path('<int:pk>/visto/', ComunicadoMarcarVistoView.as_view()),
]

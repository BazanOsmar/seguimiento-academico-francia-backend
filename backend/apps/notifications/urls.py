from django.urls import path

from .views import BroadcastView, CoberturaComunicadoView, DispositivosCountView, RegistrarTokenView

urlpatterns = [
    path('fcm/token/',             RegistrarTokenView.as_view(),     name='fcm-token'),
    path('broadcast/',             BroadcastView.as_view(),           name='broadcast'),
    path('dispositivos/',          DispositivosCountView.as_view(),   name='dispositivos-count'),
    path('cobertura-comunicado/',  CoberturaComunicadoView.as_view(), name='cobertura-comunicado'),
]

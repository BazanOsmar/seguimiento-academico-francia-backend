from django.urls import path

from .views import (
    BroadcastView,
    CoberturaComunicadoView,
    DispositivosCountView,
    NotificacionListView,
    NotificacionMarcarLeidaView,
    RegistrarTokenView,
)

urlpatterns = [
    path('fcm/token/',              RegistrarTokenView.as_view(),          name='fcm-token'),
    path('broadcast/',              BroadcastView.as_view(),               name='broadcast'),
    path('dispositivos/',           DispositivosCountView.as_view(),       name='dispositivos-count'),
    path('cobertura-comunicado/',   CoberturaComunicadoView.as_view(),     name='cobertura-comunicado'),

    path('mis-notificaciones/',     NotificacionListView.as_view(),        name='notificaciones-list'),
    path('<int:pk>/leer/',          NotificacionMarcarLeidaView.as_view(), name='notificacion-leer'),
]

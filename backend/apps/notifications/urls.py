from django.urls import path

from .views import (
    CoberturaComunicadoView,
    DispositivosCountView,
    EnviarNotificacionView,
    NotificacionListView,
    NotificacionMarcarLeidaView,
    NotificacionesEnviadasView,
    RegistrarTokenView,
)

urlpatterns = [
    path('fcm/token/',              RegistrarTokenView.as_view(),          name='fcm-token'),
    path('dispositivos/',           DispositivosCountView.as_view(),       name='dispositivos-count'),
    path('cobertura-comunicado/',   CoberturaComunicadoView.as_view(),     name='cobertura-comunicado'),

    path('enviar/',                 EnviarNotificacionView.as_view(),      name='notif-enviar'),
    path('enviadas/',               NotificacionesEnviadasView.as_view(),  name='notif-enviadas'),

    path('mis-notificaciones/',     NotificacionListView.as_view(),        name='notificaciones-list'),
    path('<int:pk>/leer/',          NotificacionMarcarLeidaView.as_view(), name='notificacion-leer'),
]

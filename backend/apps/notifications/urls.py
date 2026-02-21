from django.urls import path
from .views import RegistrarTokenView

urlpatterns = [
    path('fcm/token/', RegistrarTokenView.as_view(), name='fcm-token'),
]

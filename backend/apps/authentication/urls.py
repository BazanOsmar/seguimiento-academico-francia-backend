from django.urls import path
from rest_framework_simplejwt.views import TokenRefreshView

from .views import LoginView, ChangePasswordView, RegistroTutorView, VerificarContrasenaView, CambiarCredencialesView

urlpatterns = [
    path('login/', LoginView.as_view()),
    path('refresh/', TokenRefreshView.as_view()),
    path('change-password/', ChangePasswordView.as_view()),
    path('cambiar-credenciales/', CambiarCredencialesView.as_view()),
    path('registro-tutor/', RegistroTutorView.as_view()),
    path('verificar-contrasena/', VerificarContrasenaView.as_view()),
]


from django.urls import path
from rest_framework_simplejwt.views import TokenRefreshView

from .views import LoginView, ChangePasswordView, RegistroTutorView, VerificarContrasenaView

urlpatterns = [
    path('login/', LoginView.as_view()),
    path('refresh/', TokenRefreshView.as_view()),
    path('change-password/', ChangePasswordView.as_view()),
    path('registro-tutor/', RegistroTutorView.as_view()),
    path('verificar-contrasena/', VerificarContrasenaView.as_view()),
]


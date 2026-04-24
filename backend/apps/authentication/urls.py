from django.urls import path
from rest_framework_simplejwt.views import TokenRefreshView

from .views import (
    LoginView, ChangePasswordView, RegistroTutorView, VerificarRegistroTutorView,
    VerificarContrasenaView, CambiarCredencialesView, RegistrarIngresoView,
    VincularEstudianteView, DesvincularEstudianteView, SugerenciasView,
)

urlpatterns = [
    path('login/',                                    LoginView.as_view()),
    path('refresh/',                                  TokenRefreshView.as_view()),
    path('change-password/',                          ChangePasswordView.as_view()),
    path('cambiar-credenciales/',                     CambiarCredencialesView.as_view()),
    path('registro-tutor/',                           RegistroTutorView.as_view()),
    path('registro-tutor/verificar/',                 VerificarRegistroTutorView.as_view()),
    path('vincular-estudiante/',                      VincularEstudianteView.as_view()),
    path('desvincular-estudiante/<int:estudiante_id>/', DesvincularEstudianteView.as_view()),
    path('verificar-contrasena/',                     VerificarContrasenaView.as_view()),
    path('registrar-ingreso/',                        RegistrarIngresoView.as_view()),
    path('sugerencias/',                              SugerenciasView.as_view()),
]


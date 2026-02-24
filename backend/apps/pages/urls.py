from django.urls import path
from django.views.generic import RedirectView
from . import views

urlpatterns = [
    path('',                         RedirectView.as_view(url='/login/', permanent=False)),
    path('login/',                   views.login_view,                name='login'),
    path('director/',                views.director_view,             name='director'),
    path('director/estudiantes/',              views.director_estudiantes_view,        name='director-estudiantes'),
    path('director/estudiantes/<int:curso_id>/', views.director_curso_estudiantes_view, name='director-curso-estudiantes'),
    path('director/usuarios/',                    views.director_usuarios_view,        name='director-usuarios'),
    path('director/usuarios/<int:user_id>/',      views.director_perfil_usuario_view,  name='director-perfil-usuario'),
    path('director/comunicados/',    views.director_comunicados_view, name='director-comunicados'),
    path('profesor/',                views.profesor_view,             name='profesor'),
]

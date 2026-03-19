from django.urls import path
from django.views.generic import RedirectView
from . import views

urlpatterns = [
    path('',                         RedirectView.as_view(url='/login/', permanent=False)),
    path('login/',                   views.login_view,                name='login'),
    path('director/',                views.director_view,             name='director'),
    path('director/estudiantes/',              views.director_estudiantes_view,        name='director-estudiantes'),
    path('director/estudiantes/<int:curso_id>/', views.director_curso_estudiantes_view, name='director-curso-estudiantes'),
    path('director/estudiantes/<int:curso_id>/<int:estudiante_id>/', views.director_perfil_estudiante_view, name='director-perfil-estudiante'),
    path('director/usuarios/',                    views.director_usuarios_view,        name='director-usuarios'),
    path('director/usuarios/<int:user_id>/',      views.director_perfil_usuario_view,  name='director-perfil-usuario'),
    path('director/asistencia/',          views.director_asistencia_view,          name='director-asistencia'),
    path('director/asistencia/exportar/', views.director_asistencia_exportar_view, name='director-asistencia-exportar'),
    path('director/asistencia/exportar/excel/', views.director_asistencia_exportar_excel_view, name='director-asistencia-exportar-excel'),
    path('director/estadisticas/',   views.director_estadisticas_view, name='director-estadisticas'),
    path('director/actividad/',      views.director_actividad_view,   name='director-actividad'),
    path('director/control-diario/', views.director_control_diario_view, name='director-control-diario'),
    path('director/comunicados/',    views.director_comunicados_view, name='director-comunicados'),
    path('director/academico/',      views.director_academico_view,   name='director-academico'),
    path('director/mi-perfil/',      views.director_mi_perfil_view,   name='director-mi-perfil'),
    path('profesor/',                views.profesor_view,             name='profesor'),
]

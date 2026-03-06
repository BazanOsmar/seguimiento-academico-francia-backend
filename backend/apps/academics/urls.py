from django.urls import path
from .views import CursoListView, ProfesorCursosView

urlpatterns = [
    path("cursos/", CursoListView.as_view(), name="curso-list"),
    path("profesor/cursos/", ProfesorCursosView.as_view(), name="profesor-cursos"),
]
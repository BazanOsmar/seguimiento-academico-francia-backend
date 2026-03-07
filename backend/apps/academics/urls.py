from django.urls import path
from .views import (
    CursoListView, ProfesorCursosView,
    MateriaListCreateView, MateriaDetailView,
    AsignacionListCreateView, AsignacionDetailView,
    MateriasXCursoView,
)

urlpatterns = [
    path("cursos/",                        CursoListView.as_view(),          name="curso-list"),
    path("cursos/<int:curso_id>/materias/", MateriasXCursoView.as_view(),    name="materias-x-curso"),
    path("profesor/cursos/",               ProfesorCursosView.as_view(),     name="profesor-cursos"),
    path("materias/",                      MateriaListCreateView.as_view(),  name="materia-list-create"),
    path("materias/<int:materia_id>/",     MateriaDetailView.as_view(),      name="materia-detail"),
    path("asignaciones/",                  AsignacionListCreateView.as_view(), name="asignacion-list-create"),
    path("asignaciones/<int:asignacion_id>/", AsignacionDetailView.as_view(), name="asignacion-detail"),
]
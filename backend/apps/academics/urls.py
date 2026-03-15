from django.urls import path
from .views import (
    CursoListView, ProfesorCursosView,
    MateriaListCreateView, MateriaDetailView,
    AsignacionListCreateView, AsignacionDetailView,
    MateriasXCursoView,
    ProfesorMisAsignacionesView,
    ProfesorPlanListCreateView, ProfesorPlanDetailView, ProfesorPlanHistorialView,
    DirectorPlanesView, DirectorPlanesExportarView,
)

urlpatterns = [
    path("cursos/",                           CursoListView.as_view(),              name="curso-list"),
    path("cursos/<int:curso_id>/materias/",   MateriasXCursoView.as_view(),         name="materias-x-curso"),
    path("profesor/cursos/",                  ProfesorCursosView.as_view(),         name="profesor-cursos"),
    path("profesor/mis-asignaciones/",        ProfesorMisAsignacionesView.as_view(), name="profesor-mis-asignaciones"),
    path("profesor/planes/",                  ProfesorPlanListCreateView.as_view(), name="profesor-planes"),
    path("profesor/planes/historial/",        ProfesorPlanHistorialView.as_view(),  name="profesor-planes-historial"),
    path("profesor/planes/<int:plan_id>/",    ProfesorPlanDetailView.as_view(),     name="profesor-plan-detail"),
    path("materias/",                         MateriaListCreateView.as_view(),      name="materia-list-create"),
    path("materias/<int:materia_id>/",        MateriaDetailView.as_view(),          name="materia-detail"),
    path("asignaciones/",                     AsignacionListCreateView.as_view(),   name="asignacion-list-create"),
    path("asignaciones/<int:asignacion_id>/", AsignacionDetailView.as_view(),       name="asignacion-detail"),
    path("director/planes/",                  DirectorPlanesView.as_view(),         name="director-planes"),
    path("director/planes/exportar/",         DirectorPlanesExportarView.as_view(), name="director-planes-exportar"),
]
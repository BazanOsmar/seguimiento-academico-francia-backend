from django.urls import path
from backend.apps.students.views.student_list_views import EstudiantesPorCursoView
from backend.apps.students.views.student_director_views import (
    EstudianteDirectorListView,
    EstudianteCreateView,
    EstudianteSoloCreateView,
    EstudianteDetailView,
)
from backend.apps.students.views.student_search_views import EstudianteBusquedaView
from backend.apps.students.views.student_import_views import ImportarEstudiantesExcelView
from backend.apps.students.views.student_me_views import (
    MiEstudianteView,
    MateriasEstudianteTutorView,
    NotasMateriaEstudianteTutorView,
)

urlpatterns = [
    path(
        "me/student/",
        MiEstudianteView.as_view(),
        name="mi-estudiante",
    ),
    path(
        "me/student/<int:estudiante_id>/materias/",
        MateriasEstudianteTutorView.as_view(),
        name="mi-estudiante-materias",
    ),
    path(
        "me/student/<int:estudiante_id>/materias/<int:materia_id>/notas/",
        NotasMateriaEstudianteTutorView.as_view(),
        name="mi-estudiante-materia-notas",
    ),
    path(
        "importar-excel/",
        ImportarEstudiantesExcelView.as_view(),
        name="estudiantes-importar-excel",
    ),
    path(
        "curso/<int:curso_id>/estudiantes/",
        EstudiantesPorCursoView.as_view(),
        name="estudiantes-por-curso",
    ),
    path(
        "",
        EstudianteDirectorListView.as_view(),
        name="estudiantes-director-list",
    ),
    path(
        "crear/",
        EstudianteCreateView.as_view(),
        name="estudiantes-crear",
    ),
    path(
        "crear-solo/",
        EstudianteSoloCreateView.as_view(),
        name="estudiantes-crear-solo",
    ),
    path(
        "buscar/",
        EstudianteBusquedaView.as_view(),
        name="estudiantes-buscar",
    ),
    path(
        "<int:pk>/",
        EstudianteDetailView.as_view(),
        name="estudiante-detail",
    ),
]

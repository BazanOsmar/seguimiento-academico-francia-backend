from django.urls import path
from backend.apps.students.views.student_list_views import EstudiantesPorCursoView

urlpatterns = [
    path(
        "curso/<int:curso_id>/estudiantes/",
        EstudiantesPorCursoView.as_view(),
        name="estudiantes-por-curso",
    ),
]

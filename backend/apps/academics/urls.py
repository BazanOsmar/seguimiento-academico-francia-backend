from django.urls import path
from .views import CursoListView

urlpatterns = [
    path("cursos/", CursoListView.as_view(), name="curso-list"),
]

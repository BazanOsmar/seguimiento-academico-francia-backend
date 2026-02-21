from django.shortcuts import render, get_object_or_404


def login_view(request):
    return render(request, 'auth/login.html')


def page_not_found_view(request, exception=None):
    return render(request, '404.html', status=404)


def director_view(request):
    return render(request, 'director/dashboard.html')


def director_estudiantes_view(request):
    return render(request, 'director/estudiantes.html')


def director_curso_estudiantes_view(request, curso_id):
    from backend.apps.academics.models import Curso
    curso = get_object_or_404(Curso, pk=curso_id)
    return render(request, 'director/curso_estudiantes.html', {
        'curso_id': curso_id,
        'curso_nombre': f"{curso.grado} {curso.paralelo}",
    })


def profesor_view(request):
    return render(request, 'profesor/dashboard.html')


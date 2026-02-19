from django.shortcuts import render


def login_view(request):
    return render(request, 'auth/login.html')


def director_view(request):
    return render(request, 'director/dashboard.html')


def profesor_view(request):
    return render(request, 'profesor/dashboard.html')

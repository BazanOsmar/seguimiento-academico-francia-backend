from django.urls import path
from django.views.generic import RedirectView
from . import views

urlpatterns = [
    path('',          RedirectView.as_view(url='/login/', permanent=False)),
    path('login/',    views.login_view,    name='login'),
    path('director/', views.director_view, name='director'),
    path('profesor/', views.profesor_view, name='profesor'),
]

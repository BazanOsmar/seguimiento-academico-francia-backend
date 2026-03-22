"""
URL configuration for backend project.

The `urlpatterns` list routes URLs to views. For more information please see:
    https://docs.djangoproject.com/en/6.0/topics/http/urls/
Examples:
Function views
    1. Add an import:  from my_app import views
    2. Add a URL to urlpatterns:  path('', views.home, name='home')
Class-based views
    1. Add an import:  from other_app.views import Home
    2. Add a URL to urlpatterns:  path('', Home.as_view(), name='home')
Including another URLconf
    1. Import the include() function: from django.urls import include, path
    2. Add a URL to urlpatterns:  path('blog/', include('blog.urls'))

from django.contrib import admin
from django.urls import path

urlpatterns = [
    path('admin/', admin.site.urls),
]
"""

from django.urls import path, include, re_path
from django.contrib import admin
from django.views.generic import TemplateView
from rest_framework.response import Response
from rest_framework.decorators import api_view
from backend.apps.pages.views import page_not_found_view

handler404 = page_not_found_view


@api_view()
def api_not_found(request, *args, **kwargs):
    return Response({'errores': 'Recurso no encontrado.'}, status=404)


urlpatterns = [
    # API
    path('api/auth/', include('backend.apps.authentication.urls')),
    path('api/users/', include('backend.apps.users.urls')),
    path("api/academics/", include("backend.apps.academics.urls")),
    path("api/students/", include("backend.apps.students.urls")),
    path("api/attendance/", include("backend.apps.attendance.urls")),
    path("api/discipline/", include("backend.apps.discipline.urls")),
    path("api/notifications/", include("backend.apps.notifications.urls")),
    path("api/auditoria/",    include("backend.apps.auditoria.urls")),
    path("api/comunicados/",  include("backend.apps.comunicados.urls")),

    # Service Worker FCM — debe estar en la raíz del dominio
    path(
        'firebase-messaging-sw.js',
        TemplateView.as_view(
            template_name='firebase-messaging-sw.js',
            content_type='application/javascript',
        ),
        name='firebase-sw',
    ),

    # Admin — ruta no predecible
    path("gestion/panel-interno-4x8z1w3k/", admin.site.urls),

    # Frontend (páginas HTML)
    path("", include("backend.apps.pages.urls")),

    # Rutas /api/* sin match → JSON 404 (debe ir antes del catch-all HTML)
    re_path(r'^api/', api_not_found),

    # Catch-all → página 404 personalizada
    re_path(r'^.*$', page_not_found_view),
]
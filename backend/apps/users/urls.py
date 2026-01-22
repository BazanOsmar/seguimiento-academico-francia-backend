from django.urls import path
from .views.user_views import UserCreateView

urlpatterns = [
    path('', UserCreateView.as_view()),
]

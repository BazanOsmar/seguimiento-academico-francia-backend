from django.urls import path
from .views.user_views import UserView, UserDetailView

urlpatterns = [
    path('', UserView.as_view()),
    path('<int:user_id>/', UserDetailView.as_view()),
]

from django.conf import settings
from django.db import models

User = settings.AUTH_USER_MODEL


class FCMDevice(models.Model):
    user = models.ForeignKey(User, on_delete=models.CASCADE)
    token = models.CharField(max_length=255)

    def __str__(self):
        return f"FCM - {self.user}"

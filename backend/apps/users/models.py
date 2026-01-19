from django.db import models

# Create your models here.
class TipoUsuario(models.Model):
    tipo_usuario = models.CharField(max_length=50)

    def __str__(self):
        return self.tipo_usuario


class Usuario(models.Model):
    nombre = models.CharField(max_length=100)
    apellidos = models.CharField(max_length=100)
    usuario = models.CharField(max_length=50, unique=True)
    contrasena = models.CharField(max_length=128)
    estado = models.BooleanField(default=True)
    ultima_conexion = models.DateTimeField(null=True, blank=True)

    tipo_usuario = models.ForeignKey(
        TipoUsuario,
        on_delete=models.PROTECT,
        related_name='usuarios'
    )

    def __str__(self):
        return self.usuario


class FCMDevice(models.Model):
    usuario = models.ForeignKey(
        Usuario,
        on_delete=models.CASCADE,
        related_name='fcm_devices'
    )
    token_id = models.CharField(max_length=255)

    def __str__(self):
        return self.token_id
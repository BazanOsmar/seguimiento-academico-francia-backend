from django.db import transaction

from backend.apps.users.models import TipoUsuario, User
from backend.core.utils import generar_password
from .models import Estudiante


@transaction.atomic
def crear_estudiante_con_tutor(datos):
    """
    Crea el tutor (User) y el Estudiante en una transacción atómica.
    Retorna (estudiante, credenciales_tutor).
    """
    tipo_tutor, _ = TipoUsuario.objects.get_or_create(nombre='Tutor')

    username = datos['tutor_carnet']
    password = generar_password(datos['tutor_nombre'], datos['tutor_apellidos'])

    tutor = User.objects.create_user(
        username=username,
        password=password,
        first_name=datos['tutor_nombre'],
        last_name=datos['tutor_apellidos'],
        tipo_usuario=tipo_tutor,
        primer_ingreso=True,
    )

    estudiante = Estudiante.objects.create(
        nombre=datos['nombre'],
        apellidos=datos['apellidos'],
        identificador=datos.get('identificador') or None,
        curso=datos['curso'],
        tutor=tutor,
    )

    return estudiante, {'username': username, 'password': password}

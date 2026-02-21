import random
import string


def generar_password(nombre: str, apellidos: str) -> str:
    """
    Genera una contraseña inicial de 10 caracteres:
    - 3 letras del nombre
    - 3 letras del apellido
    - 4 caracteres aleatorios (letras y dígitos)

    Utilizado tanto para usuarios del sistema como para tutores.
    """
    name_part = nombre.strip()[:3].lower()
    last_part  = apellidos.strip()[:3].lower()
    rand_part  = ''.join(random.choices(string.ascii_letters + string.digits, k=4))
    return f"{name_part}{last_part}{rand_part}"

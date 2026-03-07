import re
import random
import string
import unicodedata


def _normalizar(texto: str) -> str:
    """Elimina tildes y caracteres especiales, retorna minúsculas sin espacios."""
    nfkd = unicodedata.normalize('NFKD', texto)
    ascii_ = nfkd.encode('ascii', 'ignore').decode('ascii')
    return re.sub(r'[^a-z0-9]', '', ascii_.lower())


def generar_username(nombre: str, apellidos: str) -> str:
    """
    Genera un username único para tutores a partir de nombre y apellidos.
    Patrón: inicial_nombre + apellidos_normalizados (máx 12 chars).
    Si ya existe, agrega sufijo numérico.
    """
    from django.contrib.auth import get_user_model
    User = get_user_model()

    base = (_normalizar(nombre)[:1] + _normalizar(apellidos)[:11])[:12]
    if not base:
        base = 'tutor'

    username = base
    contador = 2
    while User.objects.filter(username=username).exists():
        username = f"{base}{contador}"
        contador += 1
    return username


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

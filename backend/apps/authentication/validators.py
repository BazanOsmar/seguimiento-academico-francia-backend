import re
from rest_framework import serializers


def validar_password(value):
    """
    Validación de contraseña con reglas ISO:
    - Mínimo 8 caracteres
    - Al menos 1 mayúscula, 1 minúscula, 1 número, 1 carácter especial
    - Sin espacios
    """
    errores = []

    if len(value) < 8:
        errores.append("Debe tener al menos 8 caracteres.")

    if ' ' in value:
        errores.append("No debe contener espacios.")

    if not re.search(r'[A-Z]', value):
        errores.append("Debe incluir al menos una letra mayúscula.")

    if not re.search(r'[a-z]', value):
        errores.append("Debe incluir al menos una letra minúscula.")

    if not re.search(r'[0-9]', value):
        errores.append("Debe incluir al menos un número.")

    if not re.search(r'[^A-Za-z0-9]', value):
        errores.append("Debe incluir al menos un carácter especial.")

    if errores:
        raise serializers.ValidationError(errores)

    return value

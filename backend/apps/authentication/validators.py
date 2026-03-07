from rest_framework import serializers


def validar_password(value):
    """
    Reglas de contraseña para registro de tutores:
    - Mínimo 8 caracteres
    - Al menos una letra minúscula
    - Al menos un número
    - Al menos un carácter especial (no letra, no dígito, no espacio)
    """
    errores = []

    if len(value) < 8 or len(value) > 20:
        errores.append("Debe tener entre 8 y 20 caracteres.")

    if not any(c.islower() for c in value):
        errores.append("Debe incluir al menos una letra minúscula.")

    if not any(c.isdigit() for c in value):
        errores.append("Debe incluir al menos un número.")

    if not any(not c.isalpha() and not c.isdigit() and not c.isspace() for c in value):
        errores.append("Debe incluir al menos un carácter especial.")

    if errores:
        raise serializers.ValidationError(errores)

    return value

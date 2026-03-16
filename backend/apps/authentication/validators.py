from rest_framework import serializers


def validar_password(value):
    """
    Reglas de contraseña (registro tutor y cambio de credenciales):
    - Entre 8 y 20 caracteres
    - Sin espacios
    - Al menos una letra minúscula
    - Al menos una letra mayúscula
    - Al menos un número
    - Al menos un carácter especial
    """
    errores = []

    if len(value) < 8 or len(value) > 20:
        errores.append("Debe tener entre 8 y 20 caracteres.")

    if ' ' in value:
        errores.append("No puede contener espacios.")

    if not any(c.islower() for c in value):
        errores.append("Debe incluir al menos una letra minúscula.")

    if not any(c.isupper() for c in value):
        errores.append("Debe incluir al menos una letra mayúscula.")

    if not any(c.isdigit() for c in value):
        errores.append("Debe incluir al menos un número.")

    if not any(not c.isalpha() and not c.isdigit() and not c.isspace() for c in value):
        errores.append("Debe incluir al menos un carácter especial (ej: @, #, !, .).")

    if errores:
        raise serializers.ValidationError(errores)

    return value


def validar_username(value):
    """
    Reglas de nombre de usuario:
    - Entre 5 y 20 caracteres
    - Sin espacios
    - Solo letras, números y guion bajo
    - Al menos una letra
    """
    import re
    errores = []

    value = value.strip()

    if len(value) < 5 or len(value) > 20:
        errores.append("Debe tener entre 5 y 20 caracteres.")

    if ' ' in value:
        errores.append("No puede contener espacios.")

    if not re.match(r'^[a-zA-Z0-9_]+$', value):
        errores.append("Solo se permiten letras, números y guion bajo (_).")

    if not any(c.isalpha() for c in value):
        errores.append("Debe incluir al menos una letra.")

    if errores:
        raise serializers.ValidationError(errores)

    return value

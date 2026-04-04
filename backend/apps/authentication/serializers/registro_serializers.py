from rest_framework import serializers

from ..validators import validar_password, validar_username


class RegistroTutorBaseSerializer(serializers.Serializer):
    """Valida todos los datos del registro sin exigir aceptación de términos."""
    identificadores_estudiantes = serializers.ListField(
        child=serializers.CharField(),
        min_length=1,
        max_length=5,
    )
    username              = serializers.CharField()
    nombre                = serializers.CharField()
    apellidos             = serializers.CharField()
    password              = serializers.CharField(write_only=True)
    password_confirmacion = serializers.CharField(write_only=True)

    def validate_username(self, value):
        from backend.apps.users.models import User
        validar_username(value)
        if User.objects.filter(username=value).exists():
            raise serializers.ValidationError("Este nombre de usuario ya está en uso.")
        return value

    def validate_password(self, value):
        return validar_password(value)

    def validate_identificadores_estudiantes(self, value):
        from backend.apps.students.models import Estudiante

        estudiantes = []
        seen = set()
        for identificador in value:
            if identificador in seen:
                raise serializers.ValidationError(
                    f"El identificador '{identificador}' está duplicado."
                )
            seen.add(identificador)

            try:
                estudiante = Estudiante.objects.select_related('curso', 'tutor').get(
                    identificador=identificador, activo=True
                )
            except Estudiante.DoesNotExist:
                raise serializers.ValidationError(
                    f"No se encontró un estudiante activo con el identificador '{identificador}'."
                )

            if estudiante.tutor is not None:
                raise serializers.ValidationError(
                    f"El estudiante '{identificador}' ya tiene un tutor asignado."
                )

            estudiantes.append(estudiante)

        self._estudiantes = estudiantes
        return value

    def validate(self, data):
        if data['password'] != data['password_confirmacion']:
            raise serializers.ValidationError({
                "password_confirmacion": ["Las contraseñas no coinciden."]
            })
        data['_estudiantes'] = self._estudiantes
        return data


class RegistroTutorSerializer(RegistroTutorBaseSerializer):
    """Registro completo: exige accepted_terms=true para crear la cuenta."""
    accepted_terms = serializers.BooleanField()

    def validate_accepted_terms(self, value):
        if not value:
            raise serializers.ValidationError("Debes aceptar los términos y condiciones.")
        return value

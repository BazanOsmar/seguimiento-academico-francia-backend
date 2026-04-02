from rest_framework import serializers

ACCIONES_MOVIL_PERMITIDAS = {
    'LOGIN',
    'RESET_PASSWORD',
    'REGISTRAR_ASISTENCIA',
    'CREAR_CITACION',
    'ACTUALIZAR_CITACION',
    'EDITAR_USUARIO',
    'CREAR_USUARIO',
    'RESTABLECER_ATRASO',
    'CERRAR_SESION',
    'VER_HISTORIAL',
    'VER_ESTADO_DIARIO',
}


class RegistrarActividadSerializer(serializers.Serializer):
    accion      = serializers.CharField(max_length=60)
    descripcion = serializers.CharField(max_length=255)

    def validate_accion(self, value):
        valor = value.strip().upper()
        if valor not in ACCIONES_MOVIL_PERMITIDAS:
            permitidas = ', '.join(sorted(ACCIONES_MOVIL_PERMITIDAS))
            raise serializers.ValidationError(
                f"Acción no permitida. Valores válidos: {permitidas}"
            )
        return valor

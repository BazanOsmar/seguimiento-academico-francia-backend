from django.conf import settings
from rest_framework.views import APIView
from rest_framework.response import Response
from rest_framework import status
from rest_framework.permissions import IsAuthenticated

from ..serializers.citacion_write_serializers import CitacionCreateSerializer
from ..serializers.citacion_read_serializers import CitacionListSerializer
from backend.core.permissions import IsDirectorOrRegenteOrProfesor
from backend.apps.academics.models import ProfesorCurso


def _tipo_usuario(user):
    return user.tipo_usuario.nombre if user.tipo_usuario else None


def _validar_permiso_profesor(user, estudiante):
    curso = getattr(estudiante, "curso", None)
    if curso is None:
        return "El estudiante no tiene curso asignado.", status.HTTP_400_BAD_REQUEST

    es_su_curso = ProfesorCurso.objects.filter(profesor=user, curso=curso).exists()
    if not es_su_curso:
        return "No puedes crear una citacion para un estudiante de otro curso.", status.HTTP_403_FORBIDDEN

    return None, None


def _materia_para_profesor(user, estudiante):
    asignacion = ProfesorCurso.objects.filter(
        profesor=user,
        curso=estudiante.curso,
    ).select_related("materia").first()
    return asignacion.materia if asignacion else None


def _registrar_creacion(request, citacion):
    from backend.apps.auditoria.services import registrar

    nombre_emisor = f"{request.user.first_name} {request.user.last_name}".strip() or request.user.username
    nombre_estudiante = (
        f"{citacion.estudiante.apellido_paterno} "
        f"{citacion.estudiante.apellido_materno} "
        f"{citacion.estudiante.nombre}"
    ).strip()
    registrar(
        request.user,
        "CREAR_CITACION",
        f"{nombre_emisor} creo citacion para {nombre_estudiante} (motivo: {citacion.motivo})",
        request,
    )


def _notificar_tutor(request, citacion):
    tutor = citacion.estudiante.tutor
    if tutor is None:
        return

    import threading
    from backend.apps.notifications.services import enviar_notificacion

    motivos = {
        "FALTAS": "inasistencias reiteradas",
        "COMPORTAMIENTO": "problemas de comportamiento",
        "BAJO_RENDIMIENTO": "bajo rendimiento academico",
    }
    nombre_estudiante = f"{citacion.estudiante.apellido_paterno} {citacion.estudiante.nombre}".strip()
    motivo_upper = citacion.motivo.upper()
    fecha_limite = citacion.fecha_limite_asistencia
    meses_es = [
        "",
        "enero",
        "febrero",
        "marzo",
        "abril",
        "mayo",
        "junio",
        "julio",
        "agosto",
        "septiembre",
        "octubre",
        "noviembre",
        "diciembre",
    ]
    fecha_legible = f"{fecha_limite.day} de {meses_es[fecha_limite.month]}"

    if motivo_upper == "OTRO":
        cuerpo = f"La unidad educativa le solicita presentarse por {nombre_estudiante}. Presentese antes del {fecha_legible}."
        if _tipo_usuario(request.user) == "Profesor":
            asignacion = ProfesorCurso.objects.filter(
                profesor=request.user,
                curso=citacion.estudiante.curso,
            ).select_related("materia").first()
            if asignacion:
                cuerpo = (
                    f"Su hijo/a {nombre_estudiante} tiene una observacion en "
                    f"{asignacion.materia.nombre}. Presentese antes del {fecha_legible}."
                )
    else:
        motivo_texto = motivos.get(motivo_upper, citacion.motivo.lower())
        cuerpo = (
            f"Su hijo/a {nombre_estudiante} tiene una citacion por {motivo_texto}. "
            f"Presentese antes del {fecha_legible}."
        )

    threading.Thread(
        target=enviar_notificacion,
        args=(tutor,),
        kwargs={
            "titulo": "Citacion escolar",
            "cuerpo": cuerpo,
            "datos": {"rol": "padre", "citacion_id": str(citacion.id)},
            "imagen": getattr(settings, "FCM_NOTIFICATION_IMAGE", None),
        },
        daemon=True,
    ).start()


def _crear_citacion_validada(request, serializer):
    estudiante = serializer.validated_data["estudiante"]
    tipo = _tipo_usuario(request.user)

    if tipo == "Profesor":
        error, error_status = _validar_permiso_profesor(request.user, estudiante)
        if error:
            return None, error, error_status

    if not estudiante.tutor_id:
        return (
            None,
            "El estudiante no tiene tutor registrado. No se puede crear la citacion.",
            status.HTTP_400_BAD_REQUEST,
        )

    materia = _materia_para_profesor(request.user, estudiante) if tipo == "Profesor" else None
    citacion = serializer.save(emisor=request.user, materia=materia)
    _registrar_creacion(request, citacion)
    _notificar_tutor(request, citacion)
    return citacion, None, None


class CitacionCreateView(APIView):
    """
    POST api/discipline/citaciones/crear/

    Crea una citacion para un solo estudiante.
    """

    permission_classes = [IsAuthenticated, IsDirectorOrRegenteOrProfesor]

    def post(self, request):
        serializer = CitacionCreateSerializer(data=request.data)
        if not serializer.is_valid():
            return Response(serializer.errors, status=status.HTTP_400_BAD_REQUEST)

        citacion, error, error_status = _crear_citacion_validada(request, serializer)
        if error:
            return Response({"errores": error}, status=error_status)

        return Response(CitacionListSerializer(citacion).data, status=status.HTTP_201_CREATED)


class CitacionGrupoCreateView(APIView):
    """
    POST api/discipline/citaciones/crear-grupo/

    Crea citaciones para varios estudiantes. Cada estudiante genera una
    citacion independiente. Si algunos fallan, devuelve detalle parcial.
    """

    permission_classes = [IsAuthenticated, IsDirectorOrRegenteOrProfesor]

    def post(self, request):
        estudiantes = request.data.get("estudiantes")
        if not isinstance(estudiantes, list) or not estudiantes:
            return Response(
                {"errores": "Debes enviar una lista de estudiantes."},
                status=status.HTTP_400_BAD_REQUEST,
            )

        try:
            tiene_duplicados = len(estudiantes) != len(set(estudiantes))
        except TypeError:
            return Response(
                {"errores": "La lista de estudiantes contiene valores invalidos."},
                status=status.HTTP_400_BAD_REQUEST,
            )

        if tiene_duplicados:
            return Response(
                {"errores": "La lista de estudiantes contiene duplicados."},
                status=status.HTTP_400_BAD_REQUEST,
            )

        base_payload = {
            "motivo": request.data.get("motivo"),
            "descripcion": request.data.get("descripcion", ""),
            "estado": request.data.get("estado", "ENVIADA"),
            "fecha_limite_asistencia": request.data.get("fecha_limite_asistencia"),
        }
        creadas = []
        fallidas = []

        for estudiante_id in estudiantes:
            serializer = CitacionCreateSerializer(data={**base_payload, "estudiante": estudiante_id})
            if not serializer.is_valid():
                fallidas.append({"estudiante": estudiante_id, "errores": serializer.errors})
                continue

            citacion, error, _error_status = _crear_citacion_validada(request, serializer)
            if error:
                fallidas.append({"estudiante": estudiante_id, "errores": error})
                continue

            creadas.append(CitacionListSerializer(citacion).data)

        if not creadas:
            return Response(
                {
                    "creadas": [],
                    "fallidas": fallidas,
                    "total_creadas": 0,
                    "total_fallidas": len(fallidas),
                    "errores": "No se pudo crear ninguna citacion.",
                },
                status=status.HTTP_400_BAD_REQUEST,
            )

        response_status = status.HTTP_201_CREATED if not fallidas else status.HTTP_207_MULTI_STATUS
        return Response(
            {
                "creadas": creadas,
                "fallidas": fallidas,
                "total_creadas": len(creadas),
                "total_fallidas": len(fallidas),
            },
            status=response_status,
        )

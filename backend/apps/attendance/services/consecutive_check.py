from backend.apps.attendance.models import Asistencia


UMBRAL_FALTAS = 3
UMBRAL_ATRASOS = 6


def verificar_faltas_atrasos_consecutivos(sesion):
    """
    Verifica si algun estudiante acumulo faltas o atrasos consecutivos
    en el mismo curso despues de registrar la asistencia de una sesion.

    - 3 faltas consecutivas → print de alerta
    - 6 atrasos consecutivos → print de alerta

    Solo verifica estudiantes que recibieron FALTA o ATRASO en la sesion actual.
    """
    curso = sesion.curso
    asistencias_sesion = sesion.asistencias.select_related('estudiante')

    estudiantes_falta = [
        a.estudiante for a in asistencias_sesion if a.estado == 'FALTA'
    ]
    estudiantes_atraso = [
        a.estudiante for a in asistencias_sesion if a.estado == 'ATRASO'
    ]

    for estudiante in estudiantes_falta:
        ultimas = (
            Asistencia.objects
            .filter(sesion__curso=curso, estudiante=estudiante)
            .order_by('-sesion__fecha')
            .values_list('estado', flat=True)[:UMBRAL_FALTAS]
        )
        if len(ultimas) == UMBRAL_FALTAS and all(e == 'FALTA' for e in ultimas):
            print(
                f"ALERTA: Estudiante {estudiante.nombre} {estudiante.apellidos} "
                f"acumula {UMBRAL_FALTAS} faltas consecutivas en {curso}"
            )

    for estudiante in estudiantes_atraso:
        ultimas = (
            Asistencia.objects
            .filter(sesion__curso=curso, estudiante=estudiante)
            .order_by('-sesion__fecha')
            .values_list('estado', flat=True)[:UMBRAL_ATRASOS]
        )
        if len(ultimas) == UMBRAL_ATRASOS and all(e == 'ATRASO' for e in ultimas):
            print(
                f"ALERTA: Estudiante {estudiante.nombre} {estudiante.apellidos} "
                f"acumula {UMBRAL_ATRASOS} atrasos consecutivos en {curso}"
            )

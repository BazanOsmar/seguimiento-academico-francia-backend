import io

import openpyxl as _xl
from rest_framework.views import APIView
from rest_framework.response import Response
from rest_framework.permissions import IsAuthenticated
from rest_framework import status

from backend.core.permissions import IsProfesor
from ..models import ProfesorCurso
from ..services.planilla_validator import validar_estructura, validar_pertenencia, extraer_notas, validar_estudiantes
from ..services.planilla_validator_2026 import es_formato_2026, validar_estructura_2026, validar_pertenencia_2026
from ..services.notas_mongo_service import guardar_notas, obtener_notas


def _error(mensaje):
    return Response({'es_valido': False, 'mensaje': mensaje}, status=status.HTTP_400_BAD_REQUEST)


class ValidarPlanillaView(APIView):
    """
    POST /api/academics/profesor/validar-planilla/
    Valida la planilla en niveles secuenciales — se detiene en el primero que falla.
    Permiso: Profesor.
    """
    permission_classes = [IsAuthenticated, IsProfesor]

    def post(self, request):
        # ── Nivel 2: recepción ────────────────────────────────────────
        archivo = request.FILES.get('archivo')
        if not archivo:
            return _error('Debes adjuntar un archivo Excel antes de continuar.')

        nombre = archivo.name.lower()
        if not (nombre.endswith('.xlsx') or nombre.endswith('.xls')):
            return _error('El archivo debe ser .xlsx o .xls. No se aceptan otros formatos.')

        profesor_curso_id = request.data.get('profesor_curso_id')
        if not profesor_curso_id:
            return _error('Asignación no válida.')
        try:
            profesor_curso_id = int(profesor_curso_id)
        except (ValueError, TypeError):
            return _error('Asignación no válida.')
        try:
            profesor_curso = (
                ProfesorCurso.objects
                .select_related('profesor', 'materia', 'curso')
                .get(pk=profesor_curso_id, profesor=request.user)
            )
        except ProfesorCurso.DoesNotExist:
            return _error('Asignación no válida o no te pertenece.')

        contenido = archivo.read()
        try:
            wb = _xl.load_workbook(io.BytesIO(contenido), data_only=True)
        except Exception:
            return _error('No se pudo leer el archivo. Asegúrate de que no esté dañado.')

        es_2026 = es_formato_2026(wb)

        # ── Nivel 3: estructura ───────────────────────────────────────
        if es_2026:
            estructura = validar_estructura_2026(wb)
        else:
            estructura = validar_estructura(wb)

        if not estructura['es_valido']:
            return _error(estructura['mensaje'])

        # ── Nivel 4: pertenencia ──────────────────────────────────────
        if es_2026:
            error_pertenencia = validar_pertenencia_2026(estructura['metadatos'], profesor_curso)
        else:
            error_pertenencia = validar_pertenencia(estructura['metadatos'], profesor_curso)

        if error_pertenencia:
            return _error(error_pertenencia)

        # ── Nivel 5: estudiantes ──────────────────────────────────────
        curso_nombre  = f"{profesor_curso.curso.grado} \"{profesor_curso.curso.paralelo}\""
        # Ambos formatos almacenan los nombres en metadatos['estudiantes']
        # (Ley 070 los lee de FILIACION en validar_estructura, igual que 2026)
        nombres_excel = estructura['metadatos'].get('estudiantes', [])

        val_est = validar_estudiantes(nombres_excel, profesor_curso.curso_id)

        if not val_est['es_valido']:
            return Response({
                'es_valido':           False,
                'errores_estudiantes': val_est['errores'],
            }, status=status.HTTP_400_BAD_REQUEST)

        # ── Planilla válida: guardar y responder ──────────────────────
        advertencias = estructura.get('advertencias', []) + val_est.get('advertencias', [])
        estudiantes_resp = {
            'lista_estudiantes': val_est['lista_estudiantes'],
            'activos':           val_est['activos'],
            'inactivos':         val_est['inactivos'],
            'no_encontrados':    val_est['no_encontrados'],
            'total_excel':       val_est['total_excel'],
            'total_bd':          val_est['total_bd'],
            'curso_verificado':  curso_nombre,
        }

        if es_2026:
            _TRIM_MAP = {'1TRIM': 1, '2TRIM': 2, '3TRIM': 3}
            headers_por_trim = estructura['metadatos'].get('headers_actividades', {})
            mongo_result = {'insertados': 0, 'actualizados': 0, 'errores': 0}
            for hoja, dims in headers_por_trim.items():
                t = _TRIM_MAP.get(hoja, 1)
                r = guardar_notas(profesor_curso, t, dims)
                mongo_result['insertados']   += r['insertados']
                mongo_result['actualizados'] += r['actualizados']
                mongo_result['errores']      += r['errores']

            return Response({
                'es_valido':    True,
                'advertencias': advertencias,
                'metadatos':    estructura['metadatos'],
                'estudiantes':  estudiantes_resp,
                'mongo':        mongo_result,
            })
        else:
            notas = extraer_notas(wb)
            return Response({
                'es_valido':    True,
                'advertencias': advertencias,
                'metadatos':    estructura['metadatos'],
                'estudiantes':  estudiantes_resp,
                'notas':        notas,
            })


class NotasMongoView(APIView):
    """
    GET /api/academics/profesor/notas/?profesor_curso_id=X&trimestre=1
    Recupera las notas guardadas en MongoDB para una asignación y trimestre.
    Permiso: Profesor.
    """
    permission_classes = [IsAuthenticated, IsProfesor]

    def get(self, request):
        try:
            profesor_curso_id = int(request.query_params.get('profesor_curso_id', 0))
            trimestre         = int(request.query_params.get('trimestre', 1))
        except (ValueError, TypeError):
            return Response({'errores': 'Parámetros inválidos.'}, status=status.HTTP_400_BAD_REQUEST)

        try:
            pc = ProfesorCurso.objects.select_related('materia', 'curso').get(
                pk=profesor_curso_id, profesor=request.user
            )
        except ProfesorCurso.DoesNotExist:
            return Response({'errores': 'Asignación no válida.'}, status=status.HTTP_400_BAD_REQUEST)

        actividades = obtener_notas(pc.materia.id, pc.curso.id, trimestre)
        return Response({'trimestre': trimestre, 'actividades': actividades})

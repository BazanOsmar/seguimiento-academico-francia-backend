import io
import uuid

import openpyxl as _xl
from django.core.cache import cache
from django.utils import timezone
from rest_framework.views import APIView
from rest_framework.response import Response
from rest_framework.permissions import IsAuthenticated
from rest_framework import status

from backend.core.permissions import IsProfesor
from ..models import ProfesorCurso
from ..services.planilla_validator import validar_estructura, validar_pertenencia, extraer_notas, validar_estudiantes
from ..services.planilla_validator_2026 import (
    es_formato_2026, validar_estructura_2026, validar_pertenencia_2026,
    validar_completitud_notas,
)
from ..services.notas_mongo_service import guardar_notas, obtener_notas, calcular_notas_mensuales

_DRAFT_TTL  = 1800          # 30 minutos
_DRAFT_PREFIX = 'planilla_draft_'
_TRIM_MAP   = {'1TRIM': 1, '2TRIM': 2, '3TRIM': 3}


def _error(mensaje):
    return Response({'es_valido': False, 'mensaje': mensaje}, status=status.HTTP_400_BAD_REQUEST)


class ValidarPlanillaView(APIView):
    """
    POST /api/academics/profesor/validar-planilla/

    Valida la planilla en niveles secuenciales y devuelve un preview de los datos.
    NO guarda nada en Mongo — eso ocurre solo cuando el profesor confirma
    en /confirmar-planilla/.

    En caso de éxito devuelve un `draft_token` válido por 30 minutos.
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
        estructura = validar_estructura_2026(wb) if es_2026 else validar_estructura(wb)
        if not estructura['es_valido']:
            return _error(estructura['mensaje'])

        # ── Nivel 4: pertenencia ──────────────────────────────────────
        error_pertenencia = (
            validar_pertenencia_2026(estructura['metadatos'], profesor_curso)
            if es_2026 else
            validar_pertenencia(estructura['metadatos'], profesor_curso)
        )
        if error_pertenencia:
            return _error(error_pertenencia)

        # ── Nivel 5: estudiantes ──────────────────────────────────────
        nombres_excel = estructura['metadatos'].get('estudiantes', [])
        val_est = validar_estudiantes(nombres_excel, profesor_curso.curso_id)

        if not val_est['es_valido']:
            return Response({
                'es_valido':           False,
                'errores_estudiantes': val_est['errores'],
            }, status=status.HTTP_400_BAD_REQUEST)

        advertencias = estructura.get('advertencias', []) + val_est.get('advertencias', [])
        curso_nombre = f"{profesor_curso.curso.grado} \"{profesor_curso.curso.paralelo}\""
        estudiantes_resp = {
            'lista_estudiantes': val_est['lista_estudiantes'],
            'activos':           val_est['activos'],
            'inactivos':         val_est['inactivos'],
            'no_encontrados':    val_est['no_encontrados'],
            'total_excel':       val_est['total_excel'],
            'total_bd':          val_est['total_bd'],
            'curso_verificado':  curso_nombre,
        }

        # ── Nivel 6: completitud de notas (solo formato 2026) ─────────
        if es_2026:
            headers_por_trim = estructura['metadatos'].get('headers_actividades', {})
            nombres_activos  = [
                e['nombre'] for e in val_est['lista_estudiantes'] if e.get('activo') is True
            ]
            val_notas = validar_completitud_notas(headers_por_trim, nombres_activos)
            if not val_notas['es_valido']:
                return Response(
                    {'es_valido': False, 'errores_notas': val_notas['errores']},
                    status=status.HTTP_400_BAD_REQUEST,
                )

        # ── Planilla válida: guardar borrador en cache y devolver preview ─
        if es_2026:
            headers_por_trim = estructura['metadatos'].get('headers_actividades', {})
            token = str(uuid.uuid4())
            cache.set(_DRAFT_PREFIX + token, {
                'profesor_curso_id': profesor_curso.id,
                'headers_por_trim':  headers_por_trim,
                'gestion':           timezone.now().year,
            }, timeout=_DRAFT_TTL)

            return Response({
                'es_valido':    True,
                'draft_token':  token,
                'advertencias': advertencias,
                'metadatos':    estructura['metadatos'],
                'estudiantes':  estudiantes_resp,
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


class ConfirmarPlanillaView(APIView):
    """
    POST /api/academics/profesor/confirmar-planilla/

    Recibe el draft_token generado por /validar-planilla/ y guarda las notas
    en MongoDB (detalle_notas + notas_mensuales).
    El token expira a los 30 minutos — si venció, el profesor debe revalidar.
    """
    permission_classes = [IsAuthenticated, IsProfesor]

    def post(self, request):
        token = request.data.get('draft_token', '').strip()
        if not token:
            return Response(
                {'errores': 'Token no proporcionado.'},
                status=status.HTTP_400_BAD_REQUEST,
            )

        draft = cache.get(_DRAFT_PREFIX + token)
        if not draft:
            return Response(
                {'errores': 'El tiempo para confirmar venció (30 min). Vuelve a validar la planilla.'},
                status=status.HTTP_400_BAD_REQUEST,
            )

        # Verificar que la asignación sigue perteneciendo al profesor autenticado
        try:
            profesor_curso = (
                ProfesorCurso.objects
                .select_related('profesor', 'materia', 'curso')
                .get(pk=draft['profesor_curso_id'], profesor=request.user)
            )
        except ProfesorCurso.DoesNotExist:
            return Response(
                {'errores': 'Asignación no válida.'},
                status=status.HTTP_400_BAD_REQUEST,
            )

        resultado = {
            'insertados': 0, 'actualizados': 0,
            'sin_cambios': 0, 'errores': 0,
            'mensuales_procesados': 0,
        }

        for hoja, dims in draft['headers_por_trim'].items():
            t  = _TRIM_MAP.get(hoja, 1)
            r  = guardar_notas(profesor_curso, t, dims, gestion=draft['gestion'])
            rm = calcular_notas_mensuales(profesor_curso, t, dims, gestion=draft['gestion'])
            resultado['insertados']            += r['insertados']
            resultado['actualizados']          += r['actualizados']
            resultado['sin_cambios']           += r['sin_cambios']
            resultado['errores']               += r['errores']
            resultado['mensuales_procesados']  += rm['procesados']

        # Invalidar el token tras el uso
        cache.delete(_DRAFT_PREFIX + token)

        return Response({'guardado': True, 'resultado': resultado})


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

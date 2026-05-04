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
    validar_formato_headers, validar_completitud_notas,
)
from ..services.notas_mongo_service import (
    guardar_notas, obtener_notas, calcular_notas_mensuales,
    hay_notas_mes, obtener_notas_mes, pc_ids_con_notas_mes,
    comparar_notas_con_mongo, obtener_detalle_notas_tutor, obtener_promedios_grupo,
    todos_cargaron_mes,
)

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

        # ── Nivel 6: formato de encabezados de actividades ───────────
        if es_2026:
            headers_por_trim = estructura['metadatos'].get('headers_actividades', {})
            val_fmt = validar_formato_headers(headers_por_trim)
            if not val_fmt['es_valido']:
                return Response(
                    {'es_valido': False, 'errores_estudiantes': val_fmt['errores']},
                    status=status.HTTP_400_BAD_REQUEST,
                )

        # ── Nivel 7: completitud de notas (solo formato 2026) ─────────
        if es_2026:
            nombres_activos = [
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
            try:
                mes_num = int(request.data.get('mes', 0))
                if not 1 <= mes_num <= 12:
                    mes_num = 0
            except (ValueError, TypeError):
                mes_num = 0

            gestion = timezone.now().year
            diferencias = comparar_notas_con_mongo(profesor_curso, headers_por_trim, gestion=gestion)

            token = str(uuid.uuid4())
            cache.set(_DRAFT_PREFIX + token, {
                'profesor_curso_id': profesor_curso.id,
                'headers_por_trim':  headers_por_trim,
                'gestion':           gestion,
                'mes':               mes_num,
            }, timeout=_DRAFT_TTL)

            return Response({
                'es_valido':    True,
                'draft_token':  token,
                'diferencias':  diferencias,
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

        # Verificar que no se hayan subido notas de ese mes previamente
        mes     = draft.get('mes', 0)
        gestion = draft.get('gestion', timezone.now().year)
        if mes and hay_notas_mes(
            profesor_curso.materia.id, profesor_curso.curso.id,
            profesor_curso.profesor.id, mes, gestion,
        ):
            cache.delete(_DRAFT_PREFIX + token)
            return Response(
                {'errores': 'Las notas de este mes ya fueron subidas y no pueden modificarse desde aquí.'},
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

        # ── Trigger automático de K-Means si todos los profesores ya cargaron ─
        if mes and todos_cargaron_mes(mes, gestion):
            import threading
            from backend.apps.analytics.services.kmeans_service import ejecutar_analisis_kmeans
            threading.Thread(
                target=ejecutar_analisis_kmeans,
                kwargs={'gestion': gestion, 'mes': mes},
                daemon=True,
            ).start()

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


class EstadoNotasView(APIView):
    """
    GET /api/academics/profesor/estado-notas/?pc_id=X&mes=Y

    Verifica si ya existen notas subidas para esa asignación y mes.
    Si ya hay notas, devuelve headers_por_trim en el mismo formato que
    headers_actividades del validador, listo para renderizar en modo lectura.
    """
    permission_classes = [IsAuthenticated, IsProfesor]

    def get(self, request):
        try:
            pc_id = int(request.query_params.get('pc_id', 0))
            mes   = int(request.query_params.get('mes', 0))
        except (ValueError, TypeError):
            return Response({'ya_subidas': False})

        if not pc_id or not 1 <= mes <= 12:
            return Response({'ya_subidas': False})

        try:
            pc = ProfesorCurso.objects.select_related('profesor', 'materia', 'curso').get(
                pk=pc_id, profesor=request.user
            )
        except ProfesorCurso.DoesNotExist:
            return Response({'ya_subidas': False})

        gestion = timezone.now().year

        if not hay_notas_mes(pc.materia.id, pc.curso.id, pc.profesor.id, mes, gestion):
            return Response({'ya_subidas': False})

        headers_por_trim = obtener_notas_mes(pc.materia.id, pc.curso.id, pc.profesor.id, mes, gestion)
        return Response({'ya_subidas': True, 'headers_por_trim': headers_por_trim})


class NotasEstadoMesView(APIView):
    """
    GET /api/academics/profesor/notas-estado-mes/?mes=X

    Devuelve qué pc_ids del profesor ya tienen notas para ese mes.
    Una sola query a Mongo para todas las asignaciones.
    """
    permission_classes = [IsAuthenticated, IsProfesor]

    def get(self, request):
        try:
            mes = int(request.query_params.get('mes', 0))
        except (ValueError, TypeError):
            return Response({'pc_ids_con_notas': []})

        if not 1 <= mes <= 12:
            return Response({'pc_ids_con_notas': []})

        gestion      = timezone.now().year
        asignaciones = list(
            ProfesorCurso.objects
            .filter(profesor=request.user)
            .values('id', 'materia_id', 'curso_id')
        )

        ids_con_notas = pc_ids_con_notas_mes(asignaciones, request.user.id, mes, gestion)
        return Response({'pc_ids_con_notas': list(ids_con_notas)})


class NotasEstudianteProfesorView(APIView):
    """
    GET /api/academics/profesor/notas/estudiante/?pc_id=X&estudiante_id=Y

    Devuelve las notas de un estudiante específico en la materia del ProfesorCurso,
    agrupadas por trimestre. Solo el profesor dueño de la asignación puede acceder.

    Respuesta (mismo formato que el endpoint tutor):
    {
        "estudiante_id": 15,
        "materia_id": 3,
        "trimestres": {
            "1": [{ "dimension", "titulo", "fecha_actividad", "nota", "nota_maxima" }],
            "2": [...],
            "3": [...]
        }
    }
    """
    permission_classes = [IsAuthenticated, IsProfesor]

    def get(self, request):
        try:
            pc_id         = int(request.query_params.get('pc_id', 0))
            estudiante_id = int(request.query_params.get('estudiante_id', 0))
        except (ValueError, TypeError):
            return Response({'errores': 'Parámetros inválidos.'}, status=status.HTTP_400_BAD_REQUEST)

        if not pc_id or not estudiante_id:
            return Response({'errores': 'Parámetros inválidos.'}, status=status.HTTP_400_BAD_REQUEST)

        try:
            pc = ProfesorCurso.objects.select_related('materia', 'curso').get(
                pk=pc_id, profesor=request.user
            )
        except ProfesorCurso.DoesNotExist:
            return Response({'errores': 'Asignación no válida.'}, status=status.HTTP_400_BAD_REQUEST)

        agrupado   = obtener_detalle_notas_tutor(estudiante_id, pc.materia.id,
                                                dimensiones=['saber', 'hacer', 'ser'])
        trimestres = {str(t): notas for t, notas in agrupado.items()}

        return Response({
            'estudiante_id': estudiante_id,
            'materia_id':    pc.materia.id,
            'trimestres':    trimestres,
        })


class ResumenGrupoProfesorView(APIView):
    """
    GET /api/academics/profesor/notas/resumen-grupo/?pc_id=X

    Devuelve la lista de estudiantes del curso con su nota acumulada
    del trimestre más reciente con datos (calculado desde MongoDB).

    Nota máxima dinámica: SABER(45) + HACER(40) + SER(10) según dimensiones presentes.
    """
    permission_classes = [IsAuthenticated, IsProfesor]

    def get(self, request):
        try:
            pc_id = int(request.query_params.get('pc_id', 0))
        except (ValueError, TypeError):
            return Response({'errores': 'Parámetro inválido.'}, status=status.HTTP_400_BAD_REQUEST)

        if not pc_id:
            return Response({'errores': 'Parámetro inválido.'}, status=status.HTTP_400_BAD_REQUEST)

        try:
            pc = ProfesorCurso.objects.select_related('materia', 'curso').get(
                pk=pc_id, profesor=request.user
            )
        except ProfesorCurso.DoesNotExist:
            return Response({'errores': 'Asignación no válida.'}, status=status.HTTP_400_BAD_REQUEST)

        from django.db.models import Exists, OuterRef
        from backend.apps.students.models import Estudiante
        from backend.apps.notifications.models import FCMDevice

        estudiantes = list(
            Estudiante.objects.filter(curso=pc.curso, activo=True)
            .annotate(tutor_tiene_fcm=Exists(FCMDevice.objects.filter(user_id=OuterRef('tutor_id'))))
            .order_by('apellido_paterno', 'apellido_materno', 'nombre')
        )

        promedios = obtener_promedios_grupo(pc.materia.id, [e.id for e in estudiantes])

        data = []
        for e in estudiantes:
            prom = promedios.get(e.id, {})
            data.append({
                'id':              e.id,
                'nombre':          e.nombre,
                'apellidos':       f"{e.apellido_paterno} {e.apellido_materno}".strip(),
                'tiene_tutor':     e.tutor_id is not None,
                'tutor_tiene_fcm': getattr(e, 'tutor_tiene_fcm', False),
                'nota_total':      prom.get('nota_total'),
                'nota_sobre':      prom.get('nota_sobre'),
                'trimestre':       prom.get('trimestre'),
            })

        return Response(data)

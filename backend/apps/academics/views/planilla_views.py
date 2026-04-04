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


class ValidarPlanillaView(APIView):
    """
    POST /api/academics/profesor/validar-planilla/
    Recibe un Excel (.xlsx/.xls) y un profesor_curso_id, valida la planilla Ley 070
    y guarda las notas en MongoDB si es válida.
    Permiso: Profesor.
    """
    permission_classes = [IsAuthenticated, IsProfesor]

    def post(self, request):
        archivo = request.FILES.get('archivo')
        if not archivo:
            return Response({'errores': 'Se requiere un archivo Excel.'}, status=status.HTTP_400_BAD_REQUEST)

        nombre = archivo.name.lower()
        if not (nombre.endswith('.xlsx') or nombre.endswith('.xls')):
            return Response({'errores': 'Solo se aceptan archivos .xlsx o .xls.'}, status=status.HTTP_400_BAD_REQUEST)

        profesor_curso_id = request.data.get('profesor_curso_id')
        profesor_curso = None
        if profesor_curso_id:
            try:
                profesor_curso_id = int(profesor_curso_id)
            except (ValueError, TypeError):
                return Response({'errores': 'profesor_curso_id inválido.'}, status=status.HTTP_400_BAD_REQUEST)
            try:
                profesor_curso = (
                    ProfesorCurso.objects
                    .select_related('profesor', 'materia', 'curso')
                    .get(pk=profesor_curso_id, profesor=request.user)
                )
            except ProfesorCurso.DoesNotExist:
                return Response(
                    {'errores': 'Asignación no válida o no te pertenece.'},
                    status=status.HTTP_400_BAD_REQUEST,
                )

        contenido = archivo.read()
        try:
            wb = _xl.load_workbook(io.BytesIO(contenido), data_only=True)
        except Exception as e:
            return Response({'errores': f'No se pudo abrir el archivo: {e}'}, status=status.HTTP_400_BAD_REQUEST)

        if es_formato_2026(wb):
            resultado = validar_estructura_2026(wb)
            if resultado['es_valido'] and profesor_curso:
                errores_pertenencia = validar_pertenencia_2026(resultado['metadatos'], profesor_curso)
                if errores_pertenencia:
                    resultado['es_valido'] = False
                    resultado['errores'].extend(errores_pertenencia)
                else:
                    _TRIM_MAP = {'1TRIM': 1, '2TRIM': 2, '3TRIM': 3}
                    headers_por_trim = resultado['metadatos'].get('headers_actividades', {})
                    mongo_result = {'insertados': 0, 'actualizados': 0, 'errores': 0}
                    for hoja, dims in headers_por_trim.items():
                        t = _TRIM_MAP.get(hoja, 1)
                        r = guardar_notas(profesor_curso, t, dims)
                        mongo_result['insertados']  += r['insertados']
                        mongo_result['actualizados'] += r['actualizados']
                        mongo_result['errores']      += r['errores']
                    resultado['mongo'] = mongo_result

                    nombres_excel = resultado['metadatos'].get('estudiantes', [])
                    curso_nombre  = f"{profesor_curso.curso.grado} \"{profesor_curso.curso.paralelo}\""
                    val_est = validar_estudiantes(nombres_excel, profesor_curso.curso_id)
                    val_est['curso_verificado'] = curso_nombre
                    resultado['estudiantes'] = val_est
        else:
            resultado = validar_estructura(wb)
            if resultado['es_valido']:
                errores_pertenencia = validar_pertenencia(resultado['metadatos'], profesor_curso)
                if errores_pertenencia:
                    resultado['es_valido'] = False
                    resultado['errores'].extend(errores_pertenencia)
                else:
                    notas = extraer_notas(wb)
                    resultado['notas'] = notas

                    nombres_excel = []
                    for trim_data in notas['trimestres'].values():
                        datos = trim_data['saber']['datos'] or trim_data['hacer']['datos']
                        if datos:
                            nombres_excel = [e['nombre'] for e in datos]
                            break

                    curso_nombre = f"{profesor_curso.curso.grado} \"{profesor_curso.curso.paralelo}\""
                    val_est = validar_estudiantes(nombres_excel, profesor_curso.curso_id)
                    val_est['curso_verificado'] = curso_nombre
                    resultado['estudiantes'] = val_est
                    if not val_est['es_valido']:
                        resultado['es_valido'] = False
                        resultado['errores'].append(
                            f"{len(val_est['no_encontrados'])} estudiante(s) del Excel "
                            f"no se encontraron en el curso {curso_nombre}."
                        )

        return Response(resultado)


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

import openpyxl

from rest_framework.views import APIView
from rest_framework.response import Response
from rest_framework import status
from rest_framework.permissions import IsAuthenticated

from backend.core.permissions import IsDirector
from ..services.comparador_nombres import (
    detectar_curso_desde_filename, extraer_nombres_desde_excel, comparar_nombres_excel_bd,
)


class ComparadorNombresView(APIView):
    """
    POST /api/academics/director/comparar-nombres/

    Herramienta temporal para el director.
    Sube el mismo Excel de notas; el backend detecta el curso y devuelve:
      - Estudiantes en el Excel pero NO en la BD
      - Estudiantes en la BD pero NO en el Excel
    """

    permission_classes = [IsAuthenticated, IsDirector]

    def post(self, request):
        archivo = request.FILES.get('archivo')
        if not archivo:
            return Response(
                {'errores': 'Debes enviar el archivo Excel.'},
                status=status.HTTP_400_BAD_REQUEST,
            )

        try:
            wb = openpyxl.load_workbook(archivo, data_only=True)
        except Exception as e:
            return Response(
                {'errores': f'No se pudo abrir el archivo: {e}'},
                status=status.HTTP_400_BAD_REQUEST,
            )

        try:
            curso = detectar_curso_desde_filename(archivo.name)
        except ValueError as e:
            return Response({'errores': str(e)}, status=status.HTTP_400_BAD_REQUEST)

        nombres_excel = extraer_nombres_desde_excel(wb)

        if not nombres_excel:
            return Response(
                {'errores': 'No se encontraron nombres de estudiantes en el Excel.'},
                status=status.HTTP_400_BAD_REQUEST,
            )

        resultado = comparar_nombres_excel_bd(nombres_excel, curso.id)
        return Response(resultado)

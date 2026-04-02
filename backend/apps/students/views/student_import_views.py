from rest_framework.views import APIView
from rest_framework.response import Response
from rest_framework import status
from rest_framework.permissions import IsAuthenticated
from rest_framework.parsers import MultiPartParser

from backend.core.permissions import IsDirector
from backend.apps.students.services import importar_estudiantes_desde_excel, validar_formato_excel


class ImportarEstudiantesExcelView(APIView):
    """
    POST /api/students/importar-excel/

    Recibe un archivo Excel con estudiantes organizados por hojas (una por curso).
    Genera identificadores automáticamente y crea los registros en la BD.

    Permiso: solo Director.

    Body: multipart/form-data con campo 'archivo' (xlsx/xls).

    Respuesta exitosa (200):
    {
        "importados": 120,
        "omitidos":   3,
        "errores":    ["Hoja '3ro A' fila 5: datos incompletos..."]
    }
    """

    permission_classes = [IsAuthenticated, IsDirector]
    parser_classes     = [MultiPartParser]

    def post(self, request):
        archivo = request.FILES.get('archivo')

        if not archivo:
            return Response(
                {"errores": "No se recibió ningún archivo."},
                status=status.HTTP_400_BAD_REQUEST,
            )

        nombre = archivo.name.lower()
        if not (nombre.endswith('.xlsx') or nombre.endswith('.xls')):
            return Response(
                {"errores": "Solo se aceptan archivos .xlsx o .xls"},
                status=status.HTTP_400_BAD_REQUEST,
            )

        from backend.apps.students.models import Estudiante
        if Estudiante.objects.exists():
            return Response(
                {"errores": "Ya existen estudiantes registrados. La importación por Excel solo está disponible una vez. Para agregar estudiantes hacelo manualmente."},
                status=status.HTTP_403_FORBIDDEN,
            )

        errores_formato = validar_formato_excel(archivo)
        if errores_formato:
            return Response(
                {"errores": " | ".join(errores_formato)},
                status=status.HTTP_400_BAD_REQUEST,
            )

        try:
            resultado = importar_estudiantes_desde_excel(archivo)
        except Exception as e:
            return Response(
                {"errores": f"Error al procesar el archivo: {str(e)}"},
                status=status.HTTP_400_BAD_REQUEST,
            )

        return Response(resultado, status=status.HTTP_200_OK)

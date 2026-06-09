"""
Tests de academics:
- Helpers de normalización/comparación de nombres (planilla_validator)
- Comparación bidireccional Excel ↔ BD (comparador_nombres)
"""
from django.test import TestCase

from backend.apps.students.models import Estudiante
from .models import Curso
from .services.planilla_validator import _normalizar, _palabras, _coincide_nombre
from .services.comparador_nombres import comparar_nombres_excel_bd


class NormalizarTests(TestCase):
    """_normalizar: minúsculas, sin tildes, solo alfanumérico + espacios."""

    def test_quita_tildes_y_baja_a_minusculas(self):
        self.assertEqual(_normalizar('Pérez Gonzáles'), 'perez gonzales')

    def test_colapsa_espacios_y_simbolos(self):
        self.assertEqual(_normalizar('  Ñandú-María  '), 'nandu maria')

    def test_texto_vacio(self):
        self.assertEqual(_normalizar(''), '')
        self.assertEqual(_normalizar(None), '')


class CoincideNombreTests(TestCase):
    """_coincide_nombre: el conjunto menor debe ser subconjunto del mayor."""

    def test_mismo_nombre_distinto_orden(self):
        a = _palabras('Juan Pérez Lopez')
        b = _palabras('Lopez Pérez Juan')
        self.assertTrue(_coincide_nombre(a, b))

    def test_nombre_parcial_es_subconjunto(self):
        a = _palabras('Juan Pérez')
        b = _palabras('Juan Pérez Lopez')
        self.assertTrue(_coincide_nombre(a, b))

    def test_nombres_distintos_no_coinciden(self):
        a = _palabras('Juan Pérez')
        b = _palabras('Carlos Soto')
        self.assertFalse(_coincide_nombre(a, b))

    def test_conjunto_vacio_no_coincide(self):
        self.assertFalse(_coincide_nombre(set(), _palabras('Juan')))


class CompararNombresExcelBDTests(TestCase):
    """comparar_nombres_excel_bd clasifica en en_ambos / solo_en_excel / solo_en_bd."""

    @classmethod
    def setUpTestData(cls):
        cls.curso = Curso.objects.create(grado='1ro', paralelo='A')
        Estudiante.objects.create(
            nombre='Juan', apellido_paterno='Pérez', apellido_materno='Lopez',
            identificador='E1', curso=cls.curso,
        )
        Estudiante.objects.create(
            nombre='Ana', apellido_paterno='Soto', apellido_materno='Vega',
            identificador='E2', curso=cls.curso,
        )

    def test_clasificacion_bidireccional(self):
        nombres_excel = [
            'Perez Lopez Juan',     # coincide con E1 (distinto orden / sin tilde)
            'Quiroga Mamani Carla',  # solo en excel
        ]
        resultado = comparar_nombres_excel_bd(nombres_excel, self.curso.id)

        self.assertEqual(resultado['total_excel'], 2)
        self.assertEqual(resultado['total_bd'], 2)
        self.assertEqual(resultado['en_ambos'], 1)
        self.assertEqual(resultado['solo_en_excel'], ['Quiroga Mamani Carla'])
        # Ana Soto Vega no estaba en el Excel
        self.assertEqual(len(resultado['solo_en_bd']), 1)
        self.assertIn('Soto', resultado['solo_en_bd'][0])

    def test_todos_coinciden(self):
        nombres_excel = ['Perez Lopez Juan', 'Soto Vega Ana']
        resultado = comparar_nombres_excel_bd(nombres_excel, self.curso.id)

        self.assertEqual(resultado['en_ambos'], 2)
        self.assertEqual(resultado['solo_en_excel'], [])
        self.assertEqual(resultado['solo_en_bd'], [])

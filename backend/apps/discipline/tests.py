"""
Tests de discipline:
- Servicio marcar_citaciones_vencidas (vencimiento automático de citaciones)
"""
from datetime import timedelta

from django.test import TestCase
from django.utils import timezone

from backend.apps.users.models import TipoUsuario, User
from backend.apps.academics.models import Curso
from backend.apps.students.models import Estudiante
from .models import Citacion
from .services.citacion_vencimiento import marcar_citaciones_vencidas


class MarcarCitacionesVencidasTests(TestCase):
    """Una citación PENDIENTE cuya fecha_limite ya pasó debe quedar NO_ASISTIO."""

    @classmethod
    def setUpTestData(cls):
        tipo = TipoUsuario.objects.create(nombre='Director')
        cls.emisor = User.objects.create_user(
            username='dir', password='x', tipo_usuario=tipo,
        )
        cls.curso = Curso.objects.create(grado='1ro', paralelo='A')
        cls.estudiante = Estudiante.objects.create(
            nombre='Juan', apellido_paterno='Pérez', apellido_materno='Lopez',
            identificador='EST-1', curso=cls.curso,
        )
        cls.hoy = timezone.localdate()

    def _crear_citacion(self, fecha_limite, asistencia='PENDIENTE'):
        return Citacion.objects.create(
            estudiante=self.estudiante,
            emisor=self.emisor,
            motivo='FALTAS',
            descripcion='—',
            fecha_limite_asistencia=fecha_limite,
            asistencia=asistencia,
        )

    def test_pendiente_vencida_se_marca_no_asistio(self):
        cit = self._crear_citacion(self.hoy - timedelta(days=1))

        actualizadas = marcar_citaciones_vencidas()

        cit.refresh_from_db()
        self.assertEqual(actualizadas, 1)
        self.assertEqual(cit.asistencia, 'NO_ASISTIO')

    def test_pendiente_con_limite_hoy_no_se_marca(self):
        # El filtro es __lt hoy: la fecha de hoy aún no está vencida
        cit = self._crear_citacion(self.hoy)

        actualizadas = marcar_citaciones_vencidas()

        cit.refresh_from_db()
        self.assertEqual(actualizadas, 0)
        self.assertEqual(cit.asistencia, 'PENDIENTE')

    def test_pendiente_futura_no_se_marca(self):
        cit = self._crear_citacion(self.hoy + timedelta(days=3))

        marcar_citaciones_vencidas()

        cit.refresh_from_db()
        self.assertEqual(cit.asistencia, 'PENDIENTE')

    def test_citacion_ya_resuelta_no_se_toca(self):
        cit = self._crear_citacion(self.hoy - timedelta(days=5), asistencia='ASISTIO')

        actualizadas = marcar_citaciones_vencidas()

        cit.refresh_from_db()
        self.assertEqual(actualizadas, 0)
        self.assertEqual(cit.asistencia, 'ASISTIO')

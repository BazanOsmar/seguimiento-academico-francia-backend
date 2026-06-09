"""
Tests de attendance:
- Helpers puros de consecutive_check (_sumar_dias_habiles, _contar_racha)
- Generación automática de citaciones por faltas consecutivas
"""
import datetime

from django.test import TestCase
from django.utils import timezone

from backend.apps.users.models import TipoUsuario, User
from backend.apps.academics.models import Curso
from backend.apps.students.models import Estudiante
from backend.apps.discipline.models import Citacion
from .models import AsistenciaSesion, Asistencia
from .services.consecutive_check import (
    _sumar_dias_habiles, _contar_racha, verificar_faltas_atrasos_consecutivos,
    UMBRAL_FALTAS,
)


class SumarDiasHabilesTests(TestCase):
    """Suma solo días hábiles (lun–vie), saltando fines de semana."""

    def test_viernes_mas_uno_es_lunes(self):
        viernes = datetime.date(2026, 6, 5)  # viernes
        self.assertEqual(_sumar_dias_habiles(viernes, 1), datetime.date(2026, 6, 8))  # lunes

    def test_lunes_mas_cinco_es_lunes_siguiente(self):
        lunes = datetime.date(2026, 6, 1)
        self.assertEqual(_sumar_dias_habiles(lunes, 5), datetime.date(2026, 6, 8))

    def test_miercoles_mas_dos_salta_a_viernes(self):
        miercoles = datetime.date(2026, 6, 3)
        self.assertEqual(_sumar_dias_habiles(miercoles, 2), datetime.date(2026, 6, 5))


class ContarRachaTests(TestCase):
    """_contar_racha cuenta registros consecutivos del mismo estado, del más reciente hacia atrás."""

    @classmethod
    def setUpTestData(cls):
        cls.tipo = TipoUsuario.objects.create(nombre='Director')
        cls.registrador = User.objects.create_user(
            username='reg', password='x', tipo_usuario=cls.tipo,
        )
        cls.curso = Curso.objects.create(grado='2do', paralelo='B')
        cls.estudiante = Estudiante.objects.create(
            nombre='Ana', apellido_paterno='Soto', apellido_materno='Vega',
            identificador='EST-2', curso=cls.curso,
        )

    def _registrar(self, fecha, estado):
        sesion = AsistenciaSesion.objects.create(
            curso=self.curso, fecha=fecha, registrado_por=self.registrador,
        )
        Asistencia.objects.create(
            sesion=sesion, estudiante=self.estudiante,
            estado=estado, hora=datetime.time(8, 0),
        )

    def test_cuenta_faltas_consecutivas(self):
        self._registrar(datetime.date(2026, 6, 1), 'FALTA')
        self._registrar(datetime.date(2026, 6, 2), 'FALTA')
        self._registrar(datetime.date(2026, 6, 3), 'FALTA')
        self.assertEqual(_contar_racha(self.estudiante, self.curso, 'FALTA'), 3)

    def test_la_racha_se_corta_con_otro_estado(self):
        self._registrar(datetime.date(2026, 6, 1), 'FALTA')
        self._registrar(datetime.date(2026, 6, 2), 'PRESENTE')  # corta
        self._registrar(datetime.date(2026, 6, 3), 'FALTA')
        self._registrar(datetime.date(2026, 6, 4), 'FALTA')
        # Solo cuentan las dos faltas más recientes
        self.assertEqual(_contar_racha(self.estudiante, self.curso, 'FALTA'), 2)


class CitacionAutomaticaPorFaltasTests(TestCase):
    """verificar_faltas_atrasos_consecutivos crea citaciones al alcanzar el umbral."""

    @classmethod
    def setUpTestData(cls):
        cls.tipo_dir = TipoUsuario.objects.create(nombre='Director')
        cls.tipo_tut = TipoUsuario.objects.create(nombre='Tutor')
        cls.director = User.objects.create_user(
            username='dir', password='x', tipo_usuario=cls.tipo_dir,
        )
        cls.tutor = User.objects.create_user(
            username='tutor', password='x', tipo_usuario=cls.tipo_tut,
        )
        cls.curso = Curso.objects.create(grado='3ro', paralelo='C')

    def _registrar_falta(self, estudiante, fecha):
        sesion = AsistenciaSesion.objects.create(
            curso=self.curso, fecha=fecha, registrado_por=self.director,
        )
        Asistencia.objects.create(
            sesion=sesion, estudiante=estudiante,
            estado='FALTA', hora=datetime.time(8, 0),
        )
        return sesion

    def test_tres_faltas_con_tutor_genera_citacion(self):
        est = Estudiante.objects.create(
            nombre='Luis', apellido_paterno='Roca', apellido_materno='Diaz',
            identificador='EST-3', curso=self.curso, tutor=self.tutor,
        )
        self._registrar_falta(est, datetime.date(2026, 6, 1))
        self._registrar_falta(est, datetime.date(2026, 6, 2))
        ultima = self._registrar_falta(est, datetime.date(2026, 6, 3))

        verificar_faltas_atrasos_consecutivos(ultima)

        citaciones = Citacion.objects.filter(estudiante=est, motivo='FALTAS')
        self.assertEqual(citaciones.count(), 1)
        self.assertEqual(citaciones.first().asistencia, 'PENDIENTE')

    def test_menos_del_umbral_no_genera_citacion(self):
        est = Estudiante.objects.create(
            nombre='Mara', apellido_paterno='Lima', apellido_materno='Cruz',
            identificador='EST-4', curso=self.curso, tutor=self.tutor,
        )
        for i in range(UMBRAL_FALTAS - 1):
            ultima = self._registrar_falta(est, datetime.date(2026, 6, 1) + datetime.timedelta(days=i))

        verificar_faltas_atrasos_consecutivos(ultima)

        self.assertFalse(Citacion.objects.filter(estudiante=est).exists())

    def test_no_duplica_citacion_pendiente(self):
        est = Estudiante.objects.create(
            nombre='Pedro', apellido_paterno='Vaca', apellido_materno='Mole',
            identificador='EST-5', curso=self.curso, tutor=self.tutor,
        )
        self._registrar_falta(est, datetime.date(2026, 6, 1))
        self._registrar_falta(est, datetime.date(2026, 6, 2))
        ultima = self._registrar_falta(est, datetime.date(2026, 6, 3))

        verificar_faltas_atrasos_consecutivos(ultima)
        # Una cuarta falta y segunda ejecución no debe crear otra citación
        cuarta = self._registrar_falta(est, datetime.date(2026, 6, 4))
        verificar_faltas_atrasos_consecutivos(cuarta)

        self.assertEqual(Citacion.objects.filter(estudiante=est, motivo='FALTAS').count(), 1)

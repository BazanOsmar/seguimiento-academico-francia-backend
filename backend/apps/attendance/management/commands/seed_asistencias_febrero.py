"""
Genera datos de asistencia de prueba para Febrero 2026.
Crea una AsistenciaSesion por curso por día hábil (lunes a sábado)
y una Asistencia por cada estudiante con distribución realista de estados.

Uso:
    python manage.py seed_asistencias_febrero
    python manage.py seed_asistencias_febrero --limpiar   # borra los existentes primero
"""

import random
from datetime import date, timedelta, time

from django.core.management.base import BaseCommand
from django.contrib.auth import get_user_model

from backend.apps.academics.models import Curso
from backend.apps.attendance.models import AsistenciaSesion, Asistencia
from backend.apps.students.models import Estudiante

User = get_user_model()

# Distribución de estados: 73% presente, 12% falta, 10% atraso, 5% licencia
ESTADOS = ['PRESENTE', 'PRESENTE', 'PRESENTE', 'PRESENTE', 'PRESENTE',
           'PRESENTE', 'PRESENTE', 'PRESENTE', 'FALTA', 'FALTA',
           'ATRASO', 'ATRASO', 'LICENCIA']


def _hora_para_estado(estado):
    if estado == 'PRESENTE':
        h = random.randint(7, 7)
        m = random.randint(20, 55)
    elif estado == 'ATRASO':
        h = random.randint(8, 8)
        m = random.randint(0, 40)
    else:  # FALTA / LICENCIA
        h, m = 7, 30
    return time(h, m)


def _dias_habiles_febrero():
    """Retorna todos los días de feb 2026 que no sean domingo."""
    dias = []
    d = date(2026, 2, 1)
    while d.month == 2:
        if d.weekday() != 6:  # 6 = domingo
            dias.append(d)
        d += timedelta(days=1)
    return dias


class Command(BaseCommand):
    help = 'Genera datos de asistencia de prueba para Febrero 2026'

    def add_arguments(self, parser):
        parser.add_argument(
            '--limpiar',
            action='store_true',
            help='Elimina las sesiones de febrero antes de generar',
        )

    def handle(self, *args, **options):
        if options['limpiar']:
            eliminadas = AsistenciaSesion.objects.filter(
                fecha__year=2026, fecha__month=2
            ).count()
            AsistenciaSesion.objects.filter(
                fecha__year=2026, fecha__month=2
            ).delete()
            self.stdout.write(f'  {eliminadas} sesiones de febrero eliminadas.')

        # Buscar un usuario registrador (profesor o director)
        registrador = (
            User.objects.filter(tipo_usuario__nombre='Profesor').first()
            or User.objects.filter(tipo_usuario__nombre='Director').first()
            or User.objects.first()
        )
        if not registrador:
            self.stderr.write('No hay usuarios en la base de datos.')
            return

        cursos = list(Curso.objects.all())
        if not cursos:
            self.stderr.write('No hay cursos en la base de datos.')
            return

        dias = _dias_habiles_febrero()
        self.stdout.write(
            f'Generando asistencias para {len(cursos)} cursos × {len(dias)} días hábiles...'
        )

        sesiones_creadas = 0
        asistencias_creadas = 0

        for curso in cursos:
            estudiantes = list(Estudiante.objects.filter(curso=curso, activo=True))
            if not estudiantes:
                self.stdout.write(f'  {curso}: sin estudiantes, se omite.')
                continue

            for dia in dias:
                sesion, creada = AsistenciaSesion.objects.get_or_create(
                    curso=curso,
                    fecha=dia,
                    defaults={
                        'registrado_por': registrador,
                        'estado': 'ENVIADA',
                    },
                )
                if not creada:
                    continue  # ya existía, no pisar

                sesiones_creadas += 1
                registros = []
                for est in estudiantes:
                    estado = random.choice(ESTADOS)
                    registros.append(Asistencia(
                        sesion=sesion,
                        estudiante=est,
                        estado=estado,
                        hora=_hora_para_estado(estado),
                    ))
                Asistencia.objects.bulk_create(registros, ignore_conflicts=True)
                asistencias_creadas += len(registros)

        self.stdout.write(self.style.SUCCESS(
            f'\nListo: {sesiones_creadas} sesiones, {asistencias_creadas} registros de asistencia creados.'
        ))

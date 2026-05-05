"""
Script temporal: genera citaciones PENDIENTE enviadas por un Profesor y un Regente.
Ejecutar desde la raíz del proyecto:
    python seed_citaciones_test.py
"""
import os
import sys
import django
from datetime import date, timedelta

os.environ.setdefault('DJANGO_SETTINGS_MODULE', 'backend.config.settings.local')
sys.path.insert(0, os.path.dirname(__file__))
django.setup()

from backend.apps.users.models import User
from backend.apps.students.models import Estudiante
from backend.apps.discipline.models import Citacion

# ── Buscar emisores ───────────────────────────────────────────────────
profesor = User.objects.filter(tipo_usuario__nombre='Profesor').first()
regente  = User.objects.filter(tipo_usuario__nombre='Regente').first()

if not profesor:
    print("ERROR: no hay ningún usuario con tipo 'Profesor' en la BD.")
    sys.exit(1)
if not regente:
    print("ERROR: no hay ningún usuario con tipo 'Regente' en la BD.")
    sys.exit(1)

print(f"Profesor encontrado : {profesor.username} (id={profesor.id})")
print(f"Regente encontrado  : {regente.username} (id={regente.id})")

# ── Buscar estudiantes con tutor ──────────────────────────────────────
estudiantes = list(Estudiante.objects.filter(tutor__isnull=False).select_related('curso')[:10])
if len(estudiantes) < 6:
    print(f"AVISO: solo hay {len(estudiantes)} estudiantes con tutor; se usarán los disponibles.")

hoy     = date.today()
limite1 = hoy + timedelta(days=7)
limite2 = hoy + timedelta(days=14)

DATOS_PROFESOR = [
    ('FALTAS',      'El estudiante acumula 3 faltas no justificadas este mes.'),
    ('CONDUCTA',    'Se registraron incidentes de conducta durante recreo.'),
    ('RENDIMIENTO', 'Rendimiento por debajo del promedio en Matemáticas.'),
]

DATOS_REGENTE = [
    ('DOCUMENTOS',  'Faltan documentos de matrícula pendientes de entrega.'),
    ('REUNION',     'Se convoca a reunión obligatoria de padres de familia.'),
    ('OTRO',        'Asunto administrativo que requiere presencia del tutor.'),
]

creadas = 0

# Citaciones del Profesor
for i, (motivo, desc) in enumerate(DATOS_PROFESOR):
    if i >= len(estudiantes):
        break
    Citacion.objects.create(
        estudiante             = estudiantes[i],
        emisor                 = profesor,
        motivo                 = motivo,
        descripcion            = desc,
        estado                 = 'ENVIADA',
        asistencia             = 'PENDIENTE',
        fecha_limite_asistencia= limite1,
    )
    creadas += 1
    nombre_est = f"{estudiantes[i].apellido_paterno} {estudiantes[i].apellido_materno}, {estudiantes[i].nombre}".strip()
    print(f"  [Profesor] {motivo} -> {nombre_est}")

# Citaciones del Regente
for i, (motivo, desc) in enumerate(DATOS_REGENTE):
    idx = i + len(DATOS_PROFESOR)
    if idx >= len(estudiantes):
        break
    Citacion.objects.create(
        estudiante             = estudiantes[idx],
        emisor                 = regente,
        motivo                 = motivo,
        descripcion            = desc,
        estado                 = 'ENVIADA',
        asistencia             = 'PENDIENTE',
        fecha_limite_asistencia= limite2,
    )
    creadas += 1
    nombre_est = f"{estudiantes[idx].apellido_paterno} {estudiantes[idx].apellido_materno}, {estudiantes[idx].nombre}".strip()
    print(f"  [Regente]  {motivo} -> {nombre_est}")

print(f"\nListo: {creadas} citaciones PENDIENTE creadas.")

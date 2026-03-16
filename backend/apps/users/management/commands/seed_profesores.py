"""
Comando: python manage.py seed_profesores

Crea los 32 profesores de la U.E. República de Francia — Gestión 2026.
- Username: inicial_nombre + apellidos_normalizados (máx 12 chars)
- Contraseña: 3 letras nombre + 3 letras apellido + "2026"
- Si el usuario ya existe, lo omite (ON CONFLICT DO NOTHING)

Al finalizar imprime la tabla completa de credenciales.
"""

import re
import unicodedata
from django.core.management.base import BaseCommand
from backend.apps.users.models import User, TipoUsuario


# ── Datos de profesores: (apellidos, nombres) ──────────────────────────────
PROFESORES = [
    ("Quispe Choque",      "Julia Mercedes"),
    ("Rios Roncal",        "Mario Fausto"),
    ("Molina Castro",      "Jaime Paz"),
    ("Suxo Cahuana",       "Kathia Solidina"),
    ("Herrera Huaygua",    "Magaly Rossana"),
    ("Choque Quispe",      "Sandra Janeth"),
    ("Flores Lopez",       "Teddy Rogers"),
    ("Quiroga Mamani",     "Gisela Nataly"),
    ("Colque Jimenez",     "Veronica"),
    ("Gutierrez Gambarte", "Constancia"),
    ("Marin Chuquimia",    "Lourdes Jiovanna"),
    ("Quispe Paucara",     "Guillermina"),
    ("Vallejos Gomez",     "Juan Daniel"),
    ("Rios Quispe",        "Rolando Rafael"),
    ("Teran Herrera",      "Marlene"),
    ("Aragon Coila",       "Villma Daysi"),
    ("Herrera Villca",     "Jose Luis"),
    ("Guarachi Torrez",    "Roberto"),
    ("Ibanez Chambi",      "Victoria"),
    ("Chuca Rojas",        "Yola Maria"),
    ("Gonzales Guaman",    "Alejandra Victoria"),
    ("Alcon Lopez",        "Delmi Jesusa"),
    ("Mayta Diaz",         "Raul"),
    ("Plata Soria",        "Rosalia Angelica"),
    ("Torrez Sumi",        "Elvira"),
    ("Valencia Calderon",  "Maxima"),
    ("Yupanqui Mita",      "Felipe"),
    ("Peralta Choque",     "Delfin"),
    ("Quispe Perez",       "Ivan Marcelo"),
    ("Vasco Castillo",     "Nilda Rosario"),
    ("Veliz Guzman",       "Maria Adeila"),
    ("Quispe Limachi",     "Lidia"),
]


def _normalizar(texto: str) -> str:
    nfkd = unicodedata.normalize('NFKD', texto)
    ascii_ = nfkd.encode('ascii', 'ignore').decode('ascii')
    return re.sub(r'[^a-z0-9]', '', ascii_.lower())


def generar_username(nombres: str, apellidos: str) -> str:
    inicial = _normalizar(nombres.split()[0])[:1]
    aps     = _normalizar(apellidos.replace(' ', ''))[:11]
    base    = (inicial + aps)[:12]
    username = base
    contador = 2
    while User.objects.filter(username=username).exists():
        username = f"{base}{contador}"
        contador += 1
    return username


def generar_password(nombres: str, apellidos: str) -> str:
    name_part = _normalizar(nombres.split()[0])[:3]
    last_part = _normalizar(apellidos.split()[0])[:3]
    return f"{name_part}{last_part}2026"


class Command(BaseCommand):
    help = 'Crea los 32 profesores de la U.E. República de Francia — Gestión 2026'

    def handle(self, *args, **kwargs):
        try:
            tipo_profesor = TipoUsuario.objects.get(nombre='Profesor')
        except TipoUsuario.DoesNotExist:
            self.stderr.write('ERROR: TipoUsuario "Profesor" no existe en la base de datos.')
            return

        creados   = []
        omitidos  = []

        for apellidos, nombres in PROFESORES:
            username = generar_username(nombres, apellidos)
            password = generar_password(nombres, apellidos)

            if User.objects.filter(
                first_name__iexact=nombres,
                last_name__iexact=apellidos
            ).exists():
                omitidos.append(f"{apellidos}, {nombres}")
                continue

            User.objects.create_user(
                username=username,
                first_name=nombres,
                last_name=apellidos,
                password=password,
                tipo_usuario=tipo_profesor,
                primer_ingreso=True,
            )
            creados.append((username, password, nombres, apellidos))

        # ── Reporte ─────────────────────────────────────────────────────────
        self.stdout.write('\n' + '=' * 70)
        self.stdout.write(f'  PROFESORES CREADOS: {len(creados)}')
        self.stdout.write('=' * 70)
        self.stdout.write(f'  {"USERNAME":<20} {"CONTRASEÑA":<15} NOMBRE COMPLETO')
        self.stdout.write('-' * 70)
        for username, password, nombres, apellidos in creados:
            self.stdout.write(f'  {username:<20} {password:<15} {apellidos}, {nombres}')

        if omitidos:
            self.stdout.write('\n' + '-' * 70)
            self.stdout.write(f'  OMITIDOS (ya existían): {len(omitidos)}')
            for nombre in omitidos:
                self.stdout.write(f'  - {nombre}')

        self.stdout.write('=' * 70 + '\n')

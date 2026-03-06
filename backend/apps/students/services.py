import openpyxl
from django.db import transaction

from backend.apps.users.models import TipoUsuario, User
from backend.core.utils import generar_password
from .models import Estudiante


@transaction.atomic
def crear_estudiante_con_tutor(datos):
    """
    Crea el tutor (User) y el Estudiante en una transacción atómica.
    Retorna (estudiante, credenciales_tutor).
    """
    tipo_tutor, _ = TipoUsuario.objects.get_or_create(nombre='Tutor')

    username = datos['tutor_carnet']
    password = generar_password(datos['tutor_nombre'], datos['tutor_apellidos'])

    tutor = User.objects.create_user(
        username=username,
        password=password,
        first_name=datos['tutor_nombre'],
        last_name=datos['tutor_apellidos'],
        tipo_usuario=tipo_tutor,
        primer_ingreso=True,
    )

    estudiante = Estudiante.objects.create(
        nombre=datos['nombre'],
        apellidos=datos['apellidos'],
        identificador=datos.get('identificador') or None,
        curso=datos['curso'],
        tutor=tutor,
    )

    return estudiante, {'username': username, 'password': password}


# ── Importación desde Excel ───────────────────────────────────────

def _parsear_hoja(nombre_hoja: str) -> tuple:
    partes = nombre_hoja.strip().split()
    return partes[0], partes[1]


def _generar_identificador(ap_paterno, ap_materno, nombre, grado, paralelo, nro_lista):
    ini_ap  = ap_paterno[0].upper()        if ap_paterno else "X"
    ini_am  = ap_materno[0].upper()        if ap_materno else "X"
    ini_nom = nombre.split()[0][0].upper() if nombre     else "X"
    grado_paralelo = (grado + paralelo).upper().replace(" ", "")
    return f"{ini_ap}{ini_am}{ini_nom}{grado_paralelo}-{str(nro_lista).zfill(2)}"


def importar_estudiantes_desde_excel(archivo) -> dict:
    """
    Procesa un Excel con una hoja por curso (ej: '3ro A').
    Filas 1-3: cabecera. Desde fila 4: nro | ap_paterno | ap_materno | nombre(s).
    """
    from backend.apps.academics.models import Curso

    wb = openpyxl.load_workbook(archivo, data_only=True)

    importados = 0
    omitidos   = 0
    errores    = []

    cursos_map = {
        (c.grado.strip(), c.paralelo.strip()): c
        for c in Curso.objects.all()
    }
    existentes = set(Estudiante.objects.values_list('identificador', flat=True))

    with transaction.atomic():
        for nombre_hoja in wb.sheetnames:
            try:
                grado, paralelo = _parsear_hoja(nombre_hoja)
            except (IndexError, ValueError):
                errores.append(f"Hoja '{nombre_hoja}': nombre inválido (esperado ej: '3ro A').")
                continue

            curso = cursos_map.get((grado, paralelo))
            if curso is None:
                errores.append(f"Hoja '{nombre_hoja}': el curso {grado} {paralelo} no existe en la BD.")
                continue

            for fila in wb[nombre_hoja].iter_rows(min_row=4, values_only=True):
                nro, paterno, materno, nombres = fila[0], fila[1], fila[2], fila[3]

                if not any([nro, paterno, materno, nombres]):
                    continue

                nro_lista     = int(nro) if nro else 0
                ap_paterno    = str(paterno).strip().upper() if paterno else ""
                ap_materno    = str(materno).strip().upper() if materno else ""
                nombre_limpio = str(nombres).strip().upper() if nombres else ""

                if not ap_paterno or not nombre_limpio:
                    errores.append(f"Hoja '{nombre_hoja}' fila {nro_lista}: datos incompletos.")
                    continue

                identificador = _generar_identificador(
                    ap_paterno, ap_materno, nombre_limpio, grado, paralelo, nro_lista,
                )

                if identificador in existentes:
                    omitidos += 1
                    errores.append(f"'{identificador}' ya existe — omitido.")
                    continue

                Estudiante.objects.create(
                    nombre=nombre_limpio,
                    apellidos=f"{ap_paterno} {ap_materno}".strip(),
                    identificador=identificador,
                    curso=curso,
                    activo=True,
                )
                existentes.add(identificador)
                importados += 1

    return {"importados": importados, "omitidos": omitidos, "errores": errores}

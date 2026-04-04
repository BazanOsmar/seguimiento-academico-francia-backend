"""
Validador de planillas Excel del Ministerio de Educación (Ley 070).

Verifica que el archivo sea una planilla de notas válida y comprueba
que los metadatos (maestro, área, paralelo, año) correspondan al
ProfesorCurso indicado.
"""

import re
import unicodedata
import io

import openpyxl


# ── Hojas y estructura esperadas ──────────────────────────────────────────────
HOJAS_OBLIGATORIAS = ['CARATULA', 'FILIACION', '1TRIM', '2TRIM', '3TRIM', 'BOLETIN']

ESTRUCTURA_TRIMESTRE = {
    'N8': 'SER/10',
    'S8': 'SABER/45',
    'AD8': 'HACER/40',
    'AO8': 'TOTAL',
    'AQ7': 'NOTA TRIMESTRAL',
    'AU7': 'SITUACIÓN TRIMESTRAL',
    'AP7': 'AUTOEVALUACIÓN (5 PUNTOS)',
}

TRIMESTRES = ['1TRIM', '2TRIM', '3TRIM']

META_CARATULA = {
    'maestro':         'F12',
    'campo':           'B20',
    'area':            'E20',
    'año_escolaridad': 'H20',
    'paralelo':        'J20',
    'director':        'F10',
    'gestion':         'F14',
    'nivel':           'F16',
    'unidad_educativa':'F8',
}

META_BOLETIN = {
    'maestro':         'J9',
    'campo':           'J7',
    'area':            'Z5',
    'año_escolaridad': 'AB7',
    'paralelo':        'AB9',
    'director':        'J11',
}

META_TRIMESTRE = {
    'maestro':         'AA5',
    'campo':           'D5',
    'area':            'AA3',
    'año_escolaridad': 'AR1',
    'paralelo':        'AR3',
}


def _leer_celda(ws, cell_ref):
    """Lee el valor de una celda, retorna None si está vacía."""
    val = ws[cell_ref].value
    if val is None:
        return None
    val_str = str(val).strip()
    return val_str if val_str else None


def _normalizar(texto):
    """Lowercase, sin tildes/diacríticos, solo alfanumérico y espacios."""
    if not texto:
        return ''
    texto = unicodedata.normalize('NFKD', str(texto))
    texto = texto.encode('ascii', 'ignore').decode('ascii')
    texto = texto.lower()
    texto = re.sub(r'[^a-z0-9 ]', ' ', texto)
    return ' '.join(texto.split())


def validar_estructura(archivo):
    """
    Valida que el archivo (bytes, BytesIO o ruta) sea una planilla Ley 070.
    Retorna dict: { es_valido, errores[], advertencias[], metadatos{} }
    """
    resultado = {
        'es_valido': True,
        'errores': [],
        'advertencias': [],
        'metadatos': {},
    }

    # Aceptar workbook ya abierto, bytes o BytesIO
    if isinstance(archivo, openpyxl.Workbook):
        wb = archivo
    else:
        if isinstance(archivo, (bytes, bytearray)):
            archivo = io.BytesIO(archivo)
        try:
            wb = openpyxl.load_workbook(archivo, data_only=True)
        except Exception as e:
            resultado['es_valido'] = False
            resultado['errores'].append(f"No se pudo abrir el archivo: {str(e)}")
            return resultado

    # 1. Verificar hojas obligatorias
    hojas = wb.sheetnames
    for hoja in HOJAS_OBLIGATORIAS:
        if hoja not in hojas:
            resultado['es_valido'] = False
            resultado['errores'].append(f"Falta la hoja obligatoria: '{hoja}'")

    if not resultado['es_valido']:
        return resultado

    # 2. Verificar estructura de cada hoja de trimestre
    for trim in TRIMESTRES:
        ws = wb[trim]
        for cell_ref, valor_esperado in ESTRUCTURA_TRIMESTRE.items():
            val = _leer_celda(ws, cell_ref)
            if val != valor_esperado:
                resultado['es_valido'] = False
                resultado['errores'].append(
                    f"[{trim}] Celda {cell_ref}: esperaba '{valor_esperado}', "
                    f"encontró '{val}'"
                )

    # 3. Contar estudiantes en FILIACION
    ws_fil = wb['FILIACION']
    cant_estudiantes = 0
    for fila in range(9, 49):
        nombre = ws_fil.cell(row=fila, column=2).value
        if nombre and str(nombre).strip():
            cant_estudiantes += 1
        else:
            break
    resultado['metadatos']['cantidad_estudiantes'] = cant_estudiantes

    # 4. Extraer metadatos (CARATULA → BOLETIN → 1TRIM como fallback)
    ws_car  = wb['CARATULA']
    ws_bol  = wb['BOLETIN']
    ws_trim = wb['1TRIM']

    metadatos_extraidos = {}
    for campo, cell_caratula in META_CARATULA.items():
        val = _leer_celda(ws_car, cell_caratula)
        if not val and campo in META_BOLETIN:
            val = _leer_celda(ws_bol, META_BOLETIN[campo])
        if not val and campo in META_TRIMESTRE:
            val = _leer_celda(ws_trim, META_TRIMESTRE[campo])
        metadatos_extraidos[campo] = val

    resultado['metadatos'].update(metadatos_extraidos)

    # 5. Advertencias por campos críticos vacíos
    campos_criticos = ['maestro', 'paralelo', 'area', 'año_escolaridad']
    campos_vacios = [c for c in campos_criticos if not metadatos_extraidos.get(c)]
    if campos_vacios:
        resultado['advertencias'].append(
            f"Metadatos sin llenar en CARATULA: {', '.join(campos_vacios)}. "
            f"Completa la carátula antes de subir la planilla."
        )

    # 6. Verificar notas por trimestre
    for trim in TRIMESTRES:
        ws = wb[trim]
        tiene_notas = False
        for col in [19, 30]:  # SABER (S=19) y HACER (AD=30)
            for fila in range(15, 55):
                val = ws.cell(row=fila, column=col).value
                if val is not None and val != '':
                    tiene_notas = True
                    break
            if tiene_notas:
                break
        resultado['metadatos'][f'{trim}_tiene_notas'] = tiene_notas
        if not tiene_notas:
            resultado['advertencias'].append(f"[{trim}] No contiene notas cargadas")

    return resultado


def validar_pertenencia(metadatos, profesor_curso):
    """
    Verifica que los metadatos extraídos de la planilla correspondan
    al ProfesorCurso indicado.

    Retorna lista de errores (vacía = todo OK).
    """
    errores = []

    # ── 1. Nombre del maestro ────────────────────────────────────────
    maestro_planilla = _normalizar(metadatos.get('maestro', ''))
    nombre_completo  = f"{profesor_curso.profesor.first_name} {profesor_curso.profesor.last_name}".strip()
    nombre_db        = _normalizar(nombre_completo or profesor_curso.profesor.username)

    if not maestro_planilla:
        errores.append(
            "La planilla no tiene nombre de maestro en la Carátula (celda F12). "
            "Complétala antes de subir."
        )
    elif nombre_db:
        palabras_db       = set(nombre_db.split())
        palabras_planilla = set(maestro_planilla.split())
        coincidencias     = palabras_db & palabras_planilla
        # Exigir al menos 2 palabras en común (o todas si el nombre es de 1 sola palabra)
        min_match = min(2, len(palabras_db))
        if len(coincidencias) < min_match:
            errores.append(
                f"El nombre del maestro en la planilla (\"{metadatos.get('maestro')}\") "
                f"no corresponde a tu cuenta. Verifica la celda F12 de la Carátula."
            )

    # ── 2. Área / Materia ────────────────────────────────────────────
    area_planilla = _normalizar(metadatos.get('area', ''))
    materia_db    = _normalizar(profesor_curso.materia.nombre)

    if not area_planilla:
        errores.append(
            "La planilla no tiene área en la Carátula (celda E20). "
            "Complétala antes de subir."
        )
    elif materia_db:
        palabras_area    = set(area_planilla.split())
        palabras_materia = set(materia_db.split())
        if not (palabras_area & palabras_materia):
            errores.append(
                f"El área de la planilla (\"{metadatos.get('area')}\") "
                f"no coincide con la materia asignada \"{profesor_curso.materia.nombre}\"."
            )

    # ── 3. Paralelo ──────────────────────────────────────────────────
    paralelo_planilla = _normalizar(metadatos.get('paralelo', ''))
    paralelo_db       = _normalizar(profesor_curso.curso.paralelo)

    if not paralelo_planilla:
        errores.append(
            "La planilla no tiene paralelo en la Carátula (celda J20). "
            "Complétala antes de subir."
        )
    elif paralelo_planilla != paralelo_db:
        errores.append(
            f"El paralelo de la planilla (\"{metadatos.get('paralelo')}\") "
            f"no coincide con el curso asignado (paralelo \"{profesor_curso.curso.paralelo}\")."
        )

    # ── 4. Año de escolaridad / Grado ────────────────────────────────
    año_planilla = _normalizar(metadatos.get('año_escolaridad', ''))
    grado_db     = _normalizar(profesor_curso.curso.grado)

    if not año_planilla:
        errores.append(
            "La planilla no tiene año de escolaridad en la Carátula (celda H20). "
            "Complétala antes de subir."
        )
    elif grado_db:
        _ORDINALES = {
            'primero': '1', 'primera': '1',
            'segundo': '2', 'segunda': '2',
            'tercero': '3', 'tercera': '3',
            'cuarto':  '4', 'cuarta':  '4',
            'quinto':  '5', 'quinta':  '5',
            'sexto':   '6', 'sexta':   '6',
        }

        def _base_ordinal(s):
            """Normaliza a un identificador base (p.ej. '1ro', '1°', 'primero' → '1')."""
            # Reemplazar palabras ordinales completas por su número
            for palabra, num in _ORDINALES.items():
                s = re.sub(rf'\b{palabra}\b', num, s)
            # Eliminar símbolo de grado
            s = re.sub(r'[°º]', '', s)
            # Eliminar sufijos ordinales numéricos (1ro → 1, 2do → 2, etc.)
            s = re.sub(r'\b(\d+)(ro|do|er|to|vo|mo|no)\b', r'\1', s)
            return s.strip()

        base_planilla = _base_ordinal(año_planilla)
        base_db       = _base_ordinal(grado_db)

        if base_planilla not in base_db and base_db not in base_planilla:
            errores.append(
                f"El año de escolaridad de la planilla (\"{metadatos.get('año_escolaridad')}\") "
                f"no coincide con el grado del curso asignado (\"{profesor_curso.curso.grado}\")."
            )

    return errores


# ── Validación de estudiantes ─────────────────────────────────────────────────

def _palabras(texto):
    """Retorna el conjunto de palabras normalizadas de un texto."""
    return set(_normalizar(texto).split())


def _coincide_nombre(palabras_excel, palabras_db):
    """
    True si los dos conjuntos representan el mismo nombre.
    Exige que todas las palabras del conjunto más pequeño estén en el otro.
    """
    if not palabras_excel or not palabras_db:
        return False
    menor = palabras_excel if len(palabras_excel) <= len(palabras_db) else palabras_db
    mayor = palabras_excel if menor is palabras_db else palabras_db
    return menor.issubset(mayor)


def validar_estudiantes(nombres_excel, curso_id):
    """
    Verifica que cada nombre del Excel exista en la BD para ese curso.
    No importa si el estudiante está activo o inactivo.

    Retorna:
        {
          'es_valido':      bool,
          'no_encontrados': [str, ...],
          'activos':        int,
          'inactivos':      int,
          'total_excel':    int,
          'total_bd':       int,
        }
    """
    from backend.apps.students.models import Estudiante

    estudiantes_db = list(
        Estudiante.objects
        .filter(curso_id=curso_id)
        .values('nombre', 'apellido_paterno', 'apellido_materno', 'activo')
    )

    db_entries = []
    for e in estudiantes_db:
        nombre_completo = f"{e['apellido_paterno']} {e['apellido_materno']} {e['nombre']}"
        db_entries.append({
            'palabras': _palabras(nombre_completo),
            'activo':   e['activo'],
        })

    activos           = 0
    inactivos         = 0
    no_encontrados    = []
    lista_estudiantes = []

    for nombre_excel in nombres_excel:
        palabras_exc = _palabras(nombre_excel)
        match = next(
            (entry for entry in db_entries if _coincide_nombre(palabras_exc, entry['palabras'])),
            None,
        )
        if match is None:
            no_encontrados.append(nombre_excel)
            lista_estudiantes.append({'nombre': nombre_excel, 'encontrado': False, 'activo': None})
        elif match['activo']:
            activos += 1
            lista_estudiantes.append({'nombre': nombre_excel, 'encontrado': True, 'activo': True})
        else:
            inactivos += 1
            lista_estudiantes.append({'nombre': nombre_excel, 'encontrado': True, 'activo': False})

    debug_bd = [
        f"{e['apellido_paterno']} {e['apellido_materno']} {e['nombre']}"
        for e in estudiantes_db[:5]
    ]

    return {
        'es_valido':          len(no_encontrados) == 0,
        'no_encontrados':     no_encontrados,
        'lista_estudiantes':  lista_estudiantes,
        'activos':            activos,
        'inactivos':          inactivos,
        'total_excel':        len(nombres_excel),
        'total_bd':           len(db_entries),
        '_debug_nombres_excel': nombres_excel[:5],
        '_debug_nombres_bd':    debug_bd,
        '_debug_curso_id':      curso_id,
    }


# ── Extracción de notas ────────────────────────────────────────────────────────

_SABER_COLS = list(range(19, 29))   # S–AB  (10 casilleros)
_SABER_PROM = 29                     # AC
_HACER_COLS = list(range(30, 40))   # AD–AM (10 casilleros)
_HACER_PROM = 40                     # AN

_FILA_TITULO_INI      = 9
_FILA_ESTUDIANTES_INI = 15
_FILA_ESTUDIANTES_FIN = 54


def _titulo_columna(ws, col_num):
    for fila in range(_FILA_TITULO_INI, 15):
        val = ws.cell(row=fila, column=col_num).value
        if val is not None and str(val).strip():
            return str(val).strip()
    return None


def _casilleros_activos(ws, columnas):
    activos = []
    for col_num in columnas:
        titulo     = _titulo_columna(ws, col_num)
        tiene_dato = False
        for fila in range(_FILA_ESTUDIANTES_INI, _FILA_ESTUDIANTES_FIN + 1):
            val = ws.cell(row=fila, column=col_num).value
            if val is not None and val != '':
                tiene_dato = True
                break
            if val == 0:
                nombre = ws.cell(row=fila, column=2).value
                if nombre and str(nombre).strip():
                    tiene_dato = True
                    break
        if titulo or tiene_dato:
            from openpyxl.utils import get_column_letter
            activos.append({
                'col':   col_num,
                'letra': get_column_letter(col_num),
                'titulo': titulo if titulo else f"Col {get_column_letter(col_num)}",
            })
    return activos


def _estudiantes_hoja(ws, wb):
    estudiantes = []
    for fila in range(_FILA_ESTUDIANTES_INI, _FILA_ESTUDIANTES_FIN + 1):
        nombre = ws.cell(row=fila, column=2).value
        numero = ws.cell(row=fila, column=1).value
        if nombre and str(nombre).strip():
            estudiantes.append({'fila': fila, 'numero': numero, 'nombre': str(nombre).strip()})

    if not estudiantes and 'FILIACION' in wb.sheetnames:
        ws_fil = wb['FILIACION']
        offset = _FILA_ESTUDIANTES_INI - 9
        for fila in range(_FILA_ESTUDIANTES_INI, _FILA_ESTUDIANTES_FIN + 1):
            nombre = ws_fil.cell(row=fila - offset, column=2).value
            numero = ws.cell(row=fila, column=1).value
            if nombre and str(nombre).strip():
                estudiantes.append({
                    'fila':   fila,
                    'numero': numero if numero else fila - _FILA_ESTUDIANTES_INI + 1,
                    'nombre': str(nombre).strip(),
                })
    return estudiantes


def _notas_dimension(ws, estudiantes, casilleros, col_promedio):
    resultados = []
    for est in estudiantes:
        fila  = est['fila']
        notas = {}
        for cas in casilleros:
            val = ws.cell(row=fila, column=cas['col']).value
            notas[cas['titulo']] = val if val is not None else None
        promedio = ws.cell(row=fila, column=col_promedio).value
        resultados.append({
            'numero':  est['numero'],
            'nombre':  est['nombre'],
            'notas':   notas,
            'promedio': promedio,
        })
    return resultados


def extraer_notas(archivo):
    """
    Extrae las notas SABER y HACER de las hojas de trimestre.
    Acepta un Workbook ya abierto, bytes o BytesIO.
    Retorna dict con la estructura: { trimestres: { '1TRIM': {...}, ... } }
    """
    if isinstance(archivo, openpyxl.Workbook):
        wb = archivo
    else:
        if isinstance(archivo, (bytes, bytearray)):
            archivo = io.BytesIO(archivo)
        wb = openpyxl.load_workbook(archivo, data_only=True)

    _TRIM_LABELS = {
        '1TRIM': '1er Trimestre',
        '2TRIM': '2do Trimestre',
        '3TRIM': '3er Trimestre',
    }

    resultado = {'trimestres': {}}

    for sheet_name, label in _TRIM_LABELS.items():
        if sheet_name not in wb.sheetnames:
            continue

        ws            = wb[sheet_name]
        saber_activos = _casilleros_activos(ws, _SABER_COLS)
        hacer_activos = _casilleros_activos(ws, _HACER_COLS)
        estudiantes   = _estudiantes_hoja(ws, wb)

        resultado['trimestres'][sheet_name] = {
            'label': label,
            'saber': {
                'casilleros': [c['titulo'] for c in saber_activos],
                'datos':      _notas_dimension(ws, estudiantes, saber_activos, _SABER_PROM),
            },
            'hacer': {
                'casilleros': [c['titulo'] for c in hacer_activos],
                'datos':      _notas_dimension(ws, estudiantes, hacer_activos, _HACER_PROM),
            },
        }

    return resultado

"""
Validador de planillas Excel formato 2026 (Ministerio de Educación Bolivia).

Diferencias clave vs formato Ley 070 (antiguo):
  - Tiene hojas LIST 1TRIM / LIST 2TRIM / LIST 3TRIM  (asistencia)
  - No tiene hoja BOLETIN
  - Los metadatos (ÁREA, MAESTRA/O, PARALELO, AÑO DE ESCOLARIDAD) están en las
    primeras 6 filas de cada hoja de evaluación, buscados por etiqueta de texto
    (no por celda fija como en el formato anterior)
"""

import re
import unicodedata


HOJAS_EVALUACION = ['1TRIM', '2TRIM', '3TRIM']
HOJAS_BASE       = ['CARATULA', 'FILIACION'] + HOJAS_EVALUACION
HOJAS_ASISTENCIA = ['LIST 1TRIM', 'LIST 2TRIM', 'LIST 3TRIM']

_GRADO_MAP = {
    'PRIMERO':   '1ro',
    'SEGUNDO':   '2do',
    'TERCERO':   '3ro',
    'CUARTO':    '4to',
    'QUINTO':    '5to',
    'SEXTO':     '6to',
    'SÉPTIMO':   '7mo',
    'OCTAVO':    '8vo',
    'NOVENO':    '9no',
}

def _normalizar_grado(texto):
    """Convierte 'PRIMERO' → '1ro', 'SEGUNDO SECUNDARIA' → '2do Secundaria', etc."""
    if not texto:
        return texto
    resultado = texto.strip()
    for palabra, abrev in _GRADO_MAP.items():
        resultado = re.sub(rf'\b{palabra}\b', abrev, resultado, flags=re.IGNORECASE)
    return resultado


# ── Helpers ───────────────────────────────────────────────────────────────────

def _normalizar(texto):
    """Lowercase, sin tildes, solo alfanumérico y espacios."""
    if not texto:
        return ''
    texto = unicodedata.normalize('NFKD', str(texto))
    texto = texto.encode('ascii', 'ignore').decode('ascii')
    texto = texto.lower()
    texto = re.sub(r'[^a-z0-9 ]', ' ', texto)
    return ' '.join(texto.split())


def es_formato_2026(wb):
    """True si el workbook es formato 2026 (tiene hojas LIST xTRIM)."""
    return 'LIST 1TRIM' in wb.sheetnames


# ── Extracción de metadatos de hoja trimestral ────────────────────────────────

def _extraer_meta_trim(ws):
    """
    Extrae ÁREA, MAESTRA/O, CAMPO, PARALELO y AÑO DE ESCOLARIDAD de las
    primeras 6 filas de una hoja de evaluación, buscando por etiqueta de texto.

    Mapeo documentado del formato 2026:
        ÁREA:               col V3  (22) → valor en celda siguiente
        MAESTRA/O:          col V5  (22) → valor en celda siguiente
        CAMPO:              col A5  (1)  → valor en celda siguiente
        PARALELO:           col AN3 (40) → valor en celda siguiente
        AÑO DE ESCOLARIDAD: col AK1 (37) → valor en celda siguiente
    """
    meta = {
        'area':             None,
        'maestro':          None,
        'campo':            None,
        'paralelo':         None,
        'año_escolaridad':  None,
    }

    for row in ws.iter_rows(max_row=6, values_only=True):
        for i, val in enumerate(row):
            if val is None:
                continue
            etiqueta = str(val).strip().upper()
            # Valor está en la celda inmediatamente siguiente no vacía
            valor = None
            for j in range(i + 1, min(i + 10, len(row))):
                if row[j] is not None and str(row[j]).strip():
                    valor = str(row[j]).strip()
                    break
            if not valor:
                continue

            if etiqueta == 'ÁREA:':
                meta['area'] = valor
            elif 'MAESTRA' in etiqueta and ':' in etiqueta:
                meta['maestro'] = valor
            elif etiqueta == 'CAMPO:':
                meta['campo'] = valor
            elif etiqueta == 'PARALELO:':
                meta['paralelo'] = valor
            elif 'AÑO DE ESCOLARIDAD' in etiqueta and ':' in etiqueta:
                meta['año_escolaridad'] = _normalizar_grado(valor)

    return meta


# Rangos de columnas por dimensión (1-indexed, igual que openpyxl)
_DIMS = {
    'ser':   (14, 17),
    'saber': (19, 28),
    'hacer': (30, 39),
}


def _extraer_headers_trim(ws):
    """
    Extrae los títulos de actividades/exámenes de las columnas SER, SABER y HACER.
    Solo incluye columnas que tengan al menos un valor numérico en las filas
    de estudiantes (fila 15 en adelante) — columnas planificadas sin notas se omiten.
    Formato esperado del título: 'dd/mm/yyyy - Nombre actividad'
    """
    filas_header   = list(ws.iter_rows(min_row=9,  max_row=13,  values_only=True))
    filas_students = list(ws.iter_rows(min_row=15, max_row=200, values_only=True))

    headers = {}
    for dim, (col_ini, col_fin) in _DIMS.items():
        cols = []
        for col in range(col_ini, col_fin + 1):
            idx = col - 1

            # 1. Buscar título en filas de cabecera
            titulo = None
            for fila in filas_header:
                if idx >= len(fila) or fila[idx] is None:
                    continue
                val_str = str(fila[idx]).strip()
                if not val_str or val_str.upper() == 'PROMEDIO':
                    continue
                try:
                    float(val_str)
                    continue
                except ValueError:
                    pass
                titulo = val_str
                break

            if not titulo:
                continue

            # 2. Extraer notas de estudiantes en esta columna
            notas = []
            for fila in filas_students:
                if len(fila) <= max(idx, 1):
                    continue
                nro    = fila[0]
                nombre = fila[1]
                if not nro or not nombre:
                    continue
                val = fila[idx] if idx < len(fila) else None
                if _es_numero(val):
                    notas.append({
                        'nro':    int(nro),
                        'nombre': re.sub(r'\s+', ' ', str(nombre).strip()),
                        'nota':   round(float(val), 1),
                    })

            if notas:
                cols.append({'col': col, 'titulo': titulo, 'notas': notas})

        if cols:
            headers[dim] = cols

    return headers


def _es_numero(val):
    try:
        return float(val) > 0
    except (TypeError, ValueError):
        return False


def _primer_trim_con_datos(wb):
    """
    Devuelve los metadatos del primer trimestre que tenga al menos
    uno de los campos de pertenencia llenados. Junto con el nombre
    de la hoja usada.
    Retorna (meta_dict, nombre_hoja) o ({...vacíos...}, None).
    """
    vacios = {k: None for k in ['area', 'maestro', 'campo', 'paralelo', 'año_escolaridad']}
    for hoja in HOJAS_EVALUACION:
        if hoja not in wb.sheetnames:
            continue
        meta = _extraer_meta_trim(wb[hoja])
        if any(v for v in meta.values()):
            return meta, hoja
    return vacios, None


# ── Validación de estructura ──────────────────────────────────────────────────

def validar_estructura_2026(wb):
    """
    Verifica que el workbook tenga la estructura del formato 2026 y extrae
    los metadatos de pertenencia.

    Retorna:
        {
            'es_valido':    bool,
            'errores':      [str, ...],
            'advertencias': [str, ...],
            'metadatos':    dict,
        }
    """
    resultado = {
        'es_valido':    True,
        'errores':      [],
        'advertencias': [],
        'metadatos':    {'formato': '2026'},
    }

    hojas = wb.sheetnames

    # 1. Hojas obligatorias
    for hoja in HOJAS_BASE:
        if hoja not in hojas:
            resultado['es_valido'] = False
            resultado['errores'].append(f"Falta la hoja obligatoria: '{hoja}'")

    for hoja in HOJAS_ASISTENCIA:
        if hoja not in hojas:
            resultado['advertencias'].append(
                f"Hoja de asistencia no encontrada: '{hoja}' "
                "(no afecta la validación de pertenencia)"
            )

    if not resultado['es_valido']:
        return resultado

    # 2. Extraer metadatos del primer trimestre con datos
    meta, hoja_origen = _primer_trim_con_datos(wb)
    resultado['metadatos'].update(meta)
    resultado['metadatos']['hoja_origen'] = hoja_origen

    # 3. Advertir campos críticos vacíos
    campos_criticos = ['maestro', 'area', 'paralelo', 'año_escolaridad']
    vacios = [c for c in campos_criticos if not meta.get(c)]
    if vacios:
        resultado['advertencias'].append(
            f"Campos sin llenar en la hoja de evaluación: {', '.join(vacios)}. "
            "El profesor debe completarlos antes de subir la planilla."
        )

    # 4. Extraer estudiantes de FILIACION
    ws_fil = wb['FILIACION']
    estudiantes = []
    for fila in range(9, 55):
        nombre = ws_fil.cell(row=fila, column=2).value
        if nombre and str(nombre).strip():
            estudiantes.append(re.sub(r'\s+', ' ', str(nombre).strip()))
        else:
            break
    resultado['metadatos']['cantidad_estudiantes'] = len(estudiantes)
    resultado['metadatos']['estudiantes'] = estudiantes

    # 5. Extraer headers de actividades por trimestre
    headers_por_trim = {}
    for hoja in HOJAS_EVALUACION:
        if hoja in wb.sheetnames:
            h = _extraer_headers_trim(wb[hoja])
            if h:
                headers_por_trim[hoja] = h
    resultado['metadatos']['headers_actividades'] = headers_por_trim

    return resultado


# ── Validación de pertenencia ─────────────────────────────────────────────────

def validar_pertenencia_2026(metadatos, profesor_curso):
    """
    Verifica que los metadatos extraídos del Excel 2026 correspondan al
    ProfesorCurso indicado.

    Retorna lista de errores (vacía = todo OK).
    """
    errores = []

    # ── 1. Nombre del maestro ─────────────────────────────────────────────────
    maestro_excel = _normalizar(metadatos.get('maestro', ''))
    nombre_completo = (
        f"{profesor_curso.profesor.first_name} {profesor_curso.profesor.last_name}".strip()
    )
    nombre_db = _normalizar(nombre_completo or profesor_curso.profesor.username)

    if not maestro_excel:
        errores.append(
            "La planilla no tiene nombre del maestro/a en la hoja de evaluación. "
            "Completa el campo MAESTRA/O antes de subir."
        )
    elif nombre_db:
        palabras_db    = set(nombre_db.split())
        palabras_excel = set(maestro_excel.split())
        coincidencias  = palabras_db & palabras_excel
        min_match      = min(2, len(palabras_db))
        if len(coincidencias) < min_match:
            errores.append(
                f"El nombre del maestro/a en la planilla (\"{metadatos.get('maestro')}\") "
                f"no corresponde a tu cuenta ({nombre_completo or profesor_curso.profesor.username}). "
                "Verifica el campo MAESTRA/O."
            )

    # ── 2. Área vs Materia ────────────────────────────────────────────────────
    area_excel  = _normalizar(metadatos.get('area', ''))
    materia_db  = _normalizar(profesor_curso.materia.nombre)

    if not area_excel:
        errores.append(
            "La planilla no tiene el área en la hoja de evaluación. "
            "Completa el campo ÁREA antes de subir."
        )
    elif materia_db:
        if not (set(area_excel.split()) & set(materia_db.split())):
            errores.append(
                f"El área de la planilla (\"{metadatos.get('area')}\") "
                f"no coincide con tu materia asignada \"{profesor_curso.materia.nombre}\"."
            )

    # ── 3. Paralelo ───────────────────────────────────────────────────────────
    paralelo_excel = _normalizar(metadatos.get('paralelo', ''))
    paralelo_db    = _normalizar(profesor_curso.curso.paralelo)

    if not paralelo_excel:
        errores.append(
            "La planilla no tiene el paralelo en la hoja de evaluación. "
            "Completa el campo PARALELO antes de subir."
        )
    elif paralelo_excel != paralelo_db:
        errores.append(
            f"El paralelo de la planilla (\"{metadatos.get('paralelo')}\") "
            f"no coincide con tu curso asignado (paralelo \"{profesor_curso.curso.paralelo}\")."
        )

    # ── 4. Año de escolaridad vs Grado ────────────────────────────────────────
    año_excel = _normalizar(metadatos.get('año_escolaridad', ''))
    grado_db  = _normalizar(profesor_curso.curso.grado)

    if not año_excel:
        errores.append(
            "La planilla no tiene el año de escolaridad en la hoja de evaluación. "
            "Completa el campo AÑO DE ESCOLARIDAD antes de subir."
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
            for pal, num in _ORDINALES.items():
                s = re.sub(rf'\b{pal}\b', num, s)
            s = re.sub(r'[°º]', '', s)
            s = re.sub(r'\b(\d+)(ro|do|er|to|vo|mo|no)\b', r'\1', s)
            return s.strip()

        base_excel = _base_ordinal(año_excel)
        base_db    = _base_ordinal(grado_db)

        if base_excel not in base_db and base_db not in base_excel:
            errores.append(
                f"El año de escolaridad de la planilla (\"{metadatos.get('año_escolaridad')}\") "
                f"no coincide con el grado del curso asignado (\"{profesor_curso.curso.grado}\")."
            )

    return errores

"""
Validador de planillas Excel formato 2026 (Ministerio de Educación Bolivia).

Diferencias clave vs formato Ley 070:
  - Tiene hojas LIST 1TRIM / LIST 2TRIM / LIST 3TRIM  (asistencia)
  - No tiene hoja BOLETIN
  - Los metadatos están en las primeras 6 filas de cada hoja de evaluación,
    buscados por etiqueta de texto (no por celda fija)
"""

import re

from django.utils import timezone

from .planilla_validator import _normalizar, _base_ordinal, _MENSAJE_NO_OFICIAL


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
    """Convierte 'PRIMERO' → '1ro', 'SEGUNDO SECUNDARIA' → '2do Secundaria'."""
    if not texto:
        return texto
    resultado = texto.strip()
    for palabra, abrev in _GRADO_MAP.items():
        resultado = re.sub(rf'\b{palabra}\b', abrev, resultado, flags=re.IGNORECASE)
    return resultado


def es_formato_2026(wb):
    """True si el workbook es formato 2026 (tiene hojas LIST xTRIM)."""
    return 'LIST 1TRIM' in wb.sheetnames


# ── Extracción de metadatos de hoja trimestral ────────────────────────────────

def _extraer_meta_trim(ws):
    """
    Extrae ÁREA, MAESTRA/O, CAMPO, PARALELO y AÑO DE ESCOLARIDAD de las
    primeras 6 filas buscando por etiqueta de texto.
    """
    meta = {
        'area':            None,
        'maestro':         None,
        'campo':           None,
        'paralelo':        None,
        'año_escolaridad': None,
    }

    for row in ws.iter_rows(max_row=6, values_only=True):
        for i, val in enumerate(row):
            if val is None:
                continue
            etiqueta = str(val).strip().upper()
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


# Rangos de columnas por dimensión (1-indexed)
_DIMS = {
    'ser':   (14, 17),
    'saber': (19, 28),
    'hacer': (30, 39),
}


def _extraer_headers_trim(ws):
    """
    Extrae los títulos de actividades/exámenes de las columnas SER, SABER y HACER.
    Solo incluye columnas con al menos un valor numérico en filas de estudiantes.
    """
    filas_header   = list(ws.iter_rows(min_row=9,  max_row=13,  values_only=True))
    filas_students = list(ws.iter_rows(min_row=15, max_row=200, values_only=True))

    headers = {}
    for dim, (col_ini, col_fin) in _DIMS.items():
        cols = []
        for col in range(col_ini, col_fin + 1):
            idx = col - 1

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
    Devuelve los metadatos del primer trimestre con al menos uno de los
    campos de pertenencia llenados.
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
    Verifica que el workbook tenga la estructura del formato 2026.
    Retorna: { es_valido, mensaje, advertencias[], metadatos{} }
    """
    resultado = {
        'es_valido':    True,
        'mensaje':      None,
        'advertencias': [],
        'metadatos':    {'formato': '2026'},
    }

    hojas = wb.sheetnames

    # 1. Hojas obligatorias
    for hoja in HOJAS_BASE:
        if hoja not in hojas:
            resultado['es_valido'] = False
            resultado['mensaje']   = _MENSAJE_NO_OFICIAL
            return resultado

    # 2. Advertencia si faltan hojas de asistencia (no bloquea)
    for hoja in HOJAS_ASISTENCIA:
        if hoja not in hojas:
            resultado['advertencias'].append(
                f"Hoja de asistencia no encontrada: '{hoja}' "
                "(no afecta la validación de pertenencia)."
            )

    # 3. Validar año académico desde CARATULA (celda F14)
    ws_car = wb['CARATULA']
    gestion_raw = ws_car['F14'].value
    gestion_str = str(gestion_raw).strip() if gestion_raw else ''
    digitos_gestion = re.findall(r'\d{4}', gestion_str)
    año_actual = timezone.now().year
    if digitos_gestion and str(año_actual) not in digitos_gestion:
        resultado['es_valido'] = False
        resultado['mensaje']   = (
            f"La planilla corresponde a la gestión {digitos_gestion[0]}, "
            f"pero el sistema está en {año_actual}."
        )
        return resultado

    # 4. Extraer metadatos del primer trimestre con datos
    meta, hoja_origen = _primer_trim_con_datos(wb)
    resultado['metadatos'].update(meta)
    resultado['metadatos']['hoja_origen'] = hoja_origen

    # 5. Advertir campos críticos vacíos
    campos_criticos = ['maestro', 'area', 'paralelo', 'año_escolaridad']
    vacios = [c for c in campos_criticos if not meta.get(c)]
    if vacios:
        resultado['advertencias'].append(
            f"Campos sin llenar en la hoja de evaluación: {', '.join(vacios)}. "
            "El profesor debe completarlos antes de subir la planilla."
        )

    # 6. Extraer estudiantes de FILIACION
    ws_fil = wb['FILIACION']
    estudiantes = []
    for fila in range(9, 55):
        nombre = ws_fil.cell(row=fila, column=2).value
        if nombre and str(nombre).strip():
            estudiantes.append(re.sub(r'\s+', ' ', str(nombre).strip()))
        else:
            break
    resultado['metadatos']['cantidad_estudiantes'] = len(estudiantes)
    resultado['metadatos']['estudiantes']          = estudiantes

    if len(estudiantes) == 0:
        resultado['es_valido'] = False
        resultado['mensaje']   = "La planilla no tiene estudiantes registrados en FILIACION."
        return resultado

    # 7. Extraer headers de actividades por trimestre
    headers_por_trim = {}
    for hoja in HOJAS_EVALUACION:
        if hoja in wb.sheetnames:
            h = _extraer_headers_trim(wb[hoja])
            if h:
                headers_por_trim[hoja] = h
    resultado['metadatos']['headers_actividades'] = headers_por_trim

    # 8. Advertencia si todos los trimestres están sin notas
    trims_con_notas = [h for h in HOJAS_EVALUACION if h in headers_por_trim]
    if not trims_con_notas:
        resultado['advertencias'].append(
            "La planilla no tiene notas en ningún trimestre. ¿Estás seguro de que es la correcta?"
        )

    return resultado


# ── Validación de pertenencia ─────────────────────────────────────────────────

def validar_pertenencia_2026(metadatos, profesor_curso):
    """
    Verifica en orden: nombre → grado → paralelo → área/materia.
    Retorna el primer error como string, o None si todo OK.
    """
    # 1. Nombre del maestro
    maestro_excel   = _normalizar(metadatos.get('maestro', ''))
    nombre_completo = f"{profesor_curso.profesor.first_name} {profesor_curso.profesor.last_name}".strip()
    nombre_db       = _normalizar(nombre_completo or profesor_curso.profesor.username)

    if not maestro_excel or (nombre_db and len(set(nombre_db.split()) & set(maestro_excel.split())) < min(2, len(set(nombre_db.split())))):
        return (
            "Este no es tu registro de calificaciones. "
            "El nombre del docente en la planilla no coincide con tu cuenta."
        )

    # 2. Grado
    año_excel = _normalizar(metadatos.get('año_escolaridad', ''))
    grado_db  = _normalizar(profesor_curso.curso.grado)

    if not año_excel:
        return "Esta plantilla no pertenece a este grado."
    if grado_db:
        if _base_ordinal(año_excel) not in _base_ordinal(grado_db) and \
           _base_ordinal(grado_db) not in _base_ordinal(año_excel):
            return "Esta plantilla no pertenece a este grado."

    # 3. Paralelo
    paralelo_excel = _normalizar(metadatos.get('paralelo', ''))
    paralelo_db    = _normalizar(profesor_curso.curso.paralelo)

    if not paralelo_excel or paralelo_excel != paralelo_db:
        return "Esta plantilla no pertenece a este paralelo."

    # 4. Área / Materia
    area_excel = _normalizar(metadatos.get('area', ''))
    materia_db = _normalizar(profesor_curso.materia.nombre)

    if not area_excel or (materia_db and not (set(area_excel.split()) & set(materia_db.split()))):
        return "Esta no es la materia correspondiente a tu asignación."

    return None

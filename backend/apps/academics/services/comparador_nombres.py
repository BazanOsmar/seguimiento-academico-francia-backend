"""
Herramienta temporal para el director: compara los nombres de un Excel de notas
contra los estudiantes registrados en la BD para ese curso.
Devuelve estudiantes que están solo en el Excel o solo en la BD.
"""

from .planilla_validator import _normalizar, _palabras, _coincide_nombre


def comparar_nombres_excel_bd(nombres_excel, curso_id):
    """
    Comparación bidireccional entre nombres del Excel y estudiantes de la BD.

    Retorna:
        {
          'curso_nombre':  str,
          'total_excel':   int,
          'total_bd':      int,
          'en_ambos':      int,
          'solo_en_excel': [str, ...],   # en Excel pero no en BD
          'solo_en_bd':    [str, ...],   # en BD pero no en Excel
        }
    """
    from backend.apps.students.models import Estudiante
    from backend.apps.academics.models import Curso

    curso = Curso.objects.get(pk=curso_id)

    estudiantes_db = list(
        Estudiante.objects
        .filter(curso_id=curso_id)
        .values('nombre', 'apellido_paterno', 'apellido_materno', 'activo')
    )

    # Construir entradas de BD con palabras normalizadas + nombre legible
    db_entries = []
    for e in estudiantes_db:
        nombre_completo = f"{e['apellido_paterno']} {e['apellido_materno']} {e['nombre']}".strip()
        db_entries.append({
            'palabras':        _palabras(nombre_completo),
            'nombre_legible':  nombre_completo,
            'matched':         False,
        })

    solo_en_excel = []

    for nombre_excel in nombres_excel:
        palabras_exc = _palabras(nombre_excel)
        match = next(
            (e for e in db_entries if not e['matched'] and _coincide_nombre(palabras_exc, e['palabras'])),
            None,
        )
        if match:
            match['matched'] = True
        else:
            solo_en_excel.append(nombre_excel)

    solo_en_bd = [e['nombre_legible'] for e in db_entries if not e['matched']]
    en_ambos   = len(db_entries) - len(solo_en_bd)

    return {
        'curso_nombre':  str(curso),
        'total_excel':   len(nombres_excel),
        'total_bd':      len(db_entries),
        'en_ambos':      en_ambos,
        'solo_en_excel': solo_en_excel,
        'solo_en_bd':    solo_en_bd,
    }


def detectar_curso_desde_filename(filename):
    """
    Detecta el Curso a partir de los primeros 5 caracteres del nombre del archivo.
    Formato esperado: "1ro A...", "2do B...", "3ro C...", etc.
    Los primeros chars antes del espacio son el grado; el char tras el espacio es el paralelo.

    Retorna el Curso o lanza ValueError.
    """
    import re
    from backend.apps.academics.models import Curso
    from .planilla_validator import _normalizar

    prefijo = filename[:5].strip()
    m = re.match(r'^(\S+)\s+(\S)', prefijo)
    if not m:
        raise ValueError(
            f"No se pudo leer el curso del nombre del archivo '{filename}'. "
            "El nombre debe comenzar con el formato '1ro A', '2do B', etc."
        )

    grado_raw   = m.group(1)   # ej: "1ro"
    paralelo_raw = m.group(2)  # ej: "A"

    grado_norm   = _normalizar(grado_raw)
    paralelo_norm = _normalizar(paralelo_raw).upper()

    cursos = Curso.objects.all()
    for curso in cursos:
        if _normalizar(curso.paralelo).upper() != paralelo_norm:
            continue
        grado_db_norm = _normalizar(curso.grado)
        if grado_norm in grado_db_norm or grado_db_norm.startswith(grado_norm):
            return curso

    raise ValueError(
        f"No se encontró ningún curso con grado '{grado_raw}' y paralelo '{paralelo_raw}' "
        "en la base de datos."
    )


def extraer_nombres_desde_excel(wb):
    """
    Extrae la lista de nombres de estudiantes del Excel.
    Soporta formato 2026 y formato antiguo (Ley 070).
    """
    from .planilla_validator_2026 import es_formato_2026, validar_estructura_2026
    from .planilla_validator import validar_estructura, _estudiantes_hoja

    if es_formato_2026(wb):
        resultado = validar_estructura_2026(wb)
        return resultado.get('metadatos', {}).get('estudiantes', [])

    resultado = validar_estructura(wb)
    for hoja in ['1TRIM', '2TRIM', '3TRIM']:
        if hoja in wb.sheetnames:
            datos = _estudiantes_hoja(wb[hoja], wb)
            if datos:
                return [e['nombre'] for e in datos]
    return []

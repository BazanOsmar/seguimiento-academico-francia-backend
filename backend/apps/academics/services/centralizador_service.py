"""
Construye la estructura de datos del Centralizador de Notas desde la BD.

La nota final por trimestre se calcula desde `detalle_notas` (Mongo):
    nota = promedio_ser_trim + promedio_saber_trim + promedio_hacer_trim
           + autoevaluación_trim    (si existe)

Donde el promedio de cada dimensión = sum(notas) / count(notas) sobre todos
los documentos detalle_notas con la misma (estudiante, materia, trimestre,
gestión) — no se usa la colección notas_mensuales para ser/saber/hacer.

La autoevaluación se toma de `notas_mensuales.autoeval_ser` por ser el único
lugar donde se persiste (las notas detalle no la registran). Se usa el
último mes del trimestre con valor presente.
"""

from collections import defaultdict
from io import BytesIO
from typing import Optional

from django.db.models import Prefetch

from backend.apps.academics.models import Curso, Materia
from backend.apps.students.models import Estudiante

from .centralizador_export import generar_centralizador as _exportar_xlsx
from .notas_mongo_service import _get_db


# Reglas de mapeo: lista ordenada de (substrings_normalizados, etiqueta_corta).
# Coincide la primera regla cuyos substrings TODOS aparezcan en el nombre
# normalizado (sin acentos, en mayúsculas, alfanumérico+espacios).
MAPEO_MATERIAS: list[tuple[tuple[str, ...], str]] = [
    (("ARTES", "PLASTICAS"),        "Art. Plast"),
    (("BIOLOGIA",),                 "Biologia"),
    (("CIENCIAS", "SOCIALES"),      "Cs. Sociales"),
    (("COMUNICACION", "LENGUAJE"),  "Com y Len"),
    (("COSMOVISION",),              "Cosv y Fil"),
    (("FILOSOFIA",),                "Cosv y Fil"),
    (("EDUCACION", "FISICA"),       "Ed. Fisica"),
    (("EDUCACION", "MUSICAL"),      "Ed. Mus"),
    (("ESPIRITUALIDAD",),           "Val y Esp"),
    (("VALORES",),                  "Val y Esp"),
    (("LENGUA", "EXTRANJERA"),      "Len. Ext"),
    (("MATEMATICA",),               "Matematica"),
    (("TECNICA", "TECNOLOGICA"),    "T. Tecno"),
    (("FISICA",),                   "Fisica"),
    (("QUIMICA",),                  "Quimica"),
]


def _normalizar(texto: str) -> str:
    """Mayúsculas, sin acentos, conservando solo letras/dígitos/espacios."""
    if not texto:
        return ""
    out = []
    for ch in texto.upper():
        if 'A' <= ch <= 'Z' or '0' <= ch <= '9' or ch == ' ':
            out.append(ch)
        elif ch in 'ÁÀÄÂÃ':
            out.append('A')
        elif ch in 'ÉÈËÊ':
            out.append('E')
        elif ch in 'ÍÌÏÎ':
            out.append('I')
        elif ch in 'ÓÒÖÔÕ':
            out.append('O')
        elif ch in 'ÚÙÜÛ':
            out.append('U')
        elif ch == 'Ñ':
            out.append('N')
        else:
            out.append(' ')   # cualquier otro carácter (acentos rotos, guiones, etc.)
    return ' '.join(''.join(out).split())


def _nombre_corto(nombre_largo: str) -> str:
    """Devuelve la etiqueta corta para el centralizador.

    Si el nombre no calza con ninguna regla, usa las dos primeras palabras
    truncadas como fallback.
    """
    norm = _normalizar(nombre_largo)
    if not norm:
        return "Materia"
    for substrings, etiqueta in MAPEO_MATERIAS:
        if all(s in norm for s in substrings):
            return etiqueta
    palabras = norm.split()
    return " ".join(p[:4].capitalize() for p in palabras[:2])


def _hoja_de_curso(grado: str, paralelo: str) -> str:
    """Convierte ('1ro', 'A') → '1A' para el nombre de la pestaña."""
    num = "".join(ch for ch in (grado or "") if ch.isdigit()) or "?"
    return f"{num}{(paralelo or '').strip()}".upper()


def _curso_display(grado: str, paralelo: str) -> str:
    return f"{(grado or '').strip().upper()} \"{(paralelo or '').strip().upper()}\""


def _calcular_promedios_dim(gestion: int) -> dict:
    """Lee detalle_notas y agrupa por (estudiante, materia, trimestre, dim).

    Returns:
        { (eid, mid, trim): {'ser': promedio, 'saber': promedio, 'hacer': promedio} }
    """
    col = _get_db()['detalle_notas']
    pipeline = [
        {"$match": {"gestion": gestion, "dimension": {"$in": ["ser", "saber", "hacer"]}}},
        {"$group": {
            "_id": {
                "eid":  "$estudiante_id",
                "mid":  "$materia_id",
                "trim": "$trimestre",
                "dim":  "$dimension",
            },
            "suma": {"$sum": "$nota"},
            "cant": {"$sum": 1},
        }},
    ]
    out: dict = {}
    for r in col.aggregate(pipeline):
        k = (r["_id"]["eid"], r["_id"]["mid"], r["_id"]["trim"])
        out.setdefault(k, {})[r["_id"]["dim"]] = (
            r["suma"] / r["cant"] if r["cant"] else 0.0
        )
    return out


def _autoeval_por_trimestre(gestion: int) -> dict:
    """Devuelve el último autoeval_ser registrado en notas_mensuales por
    (estudiante, materia, trimestre).
    """
    col = _get_db()['notas_mensuales']
    pipeline = [
        {"$match": {"gestion": gestion, "autoeval_ser": {"$ne": None}}},
        {"$sort": {"mes": 1}},
        {"$group": {
            "_id": {
                "eid":  "$estudiante_id",
                "mid":  "$materia_id",
                "trim": "$trimestre",
            },
            "autoeval": {"$last": "$autoeval_ser"},
        }},
    ]
    return {
        (r["_id"]["eid"], r["_id"]["mid"], r["_id"]["trim"]): float(r["autoeval"] or 0)
        for r in col.aggregate(pipeline)
    }


def _construir_datos_cursos(gestion: int) -> list[dict]:
    promedios     = _calcular_promedios_dim(gestion)
    autoevals     = _autoeval_por_trimestre(gestion)

    materias_por_curso: dict[int, list[Materia]] = defaultdict(list)
    from backend.apps.academics.models import ProfesorCurso
    asignaciones = (
        ProfesorCurso.objects
        .select_related('curso', 'materia')
        .order_by('curso_id', 'materia__nombre')
    )
    vistas: set[tuple[int, int]] = set()
    for pc in asignaciones:
        clave = (pc.curso_id, pc.materia_id)
        if clave in vistas:
            continue
        vistas.add(clave)
        materias_por_curso[pc.curso_id].append(pc.materia)

    cursos = Curso.objects.all().order_by('grado', 'paralelo')

    estudiantes_qs = (
        Estudiante.objects
        .filter(activo=True)
        .order_by('apellido_paterno', 'apellido_materno', 'nombre')
    )
    estudiantes_por_curso: dict[int, list[Estudiante]] = defaultdict(list)
    for e in estudiantes_qs:
        estudiantes_por_curso[e.curso_id].append(e)

    out: list[dict] = []
    for curso in cursos:
        materias = materias_por_curso.get(curso.id, [])
        if not materias:
            continue
        etiquetas = [_nombre_corto(m.nombre) for m in materias]

        estudiantes_data = []
        for e in estudiantes_por_curso.get(curso.id, []):
            nombre_full = f"{e.apellido_paterno} {e.apellido_materno} {e.nombre}".strip()
            notas: dict[str, list[Optional[int]]] = {}
            for materia, etiq in zip(materias, etiquetas):
                trimestres: list[Optional[int]] = []
                for trim in (1, 2, 3):
                    promedio_dims = promedios.get((e.id, materia.id, trim))
                    if not promedio_dims:
                        trimestres.append(None)
                        continue
                    nota = (
                        promedio_dims.get('ser', 0)
                        + promedio_dims.get('saber', 0)
                        + promedio_dims.get('hacer', 0)
                        + autoevals.get((e.id, materia.id, trim), 0)
                    )
                    trimestres.append(int(round(nota)))
                # Si los tres trimestres son None, dejar la lista vacía igual
                notas[etiq] = trimestres
            estudiantes_data.append({
                "nombre": nombre_full,
                "sexo":   "",
                "notas":  notas,
            })

        out.append({
            "nombre_hoja":   _hoja_de_curso(curso.grado, curso.paralelo),
            "curso_display": _curso_display(curso.grado, curso.paralelo),
            "asesor":        "",
            "materias":      etiquetas,
            "estudiantes":   estudiantes_data,
        })

    return out


def generar_centralizador_xlsx(gestion: int) -> BytesIO:
    """Construye los datos y devuelve un BytesIO con el .xlsx listo para enviar."""
    cursos = _construir_datos_cursos(gestion)
    buffer = BytesIO()
    _exportar_xlsx(cursos, buffer, gestion=gestion)
    buffer.seek(0)
    return buffer

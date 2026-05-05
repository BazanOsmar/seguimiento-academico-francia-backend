"""
Corrección de nombres de estudiantes — generado 2026-04-04
Fuente: analisis_nombres_estudiantes.md

CÓMO EJECUTAR (NO usar pipe '<', usar exec):
  python manage.py shell -c "exec(open('fix_nombres_estudiantes.py').read())"
"""
from backend.apps.academics.models import Curso
from backend.apps.students.models import Estudiante

GRADO_MAP = {
    '1RO': '1ro', '2DO': '2do', '3RO': '3ro',
    '4TO': '4to', '5TO': '5to', '6TO': '6to',
}

resultados = {'ok': 0, 'no_encontrado': 0, 'ya_existe': 0, 'error': 0}


def _get_curso(grado_key, paralelo):
    return Curso.objects.get(grado=GRADO_MAP[grado_key], paralelo=paralelo)


def update_student(grado_key, paralelo, old_ap, old_am, old_nom,
                   new_ap=None, new_am=None, new_nom=None):
    """Busca por curso + apellido_paterno + apellido_materno + nombre y actualiza."""
    try:
        curso = _get_curso(grado_key, paralelo)
    except Curso.DoesNotExist:
        print(f"  [ERROR CURSO] {grado_key} {paralelo}")
        resultados['error'] += 1
        return

    qs = Estudiante.objects.filter(
        curso=curso,
        apellido_paterno=old_ap,
        apellido_materno=old_am,
        nombre=old_nom,
    )
    if not qs.exists():
        print(f"  [NO ENCONTRADO] {grado_key} {paralelo} — {old_ap} {old_am} / {old_nom}")
        resultados['no_encontrado'] += 1
        return

    e = qs.first()
    if new_ap is not None:
        e.apellido_paterno = new_ap
    if new_am is not None:
        e.apellido_materno = new_am
    if new_nom is not None:
        e.nombre = new_nom
    e.save()
    print(f"  [OK] id={e.id} → {e.apellido_paterno} {e.apellido_materno} / {e.nombre}")
    resultados['ok'] += 1


def update_student_by_ap(grado_key, paralelo, old_ap,
                         new_ap=None, new_am=None, new_nom=None):
    """
    Busca solo por curso + apellido_paterno.
    Usar cuando el apellido_materno puede estar mal almacenado (ej: apellido compuesto).
    Falla si hay más de un estudiante con ese apellido_paterno en el curso.
    """
    try:
        curso = _get_curso(grado_key, paralelo)
    except Curso.DoesNotExist:
        print(f"  [ERROR CURSO] {grado_key} {paralelo}")
        resultados['error'] += 1
        return

    qs = Estudiante.objects.filter(curso=curso, apellido_paterno=old_ap)
    count = qs.count()

    if count == 0:
        print(f"  [NO ENCONTRADO] {grado_key} {paralelo} — {old_ap}")
        resultados['no_encontrado'] += 1
        return
    if count > 1:
        print(f"  [AMBIGUO] {grado_key} {paralelo} — {old_ap} tiene {count} coincidencias, corregir manualmente")
        resultados['error'] += 1
        return

    e = qs.first()
    if new_ap is not None:
        e.apellido_paterno = new_ap
    if new_am is not None:
        e.apellido_materno = new_am
    if new_nom is not None:
        e.nombre = new_nom
    e.save()
    print(f"  [OK] id={e.id} → {e.apellido_paterno} {e.apellido_materno} / {e.nombre}")
    resultados['ok'] += 1


def inactivar(grado_key, paralelo, ap, am, nom):
    try:
        curso = _get_curso(grado_key, paralelo)
    except Curso.DoesNotExist:
        print(f"  [ERROR CURSO] {grado_key} {paralelo}")
        resultados['error'] += 1
        return

    qs = Estudiante.objects.filter(
        curso=curso, apellido_paterno=ap, apellido_materno=am, nombre=nom
    )
    if not qs.exists():
        print(f"  [NO ENCONTRADO] {grado_key} {paralelo} — {ap} {am} / {nom}")
        resultados['no_encontrado'] += 1
        return

    e = qs.first()
    e.activo = False
    e.save()
    print(f"  [INACTIVADO] id={e.id} → {e.apellido_paterno} {e.apellido_materno} / {e.nombre}")
    resultados['ok'] += 1


def crear(grado_key, paralelo, ap, am, nom):
    try:
        curso = _get_curso(grado_key, paralelo)
    except Curso.DoesNotExist:
        print(f"  [ERROR CURSO] {grado_key} {paralelo}")
        resultados['error'] += 1
        return

    if Estudiante.objects.filter(curso=curso, apellido_paterno=ap, apellido_materno=am, nombre=nom).exists():
        print(f"  [YA EXISTE] {grado_key} {paralelo} — {ap} {am} / {nom}")
        resultados['ya_existe'] += 1
        return

    e = Estudiante.objects.create(
        curso=curso,
        apellido_paterno=ap,
        apellido_materno=am,
        nombre=nom,
        activo=True,
    )
    print(f"  [CREADO] id={e.id} → {e.apellido_paterno} {e.apellido_materno} / {e.nombre}")
    resultados['ok'] += 1


# ─── ACTUALIZACIONES ────────────────────────────────────────────────────────
print("\n=== ACTUALIZACIONES ===")

# 1ro A
update_student('1RO', 'A', 'RODRIGUEZ', 'MANICO', 'DANIEL FELIZ',  new_nom='DANIEL FELIX')
update_student('1RO', 'A', 'LOPEZ',     'SALINAS', 'SEBASTIAN ABDUL', new_am='SALINA')

# 1ro B
update_student('1RO', 'B', 'ALCON',  'VEGA',     'KIM LUKA THELI',     new_nom='KIM LUCA THELI')
update_student('1RO', 'B', 'CASAS',  'APAZA',    'JESSICA DANIELA',    new_nom='YESSICA DANIELA')
update_student('1RO', 'B', 'QUISPE', 'PERSONAL', 'ROLI JHEYCO',        new_am='PERSONA')

# 1ro C
update_student('1RO', 'C', 'ALLYON',    'CONDORI', 'YOHANA MAYTE',   new_ap='AYLLON')
update_student('1RO', 'C', 'CHAO',      'MAMANI',  'KEIDY ANIGAIL',  new_nom='KEYDI ABIGAIL')
update_student('1RO', 'C', 'MOLLISACA', 'LIMACHI', 'CIRSTIAN RAY',   new_nom='CRISTIAN RAY')
update_student('1RO', 'C', 'FERMANDEZ', 'PLATA',   'EMANUEL',        new_ap='FERNANDEZ')

# 3ro A
update_student('3RO', 'A', 'COAJERA',      'ANAHUA', 'DARWIN',         new_am='ANAGUA')
update_student('3RO', 'A', 'ESTRELLA',     'RAMOS',  'ANGEL LEONARDO', new_ap='ESPRELLA')
update_student('3RO', 'A', 'HERBAS',       'ESCOBAR','WARA',           new_ap='HERVAS')
update_student('3RO', 'A', 'VILLAVICENSION','LARA',  'CARLA CIELO',    new_ap='VILLAVICENCIO')

# 3ro B
update_student('3RO', 'B', 'CHOVILLCA',  'ARFITA',   'GRETEL MONZERATH',  new_ap='CHOQUEVILLCA')
update_student('3RO', 'B', 'MACHICADO',  'APAZA',    'CARLA JAZMIN',      new_nom='CARLA JHASMIN')
update_student('3RO', 'B', 'QUISPE',     'FLORES',   'LEONARDO RICHARD',  new_nom='LEONARD RICHARD')
update_student('3RO', 'B', 'ROCHA',      'GUACHALLA','DAVID EMANUEL',     new_nom='DEYVID EMANUEL')

# 3ro C
update_student('3RO', 'C', 'ALIAGA',  'QUISPE', 'AARON DEYMAR',       new_nom='AARON DEYNAR')
update_student('3RO', 'C', 'CHAVEZ',  'PAMURI', 'ADALIDYASER',        new_nom='ADALID YASER')
update_student('3RO', 'C', 'KAPA',    'HULURI', 'SAYURI ARACELY',     new_nom='SAYURI ARCELY')
update_student('3RO', 'C', 'PALLUCA', 'LLAVES', 'AIDA ADA',           new_nom='AIDE ADA')
update_student('3RO', 'C', 'QUISPE',  'APAZA',  'ABIGAIL LISANDRO',   new_nom='ABIGAIL LISANDRA')
update_student('3RO', 'C', 'RAMOS',   'ZAPANA', 'ZARAHI YHULIANA',    new_nom='ZAHIRA YHULIANA')

# 5to A
update_student('5TO', 'A', 'BRANEZ',   'MENDOZA',    'CRISTOFHER ALEXANDER', new_ap='BRAÑEZ', new_nom='CRISTOPHER ALEXANDER')
update_student('5TO', 'A', 'CALSINA',  'QUENALLATA', 'OLIVER',               new_nom='OLVER')
update_student('5TO', 'A', 'CESPEDES', 'URIA',       'KATERINE ALEJANDRA',   new_nom='KATERIN ALEJANDRA')
update_student('5TO', 'A', 'MILLAN',   'CABRERA',    'ENRRIQUE ALEJANDRO',   new_nom='ENRIQUE ALEJANDRO')
update_student('5TO', 'A', 'POMA',     'FUENTES',    'DYLAN JHOAO',          new_am='FERNANDEZ')

# 5to B
update_student('5TO', 'B', 'CONDORI', 'CHAVEZ', 'GABRIELA SOLEDAD', new_nom='GABRIELA SOLEDADE')

# 5to C
update_student('5TO', 'C', 'CALLE',   'HURTADO',  'MATIAS JHONATAN',    new_nom='MATIAS JONATHAN')
update_student('5TO', 'C', 'CONDORI', 'CASILLA',  'JOSUE DANI ALEX',    new_nom='JOSUE DANNY ALEX')
update_student('5TO', 'C', 'CONDORI', 'CHUI',     'MARYA ANTONIA',      new_nom='MARY ANTONIA')
update_student('5TO', 'C', 'FLORES',  'VALLEJOS', 'ILUSES MARIO',       new_nom='ULISES MARIO')
update_student('5TO', 'C', 'HILAYA',  'CHOQUE',   'LIA AORIANA',        new_nom='LIA ORIANA')
update_student('5TO', 'C', 'HURTADO', 'VALDES',   'ANTONY CRISTOFER',   new_am='VALDEZ', new_nom='ANTONNY CRISTHOPER')
update_student('5TO', 'C', 'MAMANI',  'MENDOZA',  'ISAC SACARIAS',      new_nom='ISAAC ZACARIAS')
update_student('5TO', 'C', 'RIVERO',  'CHAVEZ',   'EDMAR JOEL',         new_nom='EDMAR JHOEL')

# 5to D
update_student('5TO', 'D', 'ALLASI',   'CONDORI', 'GISELA',         new_nom='GUISELA')
update_student('5TO', 'D', 'CHIPANA',  'GUTIERREZ','MARIELIDY',     new_nom='MARILEYDI')
update_student('5TO', 'D', 'LIMACHI',  'MENDOZA', 'SHEYLA ARACELI', new_nom='SHEYLA ARACELY')
update_student('5TO', 'D', 'PAREDES',  'CHOQUE',  'EYLIN BRITANY',  new_ap='PAREDEZ', new_nom='EYLIN BRITNY')
update_student('5TO', 'D', 'QUISBERT', 'BLANCO',  'SCARLET VENUS',  new_nom='SCARLETT VENUS')
update_student('5TO', 'D', 'TICONA',   'WILLIAM', 'TOMY',           new_am='WILLYAM', new_nom='THOMY')

# 5to D — LAZARTE con apellido_materno compuesto "DE LA BARRA"
# Se busca solo por apellido_paterno porque puede estar mal almacenado en distintos entornos
update_student_by_ap('5TO', 'D', 'LAZARTE',
                     new_am='DE LA BARRA', new_nom='FERNANDA VALENTINA')

# ─── INACTIVAR ───────────────────────────────────────────────────────────────
print("\n=== INACTIVAR ===")
inactivar('1RO', 'C', 'ROMERO',  'MAMANI',  'ALEJANDRO')
inactivar('2DO', 'B', 'ALBORTA', 'CORDERO', 'CIELO')

# ─── CREAR ───────────────────────────────────────────────────────────────────
print("\n=== CREAR ===")
crear('2DO', 'B', 'CHURA',    'QUISPE',   'RACHEL MAYTE')
crear('2DO', 'B', 'CORTEZ',   'QUISPE',   'JUDIT DAYANA')
crear('3RO', 'C', 'HUANCA',   'COPA',     'ARACELI JAZMIN')
crear('4TO', 'C', 'HUANCA',   'YUJRA',    'JUAN JOSE')
crear('5TO', 'A', 'SAJAMA',   'HUANCA',   'HEYDY MARISOL')
crear('5TO', 'B', 'RAMOS',    'MAMANI',   'IVETTE JHETMIRA')
crear('5TO', 'B', 'YANA',     'QUISPE',   'ELIZABETH')
crear('6TO', 'A', 'VALVERDE', 'QUISBERT', 'JESUS JULIAN')
crear('6TO', 'D', 'HUAYTA',   'JIMENEZ',  'ADRIAN JOSUE')

# ─── RESUMEN ─────────────────────────────────────────────────────────────────
print(f"""
=== RESUMEN ===
  OK            : {resultados['ok']}
  No encontrados: {resultados['no_encontrado']}
  Ya existían   : {resultados['ya_existe']}
  Errores       : {resultados['error']}
""")

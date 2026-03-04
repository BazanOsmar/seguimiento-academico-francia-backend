from datetime import datetime

from django.http import JsonResponse
from django.shortcuts import render, get_object_or_404


def login_view(request):
    return render(request, 'auth/login.html')


def page_not_found_view(request, exception=None):
    return render(request, '404.html', status=404)


def director_view(request):
    return render(request, 'director/dashboard.html')


def director_estudiantes_view(request):
    return render(request, 'director/estudiantes.html')


def director_curso_estudiantes_view(request, curso_id):
    from backend.apps.academics.models import Curso
    curso = get_object_or_404(Curso, pk=curso_id)
    return render(request, 'director/curso_estudiantes.html', {
        'curso_id': curso_id,
        'curso_nombre': f"{curso.grado} {curso.paralelo}",
    })


def director_perfil_estudiante_view(request, curso_id, estudiante_id):
    return render(request, 'director/perfil_estudiante.html', {
        'curso_id': curso_id,
        'estudiante_id': estudiante_id,
    })


def director_usuarios_view(request):
    return render(request, 'director/usuarios.html')


def director_perfil_usuario_view(request, user_id):
    return render(request, 'director/perfil_usuario.html', {'user_id': user_id})


def director_asistencia_view(request):
    return render(request, 'director/asistencia.html')


def _autenticar_por_token(request):
    """Valida JWT desde query param ?token= o header Authorization: Bearer."""
    from rest_framework_simplejwt.tokens import AccessToken
    from backend.apps.users.models import User

    # 1. Intentar desde query param
    raw = request.GET.get('token', '').strip()
    # 2. Fallback: header Authorization (para fetchAPI del frontend web)
    if not raw:
        auth = request.META.get('HTTP_AUTHORIZATION', '')
        if auth.startswith('Bearer '):
            raw = auth[7:].strip()
    if not raw:
        return None
    try:
        validated = AccessToken(raw)
        return User.objects.select_related('tipo_usuario').get(pk=validated['user_id'])
    except Exception:
        return None


_ESTADO_LETRA = {'PRESENTE': 'P', 'FALTA': 'F', 'ATRASO': 'A', 'LICENCIA': 'L'}
_DIAS_ES = ['Lunes', 'Martes', 'Miércoles', 'Jueves', 'Viernes', 'Sábado', 'Domingo']
_MESES_ES = [
    '', 'Enero', 'Febrero', 'Marzo', 'Abril', 'Mayo', 'Junio',
    'Julio', 'Agosto', 'Septiembre', 'Octubre', 'Noviembre', 'Diciembre',
]


def director_asistencia_exportar_view(request):
    import calendar
    from datetime import date
    from backend.apps.academics.models import Curso
    from backend.apps.attendance.models import AsistenciaSesion, Asistencia
    from backend.apps.students.models import Estudiante

    # ── Autenticación: token JWT en query param ──────────────────
    user = _autenticar_por_token(request)
    if not user or not user.tipo_usuario or user.tipo_usuario.nombre not in ('Director', 'Regente'):
        return JsonResponse({'errores': 'No autorizado.'}, status=403)

    curso_id = request.GET.get('curso_id', '').strip()
    mes_param = request.GET.get('mes', '').strip()  # formato YYYY-MM
    fecha_desde = request.GET.get('fecha_desde', '').strip()
    fecha_hasta = request.GET.get('fecha_hasta', '').strip()

    # Soportar tanto ?mes=YYYY-MM como ?fecha_desde=...&fecha_hasta=...
    if mes_param and not fecha_desde:
        fecha_desde = f"{mes_param}-01"
        try:
            parts = mes_param.split('-')
            y, m = int(parts[0]), int(parts[1])
            _, ld = calendar.monthrange(y, m)
            fecha_hasta = f"{mes_param}-{str(ld).zfill(2)}"
        except (ValueError, IndexError):
            fecha_hasta = fecha_desde

    if not fecha_hasta:
        fecha_hasta = fecha_desde

    ctx = {
        'error': None,
        'curso': None,
        'mes_display': '',
        'dias_habiles': [],
        'estudiantes': [],
        'generado_en': datetime.now().strftime('%d/%m/%Y %H:%M'),
    }

    if not curso_id or not fecha_desde:
        ctx['error'] = 'Faltan parámetros: se requiere curso y mes.'
        return render(request, 'director/asistencia_exportar.html', ctx)

    try:
        curso = Curso.objects.get(pk=int(curso_id))
    except (Curso.DoesNotExist, ValueError):
        ctx['error'] = 'Curso no encontrado.'
        return render(request, 'director/asistencia_exportar.html', ctx)

    # Modo verificación rápida
    if request.GET.get('check') == '1':
        from django.http import JsonResponse
        count = AsistenciaSesion.objects.filter(
            curso=curso, fecha__range=(fecha_desde, fecha_hasta)
        ).count()
        return JsonResponse({'tiene_datos': count > 0, 'total': count})

    # Parsear mes del rango
    try:
        parts = fecha_desde.split('-')
        year, month = int(parts[0]), int(parts[1])
    except (ValueError, IndexError):
        ctx['error'] = 'Formato de fecha inválido.'
        return render(request, 'director/asistencia_exportar.html', ctx)

    # Días hábiles (L-V)
    _, last_day = calendar.monthrange(year, month)
    dias_habiles = []
    for d in range(1, last_day + 1):
        dt = date(year, month, d)
        if dt.weekday() < 5:
            dias_habiles.append({
                'fecha': dt,
                'dia_nombre': _DIAS_ES[dt.weekday()],
                'dia_num': str(d).zfill(2),
            })

    fecha_ini = date(year, month, 1)
    fecha_fin = date(year, month, last_day)

    # Estudiantes activos del curso
    estudiantes_qs = (
        Estudiante.objects
        .filter(curso=curso, activo=True)
        .order_by('apellidos', 'nombre')
    )

    # Asistencias del mes → mapa: estudiante_id → {fecha → letra}
    asistencias = (
        Asistencia.objects
        .filter(sesion__curso=curso, sesion__fecha__range=(fecha_ini, fecha_fin))
        .select_related('sesion')
    )
    mapa = {}
    for a in asistencias:
        mapa.setdefault(a.estudiante_id, {})[a.sesion.fecha] = _ESTADO_LETRA.get(a.estado, '')

    # Construir datos por estudiante
    estudiantes_data = []
    for i, est in enumerate(estudiantes_qs, 1):
        est_mapa = mapa.get(est.id, {})
        celdas = []
        resumen = {'presentes': 0, 'faltas': 0, 'atrasos': 0, 'licencias': 0}
        for dh in dias_habiles:
            letra = est_mapa.get(dh['fecha'], '')
            celdas.append(letra)
            if letra == 'P':
                resumen['presentes'] += 1
            elif letra == 'F':
                resumen['faltas'] += 1
            elif letra == 'A':
                resumen['atrasos'] += 1
            elif letra == 'L':
                resumen['licencias'] += 1

        estudiantes_data.append({
            'numero': i,
            'nombre': f"{est.apellidos}, {est.nombre}",
            'celdas': celdas,
            'resumen': resumen,
        })

    ctx.update({
        'curso': curso,
        'mes_display': f"{_MESES_ES[month]} {year}",
        'dias_habiles': dias_habiles,
        'estudiantes': estudiantes_data,
    })
    return render(request, 'director/asistencia_exportar.html', ctx)


def director_estadisticas_view(request):
    return render(request, 'director/estadisticas.html')


def director_actividad_view(request):
    return render(request, 'director/actividad.html')


def director_comunicados_view(request):
    return render(request, 'director/comunicados.html')


def profesor_view(request):
    return render(request, 'profesor/dashboard.html')


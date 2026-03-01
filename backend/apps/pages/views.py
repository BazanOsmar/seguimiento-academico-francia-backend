from datetime import datetime

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


_ESTADO_LABEL = {
    'PRESENTE': 'Presente', 'FALTA': 'Falta',
    'ATRASO': 'Atraso', 'LICENCIA': 'Licencia',
}
_DIAS_ES = ['Lunes', 'Martes', 'Miércoles', 'Jueves', 'Viernes', 'Sábado', 'Domingo']


def director_asistencia_exportar_view(request):
    from django.db.models import Prefetch
    from backend.apps.academics.models import Curso
    from backend.apps.attendance.models import AsistenciaSesion, Asistencia

    curso_id    = request.GET.get('curso_id', '').strip()
    fecha_desde = request.GET.get('fecha_desde', '').strip()
    fecha_hasta = request.GET.get('fecha_hasta', '').strip() or fecha_desde

    def _fmt(s):
        try:
            y, m, d = s.split('-')
            return f"{d}/{m}/{y}"
        except Exception:
            return s

    ctx = {
        'error': None,
        'sesiones_data': [],
        'curso': None,
        'fecha_desde_fmt': _fmt(fecha_desde),
        'fecha_hasta_fmt': _fmt(fecha_hasta),
        'rango_unico': fecha_desde == fecha_hasta,
        'generado_en': datetime.now().strftime('%d/%m/%Y %H:%M'),
    }

    if not curso_id or not fecha_desde:
        ctx['error'] = 'Faltan parámetros: se requiere curso y fecha de inicio.'
        return render(request, 'director/asistencia_exportar.html', ctx)

    try:
        curso = Curso.objects.get(pk=int(curso_id))
    except (Curso.DoesNotExist, ValueError):
        ctx['error'] = 'Curso no encontrado.'
        return render(request, 'director/asistencia_exportar.html', ctx)

    # Modo verificación: solo devuelve si hay datos, sin renderizar HTML
    if request.GET.get('check') == '1':
        from django.http import JsonResponse
        count = AsistenciaSesion.objects.filter(
            curso=curso, fecha__range=(fecha_desde, fecha_hasta)
        ).count()
        return JsonResponse({'tiene_datos': count > 0, 'total': count})

    sesiones = (
        AsistenciaSesion.objects
        .filter(curso=curso, fecha__range=(fecha_desde, fecha_hasta))
        .prefetch_related(
            Prefetch(
                'asistencias',
                queryset=Asistencia.objects
                    .select_related('estudiante')
                    .order_by('estudiante__apellidos', 'estudiante__nombre'),
            )
        )
        .order_by('fecha')
    )

    sesiones_data = []
    for sesion in sesiones:
        asts = list(sesion.asistencias.all())
        sesiones_data.append({
            'fecha_display': sesion.fecha.strftime('%d/%m/%Y'),
            'dia_semana': _DIAS_ES[sesion.fecha.weekday()],
            'asistencias': [
                {
                    'numero': i + 1,
                    'nombre': f"{a.estudiante.apellidos}, {a.estudiante.nombre}",
                    'estado': _ESTADO_LABEL.get(a.estado, a.estado),
                    'estado_cls': a.estado.lower(),
                    'hora': a.hora.strftime('%H:%M'),
                }
                for i, a in enumerate(asts)
            ],
            'resumen': {
                'total':    len(asts),
                'presente': sum(1 for a in asts if a.estado == 'PRESENTE'),
                'falta':    sum(1 for a in asts if a.estado == 'FALTA'),
                'atraso':   sum(1 for a in asts if a.estado == 'ATRASO'),
                'licencia': sum(1 for a in asts if a.estado == 'LICENCIA'),
            },
        })

    ctx.update({'curso': curso, 'sesiones_data': sesiones_data})
    return render(request, 'director/asistencia_exportar.html', ctx)


def director_estadisticas_view(request):
    return render(request, 'director/estadisticas.html')


def director_actividad_view(request):
    return render(request, 'director/actividad.html')


def director_comunicados_view(request):
    return render(request, 'director/comunicados.html')


def profesor_view(request):
    return render(request, 'profesor/dashboard.html')


from collections import defaultdict

from django.utils import timezone
from rest_framework.views import APIView
from rest_framework.response import Response
from rest_framework import status

from backend.core.permissions import IsDirector
from rest_framework.permissions import IsAuthenticated
from django.db.models import Count

from ..models import ProfesorCurso, ProfesorPlan
from ..services.notas_mongo_service import (
    cursos_con_notas_mes,
    hay_notas_mes,
    obtener_cambios_notas_mes,
    obtener_notas_mes,
    todos_pc_con_notas_mes,
)

_MESES = ['', 'Enero', 'Febrero', 'Marzo', 'Abril', 'Mayo', 'Junio',
          'Julio', 'Agosto', 'Septiembre', 'Octubre', 'Noviembre', 'Diciembre']


class DirectorResumenNotasMesView(APIView):
    """
    GET /api/academics/director/resumen-notas-mes/?mes=X

    Devuelve todos los profesores con sus cursos asignados y el estado de
    carga de notas para el mes indicado.

    Respuesta:
    {
        "mes": 4,
        "gestion": 2026,
        "profesores": [
            {
                "id": 1,
                "nombre": "Juan Pérez",
                "username": "jperez",
                "iniciales": "JP",
                "total_cursos": 3,
                "cursos_con_notas": 2,
                "cursos": [
                    {
                        "curso_id": 5,
                        "curso_nombre": "3ro \"A\"",
                        "tiene_notas": true,
                        "pc_ids_con_notas": [
                            {"pc_id": 12, "materia": "Matemáticas"}
                        ]
                    },
                    ...
                ]
            },
            ...
        ]
    }
    """
    permission_classes = [IsAuthenticated, IsDirector]

    def get(self, request):
        try:
            mes = int(request.query_params.get('mes', 0))
        except (ValueError, TypeError):
            mes = 0

        if not 1 <= mes <= 12:
            return Response({'errores': 'Mes inválido (1–12).'}, status=status.HTTP_400_BAD_REQUEST)

        gestion = timezone.now().year

        # Todas las asignaciones con info de profesor, curso y materia
        asignaciones = (
            ProfesorCurso.objects
            .select_related('profesor', 'curso', 'materia')
            .filter(profesor__tipo_usuario__nombre='Profesor', profesor__is_active=True)
            .order_by('profesor__last_name', 'profesor__first_name', 'curso__grado', 'curso__paralelo')
        )

        # Una sola consulta a MongoDB: ¿qué (profesor_id, curso_id) tienen notas?
        pares_con_notas = cursos_con_notas_mes(mes, gestion)

        # Agrupar por profesor → por curso
        profesores_meta = {}     # prof_id → dict con datos del profesor
        cursos_por_prof = defaultdict(dict)  # prof_id → { curso_id → dict }

        for asig in asignaciones:
            prof    = asig.profesor
            prof_id = prof.id

            if prof_id not in profesores_meta:
                nombre = f"{prof.first_name} {prof.last_name}".strip() or prof.username
                partes = nombre.split()
                iniciales = ''.join(p[0].upper() for p in partes[:2] if p)
                profesores_meta[prof_id] = {
                    'id':        prof_id,
                    'nombre':    nombre,
                    'username':  prof.username,
                    'iniciales': iniciales or '?',
                }

            curso_id    = asig.curso.id
            curso_nombre = f"{asig.curso.grado} \"{asig.curso.paralelo}\""

            if curso_id not in cursos_por_prof[prof_id]:
                cursos_por_prof[prof_id][curso_id] = {
                    'curso_id':         curso_id,
                    'curso_nombre':     curso_nombre,
                    'tiene_notas':      False,
                    'pc_ids_con_notas': [],
                }

            if (prof_id, curso_id) in pares_con_notas:
                cursos_por_prof[prof_id][curso_id]['tiene_notas'] = True
                cursos_por_prof[prof_id][curso_id]['pc_ids_con_notas'].append({
                    'pc_id':   asig.id,
                    'materia': asig.materia.nombre,
                })

        # Construir respuesta ordenada
        resultado = []
        for prof_id, prof_data in profesores_meta.items():
            cursos = sorted(
                cursos_por_prof[prof_id].values(),
                key=lambda c: c['curso_nombre'],
            )
            cursos_ok = sum(1 for c in cursos if c['tiene_notas'])
            resultado.append({
                **prof_data,
                'total_cursos':    len(cursos),
                'cursos_con_notas': cursos_ok,
                'cursos':          cursos,
            })

        return Response({'mes': mes, 'gestion': gestion, 'profesores': resultado})


class DirectorNotasMesDetalleView(APIView):
    """
    GET /api/academics/director/notas-mes-detalle/?pc_id=X&mes=Y

    Devuelve las notas cargadas de un ProfesorCurso para el mes indicado.
    Requiere permiso Director. No restringe al profesor dueño.

    Respuesta (notas presentes):
    {
        "ya_subidas": true,
        "headers_por_trim": { "1TRIM": { "saber": [...], "hacer": [...] } },
        "metadata": {
            "materia": "Matemáticas",
            "curso": "3ro \"A\"",
            "profesor": "Juan Pérez",
            "mes": 4,
            "mes_nombre": "Abril",
            "gestion": 2026
        }
    }
    """
    permission_classes = [IsAuthenticated, IsDirector]

    def get(self, request):
        try:
            pc_id = int(request.query_params.get('pc_id', 0))
            mes   = int(request.query_params.get('mes', 0))
        except (ValueError, TypeError):
            return Response({'errores': 'Parámetros inválidos.'}, status=status.HTTP_400_BAD_REQUEST)

        if not pc_id or not 1 <= mes <= 12:
            return Response({'errores': 'Parámetros inválidos.'}, status=status.HTTP_400_BAD_REQUEST)

        try:
            pc = ProfesorCurso.objects.select_related('profesor', 'materia', 'curso').get(pk=pc_id)
        except ProfesorCurso.DoesNotExist:
            return Response({'errores': 'Asignación no encontrada.'}, status=status.HTTP_404_NOT_FOUND)

        gestion = timezone.now().year

        if not hay_notas_mes(pc.materia.id, pc.curso.id, pc.profesor.id, mes, gestion):
            return Response({'ya_subidas': False})

        headers_por_trim = obtener_notas_mes(
            pc.materia.id, pc.curso.id, pc.profesor.id, mes, gestion
        )
        cambios_notas = obtener_cambios_notas_mes(
            pc.materia.id, pc.curso.id, pc.profesor.id, mes, gestion
        )

        nombre_prof = f"{pc.profesor.first_name} {pc.profesor.last_name}".strip() or pc.profesor.username

        return Response({
            'ya_subidas':      True,
            'headers_por_trim': headers_por_trim,
            'cambios_notas':    cambios_notas,
            'metadata': {
                'materia':    pc.materia.nombre,
                'curso':      f"{pc.curso.grado} \"{pc.curso.paralelo}\"",
                'profesor':   nombre_prof,
                'mes':        mes,
                'mes_nombre': _MESES[mes] if 1 <= mes <= 12 else str(mes),
                'gestion':    gestion,
            },
        })


class DirectorSeguimientoProfesoresView(APIView):
    """
    GET /api/academics/director/seguimiento-profesores/?mes=X

    Devuelve todos los profesores con:
    - cursos_asignados: total de ProfesorCurso (no depende del mes)
    - notas_cargadas:   cuántos ProfesorCurso tienen notas subidas en MongoDB ese mes
    - planes_completos: cuántos ProfesorCurso tienen 4 planes de trabajo ese mes

    Permiso: solo Director. 3 queries totales (1 SQL asignaciones, 1 SQL planes, 1 Mongo).
    """
    permission_classes = [IsAuthenticated, IsDirector]

    def get(self, request):
        try:
            mes = int(request.query_params.get('mes', 0))
        except (ValueError, TypeError):
            mes = 0

        if not 1 <= mes <= 12:
            return Response({'errores': 'Mes inválido (1–12).'}, status=status.HTTP_400_BAD_REQUEST)

        gestion = timezone.now().year

        # 1. Todas las asignaciones de profesores
        asignaciones = list(
            ProfesorCurso.objects
            .select_related('profesor', 'curso', 'materia')
            .filter(profesor__tipo_usuario__nombre='Profesor', profesor__is_active=True)
            .order_by('profesor__last_name', 'profesor__first_name')
        )

        # 2. ProfesorCurso IDs con 4+ planes ese mes (una query SQL con anotación)
        pc_ids_planes_ok = set(
            ProfesorPlan.objects
            .filter(mes=mes, eliminado=False)
            .values('profesor_curso_id')
            .annotate(total=Count('id'))
            .filter(total__gte=4)
            .values_list('profesor_curso_id', flat=True)
        )

        # 3. (profesor_id, materia_id, curso_id) con notas en Mongo ese mes
        pares_con_notas = todos_pc_con_notas_mes(mes, gestion)

        # Agrupar por profesor
        profesores: dict = {}
        for pc in asignaciones:
            prof_id = pc.profesor.id
            if prof_id not in profesores:
                nombre = f"{pc.profesor.first_name} {pc.profesor.last_name}".strip() or pc.profesor.username
                profesores[prof_id] = {
                    'id':               prof_id,
                    'nombre':           nombre,
                    'username':         pc.profesor.username,
                    'cursos_asignados': 0,
                    'notas_cargadas':   0,
                    'planes_completos': 0,
                }

            profesores[prof_id]['cursos_asignados'] += 1

            if (pc.profesor_id, pc.materia_id, pc.curso_id) in pares_con_notas:
                profesores[prof_id]['notas_cargadas'] += 1

            if pc.id in pc_ids_planes_ok:
                profesores[prof_id]['planes_completos'] += 1

        return Response({
            'mes':        mes,
            'gestion':    gestion,
            'profesores': list(profesores.values()),
        })

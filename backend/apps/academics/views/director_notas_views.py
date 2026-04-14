from collections import defaultdict

from django.utils import timezone
from rest_framework.views import APIView
from rest_framework.response import Response
from rest_framework import status

from backend.core.permissions import IsDirector
from rest_framework.permissions import IsAuthenticated
from ..models import ProfesorCurso
from ..services.notas_mongo_service import (
    cursos_con_notas_mes,
    hay_notas_mes,
    obtener_notas_mes,
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
            .filter(profesor__tipo_usuario__nombre='Profesor')
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

        nombre_prof = f"{pc.profesor.first_name} {pc.profesor.last_name}".strip() or pc.profesor.username

        return Response({
            'ya_subidas':      True,
            'headers_por_trim': headers_por_trim,
            'metadata': {
                'materia':    pc.materia.nombre,
                'curso':      f"{pc.curso.grado} \"{pc.curso.paralelo}\"",
                'profesor':   nombre_prof,
                'mes':        mes,
                'mes_nombre': _MESES[mes] if 1 <= mes <= 12 else str(mes),
                'gestion':    gestion,
            },
        })

from django.db.models import Count
from rest_framework.generics import ListAPIView
from rest_framework.views import APIView
from rest_framework.response import Response
from rest_framework.permissions import IsAuthenticated
from rest_framework import status

from backend.apps.users.permissions import IsDirectorOrRegente, IsProfesor, IsDirector
from .models import Curso, Materia, ProfesorCurso, PlanDeTrabajo, ProfesorPlan
from .serializers import CursoSerializer, MateriaSerializer, AsignacionSerializer, ProfesorPlanSerializer


class CursoListView(ListAPIView):
    """
    Endpoint que permite obtener el listado de cursos
    (aulas) registrados en la institución, con conteo de estudiantes.
    """

    serializer_class = CursoSerializer
    permission_classes = (IsAuthenticated, IsDirectorOrRegente)

    def get_queryset(self):
        return (
            Curso.objects
            .annotate(estudiantes_count=Count('estudiante'))
            .order_by('grado', 'paralelo')
        )


class ProfesorCursosView(APIView):
    """
    GET /api/academics/profesor/cursos/

    Retorna los cursos asignados al profesor autenticado.
    Permiso: solo Profesor.
    """

    permission_classes = [IsAuthenticated, IsProfesor]

    def get(self, request):
        cursos = (
            ProfesorCurso.objects
            .filter(profesor=request.user)
            .select_related('curso')
            .values('curso__id', 'curso__grado', 'curso__paralelo')
            .distinct()
            .order_by('curso__grado', 'curso__paralelo')
        )
        data = [
            {"id": c['curso__id'], "grado": c['curso__grado'], "paralelo": c['curso__paralelo']}
            for c in cursos
        ]
        return Response(data)


class MateriaListCreateView(APIView):
    """
    GET  /api/academics/materias/  — lista todas las materias (IsDirector)
    POST /api/academics/materias/  — crea una nueva materia (IsDirector)
    """

    permission_classes = [IsAuthenticated, IsDirector]

    def get(self, request):
        materias = Materia.objects.all().order_by('nombre')
        return Response(MateriaSerializer(materias, many=True).data)

    def post(self, request):
        serializer = MateriaSerializer(data=request.data)
        if not serializer.is_valid():
            return Response(serializer.errors, status=status.HTTP_400_BAD_REQUEST)
        nombre = serializer.validated_data['nombre'].strip()
        if Materia.objects.filter(nombre__iexact=nombre).exists():
            return Response({"errores": "Ya existe una materia con ese nombre."}, status=status.HTTP_400_BAD_REQUEST)
        materia = serializer.save(nombre=nombre)
        return Response(MateriaSerializer(materia).data, status=status.HTTP_201_CREATED)


class MateriaDetailView(APIView):
    """
    DELETE /api/academics/materias/{id}/  — elimina una materia (IsDirector)
    """

    permission_classes = [IsAuthenticated, IsDirector]

    def delete(self, request, materia_id):
        try:
            materia = Materia.objects.get(pk=materia_id)
        except Materia.DoesNotExist:
            return Response({"errores": "Materia no encontrada."}, status=status.HTTP_404_NOT_FOUND)

        if ProfesorCurso.objects.filter(materia=materia).exists():
            return Response(
                {"errores": "No se puede eliminar: la materia tiene asignaciones activas."},
                status=status.HTTP_400_BAD_REQUEST,
            )
        materia.delete()
        return Response(status=status.HTTP_204_NO_CONTENT)


class MateriasXCursoView(APIView):
    """
    GET /api/academics/cursos/{curso_id}/materias/

    Devuelve las materias asignadas a un curso con el nombre del profesor.
    Permiso: Director o Regente.
    """
    permission_classes = [IsAuthenticated, IsDirectorOrRegente]

    def get(self, request, curso_id):
        from django.shortcuts import get_object_or_404
        from .models import Curso
        get_object_or_404(Curso, pk=curso_id)

        qs = (
            ProfesorCurso.objects
            .filter(curso_id=curso_id)
            .select_related('materia', 'profesor')
            .order_by('materia__nombre')
        )
        data = [
            {
                'materia_id':   pc.materia.id,
                'materia':      pc.materia.nombre,
                'profesor_id':  pc.profesor.id,
                'profesor':     (f"{pc.profesor.first_name} {pc.profesor.last_name}".strip()
                                 or pc.profesor.username),
            }
            for pc in qs
        ]
        return Response(data)


class AsignacionListCreateView(APIView):
    """
    GET  /api/academics/asignaciones/  — lista todas las asignaciones Profesor-Curso-Materia (IsDirector)
    POST /api/academics/asignaciones/  — crea una nueva asignación (IsDirector)
    """

    permission_classes = [IsAuthenticated, IsDirector]

    def get(self, request):
        qs = (
            ProfesorCurso.objects
            .select_related('profesor', 'curso', 'materia')
            .order_by('curso__grado', 'curso__paralelo', 'materia__nombre')
        )
        return Response(AsignacionSerializer(qs, many=True).data)

    def post(self, request):
        serializer = AsignacionSerializer(data=request.data)
        if not serializer.is_valid():
            return Response(serializer.errors, status=status.HTTP_400_BAD_REQUEST)

        profesor = serializer.validated_data['profesor']
        curso    = serializer.validated_data['curso']
        materia  = serializer.validated_data['materia']

        tipo = getattr(profesor.tipo_usuario, 'nombre', None)
        if tipo != 'Profesor':
            return Response({"errores": "El usuario seleccionado no es un Profesor."}, status=status.HTTP_400_BAD_REQUEST)

        if ProfesorCurso.objects.filter(profesor=profesor, curso=curso, materia=materia).exists():
            return Response({"errores": "Esta asignación ya existe."}, status=status.HTTP_400_BAD_REQUEST)

        asignacion = serializer.save()
        return Response(AsignacionSerializer(asignacion).data, status=status.HTTP_201_CREATED)


class ProfesorPlanListCreateView(APIView):
    """
    GET  /api/academics/profesor/planes/?mes=N  — planes del mes (1-12) del profesor autenticado
    POST /api/academics/profesor/planes/        — registra un nuevo plan (máx. 4 por mes)
    """

    permission_classes = [IsAuthenticated, IsProfesor]

    def get(self, request):
        mes = request.query_params.get('mes')
        qs  = ProfesorPlan.objects.filter(profesor=request.user).select_related('plan')
        if mes:
            try:
                mes = int(mes)
            except (ValueError, TypeError):
                return Response({'errores': 'El parámetro mes debe ser un número entre 1 y 12.'}, status=status.HTTP_400_BAD_REQUEST)
            qs = qs.filter(mes=mes)
        return Response(ProfesorPlanSerializer(qs.order_by('fecha_creacion'), many=True).data)

    def post(self, request):
        import calendar
        from datetime import date

        try:
            mes = int(request.data.get('mes', 0))
            if not (1 <= mes <= 12):
                raise ValueError
        except (ValueError, TypeError):
            return Response({'errores': 'El mes debe ser un número entre 1 y 12.'}, status=status.HTTP_400_BAD_REQUEST)

        try:
            semana = int(request.data.get('semana', 0))
            if not (1 <= semana <= 4):
                raise ValueError
        except (ValueError, TypeError):
            return Response({'errores': 'La semana debe ser un número entre 1 y 4.'}, status=status.HTTP_400_BAD_REQUEST)

        descripcion = (request.data.get('descripcion') or '').strip()
        if not descripcion:
            return Response({'errores': 'La descripción es requerida.'}, status=status.HTTP_400_BAD_REQUEST)

        año = date.today().year
        dias_en_mes = calendar.monthrange(año, mes)[1]
        rangos = {1: (1, 7), 2: (8, 14), 3: (15, 21), 4: (22, dias_en_mes)}
        inicio_dia, fin_dia = rangos[semana]
        fecha_inicio = date(año, mes, inicio_dia)
        fecha_fin    = date(año, mes, fin_dia)

        if ProfesorPlan.objects.filter(profesor=request.user, mes=mes, plan__fecha_inicio=fecha_inicio).exists():
            return Response({'errores': f'Ya tienes un plan registrado para la Semana {semana} de este mes.'}, status=status.HTTP_400_BAD_REQUEST)

        plan = PlanDeTrabajo.objects.create(descripcion=descripcion, fecha_inicio=fecha_inicio, fecha_fin=fecha_fin)
        pp   = ProfesorPlan.objects.create(profesor=request.user, plan=plan, mes=mes)
        return Response(ProfesorPlanSerializer(pp).data, status=status.HTTP_201_CREATED)


class ProfesorPlanDetailView(APIView):
    """
    DELETE /api/academics/profesor/planes/{plan_id}/  — elimina un plan del profesor autenticado
    """

    permission_classes = [IsAuthenticated, IsProfesor]

    def delete(self, request, plan_id):
        try:
            pp = ProfesorPlan.objects.select_related('plan').get(pk=plan_id, profesor=request.user)
        except ProfesorPlan.DoesNotExist:
            return Response({'errores': 'Plan no encontrado.'}, status=status.HTTP_404_NOT_FOUND)

        plan = pp.plan
        pp.delete()
        if not ProfesorPlan.objects.filter(plan=plan).exists():
            plan.delete()
        return Response(status=status.HTTP_204_NO_CONTENT)


class AsignacionDetailView(APIView):
    """
    DELETE /api/academics/asignaciones/{id}/  — elimina una asignación (IsDirector)
    """

    permission_classes = [IsAuthenticated, IsDirector]

    def delete(self, request, asignacion_id):
        try:
            asignacion = ProfesorCurso.objects.get(pk=asignacion_id)
        except ProfesorCurso.DoesNotExist:
            return Response({"errores": "Asignación no encontrada."}, status=status.HTTP_404_NOT_FOUND)
        asignacion.delete()
        return Response(status=status.HTTP_204_NO_CONTENT)

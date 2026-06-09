from django.utils import timezone
from rest_framework.views import APIView
from rest_framework.response import Response
from rest_framework.permissions import IsAuthenticated
from rest_framework import status

from backend.core.permissions import IsDirector, IsTutor
from backend.apps.academics.services.notas_mongo_service import _get_db
from backend.apps.students.models import Estudiante
from backend.apps.academics.models import Materia, Curso as CursoModel


class UltimoMesKMeansView(APIView):
    """GET /api/analytics/kmeans/ultimo-mes/?gestion=2026 — mes más reciente con predicciones K-Means."""
    permission_classes = [IsAuthenticated, IsDirector]

    def get(self, request):
        try:
            gestion = int(request.query_params.get('gestion', timezone.now().year))
        except (ValueError, TypeError):
            return Response({'errores': 'Parámetros inválidos.'}, status=status.HTTP_400_BAD_REQUEST)

        doc = _get_db()['predicciones'].find_one(
            {'gestion': gestion},
            sort=[('mes', -1)],
            projection={'mes': 1, '_id': 0},
        )
        return Response({'gestion': gestion, 'mes': doc['mes'] if doc else None})


class DetalleArbolView(APIView):
    """
    GET /api/analytics/arbol/detalle/
        ?estudiante_id=X&materia_id=Y&gestion=Z&mes=W

    Devuelve la predicción completa (incluye features usadas por el modelo)
    para un par (estudiante, materia) en el mes indicado.
    """
    permission_classes = [IsAuthenticated, IsDirector]

    def get(self, request):
        try:
            est_id  = int(request.query_params['estudiante_id'])
            mat_id  = int(request.query_params['materia_id'])
            gestion = int(request.query_params.get('gestion', timezone.now().year))
            mes     = int(request.query_params.get('mes',     timezone.now().month))
        except (KeyError, ValueError, TypeError):
            return Response({'errores': 'Parámetros inválidos.'}, status=status.HTTP_400_BAD_REQUEST)

        doc = _get_db()['predicciones_arbol'].find_one(
            {'estudiante_id': est_id, 'materia_id': mat_id, 'gestion': gestion, 'mes': mes},
            {'_id': 0},
        )
        if not doc:
            return Response({'errores': 'Predicción no encontrada.'}, status=status.HTTP_404_NOT_FOUND)

        est = Estudiante.objects.filter(id=est_id).select_related('curso').first()
        materia_nombre = Materia.objects.filter(id=mat_id).values_list('nombre', flat=True).first() or '—'

        nombre = (
            f"{est.apellido_paterno} {est.apellido_materno}, {est.nombre}".strip()
            if est else f'Estudiante {est_id}'
        )
        curso = f"{est.curso.grado} \"{est.curso.paralelo}\"" if est else '—'

        return Response({
            'estudiante_id':         est_id,
            'nombre':                nombre,
            'curso':                 curso,
            'materia':               materia_nombre,
            'riesgo':                doc.get('riesgo', ''),
            'probabilidad_reprobar': round(doc.get('probabilidad_reprobar', 0), 1),
            'prediccion':            doc.get('prediccion', 0),
            'modelo':                doc.get('modelo', 1),
            'features':              doc.get('features', {}),
            'fecha_analisis':        doc['fecha_analisis'].isoformat() if doc.get('fecha_analisis') else None,
        })


class UltimoMesArbolView(APIView):
    """GET /api/analytics/arbol/ultimo-mes/?gestion=2026 — mes más reciente con predicciones del árbol."""
    permission_classes = [IsAuthenticated, IsDirector]

    def get(self, request):
        try:
            gestion = int(request.query_params.get('gestion', timezone.now().year))
        except (ValueError, TypeError):
            return Response({'errores': 'Parámetros inválidos.'}, status=status.HTTP_400_BAD_REQUEST)

        doc = _get_db()['predicciones_arbol'].find_one(
            {'gestion': gestion},
            sort=[('mes', -1)],
            projection={'mes': 1, '_id': 0},
        )
        return Response({'gestion': gestion, 'mes': doc['mes'] if doc else None})


class EjecutarKMeansView(APIView):
    """
    POST /api/analytics/kmeans/ejecutar/

    Permite al Director lanzar K-Means manualmente para un mes dado.
    Útil si el trigger automático no se disparó o para re-ejecutar.

    Body: { "gestion": 2026, "mes": 5 }
    """
    permission_classes = [IsAuthenticated, IsDirector]

    def post(self, request):
        try:
            gestion = int(request.data.get('gestion', timezone.now().year))
            mes     = int(request.data.get('mes', timezone.now().month))
        except (ValueError, TypeError):
            return Response({'errores': 'Parámetros inválidos.'}, status=status.HTTP_400_BAD_REQUEST)

        if not 1 <= mes <= 12:
            return Response({'errores': 'Mes fuera de rango.'}, status=status.HTTP_400_BAD_REQUEST)

        from backend.apps.analytics.services.kmeans_service import ejecutar_analisis_kmeans
        resultado = ejecutar_analisis_kmeans(gestion=gestion, mes=mes)

        if resultado['estado'] == 'sin_datos':
            return Response(
                {'errores': 'No hay suficientes datos para ejecutar el análisis.'},
                status=status.HTTP_400_BAD_REQUEST,
            )

        return Response(resultado)


class ResultadosKMeansView(APIView):
    """
    GET /api/analytics/kmeans/resultados/?gestion=2026&mes=5

    Devuelve la lista completa de estudiantes con su cluster asignado
    y los valores de cada feature — para mostrar la tabla en el frontend.

    Respuesta:
    {
        "gestion": 2026,
        "mes": 5,
        "k": 4,
        "fecha_analisis": "...",
        "estudiantes": [
            {
                "estudiante_id": 15,
                "nombre": "Pérez, Juan",
                "curso": "1ro A",
                "cluster": "Riesgo Crítico",
                "features": {
                    "ser_pct": 0.35,
                    "saber_pct": 0.18,
                    "hacer_pct": 0.20,
                    "tasa_entrega_tareas": 0.15,
                    "promedio_examenes": 8.1,
                    "pct_asistencia": 0.52,
                    "pct_atrasos": 0.20,
                    "tendencia_norm": -0.46,
                    "tasa_citaciones": 0.67
                },
                "nota_mensual": 34.2
            },
            ...
        ]
    }
    """
    permission_classes = [IsAuthenticated, IsDirector]

    def get(self, request):
        try:
            gestion = int(request.query_params.get('gestion', timezone.now().year))
            mes     = int(request.query_params.get('mes', timezone.now().month))
        except (ValueError, TypeError):
            return Response({'errores': 'Parámetros inválidos.'}, status=status.HTTP_400_BAD_REQUEST)

        docs = list(
            _get_db()['predicciones'].find(
                {'gestion': gestion, 'mes': mes},
                {'_id': 0},
            )
        )

        if not docs:
            return Response({'gestion': gestion, 'mes': mes, 'k': None, 'estudiantes': []})

        # Enriquecer con nombre y curso desde SQL (una sola query)
        ids = [d['estudiante_id'] for d in docs]
        estudiantes_sql = {
            e.id: e for e in Estudiante.objects.filter(id__in=ids).select_related('curso')
        }

        fecha_analisis = None
        k = None
        lista = []

        for doc in docs:
            est = estudiantes_sql.get(doc['estudiante_id'])
            if not est:
                continue

            if fecha_analisis is None and doc.get('fecha_analisis'):
                fecha_analisis = doc['fecha_analisis'].isoformat()

            features = doc.get('features_usadas', {})
            lista.append({
                'estudiante_id':  doc['estudiante_id'],
                'nombre':         f"{est.apellido_paterno} {est.apellido_materno}, {est.nombre}".strip(),
                'curso':          f"{est.curso.grado} \"{est.curso.paralelo}\"",
                'cluster':        doc.get('cluster', ''),
                'nota_mensual':   round(doc.get('nota_mensual', 0), 1),
                'pca_x':         round(doc.get('pca_x', 0), 4),
                'pca_y':         round(doc.get('pca_y', 0), 4),
                'features': {
                    'ser_pct':             round(features.get('ser_pct', 0) * 100, 1),
                    'saber_pct':           round(features.get('saber_pct', 0) * 100, 1),
                    'hacer_pct':           round(features.get('hacer_pct', 0) * 100, 1),
                    'tasa_entrega_tareas': round(features.get('tasa_entrega_tareas', 0) * 100, 1),
                    'promedio_examenes':   round(features.get('promedio_examenes_pct', 0) * 100, 1),
                    'pct_asistencia':      round(features.get('pct_asistencia', 0) * 100, 1),
                    'pct_atrasos':         round(features.get('pct_atrasos', 0) * 100, 1),
                    'tendencia_norm':      round(features.get('tendencia_norm', 0), 3),
                    'tasa_citaciones':     round(features.get('tasa_citaciones', 0) * 100, 1),
                },
            })

        # k = número de clusters distintos en los resultados
        k_val = _get_db()['config'].find_one({'_id': f'kmeans_k_{gestion}'})
        k = k_val['valor'] if k_val else len({d['cluster'] for d in docs if d.get('cluster')})

        # Ordenar: primero Riesgo Crítico, luego por nota ascendente
        orden_cluster = {label: i for i, label in enumerate(reversed([
            'Excelente', 'Muy Bien', 'Satisfactorio', 'En Desarrollo', 'Requiere Apoyo',
            'Riesgo Crítico', 'Riesgo Académico', 'Rendimiento Adecuado',
        ]))}
        lista.sort(key=lambda x: (orden_cluster.get(x['cluster'], 99), x['nota_mensual']))

        return Response({
            'gestion':        gestion,
            'mes':            mes,
            'k':              k,
            'fecha_analisis': fecha_analisis,
            'estudiantes':    lista,
        })


class ResultadosArbolView(APIView):
    """
    GET /api/analytics/arbol/resultados/?gestion=2026&mes=5&page=1&page_size=20
                                         &curso_id=&materia_id=&riesgo=

    Devuelve predicciones del árbol de decisión por (estudiante, materia).
    Soporta paginación server-side y filtros por curso, materia y nivel de riesgo.
    """
    permission_classes = [IsAuthenticated, IsDirector]

    def get(self, request):
        try:
            gestion   = int(request.query_params.get('gestion', timezone.now().year))
            mes       = int(request.query_params.get('mes', timezone.now().month))
            page      = max(1, int(request.query_params.get('page', 1)))
            page_size = min(50, max(1, int(request.query_params.get('page_size', 20))))
        except (ValueError, TypeError):
            return Response({'errores': 'Parámetros inválidos.'}, status=status.HTTP_400_BAD_REQUEST)

        filtro = {'gestion': gestion, 'mes': mes}
        curso_id_param   = request.query_params.get('curso_id')
        materia_id_param = request.query_params.get('materia_id')
        riesgo_param     = request.query_params.get('riesgo')

        if curso_id_param:
            try:
                filtro['curso_id'] = int(curso_id_param)
            except ValueError:
                pass
        if materia_id_param:
            try:
                filtro['materia_id'] = int(materia_id_param)
            except ValueError:
                pass
        if riesgo_param in ('Alto', 'Medio', 'Bajo'):
            filtro['riesgo'] = riesgo_param

        col = _get_db()['predicciones_arbol']

        total = col.count_documents(filtro)
        docs  = list(
            col.find(filtro, {'_id': 0})
            .sort('probabilidad_reprobar', -1)
            .skip((page - 1) * page_size)
            .limit(page_size)
        )

        est_ids = [d['estudiante_id'] for d in docs]
        mat_ids = [d['materia_id']    for d in docs]

        estudiantes_sql = {
            e.id: e for e in
            Estudiante.objects.filter(id__in=est_ids).select_related('curso')
        }
        materias_sql = {
            m.id: m.nombre for m in Materia.objects.filter(id__in=mat_ids)
        }

        fecha_analisis = None
        resultados = []
        for doc in docs:
            est = estudiantes_sql.get(doc['estudiante_id'])
            if not est:
                continue
            if fecha_analisis is None and doc.get('fecha_analisis'):
                fecha_analisis = doc['fecha_analisis'].isoformat()
            resultados.append({
                'estudiante_id':        doc['estudiante_id'],
                'nombre':               f"{est.apellido_paterno} {est.apellido_materno}, {est.nombre}".strip(),
                'curso':                f"{est.curso.grado} \"{est.curso.paralelo}\"",
                'curso_id':             doc.get('curso_id'),
                'materia_id':           doc.get('materia_id'),
                'materia':              materias_sql.get(doc['materia_id'], '—'),
                'riesgo':               doc.get('riesgo', ''),
                'probabilidad_reprobar': round(doc.get('probabilidad_reprobar', 0), 1),
                'modelo':               doc.get('modelo', 1),
            })

        # Resumen total de riesgo (siempre sobre gestion+mes, sin otros filtros)
        resumen_raw = col.aggregate([
            {'$match': {'gestion': gestion, 'mes': mes}},
            {'$group': {'_id': '$riesgo', 'count': {'$sum': 1}}},
        ])
        resumen = {r['_id']: r['count'] for r in resumen_raw}

        # Opciones de filtro (cursos y materias disponibles para gestion+mes)
        opciones_raw = next(col.aggregate([
            {'$match': {'gestion': gestion, 'mes': mes}},
            {'$group': {'_id': None, 'cur': {'$addToSet': '$curso_id'}, 'mat': {'$addToSet': '$materia_id'}}},
        ]), {})
        cursos_filtro = [
            {'id': c.id, 'label': f"{c.grado} \"{c.paralelo}\""}
            for c in CursoModel.objects.filter(id__in=opciones_raw.get('cur', [])).order_by('grado', 'paralelo')
        ]
        materias_filtro = [
            {'id': m.id, 'label': m.nombre}
            for m in Materia.objects.filter(id__in=opciones_raw.get('mat', [])).order_by('nombre')
        ]

        return Response({
            'gestion':        gestion,
            'mes':            mes,
            'total':          total,
            'page':           page,
            'page_size':      page_size,
            'pages':          max(1, (total + page_size - 1) // page_size) if total else 0,
            'fecha_analisis': fecha_analisis,
            'resumen_riesgo': resumen,
            'opciones':       {'cursos': cursos_filtro, 'materias': materias_filtro},
            'resultados':     resultados,
        })


class EstadisticasArbolView(APIView):
    """
    GET /api/analytics/arbol/estadisticas/?gestion=2026&mes=4

    Agrega predicciones del árbol para KPIs y gráficas (sin paginación).
    """
    permission_classes = [IsAuthenticated, IsDirector]

    def get(self, request):
        try:
            gestion = int(request.query_params.get('gestion', timezone.now().year))
            mes     = int(request.query_params.get('mes', timezone.now().month))
        except (ValueError, TypeError):
            return Response({'errores': 'Parámetros inválidos.'}, status=status.HTTP_400_BAD_REQUEST)

        col    = _get_db()['predicciones_arbol']
        filtro = {'gestion': gestion, 'mes': mes}

        total = col.count_documents(filtro)
        if not total:
            return Response({'gestion': gestion, 'mes': mes, 'total_predicciones': 0})

        # ── Resumen global ────────────────────────────────────────────
        resumen_raw = col.aggregate([
            {'$match': filtro},
            {'$group': {'_id': '$riesgo', 'count': {'$sum': 1}}},
        ])
        por_riesgo = {r['_id']: r['count'] for r in resumen_raw}

        reprobados          = col.count_documents({**filtro, 'prediccion': 1})
        estudiantes_alto    = len(col.distinct('estudiante_id', {**filtro, 'riesgo': 'Alto'}))
        tasa_reprobacion    = round(reprobados / total * 100, 1)

        fecha_doc = col.find_one(filtro, {'fecha_analisis': 1, '_id': 0})
        fecha_analisis = fecha_doc['fecha_analisis'].isoformat() if fecha_doc and fecha_doc.get('fecha_analisis') else None

        # ── Por materia ───────────────────────────────────────────────
        pipe_mat = col.aggregate([
            {'$match': filtro},
            {'$group': {
                '_id':   '$materia_id',
                'alto':  {'$sum': {'$cond': [{'$eq': ['$riesgo', 'Alto']},  1, 0]}},
                'medio': {'$sum': {'$cond': [{'$eq': ['$riesgo', 'Medio']}, 1, 0]}},
                'bajo':  {'$sum': {'$cond': [{'$eq': ['$riesgo', 'Bajo']},  1, 0]}},
                'total': {'$sum': 1},
            }},
            {'$sort': {'alto': -1}},
        ])
        mat_docs  = list(pipe_mat)
        mat_ids   = [d['_id'] for d in mat_docs]
        mat_nombres = {m.id: m.nombre for m in Materia.objects.filter(id__in=mat_ids)}

        por_materia = [
            {
                'materia_id':      d['_id'],
                'materia':         mat_nombres.get(d['_id'], '—'),
                'alto':            d['alto'],
                'medio':           d['medio'],
                'bajo':            d['bajo'],
                'total':           d['total'],
                'pct_reprobacion': round(d['alto'] / d['total'] * 100, 1) if d['total'] else 0,
            }
            for d in mat_docs
        ]

        return Response({
            'gestion':              gestion,
            'mes':                  mes,
            'fecha_analisis':       fecha_analisis,
            'total_predicciones':   total,
            'estudiantes_riesgo_alto': estudiantes_alto,
            'tasa_reprobacion':     tasa_reprobacion,
            'por_riesgo':           por_riesgo,
            'por_materia':          por_materia,
        })


_MESES_NOMBRES = ['','Enero','Febrero','Marzo','Abril','Mayo','Junio',
                  'Julio','Agosto','Septiembre','Octubre','Noviembre','Diciembre']


class KMeansTutorView(APIView):
    """
    GET /api/analytics/kmeans/tutor/?gestion=2026&mes=4

    Devuelve el resultado K-Means de cada hijo del tutor autenticado.
    Uno o varios hijos según cuántos estudiantes tenga asignados.
    """
    permission_classes = [IsAuthenticated, IsTutor]

    def get(self, request):
        try:
            gestion = int(request.query_params.get('gestion', timezone.now().year))
            mes     = int(request.query_params.get('mes', timezone.now().month))
        except (ValueError, TypeError):
            return Response({'errores': 'Parámetros inválidos.'}, status=status.HTTP_400_BAD_REQUEST)

        hijos = list(
            Estudiante.objects.filter(tutor=request.user, activo=True).select_related('curso')
        )
        if not hijos:
            return Response({'errores': 'No tiene estudiantes asignados.'}, status=status.HTTP_404_NOT_FOUND)

        col     = _get_db()['predicciones']
        ids     = [h.id for h in hijos]
        docs    = {
            d['estudiante_id']: d
            for d in col.find({'estudiante_id': {'$in': ids}, 'gestion': gestion, 'mes': mes}, {'_id': 0})
        }
        hijos_map = {h.id: h for h in hijos}

        resultados = []
        for est_id in ids:
            h   = hijos_map[est_id]
            doc = docs.get(est_id)
            entry = {
                'estudiante_id': est_id,
                'nombre':  f"{h.apellido_paterno} {h.apellido_materno}, {h.nombre}".strip(),
                'curso':   f"{h.curso.grado} \"{h.curso.paralelo}\"",
                'gestion': gestion,
                'mes':     mes,
                'mes_nombre': _MESES_NOMBRES[mes] if mes <= 12 else '',
            }
            if doc:
                f = doc.get('features_usadas', {})
                entry.update({
                    'cluster':        doc.get('cluster', ''),
                    'nota_mensual':   round(doc.get('nota_mensual', 0), 1),
                    'fecha_analisis': doc['fecha_analisis'].isoformat() if doc.get('fecha_analisis') else None,
                    'features': {
                        'ser_pct':             round((f.get('ser_pct') or 0) * 100, 1),
                        'saber_pct':           round((f.get('saber_pct') or 0) * 100, 1),
                        'hacer_pct':           round((f.get('hacer_pct') or 0) * 100, 1),
                        'tasa_entrega_tareas': round((f.get('tasa_entrega_tareas') or 0) * 100, 1),
                        'pct_asistencia':      round((f.get('pct_asistencia') or 0) * 100, 1),
                        'tasa_citaciones':     round((f.get('tasa_citaciones') or 0) * 100, 1),
                    },
                })
            else:
                entry['cluster'] = None
            resultados.append(entry)

        return Response({'gestion': gestion, 'mes': mes, 'hijos': resultados})


class ArbolTutorView(APIView):
    """
    GET /api/analytics/arbol/tutor/?gestion=2026&mes=4

    Devuelve las predicciones de reprobación por materia de cada hijo del tutor.
    Ordenadas de mayor a menor probabilidad de reprobar.
    """
    permission_classes = [IsAuthenticated, IsTutor]

    def get(self, request):
        try:
            gestion = int(request.query_params.get('gestion', timezone.now().year))
            mes     = int(request.query_params.get('mes', timezone.now().month))
        except (ValueError, TypeError):
            return Response({'errores': 'Parámetros inválidos.'}, status=status.HTTP_400_BAD_REQUEST)

        hijos = list(
            Estudiante.objects.filter(tutor=request.user, activo=True).select_related('curso')
        )
        if not hijos:
            return Response({'errores': 'No tiene estudiantes asignados.'}, status=status.HTTP_404_NOT_FOUND)

        col  = _get_db()['predicciones_arbol']
        ids  = [h.id for h in hijos]
        docs = list(
            col.find(
                {'estudiante_id': {'$in': ids}, 'gestion': gestion, 'mes': mes},
                {'_id': 0}
            ).sort('probabilidad_reprobar', -1)
        )

        mat_ids = list({d['materia_id'] for d in docs})
        materias_map = {m.id: m.nombre for m in Materia.objects.filter(id__in=mat_ids)}
        hijos_map    = {h.id: h for h in hijos}

        # Agrupar por hijo
        por_hijo = {h.id: [] for h in hijos}
        fecha_analisis = None
        modelo = None
        for doc in docs:
            if fecha_analisis is None and doc.get('fecha_analisis'):
                fecha_analisis = doc['fecha_analisis'].isoformat()
            if modelo is None:
                modelo = doc.get('modelo')
            por_hijo[doc['estudiante_id']].append({
                'materia_id':           doc['materia_id'],
                'materia':              materias_map.get(doc['materia_id'], '—'),
                'probabilidad_reprobar': round(doc.get('probabilidad_reprobar', 0), 1),
                'prediccion':           doc.get('prediccion', 0),
                'riesgo':               doc.get('riesgo', ''),
            })

        resultados = []
        for h in hijos:
            resultados.append({
                'estudiante_id': h.id,
                'nombre':  f"{h.apellido_paterno} {h.apellido_materno}, {h.nombre}".strip(),
                'curso':   f"{h.curso.grado} \"{h.curso.paralelo}\"",
                'materias': por_hijo[h.id],
            })

        return Response({
            'gestion':        gestion,
            'mes':            mes,
            'mes_nombre':     _MESES_NOMBRES[mes] if mes <= 12 else '',
            'modelo':         modelo,
            'fecha_analisis': fecha_analisis,
            'hijos':          resultados,
        })

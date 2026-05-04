from django.utils import timezone
from rest_framework.views import APIView
from rest_framework.response import Response
from rest_framework.permissions import IsAuthenticated
from rest_framework import status

from backend.core.permissions import IsDirector
from backend.apps.academics.services.notas_mongo_service import _get_db
from backend.apps.students.models import Estudiante


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
                'features': {
                    'ser_pct':             round(features.get('ser_pct', 0) * 100, 1),
                    'saber_pct':           round(features.get('saber_pct', 0) * 100, 1),
                    'hacer_pct':           round(features.get('hacer_pct', 0) * 100, 1),
                    'tasa_entrega_tareas': round(features.get('tasa_entrega_tareas', 0) * 100, 1),
                    'promedio_examenes':   round(features.get('promedio_examenes', 0), 1),
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

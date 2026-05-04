"""
Servicio K-Means para agrupación de estudiantes por rendimiento académico.

Flujo:
  1. Primera ejecución del año: selecciona k óptimo (silhouette, k=2-5) y lo guarda.
  2. Ejecuciones siguientes: usa el k guardado directamente.
  3. Se dispara automáticamente cuando todos los profesores cargan su planilla del mes.

Función pública: ejecutar_analisis_kmeans(gestion, trimestre, mes)
"""

import numpy as np
import pandas as pd
from sklearn.cluster import KMeans
from sklearn.preprocessing import StandardScaler
from sklearn.metrics import silhouette_score
from datetime import datetime, timezone

from backend.apps.academics.services.notas_mongo_service import _get_db

# ─────────────────────────────────────────────────────────────────────────────
# Configuración
# ─────────────────────────────────────────────────────────────────────────────

K_DEFAULT = 4
K_MIN, K_MAX = 2, 5
MIN_MATERIAS_CON_NOTAS = 5

ETIQUETAS_POR_K = {
    2: ["Rendimiento Adecuado", "Riesgo Académico"],
    3: ["Excelente", "Requiere Apoyo", "Riesgo Crítico"],
    4: ["Excelente", "Satisfactorio", "Requiere Apoyo", "Riesgo Crítico"],
    5: ["Excelente", "Satisfactorio", "En Desarrollo", "Requiere Apoyo", "Riesgo Crítico"],
}

_FEATURE_COLS = [
    "ser_pct",
    "saber_pct",
    "hacer_pct",
    "tasa_entrega_tareas",
    "promedio_examenes",
    "pct_asistencia",
    "pct_atrasos",
    "tendencia_norm",
    "tasa_citaciones",
]


# ─────────────────────────────────────────────────────────────────────────────
# Configuración de k en MongoDB
# ─────────────────────────────────────────────────────────────────────────────

def _obtener_k_configurado(gestion: int) -> int | None:
    doc = _get_db()['config'].find_one({'_id': f'kmeans_k_{gestion}'})
    return doc['valor'] if doc else None


def _guardar_k_configurado(gestion: int, k: int):
    _get_db()['config'].update_one(
        {'_id': f'kmeans_k_{gestion}'},
        {'$set': {'valor': k, 'fecha_calibracion': datetime.now(tz=timezone.utc)}},
        upsert=True,
    )


# ─────────────────────────────────────────────────────────────────────────────
# Selección automática de k (solo primera ejecución del año)
# ─────────────────────────────────────────────────────────────────────────────

def _seleccionar_k_optimo(X_scaled: np.ndarray) -> int:
    """
    Evalúa silhouette score para k=2..5 y devuelve el k con mayor score.
    Si la diferencia entre el mejor k y k=4 es menor a 0.05, prefiere k=4
    por consistencia pedagógica.
    """
    scores = {}
    for k in range(K_MIN, K_MAX + 1):
        if len(X_scaled) < k:
            break
        labels = KMeans(n_clusters=k, random_state=42, n_init=10).fit_predict(X_scaled)
        scores[k] = silhouette_score(X_scaled, labels)

    mejor_k = max(scores, key=lambda k: scores[k])

    if mejor_k != K_DEFAULT and abs(scores[mejor_k] - scores.get(K_DEFAULT, 0)) < 0.05:
        return K_DEFAULT

    return mejor_k


# ─────────────────────────────────────────────────────────────────────────────
# PASO 1: Armar el DataFrame de features
# ─────────────────────────────────────────────────────────────────────────────

def obtener_features_colegio(gestion: int, mes: int) -> pd.DataFrame | None:
    """
    Agrega datos de notas (MongoDB), asistencia y citaciones (SQL) para todos
    los estudiantes con datos en el mes indicado.
    Excluye estudiantes con menos de MIN_MATERIAS_CON_NOTAS materias cargadas.
    """
    db = _get_db()

    # ── Mongo: promedio de todas las materias del mes por estudiante ──────────
    pipeline = [
        {'$match': {'gestion': gestion, 'mes': mes}},
        {'$group': {
            '_id':                '$estudiante_id',
            'curso_id':           {'$first': '$curso_id'},
            'ser_sum':            {'$sum': '$ser'},
            'saber_sum':          {'$sum': '$saber'},
            'hacer_sum':          {'$sum': '$hacer'},
            'nota_mensual_sum':   {'$sum': '$nota_mensual'},
            'tareas_entregadas':  {'$sum': '$cantidad_tareas_entregadas'},
            'tareas_total':       {'$sum': '$cantidad_tareas_total'},
            'examenes_sum':       {'$sum': '$promedio_examenes'},
            'count_materias':     {'$sum': 1},
        }},
        {'$match': {'count_materias': {'$gte': MIN_MATERIAS_CON_NOTAS}}},
    ]

    resultados = list(db['notas_mensuales'].aggregate(pipeline))
    if not resultados:
        return None

    registros = []
    for r in resultados:
        n = r['count_materias']
        tareas_total = r['tareas_total'] or 0
        registros.append({
            'estudiante_id':       r['_id'],
            'curso_id':            r['curso_id'],
            'ser_pct':             r['ser_sum'] / (10 * n),
            'saber_pct':           r['saber_sum'] / (45 * n),
            'hacer_pct':           r['hacer_sum'] / (40 * n),
            'tasa_entrega_tareas': r['tareas_entregadas'] / tareas_total if tareas_total > 0 else 0.0,
            'promedio_examenes':   r['examenes_sum'] / n,
            'nota_mensual_actual': r['nota_mensual_sum'] / n,
        })

    df = pd.DataFrame(registros)

    # ── SQL: asistencia del mes ───────────────────────────────────────────────
    from django.db.models import Count, Q
    from backend.apps.attendance.models import Asistencia, AsistenciaSesion

    sesiones_por_curso = dict(
        AsistenciaSesion.objects
        .filter(fecha__year=gestion, fecha__month=mes)
        .values('curso_id')
        .annotate(total=Count('id'))
        .values_list('curso_id', 'total')
    )

    asistencias_raw = list(
        Asistencia.objects
        .filter(sesion__fecha__year=gestion, sesion__fecha__month=mes)
        .values('estudiante_id', 'sesion__curso_id')
        .annotate(
            presentes=Count('id', filter=Q(estado__in=['PRESENTE', 'ATRASO', 'LICENCIA'])),
            atrasos=Count('id', filter=Q(estado='ATRASO')),
        )
    )

    asistencia_map = {}
    for r in asistencias_raw:
        total = sesiones_por_curso.get(r['sesion__curso_id'], 0)
        if total > 0:
            asistencia_map[r['estudiante_id']] = {
                'pct_asistencia': r['presentes'] / total,
                'pct_atrasos':    r['atrasos'] / total,
            }

    if asistencia_map:
        df_asist = pd.DataFrame([
            {'estudiante_id': k, **v} for k, v in asistencia_map.items()
        ])
        df = df.merge(df_asist, on='estudiante_id', how='left')
    else:
        df['pct_asistencia'] = 0.0
        df['pct_atrasos'] = 0.0

    df[['pct_asistencia', 'pct_atrasos']] = df[['pct_asistencia', 'pct_atrasos']].fillna(0.0)

    # ── SQL: citaciones del mes ───────────────────────────────────────────────
    from backend.apps.discipline.models import Citacion

    citaciones_raw = list(
        Citacion.objects
        .filter(fecha_envio__year=gestion, fecha_envio__month=mes)
        .exclude(asistencia='ANULADA')
        .values('estudiante_id')
        .annotate(total=Count('id'))
    )

    max_citaciones = max((r['total'] for r in citaciones_raw), default=1) or 1
    citaciones_map = {r['estudiante_id']: r['total'] / max_citaciones for r in citaciones_raw}

    df['tasa_citaciones'] = df['estudiante_id'].map(citaciones_map).fillna(0.0)

    # ── Tendencia normalizada con tanh ────────────────────────────────────────
    mes_anterior = mes - 1 if mes > 1 else None
    if mes_anterior:
        pipeline_ant = [
            {'$match': {'gestion': gestion, 'mes': mes_anterior}},
            {'$group': {
                '_id':              '$estudiante_id',
                'nota_mensual_sum': {'$sum': '$nota_mensual'},
                'count_materias':   {'$sum': 1},
            }},
        ]
        ant_map = {
            r['_id']: r['nota_mensual_sum'] / r['count_materias']
            for r in db['notas_mensuales'].aggregate(pipeline_ant)
        }
        anterior = df['estudiante_id'].map(ant_map).fillna(df['nota_mensual_actual'])
        raw_tendencia = df['nota_mensual_actual'] - anterior
    else:
        raw_tendencia = pd.Series(0.0, index=df.index)

    df['tendencia_norm'] = np.tanh(raw_tendencia / 20)

    return df


# ─────────────────────────────────────────────────────────────────────────────
# PASO 2: Determinar k y correr K-Means
# ─────────────────────────────────────────────────────────────────────────────

def ejecutar_kmeans(df: pd.DataFrame, gestion: int) -> pd.DataFrame:
    """
    Normaliza las features, determina k (calibra en primera ejecución del año
    o usa el k guardado), corre K-Means y asigna etiqueta semántica a cada cluster.
    """
    X = df[_FEATURE_COLS].fillna(0).values
    X_scaled = StandardScaler().fit_transform(X)

    k = _obtener_k_configurado(gestion)
    if k is None:
        k = _seleccionar_k_optimo(X_scaled)
        _guardar_k_configurado(gestion, k)

    df = df.copy()
    df['cluster_num'] = KMeans(n_clusters=k, random_state=42, n_init=10).fit_predict(X_scaled)

    etiquetas = ETIQUETAS_POR_K[k]
    medias = df.groupby('cluster_num')['nota_mensual_actual'].mean().sort_values(ascending=False)
    label_map = dict(zip(medias.index, etiquetas))
    df['cluster'] = df['cluster_num'].map(label_map)

    return df


# ─────────────────────────────────────────────────────────────────────────────
# PASO 3: Guardar en colección predicciones
# ─────────────────────────────────────────────────────────────────────────────

def guardar_predicciones(df: pd.DataFrame, gestion: int, trimestre: int, mes: int):
    """UPSERT en MongoDB colección predicciones. Clave: (estudiante_id, gestion, trimestre, mes)."""
    from pymongo import UpdateOne

    fecha_analisis = datetime.now(tz=timezone.utc)
    ops = []

    for _, row in df.iterrows():
        filtro = {
            'estudiante_id': int(row['estudiante_id']),
            'gestion':       gestion,
            'trimestre':     trimestre,
            'mes':           mes,
        }
        ops.append(UpdateOne(filtro, {'$set': {
            'curso_id':                               int(row['curso_id']),
            'fecha_analisis':                         fecha_analisis,
            'cluster':                                row['cluster'],
            'features_usadas.ser_pct':                float(row['ser_pct']),
            'features_usadas.saber_pct':              float(row['saber_pct']),
            'features_usadas.hacer_pct':              float(row['hacer_pct']),
            'features_usadas.tasa_entrega_tareas':    float(row['tasa_entrega_tareas']),
            'features_usadas.promedio_examenes':      float(row['promedio_examenes']),
            'features_usadas.pct_asistencia':         float(row['pct_asistencia']),
            'features_usadas.pct_atrasos':            float(row['pct_atrasos']),
            'features_usadas.tendencia_norm':         float(row['tendencia_norm']),
            'features_usadas.tasa_citaciones':        float(row['tasa_citaciones']),
            'nota_mensual':                           float(row['nota_mensual_actual']),
        }}, upsert=True))

    if ops:
        _get_db()['predicciones'].bulk_write(ops, ordered=False)


# ─────────────────────────────────────────────────────────────────────────────
# FUNCIÓN PRINCIPAL
# ─────────────────────────────────────────────────────────────────────────────

def _mes_a_trimestre(mes: int) -> int:
    if mes <= 4:
        return 1
    if mes <= 8:
        return 2
    return 3


def ejecutar_analisis_kmeans(gestion: int, mes: int) -> dict:
    """
    Orquesta los 3 pasos. Se llama automáticamente cuando todos los profesores
    cargan su planilla del mes, o manualmente desde el endpoint del Director.

    Returns:
        { estado: 'ok' | 'sin_datos', estudiantes: int, clusters: dict, k: int }
    """
    trimestre = _mes_a_trimestre(mes)
    df = obtener_features_colegio(gestion=gestion, mes=mes)

    k_minimo = _obtener_k_configurado(gestion) or K_MIN
    if df is None or len(df) < k_minimo:
        return {'estado': 'sin_datos', 'estudiantes': 0 if df is None else len(df)}

    df = ejecutar_kmeans(df, gestion=gestion)
    guardar_predicciones(df, gestion=gestion, trimestre=trimestre, mes=mes)

    return {
        'estado':      'ok',
        'estudiantes': len(df),
        'k':           int(df['cluster_num'].nunique()),
        'clusters':    df['cluster'].value_counts().to_dict(),
    }

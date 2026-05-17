"""
Servicio K-Means para agrupación de estudiantes por rendimiento académico.

Flujo:
  1. Primera ejecución del año: selecciona k óptimo (silhouette, k=2-5) y lo guarda.
  2. Ejecuciones siguientes: usa el k guardado directamente.
  3. Se dispara automáticamente cuando todos los profesores cargan su planilla del mes.

Función pública: ejecutar_analisis_kmeans(gestion, mes)
"""

import numpy as np
import pandas as pd
from sklearn.cluster import KMeans
from sklearn.decomposition import PCA
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

# Citaciones: más de este número = tasa = 1.0 (riesgo máximo)
_MAX_CITACIONES_FIJO = 5

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
    "promedio_examenes_pct",
    "pct_asistencia",
    "pct_atrasos",
    "tendencia_norm",
    "tasa_citaciones",
]

# Valor neutro para features sin datos (no penaliza ni premia)
_FILLNA_NEUTRAL = {
    "ser_pct":              0.5,
    "saber_pct":            0.5,
    "hacer_pct":            0.5,
    "tasa_entrega_tareas":  0.5,
    "promedio_examenes_pct":0.5,
    "pct_asistencia":       0.0,
    "pct_atrasos":          0.0,
    "tendencia_norm":       0.0,
    "tasa_citaciones":      0.0,
}


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


def _mes_a_trimestre(mes: int) -> int:
    if mes <= 4:
        return 1
    if mes <= 8:
        return 2
    return 3


# ─────────────────────────────────────────────────────────────────────────────
# PASO 1: Armar el DataFrame de features
# ─────────────────────────────────────────────────────────────────────────────

def obtener_features_colegio(gestion: int, mes: int) -> pd.DataFrame | None:
    """
    Agrega datos de notas (MongoDB), asistencia y citaciones (SQL) para todos
    los estudiantes con datos en el mes indicado.

    Fixes vs versión anterior:
    - ser/saber/hacer usan conteo de materias con datos reales (no total),
      imputan 0.5 cuando la dimensión es null en todas las materias.
    - promedio_examenes normalizado a [0,1], imputa 0.5 cuando sin datos.
    - tasa_entrega_tareas imputa 0.5 cuando no hay tareas (hacer null).
    - tasa_citaciones usa cap fijo (_MAX_CITACIONES_FIJO) en vez de max relativo.
    - tendencia_norm no cruza fronteras de trimestre (vale 0 en el primer mes).
    """
    db = _get_db()

    # ── Mongo: promedios del mes por estudiante ───────────────────────────────
    _null_count = lambda campo: {
        '$sum': {'$cond': {'if': {'$gt': [f'${campo}', None]}, 'then': 1, 'else': 0}}
    }

    pipeline = [
        {'$match': {'gestion': gestion, 'mes': mes}},
        {'$group': {
            '_id':      '$estudiante_id',
            'curso_id': {'$first': '$curso_id'},

            'ser_sum':   {'$sum': '$ser'},
            'saber_sum': {'$sum': '$saber'},
            'hacer_sum': {'$sum': '$hacer'},

            'ser_count':   _null_count('ser'),
            'saber_count': _null_count('saber'),
            'hacer_count': _null_count('hacer'),

            'nota_mensual_sum':  {'$sum': '$nota_mensual'},
            'tareas_entregadas': {'$sum': '$cantidad_tareas_entregadas'},
            'tareas_total':      {'$sum': '$cantidad_tareas_total'},

            'examenes_sum':   {'$sum': '$promedio_examenes'},
            'examenes_count': _null_count('promedio_examenes'),

            'count_materias': {'$sum': 1},
        }},
        {'$match': {'count_materias': {'$gte': MIN_MATERIAS_CON_NOTAS}}},
    ]

    resultados = list(db['notas_mensuales'].aggregate(pipeline))
    if not resultados:
        return None

    # Si algún estudiante no tiene SER en TODAS sus materias del mes, se
    # excluye la dimensión SER del entrenamiento (regla del director: SER
    # solo participa cuando está completa para el 100% de los estudiantes).
    ser_excluido = any(r['ser_count'] < r['count_materias'] for r in resultados)

    registros = []
    for r in resultados:
        n           = r['count_materias']
        sc          = r['ser_count']
        sabc        = r['saber_count']
        hc          = r['hacer_count']
        ec          = r['examenes_count']
        tareas_tot  = r['tareas_total'] or 0

        # Dimensiones: porcentaje sobre el máximo, solo materias con datos reales
        ser_pct   = r['ser_sum']   / (10 * sc)   if sc   > 0 else 0.5
        saber_pct = r['saber_sum'] / (45 * sabc) if sabc > 0 else 0.5
        hacer_pct = r['hacer_sum'] / (40 * hc)   if hc   > 0 else 0.5

        # Tasa de entrega: 0.5 neutral cuando no hay datos de hacer
        tasa_entrega = r['tareas_entregadas'] / tareas_tot if tareas_tot > 0 else 0.5

        # Promedio exámenes normalizado a [0,1]; 0.5 cuando sin datos de saber
        prom_examenes_pct = (r['examenes_sum'] / ec) / 45 if ec > 0 else 0.5

        registros.append({
            'estudiante_id':        r['_id'],
            'curso_id':             r['curso_id'],
            'ser_pct':              round(ser_pct,           4),
            'saber_pct':            round(saber_pct,         4),
            'hacer_pct':            round(hacer_pct,         4),
            'tasa_entrega_tareas':  round(tasa_entrega,      4),
            'promedio_examenes_pct':round(prom_examenes_pct, 4),
            'nota_mensual_actual':  r['nota_mensual_sum'] / n,
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
        df['pct_atrasos']    = 0.0

    df[['pct_asistencia', 'pct_atrasos']] = df[['pct_asistencia', 'pct_atrasos']].fillna(0.0)

    # ── SQL: citaciones del mes — cap fijo para comparabilidad entre meses ────
    from backend.apps.discipline.models import Citacion

    citaciones_raw = list(
        Citacion.objects
        .filter(fecha_envio__year=gestion, fecha_envio__month=mes)
        .exclude(asistencia='ANULADA')
        .values('estudiante_id')
        .annotate(total=Count('id'))
    )

    citaciones_map = {
        r['estudiante_id']: min(r['total'] / _MAX_CITACIONES_FIJO, 1.0)
        for r in citaciones_raw
    }
    df['tasa_citaciones'] = df['estudiante_id'].map(citaciones_map).fillna(0.0)

    # ── Tendencia normalizada — sin cruzar fronteras de trimestre ─────────────
    trimestre_actual  = _mes_a_trimestre(mes)
    mes_anterior      = mes - 1 if mes > 1 else None

    # No comparar contra mes de otro trimestre
    if mes_anterior and _mes_a_trimestre(mes_anterior) != trimestre_actual:
        mes_anterior = None

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
        anterior      = df['estudiante_id'].map(ant_map).fillna(df['nota_mensual_actual'])
        raw_tendencia = df['nota_mensual_actual'] - anterior
    else:
        raw_tendencia = pd.Series(0.0, index=df.index)

    df['tendencia_norm'] = np.tanh(raw_tendencia / 20)

    # Propagar el flag (pandas conserva df.attrs entre operaciones simples).
    df.attrs['ser_excluido'] = ser_excluido
    return df


# ─────────────────────────────────────────────────────────────────────────────
# PASO 2: Determinar k y correr K-Means
# ─────────────────────────────────────────────────────────────────────────────

def ejecutar_kmeans(df: pd.DataFrame, gestion: int) -> pd.DataFrame:
    """
    Normaliza las features, determina k, corre K-Means y asigna etiqueta semántica.
    Imputación por feature: 0.5 para dimensiones/examenes/tareas sin datos, 0 para el resto.

    Si df.attrs['ser_excluido'] es True, ser_pct NO se usa como feature
    (regla: la dimensión SER solo participa si está completa para TODOS los
    estudiantes ese mes).
    """
    ser_excluido = bool(df.attrs.get('ser_excluido', False))
    feature_cols = [c for c in _FEATURE_COLS if not (ser_excluido and c == 'ser_pct')]

    X = df[feature_cols].copy()
    for col, val in _FILLNA_NEUTRAL.items():
        if col in X.columns:
            X[col] = X[col].fillna(val)
    X_scaled = StandardScaler().fit_transform(X.values)

    k = _obtener_k_configurado(gestion)
    if k is None:
        k = _seleccionar_k_optimo(X_scaled)
        _guardar_k_configurado(gestion, k)

    df = df.copy()
    df['cluster_num'] = KMeans(n_clusters=k, random_state=42, n_init=10).fit_predict(X_scaled)

    pca_coords = PCA(n_components=2).fit_transform(X_scaled)
    df['pca_x'] = np.round(pca_coords[:, 0], 4)
    df['pca_y'] = np.round(pca_coords[:, 1], 4)

    etiquetas = ETIQUETAS_POR_K[k]
    medias    = df.groupby('cluster_num')['nota_mensual_actual'].mean().sort_values(ascending=False)
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
    ser_excluido   = bool(df.attrs.get('ser_excluido', False))
    ops = []

    for _, row in df.iterrows():
        filtro = {
            'estudiante_id': int(row['estudiante_id']),
            'gestion':       gestion,
            'trimestre':     trimestre,
            'mes':           mes,
        }
        ops.append(UpdateOne(filtro, {'$set': {
            'curso_id':                                  int(row['curso_id']),
            'fecha_analisis':                            fecha_analisis,
            'cluster':                                   row['cluster'],
            'ser_excluido':                              ser_excluido,
            'features_usadas.ser_pct':                   None if ser_excluido else float(row['ser_pct']),
            'features_usadas.saber_pct':                 float(row['saber_pct']),
            'features_usadas.hacer_pct':                 float(row['hacer_pct']),
            'features_usadas.tasa_entrega_tareas':       float(row['tasa_entrega_tareas']),
            'features_usadas.promedio_examenes_pct':     float(row['promedio_examenes_pct']),
            'features_usadas.pct_asistencia':            float(row['pct_asistencia']),
            'features_usadas.pct_atrasos':               float(row['pct_atrasos']),
            'features_usadas.tendencia_norm':            float(row['tendencia_norm']),
            'features_usadas.tasa_citaciones':           float(row['tasa_citaciones']),
            'nota_mensual':                              float(row['nota_mensual_actual']),
            'pca_x':                                     float(row['pca_x']),
            'pca_y':                                     float(row['pca_y']),
        }}, upsert=True))

    if ops:
        _get_db()['predicciones'].bulk_write(ops, ordered=False)


# ─────────────────────────────────────────────────────────────────────────────
# FUNCIÓN PRINCIPAL
# ─────────────────────────────────────────────────────────────────────────────

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

    resultado = {
        'estado':      'ok',
        'estudiantes': len(df),
        'k':           int(df['cluster_num'].nunique()),
        'clusters':    df['cluster'].value_counts().to_dict(),
    }

    _notificar_director_kmeans(resultado, gestion, mes)

    return resultado


def _notificar_director_kmeans(resultado: dict, gestion: int, mes: int):
    try:
        from django.db import close_old_connections
        close_old_connections()
        from backend.apps.notifications.models import Notificacion
        from backend.apps.users.models import TipoUsuario, User

        tipo_director = TipoUsuario.objects.get(nombre='Director')
        directores    = list(User.objects.filter(tipo_usuario=tipo_director, is_active=True))
        clusters_str  = ', '.join(f'{k}: {v}' for k, v in resultado['clusters'].items())
        descripcion   = (
            f"Analisis K-Means completado para el mes {mes} de {gestion}. "
            f"{resultado['estudiantes']} estudiantes analizados en {resultado['k']} grupos. "
            f"{clusters_str}"
        )
        Notificacion.objects.bulk_create([
            Notificacion(emisor=None, receptor=d, descripcion=descripcion)
            for d in directores
        ])
    except Exception:
        pass

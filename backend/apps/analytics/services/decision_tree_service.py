"""
Servicio Árbol de Decisión — predicción de riesgo de reprobación por materia.

Modelos:
  - Modelo 1 (arbol_t1.joblib)  : features de T1 acumuladas → predicción temprana (mes 1–4)
  - Modelo 2 (arbol_t1_t2.joblib): features de T1 completo + T2 acumulado → predicción precisa (mes 5–12)

Trigger: mismo que K-Means. Cuando el último profesor confirma su planilla del mes,
planilla_views.py lanza este servicio en un hilo separado después de K-Means.

Granularidad: una predicción por (estudiante_id, materia_id) — a diferencia de
K-Means que es por estudiante. Esto permite identificar en qué materia hay riesgo.
"""

import logging
from datetime import datetime, timezone
from pathlib import Path

import numpy as np
import pandas as pd

from backend.apps.academics.services.notas_mongo_service import _get_db

logger = logging.getLogger(__name__)

# ─────────────────────────────────────────────────────────────────────────────
# Paths y configuración
# ─────────────────────────────────────────────────────────────────────────────

_ML_DIR = Path(__file__).resolve().parent.parent / 'ml_models'
_JOBLIB_MODELO1 = _ML_DIR / 'arbol_t1.joblib'
_JOBLIB_MODELO2 = _ML_DIR / 'arbol_t1_t2.joblib'

# Orden exacto de features usado en el entrenamiento
_FEATURES_M1 = [
    't1_hacer_pct',
    't1_saber_pct',
    't1_tareas_realizadas_pct',
    't1_faltas',
    't1_ser_pct',
    't1_autoeval_ser_pct',
    't1_brecha_autoeval_ser',
]

_FEATURES_M2 = _FEATURES_M1 + [
    't2_hacer_pct',
    't2_saber_pct',
    't2_tareas_realizadas_pct',
    't2_faltas',
    't2_ser_pct',
    't2_autoeval_ser_pct',
    't2_brecha_autoeval_ser',
]

# Umbrales para derivar nivel de riesgo desde la probabilidad de reprobación (0-100)
# El modelo es binario: 0=APROBADO, 1=REPROBADO
_UMBRAL_ALTO  = 66.0   # >= 66% → Alto
_UMBRAL_MEDIO = 33.0   # >= 33% → Medio, < 33% → Bajo

def _prob_a_riesgo(prob_pct: float) -> str:
    if prob_pct >= _UMBRAL_ALTO:
        return 'Alto'
    if prob_pct >= _UMBRAL_MEDIO:
        return 'Medio'
    return 'Bajo'

_MESES_T1 = [1, 2, 3, 4]
_MESES_T2 = [5, 6, 7, 8]


# ─────────────────────────────────────────────────────────────────────────────
# Carga del modelo
# ─────────────────────────────────────────────────────────────────────────────

def _cargar_modelo(path: Path):
    if not path.exists():
        logger.warning('Modelo no disponible: %s', path)
        return None
    import joblib
    obj = joblib.load(path)
    # El archivo puede ser un dict {'modelo': clf, ...} o directamente el clf
    return obj['modelo'] if isinstance(obj, dict) and 'modelo' in obj else obj


# ─────────────────────────────────────────────────────────────────────────────
# Recopilación de features desde MongoDB
# ─────────────────────────────────────────────────────────────────────────────

def _features_por_trimestre(db, gestion: int, meses: list, trimestre: int) -> pd.DataFrame:
    """
    Agrega notas_mensuales de los meses indicados por (estudiante_id, materia_id).

    Retorna DataFrame con columnas normalizadas (sin prefijo de trimestre):
    hacer_pct, saber_pct, tareas_realizadas_pct, ser_pct, autoeval_ser_pct,
    brecha_autoeval_ser  +  estudiante_id, materia_id, curso_id.
    """
    pipeline = [
        {'$match': {
            'gestion':   gestion,
            'mes':       {'$in': meses},
            'trimestre': trimestre,
        }},
        {'$group': {
            '_id': {
                'estudiante_id': '$estudiante_id',
                'materia_id':    '$materia_id',
            },
            'curso_id':          {'$first': '$curso_id'},
            'hacer_sum':         {'$sum': '$hacer'},
            'saber_sum':         {'$sum': '$saber'},
            'ser_sum':           {'$sum': '$ser'},
            'tareas_entregadas': {'$sum': '$cantidad_tareas_entregadas'},
            'tareas_total':      {'$sum': '$cantidad_tareas_total'},
            # autoeval es el mismo valor en todos los meses del trimestre;
            # $max ignora null y devuelve el valor real si existe en algún mes
            'autoeval_max':      {'$max': '$autoeval_ser'},
            'n_meses':           {'$sum': 1},
        }},
    ]

    registros = []
    for r in db['notas_mensuales'].aggregate(pipeline):
        n            = r['n_meses']
        tareas_total = r['tareas_total'] or 0
        ser_pct      = round(r['ser_sum']   / (10 * n), 4)
        autoeval_raw = r['autoeval_max']
        autoeval_pct = round(autoeval_raw / 5, 4) if autoeval_raw is not None else 0.0

        registros.append({
            'estudiante_id':          r['_id']['estudiante_id'],
            'materia_id':             r['_id']['materia_id'],
            'curso_id':               r['curso_id'],
            'hacer_pct':              round(r['hacer_sum'] / (40 * n), 4),
            'saber_pct':              round(r['saber_sum'] / (45 * n), 4),
            'tareas_realizadas_pct':  round(r['tareas_entregadas'] / tareas_total, 4) if tareas_total else 0.0,
            'ser_pct':                ser_pct,
            'autoeval_ser_pct':       autoeval_pct,
            'brecha_autoeval_ser':    round(ser_pct - autoeval_pct, 4),
        })

    return pd.DataFrame(registros) if registros else pd.DataFrame()


def _faltas_por_meses(gestion: int, meses: list) -> dict:
    """Devuelve {estudiante_id: total_faltas} para los meses indicados."""
    from django.db.models import Count
    from backend.apps.attendance.models import Asistencia

    qs = (
        Asistencia.objects
        .filter(
            sesion__fecha__year=gestion,
            sesion__fecha__month__in=meses,
            estado='FALTA',
        )
        .values('estudiante_id')
        .annotate(total=Count('id'))
    )
    return {r['estudiante_id']: r['total'] for r in qs}


def _renombrar_con_prefijo(df: pd.DataFrame, prefijo: str) -> pd.DataFrame:
    """Renombra columnas de features agregando el prefijo de trimestre (ej. 't1_')."""
    _COLS_FEATURES = [
        'hacer_pct', 'saber_pct', 'tareas_realizadas_pct',
        'faltas', 'ser_pct', 'autoeval_ser_pct', 'brecha_autoeval_ser',
    ]
    return df.rename(columns={c: f'{prefijo}{c}' for c in _COLS_FEATURES if c in df.columns})


# ─────────────────────────────────────────────────────────────────────────────
# PASO 1: Armar DataFrame con todas las features según el mes
# ─────────────────────────────────────────────────────────────────────────────

def obtener_features_arbol(gestion: int, mes: int) -> tuple:
    """
    Recopila features acumuladas hasta el mes actual para cada (estudiante, materia).

    Lógica de selección de modelo:
      - mes 1–4  → Modelo 1: solo T1 (meses transcurridos del T1)
      - mes 5–12 → Modelo 2: T1 completo + T2 acumulado hasta mes

    Returns:
        (DataFrame con features, modelo_num: int)
        DataFrame vacío si no hay datos suficientes.
    """
    db = _get_db()

    if mes <= 4:
        modelo_num  = 1
        meses_usar  = [m for m in _MESES_T1 if m <= mes]
        df = _features_por_trimestre(db, gestion, meses_usar, trimestre=1)
        if df.empty:
            return pd.DataFrame(), modelo_num

        faltas = _faltas_por_meses(gestion, meses_usar)
        df['faltas'] = df['estudiante_id'].map(faltas).fillna(0).astype(int)
        df = _renombrar_con_prefijo(df, 't1_')

    else:
        modelo_num    = 2
        meses_t2_usar = [m for m in _MESES_T2 if m <= mes]

        df_t1 = _features_por_trimestre(db, gestion, _MESES_T1, trimestre=1)
        df_t2 = _features_por_trimestre(db, gestion, meses_t2_usar, trimestre=2)

        if df_t1.empty or df_t2.empty:
            return pd.DataFrame(), modelo_num

        faltas_t1 = _faltas_por_meses(gestion, _MESES_T1)
        faltas_t2 = _faltas_por_meses(gestion, meses_t2_usar)

        df_t1['faltas'] = df_t1['estudiante_id'].map(faltas_t1).fillna(0).astype(int)
        df_t2['faltas'] = df_t2['estudiante_id'].map(faltas_t2).fillna(0).astype(int)

        df_t1 = _renombrar_con_prefijo(df_t1, 't1_')
        df_t2 = _renombrar_con_prefijo(df_t2, 't2_')

        cols_t2 = ['estudiante_id', 'materia_id'] + [c for c in df_t2.columns if c.startswith('t2_')]
        df = df_t1.merge(df_t2[cols_t2], on=['estudiante_id', 'materia_id'], how='inner')

    return df, modelo_num


# ─────────────────────────────────────────────────────────────────────────────
# PASO 2: Predecir
# ─────────────────────────────────────────────────────────────────────────────

def _predecir(df: pd.DataFrame, modelo, feature_cols: list) -> pd.DataFrame:
    X = df[feature_cols].fillna(0).values

    predicciones   = modelo.predict(X)       # 0=APROBADO, 1=REPROBADO
    probabilidades = modelo.predict_proba(X)

    clases       = list(modelo.classes_)
    idx_reprobado = clases.index(1) if 1 in clases else 0

    # Probabilidad almacenada en escala 0-100
    prob_pct = (probabilidades[:, idx_reprobado] * 100).round(2)

    df = df.copy()
    df['prediccion']           = [int(p) for p in predicciones]
    df['probabilidad_reprobar'] = prob_pct
    df['riesgo']               = [_prob_a_riesgo(p) for p in prob_pct]
    return df


# ─────────────────────────────────────────────────────────────────────────────
# PASO 3: Guardar en predicciones_arbol
# ─────────────────────────────────────────────────────────────────────────────

def guardar_predicciones_arbol(df: pd.DataFrame, modelo_num: int,
                                gestion: int, trimestre: int, mes: int):
    from pymongo import UpdateOne

    feature_cols = _FEATURES_M1 if modelo_num == 1 else _FEATURES_M2
    fecha        = datetime.now(tz=timezone.utc)
    ops          = []

    for _, row in df.iterrows():
        filtro = {
            'estudiante_id': int(row['estudiante_id']),
            'materia_id':    int(row['materia_id']),
            'gestion':       gestion,
            'trimestre':     trimestre,
            'mes':           mes,
        }
        features_doc = {
            col: round(float(row[col]), 4) if col in row.index and row[col] is not None else None
            for col in feature_cols
        }
        ops.append(UpdateOne(filtro, {'$set': {
            **filtro,
            'curso_id':              int(row['curso_id']),
            'modelo':                modelo_num,
            'prediccion':            int(row['prediccion']),           # 0=APROBADO, 1=REPROBADO
            'probabilidad_reprobar': float(row['probabilidad_reprobar']),  # 0-100
            'riesgo':                row['riesgo'],                    # derivado de umbrales
            'features':              features_doc,
            'fecha_analisis':        fecha,
        }}, upsert=True))

    col = _get_db()['predicciones_arbol']
    for i in range(0, len(ops), 300):
        col.bulk_write(ops[i:i + 300], ordered=False)


# ─────────────────────────────────────────────────────────────────────────────
# Función principal
# ─────────────────────────────────────────────────────────────────────────────

def _mes_a_trimestre(mes: int) -> int:
    if mes <= 4:
        return 1
    if mes <= 8:
        return 2
    return 3


def ejecutar_analisis_arbol(gestion: int, mes: int) -> dict:
    """
    Orquesta los 3 pasos. Se llama en hilo separado desde planilla_views.py
    después de K-Means, cuando todos los profesores confirmaron su planilla.

    Returns:
        { estado, predicciones, modelo }
    """
    df, modelo_num = obtener_features_arbol(gestion, mes)

    if df.empty:
        return {'estado': 'sin_datos', 'predicciones': 0, 'modelo': modelo_num}

    path  = _JOBLIB_MODELO1 if modelo_num == 1 else _JOBLIB_MODELO2
    modelo = _cargar_modelo(path)

    if modelo is None:
        return {'estado': 'modelo_no_disponible', 'predicciones': 0, 'modelo': modelo_num}

    feature_cols = _FEATURES_M1 if modelo_num == 1 else _FEATURES_M2
    df = _predecir(df, modelo, feature_cols)

    trimestre = _mes_a_trimestre(mes)
    guardar_predicciones_arbol(df, modelo_num, gestion, trimestre, mes)

    return {'estado': 'ok', 'predicciones': len(df), 'modelo': modelo_num}

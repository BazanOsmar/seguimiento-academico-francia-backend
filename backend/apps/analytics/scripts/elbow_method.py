"""
Método del codo para confirmar que k=4 es el número correcto de clusters.
Corre UNA SOLA VEZ manualmente cuando hay datos reales en notas_mensuales.

Uso (desde la raíz del proyecto, con venv activado):
    python -m backend.apps.analytics.scripts.elbow_method
"""

import os
import django

os.environ.setdefault('DJANGO_SETTINGS_MODULE', 'backend.config.settings.local')
django.setup()

import matplotlib.pyplot as plt
from sklearn.cluster import KMeans
from sklearn.preprocessing import StandardScaler

from backend.apps.analytics.services.kmeans_service import (
    obtener_features_colegio,
    _FEATURE_COLS,
)


def metodo_del_codo(gestion: int, mes: int):
    df = obtener_features_colegio(gestion=gestion, mes=mes)

    if df is None or len(df) < 8:
        print(f"No hay suficientes estudiantes ({0 if df is None else len(df)}). Mínimo requerido: 8.")
        return

    X = df[_FEATURE_COLS].fillna(0).values
    X_scaled = StandardScaler().fit_transform(X)

    inertias = []
    rango_k = range(2, 9)

    for k in rango_k:
        km = KMeans(n_clusters=k, random_state=42, n_init=10)
        km.fit(X_scaled)
        inertias.append(km.inertia_)

    plt.figure(figsize=(8, 5))
    plt.plot(list(rango_k), inertias, marker='o', linewidth=2, color='#2E75B6')
    plt.title('Método del Codo — K-Means', fontsize=14)
    plt.xlabel('Número de clusters (k)')
    plt.ylabel('Inercia')
    plt.xticks(list(rango_k))
    plt.grid(True, linestyle='--', alpha=0.5)
    plt.tight_layout()
    plt.savefig('elbow_plot.png', dpi=150)
    plt.show()
    print('Gráfico guardado como elbow_plot.png')
    print(f'Inertias: {dict(zip(rango_k, inertias))}')
    print(f'Estudiantes analizados: {len(df)}')


if __name__ == '__main__':
    metodo_del_codo(gestion=2026, mes=3)

# =============================================================================
# K-MEANS — Agrupación de Estudiantes por Rendimiento Académico
# Colegio Francia · Proyecto de Grado · 2026
#
# INSTRUCCIONES:
#   1. Ejecutar cada sección en orden (de arriba hacia abajo)
#   2. Cuando se pida, subir el archivo CSV con los datos de estudiantes
#   3. El CSV debe tener las columnas indicadas en la Sección 2
# =============================================================================


# =============================================================================
# SECCIÓN 1 — Importaciones
# =============================================================================

import numpy as np
import pandas as pd
import matplotlib.pyplot as plt
import matplotlib.cm as cm
import seaborn as sns

from sklearn.cluster import KMeans
from sklearn.preprocessing import StandardScaler
from sklearn.decomposition import PCA
from sklearn.metrics import silhouette_score, silhouette_samples

# Para subir archivos desde tu PC a Google Colab
from google.colab import files

# Configuración visual global
plt.rcParams['figure.dpi'] = 120
plt.rcParams['font.family'] = 'DejaVu Sans'
sns.set_theme(style='whitegrid', palette='muted')

print("Librerías cargadas correctamente.")


# =============================================================================
# SECCIÓN 2 — Carga del dataset CSV
#
# El CSV debe tener estas columnas (en cualquier orden):
#
#   estudiante_id       → número entero identificador del estudiante
#   nombre              → nombre completo (texto)
#   curso               → ej. "1ro A", "2do B"
#   ser_pct             → dimensión SER normalizada       [0.0 – 1.0]
#   saber_pct           → dimensión SABER normalizada     [0.0 – 1.0]
#   hacer_pct           → dimensión HACER normalizada     [0.0 – 1.0]
#   tasa_entrega_tareas → tareas entregadas / tareas totales [0.0 – 1.0]
#   promedio_examenes   → promedio de notas > 0 en saber  [0.0 – 45.0]
#   pct_asistencia      → (PRESENTE+ATRASO+LICENCIA) / sesiones [0.0 – 1.0]
#   pct_atrasos         → ATRASO / sesiones               [0.0 – 1.0]
#   tendencia           → nota_mensual_actual − nota_mes_anterior
#   nota_mensual        → nota total del mes (SER+SABER+HACER) [0.0 – 95.0]
# =============================================================================

# Subir el archivo CSV desde tu computadora
print("Selecciona el archivo CSV con los datos de estudiantes...")
uploaded = files.upload()

# Cargar el CSV en un DataFrame
nombre_archivo = list(uploaded.keys())[0]
df_raw = pd.read_csv(nombre_archivo)

print(f"\nArchivo cargado: '{nombre_archivo}'")
print(f"Filas: {len(df_raw)} estudiantes | Columnas: {df_raw.shape[1]}")
print("\nPrimeras 5 filas:")
df_raw.head()


# =============================================================================
# SECCIÓN 3 — Exploración inicial de los datos (EDA)
# =============================================================================

print("=" * 60)
print("INFORMACIÓN GENERAL DEL DATASET")
print("=" * 60)
df_raw.info()

print("\n" + "=" * 60)
print("ESTADÍSTICAS DESCRIPTIVAS")
print("=" * 60)
df_raw.describe().round(3)


# ── Verificar valores faltantes ──────────────────────────────────────────────
print("\n" + "=" * 60)
print("VALORES FALTANTES POR COLUMNA")
print("=" * 60)
faltantes = df_raw.isnull().sum()
faltantes = faltantes[faltantes > 0]
if faltantes.empty:
    print("No hay valores faltantes.")
else:
    print(faltantes)


# ── Distribución de notas mensuales ──────────────────────────────────────────
fig, axes = plt.subplots(1, 2, figsize=(14, 4))

axes[0].hist(df_raw['nota_mensual'], bins=20, color='steelblue', edgecolor='white')
axes[0].set_title('Distribución de Nota Mensual')
axes[0].set_xlabel('Nota mensual (0 – 95)')
axes[0].set_ylabel('Cantidad de estudiantes')

axes[1].hist(df_raw['pct_asistencia'], bins=20, color='mediumseagreen', edgecolor='white')
axes[1].set_title('Distribución de Asistencia')
axes[1].set_xlabel('Porcentaje de asistencia')
axes[1].set_ylabel('Cantidad de estudiantes')

plt.suptitle('Distribución de variables clave', fontsize=13, fontweight='bold')
plt.tight_layout()
plt.show()


# =============================================================================
# SECCIÓN 4 — Preprocesamiento
#
# - Se seleccionan las 8 features que usará K-Means
# - Los valores faltantes se reemplazan con 0
# - Se normaliza con StandardScaler (media=0, desviación estándar=1)
#   para que ninguna variable domine por su escala
# =============================================================================

# Columnas que entran al modelo
FEATURES = [
    'ser_pct',
    'saber_pct',
    'hacer_pct',
    'tasa_entrega_tareas',
    'promedio_examenes',
    'pct_asistencia',
    'pct_atrasos',
    'tendencia',
]

# Extraer las features y manejar valores faltantes
X = df_raw[FEATURES].fillna(0).values

# Normalizar: necesario para K-Means porque el algoritmo usa distancias euclidianas.
# Sin normalizar, 'promedio_examenes' (escala 0-45) dominaría sobre 'ser_pct' (0-1).
scaler = StandardScaler()
X_scaled = scaler.fit_transform(X)

print(f"Features seleccionadas: {FEATURES}")
print(f"Shape del dataset normalizado: {X_scaled.shape}")
print(f"\nMedia antes de escalar (promedio_examenes): {df_raw['promedio_examenes'].mean():.2f}")
print(f"Media después de escalar (promedio_examenes): {X_scaled[:, 4].mean():.4f}  ← debe estar cerca de 0")


# =============================================================================
# SECCIÓN 5 — Método del Codo
#
# Ayuda a encontrar el número óptimo de clusters (k).
# Se grafica la inercia (suma de distancias cuadradas de cada punto a su
# centroide más cercano) para distintos valores de k.
# El "codo" indica el k donde agregar más clusters ya no aporta mucho.
# =============================================================================

inertias = []
rango_k = range(2, 10)

for k in rango_k:
    km = KMeans(n_clusters=k, random_state=42, n_init=10)
    km.fit(X_scaled)
    inertias.append(km.inertia_)

# Graficar el codo
plt.figure(figsize=(8, 5))
plt.plot(list(rango_k), inertias, marker='o', linewidth=2.5,
         color='#2E75B6', markerfacecolor='white', markeredgewidth=2)

# Marcar el k elegido (4)
K_ELEGIDO = 4
idx_elegido = list(rango_k).index(K_ELEGIDO)
plt.axvline(x=K_ELEGIDO, color='tomato', linestyle='--', linewidth=1.5, label=f'k = {K_ELEGIDO} (elegido)')
plt.scatter([K_ELEGIDO], [inertias[idx_elegido]], color='tomato', s=120, zorder=5)

plt.title('Método del Codo — Selección de k óptimo', fontsize=14, fontweight='bold')
plt.xlabel('Número de clusters (k)')
plt.ylabel('Inercia (suma de distancias cuadradas)')
plt.xticks(list(rango_k))
plt.legend()
plt.grid(True, linestyle='--', alpha=0.5)
plt.tight_layout()
plt.savefig('elbow_plot.png', dpi=150, bbox_inches='tight')
plt.show()

print(f"\nInercias por k: {dict(zip(rango_k, [round(i, 1) for i in inertias]))}")
print("Gráfico guardado como 'elbow_plot.png'")


# =============================================================================
# SECCIÓN 6 — Entrenamiento K-Means con k = 4
#
# Se usan 4 clusters que corresponden a:
#   Excelente · Satisfactorio · Requiere Apoyo · Riesgo Crítico
#
# El etiquetado es automático: el cluster con mayor promedio de nota_mensual
# recibe "Excelente", el de menor recibe "Riesgo Crítico".
# =============================================================================

K = 4
ETIQUETAS = ['Excelente', 'Satisfactorio', 'Requiere Apoyo', 'Riesgo Crítico']

# Entrenar el modelo
km_final = KMeans(n_clusters=K, random_state=42, n_init=10)
clusters_num = km_final.fit_predict(X_scaled)

# Agregar el cluster numérico al DataFrame
df = df_raw.copy()
df['cluster_num'] = clusters_num

# Etiquetar por nota_mensual promedio de cada cluster (de mayor a menor)
media_por_cluster = df.groupby('cluster_num')['nota_mensual'].mean().sort_values(ascending=False)
label_map = {cluster_id: etiqueta for cluster_id, etiqueta in zip(media_por_cluster.index, ETIQUETAS)}
df['cluster'] = df['cluster_num'].map(label_map)

print("=" * 60)
print("RESULTADOS DEL ENTRENAMIENTO K-MEANS")
print("=" * 60)
print(f"\nEstudiantes analizados: {len(df)}")
print(f"\nDistribución por cluster:")
print(df['cluster'].value_counts().to_string())

print(f"\nNota mensual promedio por cluster:")
print(df.groupby('cluster')['nota_mensual'].mean().sort_values(ascending=False).round(2).to_string())


# ── Puntuación de silueta (mide qué tan bien separados están los clusters) ────
sil_score = silhouette_score(X_scaled, clusters_num)
print(f"\nPuntuación de silueta: {sil_score:.4f}  (rango -1 a 1, mayor es mejor)")


# =============================================================================
# SECCIÓN 7 — Visualizaciones
# =============================================================================

COLORES = {
    'Excelente':      '#2ecc71',   # verde
    'Satisfactorio':  '#3498db',   # azul
    'Requiere Apoyo': '#f39c12',   # naranja
    'Riesgo Crítico': '#e74c3c',   # rojo
}


# ── 7.1 Gráfico de barras: distribución de clusters ──────────────────────────
conteo = df['cluster'].value_counts().reindex(ETIQUETAS)

plt.figure(figsize=(9, 5))
bars = plt.bar(conteo.index, conteo.values,
               color=[COLORES[c] for c in conteo.index], edgecolor='white', width=0.6)

for bar, val in zip(bars, conteo.values):
    pct = val / len(df) * 100
    plt.text(bar.get_x() + bar.get_width() / 2, bar.get_height() + 2,
             f'{val}\n({pct:.1f}%)', ha='center', va='bottom', fontsize=11, fontweight='bold')

plt.title('Distribución de Estudiantes por Cluster', fontsize=14, fontweight='bold')
plt.ylabel('Cantidad de estudiantes')
plt.ylim(0, conteo.max() * 1.2)
plt.tight_layout()
plt.savefig('clusters_distribucion.png', dpi=150, bbox_inches='tight')
plt.show()


# ── 7.2 Dispersión: Asistencia vs Nota Mensual ───────────────────────────────
plt.figure(figsize=(10, 6))
for cluster_name in ETIQUETAS:
    mask = df['cluster'] == cluster_name
    plt.scatter(
        df.loc[mask, 'pct_asistencia'] * 100,
        df.loc[mask, 'nota_mensual'],
        c=COLORES[cluster_name],
        label=cluster_name,
        alpha=0.7,
        s=60,
        edgecolors='white',
        linewidths=0.5,
    )

plt.xlabel('Asistencia (%)', fontsize=12)
plt.ylabel('Nota Mensual (0 – 95)', fontsize=12)
plt.title('Asistencia vs Nota Mensual por Cluster', fontsize=14, fontweight='bold')
plt.legend(title='Cluster', fontsize=10)
plt.tight_layout()
plt.savefig('scatter_asistencia_nota.png', dpi=150, bbox_inches='tight')
plt.show()


# ── 7.3 Radar chart: perfil promedio de cada cluster ─────────────────────────
# Muestra qué tanto "puntúa" cada cluster en cada feature normalizada [0, 1]

# Calcular los centroides en el espacio original (sin normalizar)
medias_cluster = df.groupby('cluster')[FEATURES].mean()

# Normalizar cada feature al rango [0, 1] para el radar
medias_norm = (medias_cluster - medias_cluster.min()) / (medias_cluster.max() - medias_cluster.min() + 1e-9)

etiquetas_radar = [
    'SER', 'SABER', 'HACER',
    'Entrega\nTareas', 'Prom.\nExámenes',
    'Asistencia', 'Sin\nAtrasos*', 'Tendencia'
]

N = len(FEATURES)
angulos = np.linspace(0, 2 * np.pi, N, endpoint=False).tolist()
angulos += angulos[:1]  # cerrar el polígono

fig, ax = plt.subplots(figsize=(8, 8), subplot_kw=dict(polar=True))

for cluster_name in ETIQUETAS:
    if cluster_name not in medias_norm.index:
        continue
    valores = medias_norm.loc[cluster_name].tolist()
    # Invertir pct_atrasos: menos atrasos = mejor
    valores[6] = 1 - valores[6]
    valores += valores[:1]
    ax.plot(angulos, valores, linewidth=2, color=COLORES[cluster_name], label=cluster_name)
    ax.fill(angulos, valores, alpha=0.1, color=COLORES[cluster_name])

ax.set_xticks(angulos[:-1])
ax.set_xticklabels(etiquetas_radar, fontsize=10)
ax.set_ylim(0, 1)
ax.set_yticks([0.25, 0.5, 0.75, 1.0])
ax.set_yticklabels(['25%', '50%', '75%', '100%'], fontsize=7)
ax.set_title('Perfil Promedio por Cluster\n(valores normalizados)', fontsize=13, fontweight='bold', pad=20)
ax.legend(loc='upper right', bbox_to_anchor=(1.3, 1.1))

plt.figtext(0.5, 0.01, '* Invertido: mayor valor = menos atrasos', ha='center', fontsize=8, color='gray')
plt.tight_layout()
plt.savefig('radar_clusters.png', dpi=150, bbox_inches='tight')
plt.show()


# ── 7.4 Visualización 2D con PCA ─────────────────────────────────────────────
# PCA reduce las 8 features a 2 dimensiones para poder graficar.
# No pierde toda la información, pero sí parte — es solo para visualizar.

pca = PCA(n_components=2, random_state=42)
X_pca = pca.fit_transform(X_scaled)
varianza_explicada = pca.explained_variance_ratio_ * 100

plt.figure(figsize=(10, 7))
for cluster_name in ETIQUETAS:
    mask = df['cluster'] == cluster_name
    plt.scatter(
        X_pca[mask, 0], X_pca[mask, 1],
        c=COLORES[cluster_name],
        label=f'{cluster_name} (n={mask.sum()})',
        alpha=0.7, s=60, edgecolors='white', linewidths=0.5,
    )

# Marcar los centroides
centroides_pca = pca.transform(km_final.cluster_centers_)
plt.scatter(centroides_pca[:, 0], centroides_pca[:, 1],
            marker='X', s=200, c='black', zorder=10, label='Centroides')

plt.xlabel(f'Componente Principal 1 ({varianza_explicada[0]:.1f}% varianza)', fontsize=11)
plt.ylabel(f'Componente Principal 2 ({varianza_explicada[1]:.1f}% varianza)', fontsize=11)
plt.title(f'Clusters K-Means visualizados en 2D (PCA)\n'
          f'Varianza explicada total: {sum(varianza_explicada):.1f}%', fontsize=13, fontweight='bold')
plt.legend(fontsize=9)
plt.tight_layout()
plt.savefig('pca_clusters.png', dpi=150, bbox_inches='tight')
plt.show()


# ── 7.5 Análisis de Silueta por cluster ──────────────────────────────────────
# La silueta mide qué tan bien asignado está cada estudiante a su cluster.
# Valores cerca de 1 = bien asignado. Cerca de 0 = en el borde. Negativo = mal asignado.

sil_values = silhouette_samples(X_scaled, clusters_num)
df['silhouette'] = sil_values

fig, ax = plt.subplots(figsize=(10, 6))
y_lower = 10

for i, cluster_name in enumerate(ETIQUETAS):
    mask = df['cluster'] == cluster_name
    cluster_sil = sil_values[mask.values]
    cluster_sil.sort()

    size = cluster_sil.shape[0]
    y_upper = y_lower + size

    color = COLORES[cluster_name]
    ax.fill_betweenx(np.arange(y_lower, y_upper), 0, cluster_sil,
                     facecolor=color, edgecolor=color, alpha=0.7)
    ax.text(-0.05, y_lower + 0.5 * size, cluster_name, fontsize=9)
    y_lower = y_upper + 10

ax.axvline(x=sil_score, color='red', linestyle='--', linewidth=1.5,
           label=f'Silueta promedio: {sil_score:.3f}')
ax.set_xlabel('Coeficiente de silueta')
ax.set_ylabel('Estudiantes agrupados por cluster')
ax.set_title('Análisis de Silueta por Cluster', fontsize=13, fontweight='bold')
ax.legend()
plt.tight_layout()
plt.savefig('silhouette_plot.png', dpi=150, bbox_inches='tight')
plt.show()


# =============================================================================
# SECCIÓN 8 — Tabla de resultados por cluster
# =============================================================================

print("=" * 70)
print("PROMEDIO DE FEATURES POR CLUSTER")
print("=" * 70)

resumen = df.groupby('cluster')[FEATURES + ['nota_mensual']].mean().round(3)
resumen = resumen.reindex(ETIQUETAS)
resumen.columns = [
    'SER', 'SABER', 'HACER', 'Entrega Tareas',
    'Prom. Examenes', 'Asistencia', 'Atrasos', 'Tendencia', 'Nota Mensual'
]
print(resumen.to_string())


# ── Exportar resultados completos a CSV ───────────────────────────────────────
cols_exportar = ['estudiante_id', 'nombre', 'curso', 'nota_mensual', 'cluster'] + FEATURES
df[cols_exportar].to_csv('resultados_kmeans.csv', index=False)
print("\nResultados exportados a 'resultados_kmeans.csv'")
files.download('resultados_kmeans.csv')

print("\n¡Análisis K-Means completado exitosamente!")

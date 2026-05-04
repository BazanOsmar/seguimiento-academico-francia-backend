'use strict';

/* ================================================================
   estadisticas.js — Dashboard analítico del Director
   ================================================================ */

// ── Colores por etiqueta de cluster ─────────────────────────────
const CLUSTER_COLORES = {
    'Excelente':            '#22c55e',
    'Satisfactorio':        '#3b82f6',
    'En Desarrollo':        '#06b6d4',
    'Requiere Apoyo':       '#f59e0b',
    'Riesgo Crítico':       '#ef4444',
    'Rendimiento Adecuado': '#22c55e',
    'Riesgo Académico':     '#ef4444',
    'Muy Bien':             '#3b82f6',
};

// Estado K-Means (datos cargados)
let _kmeansData = null;

// ── Estado de los gráficos ───────────────────────────────────────
let _charts = {};

// ── Colores Chart.js (fijos, usando valores de paleta) ────────────
const C = {
    verde:    '#22c55e',
    rojo:     '#ef4444',
    amarillo: '#f59e0b',
    azul:     '#6366f1',
    cyan:     '#06b6d4',
    morado:   '#a855f7',
};

// ── Opciones comunes Chart.js ─────────────────────────────────────
const _baseFont = { family: 'inherit', size: 12 };

// ════════════════════════════════════════════════════════════════
// 1. KPI CARDS — datos reales
// ════════════════════════════════════════════════════════════════
async function _cargarKPIs() {
    const hoy = new Date().toISOString().split('T')[0];

    // Paralelo: estudiantes, cursos, citaciones pendientes, asistencia hoy
    const [resEstudiantes, resCursos, resCitaciones, resAsistencia] = await Promise.all([
        fetchAPI('/api/students/'),
        fetchAPI('/api/academics/cursos/'),
        fetchAPI('/api/discipline/citaciones/?asistencia=PENDIENTE'),
        fetchAPI(`/api/attendance/estado-diario/?fecha=${hoy}`),
    ]);

    // Total estudiantes
    if (resEstudiantes.ok && Array.isArray(resEstudiantes.data)) {
        document.getElementById('kpi-estudiantes').textContent = resEstudiantes.data.length;
    }

    // Total cursos
    if (resCursos.ok && Array.isArray(resCursos.data)) {
        document.getElementById('kpi-cursos').textContent = resCursos.data.length;
    }

    // Citaciones pendientes
    if (resCitaciones.ok && Array.isArray(resCitaciones.data)) {
        document.getElementById('kpi-citaciones').textContent = resCitaciones.data.length;
    }

    // Asistencia hoy: % sesiones registradas vs total cursos
    if (resAsistencia.ok && resAsistencia.data) {
        const totalCursos = resCursos.ok && Array.isArray(resCursos.data) ? resCursos.data.length : 0;
        const sesionesHoy = Array.isArray(resAsistencia.data.sesiones) ? resAsistencia.data.sesiones.length : 0;
        if (totalCursos > 0) {
            const pct = Math.round((sesionesHoy / totalCursos) * 100);
            document.getElementById('kpi-asistencia').textContent = `${pct}%`;
        } else {
            document.getElementById('kpi-asistencia').textContent = '—';
        }
    }
}

// ════════════════════════════════════════════════════════════════
// 2. K-MEANS — datos reales
// ════════════════════════════════════════════════════════════════
async function _cargarKMeans(mes, gestion) {
    const estadoEl = document.getElementById('kmeansEstado');
    estadoEl.style.display = 'block';
    estadoEl.textContent = 'Cargando resultados…';

    const { ok, data } = await fetchAPI(`/api/analytics/kmeans/resultados/?gestion=${gestion}&mes=${mes}`);

    if (!ok || !data.estudiantes || !data.estudiantes.length) {
        estadoEl.textContent = 'Sin resultados para este mes. Usa el botón "Ejecutar análisis" si ya están todas las planillas cargadas.';
        document.getElementById('tbodyKmeans').innerHTML =
            `<tr><td colspan="11" style="text-align:center;color:var(--text-muted);padding:32px">Sin datos para este mes.</td></tr>`;
        document.getElementById('clusterCards').innerHTML =
            `<div style="color:var(--text-muted);font-size:0.8rem;padding:20px 0">Sin datos disponibles.</div>`;
        if (_charts.burbuja)    _charts.burbuja.destroy();
        if (_charts.distCurso)  _charts.distCurso.destroy();
        return;
    }

    _kmeansData = data;

    const mesesNombres = ['','Enero','Febrero','Marzo','Abril','Mayo','Junio','Julio','Agosto','Septiembre','Octubre','Noviembre','Diciembre'];
    const fechaStr = data.fecha_analisis ? new Date(data.fecha_analisis).toLocaleString('es-BO') : '—';
    estadoEl.textContent = `Último análisis: ${mesesNombres[mes]} ${gestion} · ${data.estudiantes.length} estudiantes · ${data.k} grupos · Generado: ${fechaStr}`;

    _renderBubbleChart(data.estudiantes);
    _renderClusterCards(data.estudiantes);
    _renderDistribucionPorCurso(data.estudiantes);
    _renderTablaKmeans(data.estudiantes);
    _inicializarFiltrosKmeans(data.estudiantes);
}

async function _ejecutarKMeans() {
    const mes     = parseInt(document.getElementById('kmeansMes').value);
    const gestion = new Date().getFullYear();
    const btn     = document.getElementById('btnEjecutarKmeans');
    const estadoEl = document.getElementById('kmeansEstado');

    btn.disabled = true;
    btn.textContent = 'Ejecutando…';
    estadoEl.style.display = 'block';
    estadoEl.textContent = 'Corriendo K-Means, esto puede tardar unos segundos…';

    const { ok, data } = await fetchAPI('/api/analytics/kmeans/ejecutar/', {
        method: 'POST',
        body: JSON.stringify({ gestion, mes }),
    });

    btn.disabled = false;
    btn.textContent = 'Ejecutar análisis';

    if (!ok) {
        estadoEl.textContent = data?.errores || 'Error al ejecutar el análisis.';
        return;
    }

    await _cargarKMeans(mes, gestion);
}

function _renderBubbleChart(estudiantes) {
    const ctx = document.getElementById('chartBurbuja').getContext('2d');
    if (_charts.burbuja) _charts.burbuja.destroy();

    const porCluster = {};
    estudiantes.forEach(e => {
        if (!porCluster[e.cluster]) porCluster[e.cluster] = [];
        porCluster[e.cluster].push(e);
    });

    const datasets = Object.entries(porCluster).map(([label, lista]) => {
        const color = CLUSTER_COLORES[label] || '#94a3b8';
        return {
            label,
            data: lista.map(e => ({
                x: e.features.pct_asistencia,
                y: e.nota_mensual,
                r: 7,
                nombre: e.nombre,
            })),
            backgroundColor: color + 'bb',
            borderColor: color,
            borderWidth: 1.5,
        };
    });

    _charts.burbuja = new Chart(ctx, {
        type: 'bubble',
        data: { datasets },
        options: {
            responsive: true,
            maintainAspectRatio: false,
            plugins: {
                legend: { labels: { color: '#94a3b8', font: _baseFont, boxWidth: 12, padding: 14 } },
                tooltip: {
                    callbacks: {
                        label: ctx => {
                            const d = ctx.raw;
                            return ` ${d.nombre} | Asist: ${d.x}% | Nota: ${d.y}/95`;
                        },
                    },
                },
            },
            scales: {
                x: {
                    title: { display: true, text: '% Asistencia', color: '#64748b', font: _baseFont },
                    min: 0, max: 105,
                    ticks: { color: '#64748b', font: _baseFont, callback: v => `${v}%` },
                    grid: { color: 'rgba(255,255,255,0.04)' },
                },
                y: {
                    title: { display: true, text: 'Nota mensual /95', color: '#64748b', font: _baseFont },
                    min: 0, max: 100,
                    ticks: { color: '#64748b', font: _baseFont },
                    grid: { color: 'rgba(255,255,255,0.06)' },
                },
            },
        },
    });
}

function _renderClusterCards(estudiantes) {
    const container = document.getElementById('clusterCards');
    container.innerHTML = '';

    const porCluster = {};
    estudiantes.forEach(e => {
        if (!porCluster[e.cluster]) porCluster[e.cluster] = [];
        porCluster[e.cluster].push(e);
    });

    Object.entries(porCluster).forEach(([label, lista]) => {
        const color    = CLUSTER_COLORES[label] || '#94a3b8';
        const avgAsist = Math.round(lista.reduce((s, e) => s + e.features.pct_asistencia, 0) / lista.length);
        const avgNota  = (lista.reduce((s, e) => s + e.nota_mensual, 0) / lista.length).toFixed(1);
        const avgCit   = (lista.reduce((s, e) => s + e.features.tasa_citaciones, 0) / lista.length).toFixed(1);

        const card = document.createElement('div');
        card.className = 'cluster-card';
        card.style.borderLeftColor = color;
        card.innerHTML = `
            <div class="cluster-card__header">
                <span class="cluster-dot" style="background:${color}"></span>
                <span class="cluster-label">${label}</span>
            </div>
            <div class="cluster-stats">
                <div class="cluster-stat">
                    <span class="cluster-stat__val">${lista.length}</span>
                    <span class="cluster-stat__key">estudiantes</span>
                </div>
                <div class="cluster-stat">
                    <span class="cluster-stat__val">${avgAsist}%</span>
                    <span class="cluster-stat__key">asistencia</span>
                </div>
                <div class="cluster-stat">
                    <span class="cluster-stat__val">${avgNota}</span>
                    <span class="cluster-stat__key">nota prom.</span>
                </div>
                <div class="cluster-stat">
                    <span class="cluster-stat__val">${avgCit}%</span>
                    <span class="cluster-stat__key">citaciones</span>
                </div>
            </div>
        `;
        container.appendChild(card);
    });
}

function _tendenciaIcon(val) {
    if (val > 0.1)  return '<span style="color:#22c55e;font-weight:700">↑</span>';
    if (val < -0.1) return '<span style="color:#ef4444;font-weight:700">↓</span>';
    return '<span style="color:#64748b">→</span>';
}

function _renderTablaKmeans(estudiantes) {
    const tbody = document.getElementById('tbodyKmeans');
    if (!estudiantes.length) {
        tbody.innerHTML = `<tr><td colspan="11" style="text-align:center;color:var(--text-muted);padding:32px">Sin datos.</td></tr>`;
        return;
    }

    tbody.innerHTML = estudiantes.map(e => {
        const color = CLUSTER_COLORES[e.cluster] || '#94a3b8';
        const f = e.features;
        return `
            <tr>
                <td style="font-weight:500">${e.nombre}</td>
                <td style="color:var(--text-muted)">${e.curso}</td>
                <td>
                    <span style="display:inline-block;padding:2px 9px;border-radius:20px;font-size:0.7rem;font-weight:700;background:${color}22;color:${color}">
                        ${e.cluster}
                    </span>
                </td>
                <td style="font-weight:600">${e.nota_mensual}</td>
                <td>${f.ser_pct}%</td>
                <td>${f.saber_pct}%</td>
                <td>${f.hacer_pct}%</td>
                <td>${f.pct_asistencia}%</td>
                <td>${f.tasa_entrega_tareas}%</td>
                <td style="text-align:center">${_tendenciaIcon(f.tendencia_norm)}</td>
                <td style="color:${f.tasa_citaciones > 50 ? '#ef4444' : 'inherit'}">${f.tasa_citaciones}%</td>
            </tr>
        `;
    }).join('');

    document.getElementById('kmeansConteo').textContent = `${estudiantes.length} estudiantes`;
}

// Orden canónico de clusters de mejor a peor rendimiento
const _ORDEN_CLUSTERS = [
    'Excelente', 'Rendimiento Adecuado', 'Satisfactorio', 'Muy Bien',
    'En Desarrollo', 'Requiere Apoyo', 'Riesgo Académico', 'Riesgo Crítico',
];

function _renderDistribucionPorCurso(estudiantes) {
    const cursos = [...new Set(estudiantes.map(e => e.curso))].sort();
    const clusters = [...new Set(estudiantes.map(e => e.cluster))]
        .sort((a, b) => {
            const ia = _ORDEN_CLUSTERS.indexOf(a);
            const ib = _ORDEN_CLUSTERS.indexOf(b);
            return (ia === -1 ? 99 : ia) - (ib === -1 ? 99 : ib);
        });

    const datasets = clusters.map(cluster => {
        const color = CLUSTER_COLORES[cluster] || '#94a3b8';
        return {
            label: cluster,
            data: cursos.map(curso =>
                estudiantes.filter(e => e.curso === curso && e.cluster === cluster).length
            ),
            backgroundColor: color + 'cc',
            borderColor: color,
            borderWidth: 1,
            borderRadius: 3,
        };
    });

    // Altura dinámica según cantidad de cursos
    const wrap = document.getElementById('distCursoWrap');
    wrap.style.height = `${Math.max(140, cursos.length * 38)}px`;

    const ctx = document.getElementById('chartDistCurso').getContext('2d');
    if (_charts.distCurso) _charts.distCurso.destroy();

    _charts.distCurso = new Chart(ctx, {
        type: 'bar',
        data: { labels: cursos, datasets },
        options: {
            indexAxis: 'y',
            responsive: true,
            maintainAspectRatio: false,
            plugins: {
                legend: { labels: { color: '#94a3b8', font: _baseFont, boxWidth: 12, padding: 14 } },
                tooltip: {
                    callbacks: {
                        label: ctx => ` ${ctx.dataset.label}: ${ctx.parsed.x} estudiante${ctx.parsed.x !== 1 ? 's' : ''}`,
                    },
                },
            },
            scales: {
                x: {
                    stacked: true,
                    ticks: { color: '#64748b', font: _baseFont, stepSize: 1 },
                    grid: { color: 'rgba(255,255,255,0.05)' },
                },
                y: {
                    stacked: true,
                    ticks: { color: '#94a3b8', font: _baseFont },
                    grid: { display: false },
                },
            },
        },
    });
}

function _inicializarFiltrosKmeans(estudiantes) {
    const selCurso   = document.getElementById('filtroKmeansCurso');
    const selCluster = document.getElementById('filtroKmeansCluster');

    // Poblar cursos únicos
    const cursos = [...new Set(estudiantes.map(e => e.curso))].sort();
    selCurso.innerHTML = '<option value="">Todos los cursos</option>';
    cursos.forEach(c => { const o = document.createElement('option'); o.value = c; o.textContent = c; selCurso.appendChild(o); });

    // Poblar clusters únicos
    const clusters = [...new Set(estudiantes.map(e => e.cluster))];
    selCluster.innerHTML = '<option value="">Todos los grupos</option>';
    clusters.forEach(c => { const o = document.createElement('option'); o.value = c; o.textContent = c; selCluster.appendChild(o); });

    const filtrar = () => {
        const curso   = selCurso.value;
        const cluster = selCluster.value;
        const filtrados = estudiantes.filter(e =>
            (!curso   || e.curso   === curso) &&
            (!cluster || e.cluster === cluster)
        );
        _renderTablaKmeans(filtrados);
    };

    selCurso.addEventListener('change', filtrar);
    selCluster.addEventListener('change', filtrar);
}

// ════════════════════════════════════════════════════════════════
// INIT
// ════════════════════════════════════════════════════════════════
document.addEventListener('DOMContentLoaded', async () => {
    // KPIs (async, real data)
    _cargarKPIs();

    // K-Means — seleccionar mes actual por defecto y cargar resultados
    const mesActual = new Date().getMonth() + 1;
    const selMes = document.getElementById('kmeansMes');
    selMes.value = mesActual;
    _cargarKMeans(mesActual, new Date().getFullYear());

    selMes.addEventListener('change', () =>
        _cargarKMeans(parseInt(selMes.value), new Date().getFullYear())
    );
    document.getElementById('btnEjecutarKmeans').addEventListener('click', _ejecutarKMeans);
});

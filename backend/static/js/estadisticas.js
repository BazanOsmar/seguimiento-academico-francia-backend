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

const RIESGO_COLORES = {
    'Alto':  '#ef4444',
    'Medio': '#f59e0b',
    'Bajo':  '#22c55e',
};

let _kmeansData     = null;
let _charts         = {};
let _kmeansFiltrados = [];
let _kmeansPagina   = 1;
const _KMEANS_PAGE  = 20;

let _arbolPage      = 1;
let _arbolFiltros   = {};

const _baseFont = { family: 'inherit', size: 12 };
const C = {
    verde:    '#22c55e',
    rojo:     '#ef4444',
    amarillo: '#f59e0b',
    azul:     '#6366f1',
    cyan:     '#06b6d4',
    morado:   '#a855f7',
};

// ════════════════════════════════════════════════════════════════
// SIDEBAR
// ════════════════════════════════════════════════════════════════
function _initSidebar() {
    const sidebar  = document.querySelector('.sidebar');
    const backdrop = document.getElementById('sidebarBackdrop');
    const btnMenu  = document.getElementById('btnMenu');
    const isDesktop = () => window.matchMedia('(min-width: 769px)').matches;
    let _leaveTimer;

    sidebar.addEventListener('mouseenter', () => {
        clearTimeout(_leaveTimer);
        if (isDesktop()) sidebar.classList.add('sidebar--expanded');
    });
    sidebar.addEventListener('mouseleave', () => {
        if (isDesktop())
            _leaveTimer = setTimeout(() => sidebar.classList.remove('sidebar--expanded'), 200);
    });
    btnMenu.addEventListener('click', () =>
        sidebar.classList.contains('sidebar--open')
            ? (sidebar.classList.remove('sidebar--open'), backdrop.classList.remove('visible'))
            : (sidebar.classList.add('sidebar--open'),    backdrop.classList.add('visible'))
    );
    backdrop.addEventListener('click', () => {
        sidebar.classList.remove('sidebar--open');
        backdrop.classList.remove('visible');
    });

    document.getElementById('btnLogout').addEventListener('click', () => {
        localStorage.removeItem('access_token');
        localStorage.removeItem('refresh_token');
        localStorage.removeItem('user');
        window.location.replace('/login/');
    });

    const user = JSON.parse(localStorage.getItem('user') || 'null');
    if (user) {
        const rol = document.getElementById('profileRole');
        if (rol) rol.textContent = user.tipo_usuario || 'Director';
    }
}

// ════════════════════════════════════════════════════════════════
// TABS
// ════════════════════════════════════════════════════════════════
let _rptCargado = false;

function _inicializarTabs() {
    document.querySelectorAll('.tab-btn').forEach(btn => {
        btn.addEventListener('click', () => {
            const tab = btn.dataset.tab;
            document.querySelectorAll('.tab-btn').forEach(b => b.classList.toggle('active', b === btn));
            document.querySelectorAll('.tab-panel').forEach(p => p.classList.toggle('active', p.id === `panel${tab.charAt(0).toUpperCase() + tab.slice(1)}`));
            if (tab === 'reportes' && !_rptCargado) {
                _rptCargado = true;
                if (typeof window.rptInit === 'function') window.rptInit();
            }
        });
    });
}

// ════════════════════════════════════════════════════════════════
// 1. KPI CARDS
// ════════════════════════════════════════════════════════════════
async function _cargarKPIs() {
    const { ok, data } = await fetchAPI('/api/students/');
    if (ok && Array.isArray(data))
        document.getElementById('kpi-estudiantes').textContent = data.length;
}

function _actualizarKPIsKmeans(estudiantes) {
    const critico = estudiantes.filter(e => e.cluster === 'Riesgo Crítico').length;
    const apoyo   = estudiantes.filter(e => e.cluster === 'Requiere Apoyo').length;
    const promedio = estudiantes.length
        ? (estudiantes.reduce((s, e) => s + e.nota_mensual, 0) / estudiantes.length).toFixed(1)
        : '—';

    document.getElementById('kpi-estudiantes').textContent     = estudiantes.length || '—';
    document.getElementById('kpi-riesgo-critico').textContent  = critico  || '—';
    document.getElementById('kpi-requiere-apoyo').textContent  = apoyo    || '—';
    document.getElementById('kpi-nota-prom').textContent       = estudiantes.length ? promedio : '—';
}

function _resetKPIsKmeans() {
    ['kpi-riesgo-critico', 'kpi-requiere-apoyo', 'kpi-nota-prom'].forEach(id => {
        document.getElementById(id).textContent = '—';
    });
}

function _toggleKmeansContent(hayDatos) {
    document.getElementById('kmeansContent').style.display    = hayDatos ? '' : 'none';
    document.getElementById('kmeansEmptyState').style.display = hayDatos ? 'none' : 'block';
}

function _toggleArbolContent(hayDatos) {
    document.getElementById('arbolContent').style.display    = hayDatos ? '' : 'none';
    document.getElementById('arbolEmptyState').style.display = hayDatos ? 'none' : 'block';
}

// ════════════════════════════════════════════════════════════════
// 2. K-MEANS
// ════════════════════════════════════════════════════════════════
async function _cargarKMeans(mes, gestion) {
    const estadoEl = document.getElementById('kmeansEstado');
    estadoEl.style.display = 'block';
    estadoEl.textContent = 'Cargando resultados…';

    const { ok, data } = await fetchAPI(`/api/analytics/kmeans/resultados/?gestion=${gestion}&mes=${mes}`);

    if (!ok || !data.estudiantes || !data.estudiantes.length) {
        estadoEl.style.display = 'none';
        _toggleKmeansContent(false);
        if (_charts.burbuja)     _charts.burbuja.destroy();
        if (_charts.distCurso)   _charts.distCurso.destroy();
        if (_charts.perfilGrupo) _charts.perfilGrupo.destroy();
        _resetKPIsKmeans();
        return;
    }

    _toggleKmeansContent(true);

    _kmeansData = data;
    _kmeansPagina = 1;

    const mesesNombres = ['','Enero','Febrero','Marzo','Abril','Mayo','Junio','Julio','Agosto','Septiembre','Octubre','Noviembre','Diciembre'];
    const fechaStr = data.fecha_analisis ? new Date(data.fecha_analisis).toLocaleString('es-BO') : '—';
    estadoEl.textContent = `Último análisis: ${mesesNombres[mes]} ${gestion} · ${data.estudiantes.length} estudiantes · ${data.k} grupos · Generado: ${fechaStr}`;

    _actualizarKPIsKmeans(data.estudiantes);
    _renderScatterKmeans(data.estudiantes);
    _renderClusterCards(data.estudiantes);
    _renderPerfilGrupo(data.estudiantes);
    _renderDistribucionPorCurso(data.estudiantes);
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

// Scatter PCA (usa pca_x/pca_y si están disponibles, si no cae en asistencia vs nota)
function _renderScatterKmeans(estudiantes) {
    const ctx = document.getElementById('chartBurbuja').getContext('2d');
    if (_charts.burbuja) _charts.burbuja.destroy();

    const usaPCA = estudiantes.some(e => e.pca_x !== undefined && e.pca_x !== 0 || e.pca_y !== 0);

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
                x: usaPCA ? e.pca_x : e.features.pct_asistencia,
                y: usaPCA ? e.pca_y : e.nota_mensual,
                r: 7,
                nombre: e.nombre,
                nota: e.nota_mensual,
            })),
            backgroundColor: color + 'bb',
            borderColor: color,
            borderWidth: 1.5,
        };
    });

    const xLabel = usaPCA ? 'Componente Principal 1' : '% Asistencia';
    const yLabel = usaPCA ? 'Componente Principal 2' : 'Nota mensual /95';
    const chartTitle = usaPCA ? 'Scatter PCA — Componente 1 vs 2' : 'Scatter — Asistencia vs Nota Mensual';

    document.querySelector('#chartBurbuja').closest('.chart-card').querySelector('.chart-card__title').textContent = chartTitle;

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
                            if (usaPCA)
                                return ` ${d.nombre} | Nota: ${d.nota}/95`;
                            return ` ${d.nombre} | Asist: ${d.x}% | Nota: ${d.y}/95`;
                        },
                    },
                },
            },
            scales: {
                x: {
                    title: { display: true, text: xLabel, color: '#64748b', font: _baseFont },
                    ticks: { color: '#64748b', font: _baseFont },
                    grid: { color: 'rgba(255,255,255,0.04)' },
                },
                y: {
                    title: { display: true, text: yLabel, color: '#64748b', font: _baseFont },
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

function _renderTablaKmeans(lista) {
    const tbody = document.getElementById('tbodyKmeans');
    const pagRow = document.getElementById('paginacionKmeans');

    const totalPags = Math.ceil(lista.length / _KMEANS_PAGE) || 1;
    if (_kmeansPagina > totalPags) _kmeansPagina = totalPags;

    const inicio = (_kmeansPagina - 1) * _KMEANS_PAGE;
    const pagina = lista.slice(inicio, inicio + _KMEANS_PAGE);

    if (!pagina.length) {
        tbody.innerHTML = `<tr><td colspan="11" style="text-align:center;color:var(--text-muted);padding:32px">Sin datos.</td></tr>`;
        pagRow.style.display = 'none';
        document.getElementById('kmeansConteo').textContent = '0 estudiantes';
        return;
    }

    tbody.innerHTML = pagina.map(e => {
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

    document.getElementById('kmeansConteo').textContent = `${lista.length} estudiantes`;

    if (lista.length > _KMEANS_PAGE) {
        pagRow.style.display = 'flex';
        document.getElementById('kPagInfo').textContent = `Pág. ${_kmeansPagina} de ${totalPags}`;
        document.getElementById('kPrevBtn').disabled = _kmeansPagina <= 1;
        document.getElementById('kNextBtn').disabled = _kmeansPagina >= totalPags;
    } else {
        pagRow.style.display = 'none';
    }
}

const _ORDEN_CLUSTERS = [
    'Excelente', 'Rendimiento Adecuado', 'Satisfactorio', 'Muy Bien',
    'En Desarrollo', 'Requiere Apoyo', 'Riesgo Académico', 'Riesgo Crítico',
];

function _renderPerfilGrupo(estudiantes) {
    const ctx = document.getElementById('chartPerfilGrupo').getContext('2d');
    if (_charts.perfilGrupo) _charts.perfilGrupo.destroy();

    const clusters = [...new Set(estudiantes.map(e => e.cluster))]
        .sort((a, b) => _ORDEN_CLUSTERS.indexOf(a) - _ORDEN_CLUSTERS.indexOf(b));

    const avg = (lista, fn) => lista.length ? +(lista.reduce((s, e) => s + fn(e), 0) / lista.length).toFixed(1) : 0;

    const dimensiones = ['SER', 'SABER', 'HACER', 'Tareas'];
    const datasets = clusters.map(label => {
        const lista = estudiantes.filter(e => e.cluster === label);
        const color = CLUSTER_COLORES[label] || '#94a3b8';
        return {
            label,
            data: [
                avg(lista, e => e.features.ser_pct),
                avg(lista, e => e.features.saber_pct),
                avg(lista, e => e.features.hacer_pct),
                avg(lista, e => e.features.tasa_entrega_tareas),
            ],
            backgroundColor: color + '99',
            borderColor: color,
            borderWidth: 2,
            borderRadius: 4,
        };
    });

    _charts.perfilGrupo = new Chart(ctx, {
        type: 'bar',
        data: { labels: dimensiones, datasets },
        options: {
            responsive: true,
            maintainAspectRatio: false,
            plugins: {
                legend: { labels: { color: '#94a3b8', font: _baseFont, boxWidth: 12, padding: 14 } },
                tooltip: {
                    callbacks: {
                        label: ctx => ` ${ctx.dataset.label}: ${ctx.parsed.y}%`,
                    },
                },
            },
            scales: {
                x: {
                    ticks: { color: '#94a3b8', font: { family: 'inherit', size: 13, weight: '600' } },
                    grid: { display: false },
                },
                y: {
                    min: 0,
                    max: 100,
                    ticks: {
                        color: '#64748b',
                        font: _baseFont,
                        callback: v => `${v}%`,
                    },
                    grid: { color: 'rgba(255,255,255,0.05)' },
                },
            },
        },
    });
}

function _renderDistribucionPorCurso(estudiantes) {
    const cursos   = [...new Set(estudiantes.map(e => e.curso))].sort();
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

    const cursos = [...new Set(estudiantes.map(e => e.curso))].sort();
    selCurso.innerHTML = '<option value="">Todos los cursos</option>';
    cursos.forEach(c => { const o = document.createElement('option'); o.value = c; o.textContent = c; selCurso.appendChild(o); });

    const clusters = [...new Set(estudiantes.map(e => e.cluster))];
    selCluster.innerHTML = '<option value="">Todos los grupos</option>';
    clusters.forEach(c => { const o = document.createElement('option'); o.value = c; o.textContent = c; selCluster.appendChild(o); });

    const filtrar = () => {
        const curso   = selCurso.value;
        const cluster = selCluster.value;
        _kmeansFiltrados = estudiantes.filter(e =>
            (!curso   || e.curso   === curso) &&
            (!cluster || e.cluster === cluster)
        );
        _kmeansPagina = 1;
        _renderTablaKmeans(_kmeansFiltrados);
    };

    _kmeansFiltrados = [...estudiantes];
    _renderTablaKmeans(_kmeansFiltrados);

    selCurso.removeEventListener('change', filtrar);
    selCluster.removeEventListener('change', filtrar);
    selCurso.addEventListener('change', filtrar);
    selCluster.addEventListener('change', filtrar);

    // Paginación K-Means
    document.getElementById('kPrevBtn').onclick = () => { _kmeansPagina--; _renderTablaKmeans(_kmeansFiltrados); };
    document.getElementById('kNextBtn').onclick = () => { _kmeansPagina++; _renderTablaKmeans(_kmeansFiltrados); };
}

// ════════════════════════════════════════════════════════════════
// 3. ÁRBOLES DE DECISIÓN
// ════════════════════════════════════════════════════════════════

async function _cargarEstadisticasArbol(mes, gestion) {
    const { ok, data } = await fetchAPI(`/api/analytics/arbol/estadisticas/?gestion=${gestion}&mes=${mes}`);
    if (!ok || !data.total_predicciones) {
        ['arbol-kpi-est-alto','arbol-kpi-pred-alto','arbol-kpi-tasa','arbol-kpi-pred-bajo']
            .forEach(id => { document.getElementById(id).textContent = '—'; });
        if (_charts.arbolMat)   _charts.arbolMat.destroy();
        if (_charts.arbolDonut) _charts.arbolDonut.destroy();
        return;
    }

    const pr = data.por_riesgo || {};
    document.getElementById('arbol-kpi-est-alto').textContent  = data.estudiantes_riesgo_alto ?? '—';
    document.getElementById('arbol-kpi-pred-alto').textContent = pr['Alto']  ?? 0;
    document.getElementById('arbol-kpi-tasa').textContent      = data.tasa_reprobacion != null ? `${data.tasa_reprobacion}%` : '—';
    document.getElementById('arbol-kpi-pred-bajo').textContent = pr['Bajo']  ?? 0;

    _renderArbolMaterias(data.por_materia || []);
    _renderArbolDonut(pr);
}

function _renderArbolMaterias(porMateria) {
    const ctx = document.getElementById('chartArbolMaterias').getContext('2d');
    if (_charts.arbolMat) _charts.arbolMat.destroy();

    const sorted = [...porMateria].sort((a, b) => b.pct_reprobacion - a.pct_reprobacion);
    const labels  = sorted.map(m => m.materia);
    const valores = sorted.map(m => m.pct_reprobacion);
    const colores = valores.map(v => v >= 50 ? '#ef4444cc' : v >= 25 ? '#f59e0bcc' : '#22c55ecc');
    const bordes  = valores.map(v => v >= 50 ? '#ef4444' : v >= 25 ? '#f59e0b' : '#22c55e');

    const wrap = document.getElementById('arbolMatWrap');
    wrap.style.height = `${Math.max(300, sorted.length * 36)}px`;

    _charts.arbolMat = new Chart(ctx, {
        type: 'bar',
        data: {
            labels,
            datasets: [{
                label: '% Estudiantes que reprobarían',
                data: valores,
                backgroundColor: colores,
                borderColor: bordes,
                borderWidth: 1.5,
                borderRadius: 4,
            }],
        },
        options: {
            indexAxis: 'y',
            responsive: true,
            maintainAspectRatio: false,
            plugins: {
                legend: { display: false },
                tooltip: {
                    callbacks: {
                        label: ctx => {
                            const m = sorted[ctx.dataIndex];
                            return ` ${ctx.parsed.x}% (${m.alto} de ${m.total} estudiantes)`;
                        },
                    },
                },
            },
            scales: {
                x: {
                    min: 0, max: 100,
                    ticks: { color: '#64748b', font: _baseFont, callback: v => `${v}%` },
                    grid: { color: 'rgba(255,255,255,0.05)' },
                },
                y: {
                    ticks: { color: '#94a3b8', font: _baseFont },
                    grid: { display: false },
                },
            },
        },
    });
}

function _renderArbolDonut(porRiesgo) {
    const ctx = document.getElementById('chartArbolDonut').getContext('2d');
    if (_charts.arbolDonut) _charts.arbolDonut.destroy();

    const labels = ['Aprobado', 'Reprobado'];
    const bajo   = porRiesgo['Bajo']  || 0;
    const medio  = porRiesgo['Medio'] || 0;
    const alto   = porRiesgo['Alto']  || 0;
    const aprobados   = bajo + medio;
    const reprobados  = alto;

    _charts.arbolDonut = new Chart(ctx, {
        type: 'doughnut',
        data: {
            labels,
            datasets: [{
                data: [aprobados, reprobados],
                backgroundColor: ['#22c55e99', '#ef444499'],
                borderColor:     ['#22c55e',   '#ef4444'],
                borderWidth: 2,
            }],
        },
        options: {
            responsive: true,
            maintainAspectRatio: false,
            cutout: '65%',
            plugins: {
                legend: {
                    position: 'bottom',
                    labels: { color: '#94a3b8', font: _baseFont, boxWidth: 12, padding: 16 },
                },
                tooltip: {
                    callbacks: {
                        label: ctx => {
                            const total = aprobados + reprobados;
                            const pct = total ? (ctx.parsed / total * 100).toFixed(1) : 0;
                            return ` ${ctx.label}: ${ctx.parsed} (${pct}%)`;
                        },
                    },
                },
            },
        },
    });
}

async function _cargarArbol(mes, gestion, page) {
    const estadoEl = document.getElementById('arbolEstado');
    estadoEl.style.display = 'block';
    estadoEl.textContent = 'Cargando predicciones…';

    _arbolPage = page || 1;

    const params = new URLSearchParams({
        gestion, mes, page: _arbolPage, page_size: 20,
        ..._arbolFiltros,
    });

    const { ok, data } = await fetchAPI(`/api/analytics/arbol/resultados/?${params}`);

    if (!ok) {
        estadoEl.textContent = data?.errores || 'Error al cargar los resultados.';
        return;
    }

    const mesesNombres = ['','Enero','Febrero','Marzo','Abril','Mayo','Junio','Julio','Agosto','Septiembre','Octubre','Noviembre','Diciembre'];
    const fechaStr = data.fecha_analisis ? new Date(data.fecha_analisis).toLocaleString('es-BO') : '—';

    if (!data.total) {
        estadoEl.style.display = 'none';
        _toggleArbolContent(false);
        return;
    }

    _toggleArbolContent(true);
    estadoEl.style.display = 'block';
    estadoEl.textContent = `Último análisis: ${mesesNombres[mes]} ${gestion} · ${data.total} predicciones · Generado: ${fechaStr}`;

    _actualizarKpisArbol(data.resumen_riesgo || {}, data.total);
    _poblarFiltrosArbol(data.opciones || {});
    _renderTablaArbol(data.resultados || [], data.total, data.pages);
}

function _actualizarKpisArbol() { /* reemplazado por _cargarEstadisticasArbol */ }

function _poblarFiltrosArbol(opciones) {
    const selCurso   = document.getElementById('filtroArbolCurso');
    const selMateria = document.getElementById('filtroArbolMateria');

    const curActual = selCurso.value;
    const matActual = selMateria.value;

    if (opciones.cursos && opciones.cursos.length) {
        selCurso.innerHTML = '<option value="">Todos los cursos</option>';
        opciones.cursos.forEach(c => {
            const o = document.createElement('option');
            o.value = c.id; o.textContent = c.label;
            if (String(c.id) === curActual) o.selected = true;
            selCurso.appendChild(o);
        });
    }

    if (opciones.materias && opciones.materias.length) {
        selMateria.innerHTML = '<option value="">Todas las materias</option>';
        opciones.materias.forEach(m => {
            const o = document.createElement('option');
            o.value = m.id; o.textContent = m.label;
            if (String(m.id) === matActual) o.selected = true;
            selMateria.appendChild(o);
        });
    }
}

function _renderTablaArbol(resultados, total, pages) {
    const tbody   = document.getElementById('tbodyArbol');
    const pagRow  = document.getElementById('paginacionArbol');

    if (!resultados.length) {
        tbody.innerHTML = `<tr><td colspan="6" style="text-align:center;color:var(--text-muted);padding:32px">Sin resultados con los filtros actuales.</td></tr>`;
        pagRow.style.display = 'none';
        document.getElementById('arbolConteo').textContent = '0 resultados';
        return;
    }

    tbody.innerHTML = resultados.map(r => {
        const badgeClass = `risk-badge risk-badge--${r.riesgo}`;
        const probColor  = r.riesgo === 'Alto' ? '#ef4444' : r.riesgo === 'Medio' ? '#f59e0b' : '#22c55e';
        const modeloLabel = r.modelo === 1 ? 'T1' : 'T1+T2';
        return `
            <tr>
                <td style="font-weight:500">${r.nombre}</td>
                <td style="color:var(--text-muted)">${r.curso}</td>
                <td>${r.materia}</td>
                <td><span class="${badgeClass}">${r.riesgo}</span></td>
                <td style="font-weight:600;color:${probColor}">${r.probabilidad_reprobar}%</td>
                <td style="color:var(--text-muted);font-size:0.72rem">${modeloLabel}</td>
            </tr>
        `;
    }).join('');

    document.getElementById('arbolConteo').textContent = `${total} resultado${total !== 1 ? 's' : ''}`;

    if (pages > 1) {
        pagRow.style.display = 'flex';
        document.getElementById('aPagInfo').textContent = `Pág. ${_arbolPage} de ${pages}`;
        document.getElementById('aPrevBtn').disabled = _arbolPage <= 1;
        document.getElementById('aNextBtn').disabled = _arbolPage >= pages;
    } else {
        pagRow.style.display = 'none';
    }
}

function _inicializarFiltrosArbol() {
    const selMes     = document.getElementById('arbolMes');
    const selCurso   = document.getElementById('filtroArbolCurso');
    const selMateria = document.getElementById('filtroArbolMateria');
    const selRiesgo  = document.getElementById('filtroArbolRiesgo');

    const recargar = () => {
        _arbolFiltros = {};
        if (selCurso.value)   _arbolFiltros.curso_id   = selCurso.value;
        if (selMateria.value) _arbolFiltros.materia_id = selMateria.value;
        if (selRiesgo.value)  _arbolFiltros.riesgo     = selRiesgo.value;
        _cargarArbol(parseInt(selMes.value), new Date().getFullYear(), 1);
    };

    selMes.addEventListener('change', () => {
        _cargarEstadisticasArbol(parseInt(selMes.value), new Date().getFullYear());
        recargar();
    });
    selCurso.addEventListener('change', recargar);
    selMateria.addEventListener('change', recargar);
    selRiesgo.addEventListener('change', recargar);

    document.getElementById('aPrevBtn').onclick = () =>
        _cargarArbol(parseInt(selMes.value), new Date().getFullYear(), _arbolPage - 1);
    document.getElementById('aNextBtn').onclick = () =>
        _cargarArbol(parseInt(selMes.value), new Date().getFullYear(), _arbolPage + 1);
}

// ════════════════════════════════════════════════════════════════
// INIT
// ════════════════════════════════════════════════════════════════
document.addEventListener('DOMContentLoaded', async () => {
    _initSidebar();
    _inicializarTabs();
    _cargarKPIs();

    const mesActual = new Date().getMonth() + 1;
    const gestion   = new Date().getFullYear();

    // K-Means
    const selMesKmeans = document.getElementById('kmeansMes');
    selMesKmeans.value = mesActual;
    _cargarKMeans(mesActual, gestion);
    selMesKmeans.addEventListener('change', () =>
        _cargarKMeans(parseInt(selMesKmeans.value), gestion)
    );
    document.getElementById('btnEjecutarKmeans').addEventListener('click', _ejecutarKMeans);

    // Árboles
    const selMesArbol = document.getElementById('arbolMes');
    selMesArbol.value = mesActual;
    _inicializarFiltrosArbol();
    _cargarEstadisticasArbol(mesActual, gestion);
    _cargarArbol(mesActual, gestion, 1);
});

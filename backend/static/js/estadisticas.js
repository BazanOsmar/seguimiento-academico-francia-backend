'use strict';

/* ================================================================
   estadisticas.js — Dashboard analítico del Director
   Combina datos reales de la API con datos ficticios (mockup ML)
   ================================================================ */

// ── Datos ficticios K-Means ──────────────────────────────────────
const _DATOS_KMEANS = {
    clusters: [
        {
            id: 'A', label: 'Rendimiento Alto', color: '#22c55e',
            n: 18, asistencia: 92, promedio: 78, citaciones: 0.3,
        },
        {
            id: 'B', label: 'Rendimiento Regular', color: '#f59e0b',
            n: 14, asistencia: 76, promedio: 61, citaciones: 1.2,
        },
        {
            id: 'C', label: 'En Riesgo', color: '#ef4444',
            n: 6, asistencia: 54, promedio: 42, citaciones: 3.8,
        },
    ],
    puntos: [
        // Cluster A (verde) — alto rendimiento
        { x: 95, y: 82, r: 7, cluster: 'A' },
        { x: 91, y: 79, r: 7, cluster: 'A' },
        { x: 94, y: 75, r: 7, cluster: 'A' },
        { x: 88, y: 80, r: 7, cluster: 'A' },
        { x: 93, y: 72, r: 7, cluster: 'A' },
        { x: 90, y: 77, r: 7, cluster: 'A' },
        { x: 97, y: 84, r: 7, cluster: 'A' },
        { x: 89, y: 76, r: 7, cluster: 'A' },
        { x: 92, y: 81, r: 7, cluster: 'A' },
        { x: 96, y: 78, r: 7, cluster: 'A' },
        { x: 87, y: 73, r: 7, cluster: 'A' },
        { x: 93, y: 80, r: 7, cluster: 'A' },
        { x: 91, y: 74, r: 7, cluster: 'A' },
        { x: 88, y: 77, r: 7, cluster: 'A' },
        { x: 95, y: 83, r: 7, cluster: 'A' },
        { x: 90, y: 79, r: 7, cluster: 'A' },
        { x: 94, y: 76, r: 7, cluster: 'A' },
        { x: 86, y: 71, r: 7, cluster: 'A' },
        // Cluster B (amarillo) — regular
        { x: 76, y: 63, r: 9, cluster: 'B' },
        { x: 72, y: 58, r: 9, cluster: 'B' },
        { x: 79, y: 65, r: 9, cluster: 'B' },
        { x: 74, y: 60, r: 9, cluster: 'B' },
        { x: 77, y: 62, r: 9, cluster: 'B' },
        { x: 73, y: 57, r: 9, cluster: 'B' },
        { x: 80, y: 66, r: 9, cluster: 'B' },
        { x: 75, y: 59, r: 9, cluster: 'B' },
        { x: 78, y: 64, r: 9, cluster: 'B' },
        { x: 71, y: 56, r: 9, cluster: 'B' },
        { x: 76, y: 61, r: 9, cluster: 'B' },
        { x: 74, y: 63, r: 9, cluster: 'B' },
        { x: 79, y: 58, r: 9, cluster: 'B' },
        { x: 73, y: 60, r: 9, cluster: 'B' },
        // Cluster C (rojo) — riesgo
        { x: 52, y: 40, r: 13, cluster: 'C' },
        { x: 48, y: 38, r: 13, cluster: 'C' },
        { x: 56, y: 44, r: 13, cluster: 'C' },
        { x: 51, y: 41, r: 13, cluster: 'C' },
        { x: 55, y: 45, r: 13, cluster: 'C' },
        { x: 50, y: 39, r: 13, cluster: 'C' },
    ],
};

// ── Datos ficticios Árbol de Decisión ────────────────────────────
const _DATOS_ARBOL = {
    en_riesgo: [
        { nombre: 'García López, Luis',     curso: '1ro A', asistencia: 48, promedio: 39, citaciones: 5, nivel: 'ALTO' },
        { nombre: 'Mamani Flores, Ana',     curso: '2do B', asistencia: 52, promedio: 43, citaciones: 4, nivel: 'ALTO' },
        { nombre: 'Condori Quispe, Pedro',  curso: '1ro A', asistencia: 61, promedio: 51, citaciones: 3, nivel: 'MEDIO' },
        { nombre: 'Vargas Solíz, Karen',    curso: '3ro A', asistencia: 57, promedio: 47, citaciones: 4, nivel: 'ALTO' },
        { nombre: 'Chambi Roque, Diego',    curso: '2do A', asistencia: 63, promedio: 55, citaciones: 2, nivel: 'MEDIO' },
        { nombre: 'Torrez Lima, Valeria',   curso: '1ro B', asistencia: 44, promedio: 35, citaciones: 6, nivel: 'ALTO' },
    ],
};

// ── Datos ficticios notas ────────────────────────────────────────
const _DATOS_NOTAS = {
    materias: ['Matemáticas', 'Lenguaje', 'Ciencias', 'Ed. Física', 'Arte'],
    ser:   [72, 80, 68, 88, 85],
    saber: [61, 74, 58, 82, 78],
    hacer: [68, 77, 65, 90, 83],
};

// ── Estado de los gráficos ───────────────────────────────────────
let _charts = {};

// ── Utilidades de fecha ──────────────────────────────────────────
function _mesAnterior(yyyy, mm, offset) {
    let m = mm - offset;
    let y = yyyy;
    while (m <= 0) { m += 12; y--; }
    return `${y}-${String(m).padStart(2, '0')}`;
}

// ── Colores Chart.js (fijos, usando valores de paleta) ────────────
const C = {
    verde:    '#22c55e',
    rojo:     '#ef4444',
    amarillo: '#f59e0b',
    azul:     '#6366f1',
    cyan:     '#06b6d4',
    morado:   '#a855f7',

    verdeAlfa: (a) => `rgba(34,197,94,${a})`,
    rojoAlfa:  (a) => `rgba(239,68,68,${a})`,
    azulAlfa:  (a) => `rgba(99,102,241,${a})`,
    amarilloAlfa: (a) => `rgba(245,158,11,${a})`,
    cyanAlfa:  (a) => `rgba(6,182,212,${a})`,
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
// 2. GRÁFICOS DE ASISTENCIA — datos reales (últimos 6 meses)
// ════════════════════════════════════════════════════════════════
async function _cargarGraficosAsistencia() {
    const hoy   = new Date();
    const year  = hoy.getFullYear();
    const month = hoy.getMonth() + 1; // 1-based

    // Generar los últimos 6 meses
    const meses = [];
    for (let i = 5; i >= 0; i--) {
        meses.push(_mesAnterior(year, month, i));
    }

    // Fetch de cada mes en paralelo
    const resultados = await Promise.all(
        meses.map(m => fetchAPI(`/api/attendance/calendario-mensual/?mes=${m}`))
    );

    // Calcular presencias y faltas por mes (proporción de días registrados)
    const labels     = [];
    const presentes  = [];
    const faltas     = [];
    const distribucion = { presente: 0, falta: 0, atraso: 0, licencia: 0 };

    resultados.forEach((res, idx) => {
        const mesStr = meses[idx];
        const [y, m] = mesStr.split('-').map(Number);
        const nombreMes = new Date(y, m - 1, 1)
            .toLocaleDateString('es-BO', { month: 'short' });
        labels.push(nombreMes.charAt(0).toUpperCase() + nombreMes.slice(1));

        if (res.ok && res.data) {
            const totalCursos = res.data.t || 1;
            const dias = res.data.d || [];
            const totalSesiones  = dias.reduce((acc, d) => acc + d.s, 0);
            // Estimación: sesiones = días × cursos. Usamos fracción de completitud como proxy
            const diasConRegistro = dias.length;
            const pctCompleto = totalCursos > 0
                ? Math.round((totalSesiones / (diasConRegistro * totalCursos || 1)) * 100)
                : 0;
            presentes.push(Math.min(pctCompleto, 100));
            faltas.push(100 - Math.min(pctCompleto, 100));
        } else {
            presentes.push(0);
            faltas.push(0);
        }
    });

    // Distribución global (acumulada): usamos proporciones ficticias si no hay datos reales suficientes
    const totalPresentes = presentes.reduce((a, b) => a + b, 0);
    if (totalPresentes > 0) {
        const avg = presentes.reduce((a, b) => a + b, 0) / presentes.length;
        distribucion.presente  = Math.round(avg);
        distribucion.falta     = Math.round((100 - avg) * 0.55);
        distribucion.atraso    = Math.round((100 - avg) * 0.30);
        distribucion.licencia  = Math.round((100 - avg) * 0.15);
    } else {
        // Datos de demostración si la BD está vacía
        Object.assign(distribucion, { presente: 78, falta: 12, atraso: 6, licencia: 4 });
        for (let i = 0; i < presentes.length; i++) {
            presentes[i] = 75 + Math.floor(Math.random() * 10);
            faltas[i]    = 100 - presentes[i];
        }
    }

    _renderLineChart(labels, presentes, faltas);
    _renderDonutChart(distribucion);
}

function _renderLineChart(labels, presentes, faltas) {
    const ctx = document.getElementById('chartLinea').getContext('2d');
    if (_charts.linea) _charts.linea.destroy();

    _charts.linea = new Chart(ctx, {
        type: 'line',
        data: {
            labels,
            datasets: [
                {
                    label: 'Días con asistencia (%)',
                    data: presentes,
                    borderColor: C.verde,
                    backgroundColor: C.verdeAlfa(0.1),
                    borderWidth: 2.5,
                    pointRadius: 4,
                    pointBackgroundColor: C.verde,
                    tension: 0.4,
                    fill: true,
                },
                {
                    label: 'Sin registro (%)',
                    data: faltas,
                    borderColor: C.rojo,
                    backgroundColor: C.rojoAlfa(0.08),
                    borderWidth: 2,
                    pointRadius: 4,
                    pointBackgroundColor: C.rojo,
                    tension: 0.4,
                    fill: false,
                    borderDash: [4, 3],
                },
            ],
        },
        options: {
            responsive: true,
            maintainAspectRatio: false,
            plugins: {
                legend: {
                    labels: { color: '#94a3b8', font: _baseFont, boxWidth: 12, padding: 14 },
                },
                tooltip: { mode: 'index', intersect: false },
            },
            scales: {
                x: {
                    ticks: { color: '#64748b', font: _baseFont },
                    grid: { color: 'rgba(255,255,255,0.04)' },
                },
                y: {
                    min: 0, max: 100,
                    ticks: {
                        color: '#64748b', font: _baseFont,
                        callback: v => `${v}%`,
                    },
                    grid: { color: 'rgba(255,255,255,0.06)' },
                },
            },
        },
    });
}

function _renderDonutChart(dist) {
    const ctx = document.getElementById('chartDonut').getContext('2d');
    if (_charts.donut) _charts.donut.destroy();

    _charts.donut = new Chart(ctx, {
        type: 'doughnut',
        data: {
            labels: ['Presente', 'Falta', 'Atraso', 'Licencia'],
            datasets: [{
                data: [dist.presente, dist.falta, dist.atraso, dist.licencia],
                backgroundColor: [C.verde, C.rojo, C.amarillo, C.cyan],
                borderColor: '#1a1f2e',
                borderWidth: 3,
                hoverOffset: 6,
            }],
        },
        options: {
            responsive: true,
            maintainAspectRatio: false,
            cutout: '68%',
            plugins: {
                legend: {
                    position: 'bottom',
                    labels: { color: '#94a3b8', font: _baseFont, boxWidth: 12, padding: 12 },
                },
                tooltip: {
                    callbacks: {
                        label: ctx => ` ${ctx.label}: ${ctx.parsed}%`,
                    },
                },
            },
        },
    });
}

// ════════════════════════════════════════════════════════════════
// 3. K-MEANS — Bubble chart + cluster cards
// ════════════════════════════════════════════════════════════════
function _renderKMeans() {
    _renderBubbleChart();
    _renderClusterCards();
}

function _renderBubbleChart() {
    const ctx = document.getElementById('chartBurbuja').getContext('2d');
    if (_charts.burbuja) _charts.burbuja.destroy();

    const datasets = _DATOS_KMEANS.clusters.map(cl => ({
        label: cl.label,
        data: _DATOS_KMEANS.puntos
            .filter(p => p.cluster === cl.id)
            .map(p => ({ x: p.x, y: p.y, r: p.r })),
        backgroundColor: cl.color + 'bb',
        borderColor: cl.color,
        borderWidth: 1.5,
    }));

    _charts.burbuja = new Chart(ctx, {
        type: 'bubble',
        data: { datasets },
        options: {
            responsive: true,
            maintainAspectRatio: false,
            plugins: {
                legend: {
                    labels: { color: '#94a3b8', font: _baseFont, boxWidth: 12, padding: 14 },
                },
                tooltip: {
                    callbacks: {
                        label: ctx => {
                            const d = ctx.raw;
                            return ` Asist: ${d.x}% | Notas: ${d.y}pts`;
                        },
                    },
                },
            },
            scales: {
                x: {
                    title: { display: true, text: '% Asistencia', color: '#64748b', font: _baseFont },
                    min: 30, max: 105,
                    ticks: { color: '#64748b', font: _baseFont, callback: v => `${v}%` },
                    grid: { color: 'rgba(255,255,255,0.04)' },
                },
                y: {
                    title: { display: true, text: 'Promedio (pts)', color: '#64748b', font: _baseFont },
                    min: 20, max: 100,
                    ticks: { color: '#64748b', font: _baseFont },
                    grid: { color: 'rgba(255,255,255,0.06)' },
                },
            },
        },
    });
}

function _renderClusterCards() {
    const container = document.getElementById('clusterCards');
    container.innerHTML = '';

    const iconos = { A: '●', B: '●', C: '●' };

    _DATOS_KMEANS.clusters.forEach(cl => {
        const card = document.createElement('div');
        card.className = 'cluster-card';
        card.style.borderLeftColor = cl.color;
        card.innerHTML = `
            <div class="cluster-card__header">
                <span class="cluster-dot" style="background:${cl.color}"></span>
                <span class="cluster-label">${cl.label}</span>
            </div>
            <div class="cluster-stats">
                <div class="cluster-stat">
                    <span class="cluster-stat__val">${cl.n}</span>
                    <span class="cluster-stat__key">estudiantes</span>
                </div>
                <div class="cluster-stat">
                    <span class="cluster-stat__val">${cl.asistencia}%</span>
                    <span class="cluster-stat__key">asistencia</span>
                </div>
                <div class="cluster-stat">
                    <span class="cluster-stat__val">${cl.promedio}pts</span>
                    <span class="cluster-stat__key">promedio</span>
                </div>
                <div class="cluster-stat">
                    <span class="cluster-stat__val">${cl.citaciones}</span>
                    <span class="cluster-stat__key">citaciones avg</span>
                </div>
            </div>
        `;
        container.appendChild(card);
    });
}

// ════════════════════════════════════════════════════════════════
// 4. ÁRBOL DE DECISIÓN — tabla de riesgo
// ════════════════════════════════════════════════════════════════
function _renderArbol() {
    const tbody   = document.getElementById('tbodyRiesgo');
    const filtro  = document.getElementById('filtroRiesgoCurso');
    const cursoFil = filtro ? filtro.value : '';

    const datos = cursoFil
        ? _DATOS_ARBOL.en_riesgo.filter(e => e.curso === cursoFil)
        : _DATOS_ARBOL.en_riesgo;

    tbody.innerHTML = datos.map(e => `
        <tr>
            <td>${e.nombre}</td>
            <td>${e.curso}</td>
            <td>${e.asistencia}%</td>
            <td>${e.promedio}pts</td>
            <td>${e.citaciones}</td>
            <td>
                <span class="risk-badge risk-badge--${e.nivel.toLowerCase()}">${e.nivel}</span>
            </td>
        </tr>
    `).join('');

    if (!datos.length) {
        tbody.innerHTML = `<tr><td colspan="6" style="text-align:center;color:var(--text-muted);padding:24px">Sin estudiantes en riesgo para este curso</td></tr>`;
    }
}

function _initFiltroRiesgo() {
    const filtro = document.getElementById('filtroRiesgoCurso');
    if (!filtro) return;

    // Poblar opciones con cursos únicos del dataset
    const cursos = [...new Set(_DATOS_ARBOL.en_riesgo.map(e => e.curso))].sort();
    cursos.forEach(c => {
        const opt = document.createElement('option');
        opt.value = c;
        opt.textContent = c;
        filtro.appendChild(opt);
    });

    filtro.addEventListener('change', _renderArbol);
}

// ════════════════════════════════════════════════════════════════
// 5. RENDIMIENTO ACADÉMICO — Barras apiladas + Radar
// ════════════════════════════════════════════════════════════════
function _renderRendimiento() {
    _renderBarrasApiladas();
    _renderRadar();
}

function _renderBarrasApiladas() {
    const ctx = document.getElementById('chartBarras').getContext('2d');
    if (_charts.barras) _charts.barras.destroy();

    _charts.barras = new Chart(ctx, {
        type: 'bar',
        data: {
            labels: _DATOS_NOTAS.materias,
            datasets: [
                {
                    label: 'Ser',
                    data: _DATOS_NOTAS.ser,
                    backgroundColor: C.verdeAlfa(0.75),
                    borderColor: C.verde,
                    borderWidth: 1,
                    borderRadius: 3,
                },
                {
                    label: 'Saber',
                    data: _DATOS_NOTAS.saber,
                    backgroundColor: C.azulAlfa(0.75),
                    borderColor: C.azul,
                    borderWidth: 1,
                    borderRadius: 3,
                },
                {
                    label: 'Hacer',
                    data: _DATOS_NOTAS.hacer,
                    backgroundColor: C.amarilloAlfa(0.75),
                    borderColor: C.amarillo,
                    borderWidth: 1,
                    borderRadius: 3,
                },
            ],
        },
        options: {
            responsive: true,
            maintainAspectRatio: false,
            plugins: {
                legend: {
                    labels: { color: '#94a3b8', font: _baseFont, boxWidth: 12, padding: 14 },
                },
            },
            scales: {
                x: {
                    stacked: true,
                    ticks: { color: '#64748b', font: _baseFont },
                    grid: { display: false },
                },
                y: {
                    stacked: true,
                    ticks: { color: '#64748b', font: _baseFont },
                    grid: { color: 'rgba(255,255,255,0.05)' },
                },
            },
        },
    });
}

function _renderRadar() {
    const ctx = document.getElementById('chartRadar').getContext('2d');
    if (_charts.radar) _charts.radar.destroy();

    _charts.radar = new Chart(ctx, {
        type: 'radar',
        data: {
            labels: ['Ser', 'Saber', 'Hacer', 'Asistencia', 'Disciplina'],
            datasets: [
                {
                    label: '1ro A',
                    data: [75, 63, 70, 88, 82],
                    borderColor: C.azul,
                    backgroundColor: C.azulAlfa(0.18),
                    borderWidth: 2,
                    pointBackgroundColor: C.azul,
                    pointRadius: 4,
                },
                {
                    label: '2do B',
                    data: [68, 55, 62, 72, 74],
                    borderColor: C.verde,
                    backgroundColor: C.verdeAlfa(0.12),
                    borderWidth: 2,
                    pointBackgroundColor: C.verde,
                    pointRadius: 4,
                },
            ],
        },
        options: {
            responsive: true,
            maintainAspectRatio: false,
            plugins: {
                legend: {
                    labels: { color: '#94a3b8', font: _baseFont, boxWidth: 12, padding: 14 },
                },
            },
            scales: {
                r: {
                    min: 0, max: 100,
                    ticks: {
                        backdropColor: 'transparent',
                        color: '#64748b',
                        font: { size: 10 },
                        stepSize: 25,
                    },
                    grid: { color: 'rgba(255,255,255,0.08)' },
                    angleLines: { color: 'rgba(255,255,255,0.08)' },
                    pointLabels: { color: '#94a3b8', font: _baseFont },
                },
            },
        },
    });
}

// ════════════════════════════════════════════════════════════════
// INIT
// ════════════════════════════════════════════════════════════════
document.addEventListener('DOMContentLoaded', async () => {
    // KPIs (async, real data)
    _cargarKPIs();

    // Asistencia (async, real data)
    _cargarGraficosAsistencia();

    // K-Means (sync, mock data)
    _renderKMeans();

    // Árbol de decisión (sync, mock data)
    _initFiltroRiesgo();
    _renderArbol();

    // Rendimiento (sync, mock data)
    _renderRendimiento();
});

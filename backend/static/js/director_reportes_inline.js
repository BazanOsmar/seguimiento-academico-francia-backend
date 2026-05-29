/* director_reportes_inline.js — Reportes Institucionales */
'use strict';

/* ── Paleta Chart.js (sincronizada con CSS vars) ─────────────── */
const BLUE   = 'rgba(96,165,250,.85)';
const GREEN  = 'rgba(74,222,128,.85)';
const RED    = 'rgba(248,113,113,.85)';
const YELLOW = 'rgba(250,204,21,.85)';
const PURPLE = 'rgba(167,139,250,.85)';
const ORANGE = 'rgba(251,146,60,.85)';
const TEAL   = 'rgba(45,212,191,.85)';
const PINK   = 'rgba(244,114,182,.85)';

const CHART_DEFAULTS = {
    color: '#94a3b8',
    plugins: { legend: { labels: { color: '#94a3b8', font: { size: 12 } } } },
};

Chart.defaults.color = '#94a3b8';
Chart.defaults.borderColor = 'rgba(59,130,246,.12)';

/* ── Referencias DOM ─────────────────────────────────────────── */
const _rpt$ = id => document.getElementById(id);
const selTrim   = _rpt$('selTrimestre');
const btnCargar = _rpt$('btnCargar');
const rptLoad   = _rpt$('rptLoading');
const rptEmpty  = _rpt$('rptEmptyState');
const rptContent = _rpt$('rptContent');

/* ── Instancias de gráficas (para destruir al recargar) ──────── */
const _rptCharts = {};

function destroyChart(key) {
    if (_rptCharts[key]) { _rptCharts[key].destroy(); delete _rptCharts[key]; }
}

/* ── Tab switching ───────────────────────────────────────────── */
document.querySelectorAll('.rpt-tab').forEach(btn => {
    btn.addEventListener('click', () => {
        document.querySelectorAll('.rpt-tab').forEach(t => t.classList.remove('active'));
        document.querySelectorAll('.rpt-panel').forEach(p => p.classList.remove('active'));
        btn.classList.add('active');
        _rpt$(`tab-${btn.dataset.tab}`).classList.add('active');
    });
});

/* ── Helpers ─────────────────────────────────────────────────── */
function txt(id, val) {
    const el = _rpt$(id);
    if (el) el.textContent = val ?? '—';
}

function pct(v) { return v != null ? `${(+v).toFixed(1)}%` : '—'; }
function num(v) { return v != null ? String(+v) : '—'; }
function flo(v, d = 1) { return v != null ? (+v).toFixed(d) : '—'; }

function showError(msg) {
    console.error('[Reportes]', msg);
}

function setLoading(on) {
    btnCargar.disabled = on;
    rptLoad.style.display = on ? 'flex' : 'none';
}

function trimestreActual() {
    const mes = new Date().getMonth() + 1;
    if (mes <= 4) return 1;
    if (mes <= 8) return 2;
    return 3;
}

function setEmptyState(show) {
    if (rptEmpty) rptEmpty.style.display = show ? 'block' : 'none';
    if (rptContent) rptContent.style.display = show ? 'none' : '';
}

function tieneDatosReporte(respuestas) {
    const [rRend, rAsist, rCit, rCom, rProf] = respuestas;
    return Boolean(
        (rRend.ok && (rRend.data?.total_estudiantes || 0) > 0) ||
        (rAsist.ok && (rAsist.data?.total_sesiones || 0) > 0) ||
        (rCit.ok && (rCit.data?.total || 0) > 0) ||
        (rCom.ok && ((rCom.data?.total_comunicados || rCom.data?.total || 0) > 0)) ||
        (rProf.ok && ((rProf.data?.con_notas || 0) > 0 || (rProf.data?.con_planes || 0) > 0))
    );
}

function buildDonut(key, canvas, labels, data, colors) {
    destroyChart(key);
    _rptCharts[key] = new Chart(canvas, {
        type: 'doughnut',
        data: { labels, datasets: [{ data, backgroundColor: colors, borderWidth: 0 }] },
        options: {
            cutout: '65%',
            plugins: {
                legend: { position: 'bottom', labels: { color: '#94a3b8', font: { size: 11 }, boxWidth: 12 } },
                tooltip: { callbacks: { label: ctx => ` ${ctx.label}: ${ctx.formattedValue}` } },
            },
            responsive: true,
            maintainAspectRatio: false,
        },
    });
}

function buildBar(key, canvas, labels, datasets, opts = {}) {
    destroyChart(key);
    _rptCharts[key] = new Chart(canvas, {
        type: 'bar',
        data: { labels, datasets },
        options: {
            indexAxis: opts.horizontal ? 'y' : 'x',
            responsive: true,
            maintainAspectRatio: false,
            plugins: {
                legend: { display: opts.legend ?? false, labels: { color: '#94a3b8' } },
            },
            scales: {
                x: { ticks: { color: '#94a3b8', font: { size: 11 } }, grid: { color: 'rgba(59,130,246,.1)' } },
                y: { ticks: { color: '#94a3b8', font: { size: 11 } }, grid: { color: 'rgba(59,130,246,.1)' }, beginAtZero: true },
            },
            ...opts.extra,
        },
    });
}

function fillTable(tbodyId, rows) {
    const tb = document.querySelector(`#${tbodyId} tbody`);
    if (!tb) return;
    if (!rows || !rows.length) {
        tb.innerHTML = `<tr><td colspan="99" class="rpt-empty">Sin datos</td></tr>`;
        return;
    }
    tb.innerHTML = rows.join('');
}

function statList(containerId, items) {
    const el = _rpt$(containerId);
    if (!el) return;
    if (!items || !items.length) { el.innerHTML = '<p class="rpt-empty">Sin datos</p>'; return; }
    el.innerHTML = items.map(([k, v, cls]) =>
        `<li><span class="rpt-stat-list__key">${k}</span><span class="rpt-stat-list__val ${cls || ''}">${v}</span></li>`
    ).join('');
}

/* ── Carga de datos ──────────────────────────────────────────── */
async function cargarTodo() {
    const trimestre = selTrim.value;
    const gestion = new Date().getFullYear();
    setLoading(true);

    const [rRend, rAsist, rCit, rCom, rProf, rTut] = await Promise.all([
        fetchAPI(`/api/analytics/reportes/rendimiento/?trimestre=${trimestre}&gestion=${gestion}`),
        fetchAPI(`/api/analytics/reportes/asistencia/?trimestre=${trimestre}&gestion=${gestion}`),
        fetchAPI(`/api/analytics/reportes/citaciones/?trimestre=${trimestre}&gestion=${gestion}`),
        fetchAPI(`/api/analytics/reportes/comunicados/?trimestre=${trimestre}&gestion=${gestion}`),
        fetchAPI(`/api/analytics/reportes/profesores/?trimestre=${trimestre}&gestion=${gestion}`),
        fetchAPI(`/api/analytics/reportes/tutores/`),
    ]);

    setLoading(false);

    const respuestas = [rRend, rAsist, rCit, rCom, rProf, rTut];
    if (!tieneDatosReporte(respuestas)) {
        setEmptyState(true);
        return false;
    }

    setEmptyState(false);

    if (rRend.ok)  renderAcademico(rRend.data);
    if (rAsist.ok) renderAsistencia(rAsist.data);
    if (rCit.ok)   renderCitaciones(rCit.data);
    if (rCom.ok)   renderComunicados(rCom.data);
    if (rProf.ok)  renderProfesores(rProf.data);
    if (rTut.ok)   renderTutores(rTut.data);
    return true;
}

/* ── Académico ───────────────────────────────────────────────── */
function renderAcademico(d) {
    const mats  = d.materias_ranking  || d.materias   || [];
    const curs  = d.cursos_ranking    || d.cursos     || [];
    const profs = d.profesores_ranking|| d.profesores || [];

    txt('acad-prom',       flo(d.promedio_colegio));
    txt('acad-total',      num(d.total_estudiantes));
    txt('acad-mejor-prof', profs.length ? profs[0].nombre : '—');
    txt('acad-peor-mat',   mats.length  ? mats[0].nombre  : '—');

    /* Gráfica materias (peor primero) */
    const matsSlice = mats.slice(0, 8);
    buildBar('chartMaterias', _rpt$('chartMaterias'),
        matsSlice.map(m => m.nombre),
        [{ label: 'Promedio', data: matsSlice.map(m => m.promedio), backgroundColor: RED, borderRadius: 6 }],
        { horizontal: true, extra: { scales: { x: { max: 95, ticks: { color: '#94a3b8' } }, y: { ticks: { color: '#94a3b8' } } } } }
    );

    /* Gráfica cursos (peor primero) */
    const cursSlice = curs.slice(0, 8);
    buildBar('chartCursos', _rpt$('chartCursos'),
        cursSlice.map(c => c.nombre),
        [{ label: 'Promedio', data: cursSlice.map(c => c.promedio), backgroundColor: ORANGE, borderRadius: 6 }],
        { horizontal: true, extra: { scales: { x: { max: 95, ticks: { color: '#94a3b8' } }, y: { ticks: { color: '#94a3b8' } } } } }
    );

    /* Top 5 */
    fillTable('tablaTop5', (d.top5 || []).map((e, i) => `
        <tr>
            <td>${i + 1}</td>
            <td>${e.nombre}</td>
            <td>${e.curso || '—'}</td>
            <td><strong>${flo(e.nota ?? e.promedio)}</strong></td>
        </tr>`));

    /* Bottom 5 */
    fillTable('tablaBottom5', (d.bottom5 || []).map((e, i) => `
        <tr>
            <td>${i + 1}</td>
            <td>${e.nombre}</td>
            <td>${e.curso || '—'}</td>
            <td class="text-danger" style="color:#f87171"><strong>${flo(e.nota ?? e.promedio)}</strong></td>
        </tr>`));

    /* Ranking profesores */
    fillTable('tablaProfs', profs.map((p, i) => {
        const prom = +p.promedio;
        const badge = prom >= 70
            ? `<span class="rpt-badge rpt-badge--green">${flo(prom)}</span>`
            : prom >= 51
                ? `<span class="rpt-badge rpt-badge--yellow">${flo(prom)}</span>`
                : `<span class="rpt-badge rpt-badge--red">${flo(prom)}</span>`;
        return `<tr>
            <td>${i + 1}</td>
            <td>${p.nombre}</td>
            <td>${num(p.total ?? p.total_estudiantes)}</td>
            <td>${flo(p.promedio)}</td>
            <td>${badge}</td>
        </tr>`;
    }));
}

/* ── Asistencia ──────────────────────────────────────────────── */
function renderAsistencia(d) {
    const g = d.globales || d;
    txt('asist-pct-pres',    pct(g.pct_presentes));
    txt('asist-pct-faltas',  pct(g.pct_faltas));
    txt('asist-pct-atrasos', pct(g.pct_atrasos));
    txt('asist-sesiones',    num(d.total_sesiones));

    /* Donut global */
    buildDonut('chartAsistDonut', _rpt$('chartAsistDonut'),
        ['Presentes', 'Faltas', 'Atrasos', 'Otros'],
        [g.pct_presentes, g.pct_faltas, g.pct_atrasos, g.pct_licencias ?? g.pct_otros ?? 0],
        [GREEN, RED, YELLOW, BLUE]);

    /* Cursos con mayor tasa de faltas */
    const cursos = d.cursos_ranking || d.cursos || [];
    const cfal = cursos.slice(0, 8);
    buildBar('chartCursosFaltas', _rpt$('chartCursosFaltas'),
        cfal.map(c => c.nombre ?? c.curso),
        [{ label: '% Faltas', data: cfal.map(c => c.pct_faltas), backgroundColor: RED, borderRadius: 6 }],
        { horizontal: true });

    /* Tabla ranking */
    fillTable('tablaCursosAsist', cursos.map(c => `
        <tr>
            <td>${c.nombre ?? c.curso}</td>
            <td style="color:#f87171">${pct(c.pct_faltas)}</td>
            <td style="color:#facc15">${pct(c.pct_atrasos)}</td>
            <td>${num(c.sesiones ?? c.total_sesiones)}</td>
        </tr>`));
}

/* ── Citaciones ──────────────────────────────────────────────── */
function renderCitaciones(d) {
    txt('cit-total',      num(d.total));
    txt('cit-pct-asistio', pct(d.pct_asistio));
    txt('cit-vencidas',   num(d.vencidas));
    txt('cit-auto',       num(d.automaticas ?? d.auto));

    /* Donut estados */
    const est = d.por_estado || d.por_asistencia || {};
    buildDonut('chartCitDonut', _rpt$('chartCitDonut'),
        ['Asistió', 'No asistió', 'Atraso', 'Pendiente', 'Anulada'],
        [est.ASISTIO ?? 0, est.NO_ASISTIO ?? 0, est.ATRASO ?? 0, est.PENDIENTE ?? 0, est.ANULADA ?? 0],
        [GREEN, RED, YELLOW, BLUE, PURPLE]);

    /* Cursos */
    const cursos = (d.cursos || d.cursos_ranking || []).slice(0, 8);
    buildBar('chartCitCursos', _rpt$('chartCitCursos'),
        cursos.map(c => c.curso || c.nombre),
        [{ label: 'Citaciones', data: cursos.map(c => c.total), backgroundColor: BLUE, borderRadius: 6 }],
        { horizontal: true });
}

/* ── Comunicados ─────────────────────────────────────────────── */
function renderComunicados(d) {
    txt('com-total',  num(d.total ?? d.total_comunicados));
    txt('com-pct',    pct(d.pct_lectura));
    txt('com-nunca',  num(d.tutores_nunca_leen));
    txt('com-vencer', num(d.proximos_vencer));

    /* Donut lectura */
    buildDonut('chartComDonut', _rpt$('chartComDonut'),
        ['Leídos', 'No leídos'],
        [d.total_leidos ?? d.leidas ?? 0, d.total_no_leidos ?? d.no_leidas ?? 0],
        [GREEN, RED]);

    /* Stat list */
    statList('comStatList', [
        ['Total comunicados activos',   num(d.total ?? d.total_comunicados),              ''],
        ['Recepciones totales',         num(d.total_recepciones ?? d.total_entregas),  ''],
        ['Leídas',                      num(d.total_leidos ?? d.leidas),       'rpt-stat-list__val--green'],
        ['No leídas',                   num(d.total_no_leidos ?? d.no_leidas),    ''],
        ['Por vencer (≤3 días)',        num(d.proximos_vencer),    ''],
        ['Tutores sin leer nunca',      num(d.tutores_nunca_leen), ''],
    ]);
}

/* ── Profesores ──────────────────────────────────────────────── */
function renderProfesores(d) {
    txt('prof-total',      num(d.total_profesores));
    txt('prof-con-notas',  num(d.con_notas));
    txt('prof-sin-notas',  num(d.sin_notas));
    txt('prof-con-planes', num(d.con_planes_completos ?? d.con_planes));

    fillTable('tablaProfsDetalle', (d.profesores || []).map(p => {
        const tieneNotas = p.tiene_notas ?? p.notas_cargadas;
        const planesOk = p.planes_ok ?? p.planes_completos;
        const badgeNotas  = tieneNotas  ? `<span class="rpt-badge rpt-badge--green">Sí</span>`  : `<span class="rpt-badge rpt-badge--red">No</span>`;
        const badgePlanes = planesOk    ? `<span class="rpt-badge rpt-badge--green">Sí</span>`  : `<span class="rpt-badge rpt-badge--yellow">No</span>`;
        return `<tr>
            <td>${p.nombre}</td>
            <td>${num(p.asignaciones)}</td>
            <td>${badgeNotas}</td>
            <td>${badgePlanes}</td>
            <td>${num(p.citaciones)}</td>
        </tr>`;
    }));
}

/* ── Tutores ─────────────────────────────────────────────────── */
function renderTutores(d) {
    txt('tut-total-est', num(d.total_estudiantes));
    txt('tut-con-tutor', num(d.con_tutor));
    txt('tut-sin-tutor', num(d.sin_tutor));
    txt('tut-con-fcm',   num(d.con_fcm));

    /* Donut cobertura tutores */
    buildDonut('chartTutoresDonut', _rpt$('chartTutoresDonut'),
        ['Con tutor', 'Sin tutor'],
        [d.con_tutor ?? 0, d.sin_tutor ?? 0],
        [GREEN, RED]);

    /* Donut FCM */
    buildDonut('chartFcmDonut', _rpt$('chartFcmDonut'),
        ['Con FCM', 'Sin FCM'],
        [d.con_fcm ?? 0, (d.total_tutores ?? 0) - (d.con_fcm ?? 0)],
        [BLUE, PURPLE]);

    /* Stat list */
    statList('tutStatList', [
        ['Total estudiantes',         num(d.total_estudiantes), ''],
        ['Con tutor registrado',      num(d.con_tutor),         ''],
        ['Sin tutor asignado',        num(d.sin_tutor),         ''],
        ['Total tutores únicos',      num(d.total_tutores),     ''],
        ['Con app / notificaciones',  num(d.con_fcm),           ''],
        ['Tutores sin primer login',  num(d.nunca_login),       ''],
    ]);
}

/* ── Arranque (llamado desde estadisticas.js al activar el tab) ── */
btnCargar.addEventListener('click', cargarTodo);

window.rptInit = function () {
    const inicio = trimestreActual();
    const probar = async () => {
        for (let t = inicio; t >= 1; t--) {
            if (selTrim) selTrim.value = String(t);
            const ok = await cargarTodo();
            if (ok) return;
        }
        setEmptyState(true);
    };
    probar();
};

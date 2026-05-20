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
const $ = id => document.getElementById(id);
const selMes    = $('selMes');
const selGest   = $('selGestion');
const btnCargar = $('btnCargar');
const rptLoad   = $('rptLoading');

/* ── Instancias de gráficas (para destruir al recargar) ──────── */
const _charts = {};

function destroyChart(key) {
    if (_charts[key]) { _charts[key].destroy(); delete _charts[key]; }
}

/* ── Tab switching ───────────────────────────────────────────── */
document.querySelectorAll('.rpt-tab').forEach(btn => {
    btn.addEventListener('click', () => {
        document.querySelectorAll('.rpt-tab').forEach(t => t.classList.remove('active'));
        document.querySelectorAll('.rpt-panel').forEach(p => p.classList.remove('active'));
        btn.classList.add('active');
        $(`tab-${btn.dataset.tab}`).classList.add('active');
    });
});

/* ── Helpers ─────────────────────────────────────────────────── */
function txt(id, val) {
    const el = $(id);
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

function buildDonut(key, canvas, labels, data, colors) {
    destroyChart(key);
    _charts[key] = new Chart(canvas, {
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
    _charts[key] = new Chart(canvas, {
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
    const el = $(containerId);
    if (!el) return;
    if (!items || !items.length) { el.innerHTML = '<p class="rpt-empty">Sin datos</p>'; return; }
    el.innerHTML = items.map(([k, v, cls]) =>
        `<li><span class="rpt-stat-list__key">${k}</span><span class="rpt-stat-list__val ${cls || ''}">${v}</span></li>`
    ).join('');
}

/* ── Carga de datos ──────────────────────────────────────────── */
async function cargarTodo() {
    const mes    = selMes.value;
    const gestion = selGest.value;
    setLoading(true);

    const [rRend, rAsist, rCit, rCom, rProf, rTut] = await Promise.all([
        fetchAPI(`/api/analytics/reportes/rendimiento/?mes=${mes}&gestion=${gestion}`),
        fetchAPI(`/api/analytics/reportes/asistencia/`),
        fetchAPI(`/api/analytics/reportes/citaciones/`),
        fetchAPI(`/api/analytics/reportes/comunicados/`),
        fetchAPI(`/api/analytics/reportes/profesores/?mes=${mes}&gestion=${gestion}`),
        fetchAPI(`/api/analytics/reportes/tutores/`),
    ]);

    setLoading(false);

    if (rRend.ok)  renderAcademico(rRend.data);
    if (rAsist.ok) renderAsistencia(rAsist.data);
    if (rCit.ok)   renderCitaciones(rCit.data);
    if (rCom.ok)   renderComunicados(rCom.data);
    if (rProf.ok)  renderProfesores(rProf.data);
    if (rTut.ok)   renderTutores(rTut.data);
}

/* ── Académico ───────────────────────────────────────────────── */
function renderAcademico(d) {
    txt('acad-prom',     flo(d.promedio_colegio));
    txt('acad-total',    num(d.total_estudiantes));
    txt('acad-mejor-prof', d.profesores?.length ? d.profesores[0].nombre : '—');
    txt('acad-peor-mat',   d.materias?.length   ? d.materias[0].materia  : '—');

    /* Gráfica materias (peor primero) */
    const mats  = (d.materias || []).slice(0, 8);
    buildBar('chartMaterias', $('chartMaterias'),
        mats.map(m => m.materia),
        [{ label: 'Promedio', data: mats.map(m => m.promedio), backgroundColor: RED, borderRadius: 6 }],
        { horizontal: true, extra: { scales: { x: { max: 95, ticks: { color: '#94a3b8' } }, y: { ticks: { color: '#94a3b8' } } } } }
    );

    /* Gráfica cursos (peor primero) */
    const cursos = (d.cursos || []).slice(0, 8);
    buildBar('chartCursos', $('chartCursos'),
        cursos.map(c => c.curso),
        [{ label: 'Promedio', data: cursos.map(c => c.promedio), backgroundColor: ORANGE, borderRadius: 6 }],
        { horizontal: true, extra: { scales: { x: { max: 95, ticks: { color: '#94a3b8' } }, y: { ticks: { color: '#94a3b8' } } } } }
    );

    /* Top 5 */
    fillTable('tablaTop5', (d.top5 || []).map((e, i) => `
        <tr>
            <td>${i + 1}</td>
            <td>${e.nombre}</td>
            <td>${e.curso || '—'}</td>
            <td><strong>${flo(e.promedio)}</strong></td>
        </tr>`));

    /* Bottom 5 */
    fillTable('tablaBottom5', (d.bottom5 || []).map((e, i) => `
        <tr>
            <td>${i + 1}</td>
            <td>${e.nombre}</td>
            <td>${e.curso || '—'}</td>
            <td class="text-danger" style="color:#f87171"><strong>${flo(e.promedio)}</strong></td>
        </tr>`));

    /* Ranking profesores */
    fillTable('tablaProfs', (d.profesores || []).map((p, i) => {
        const prom = +p.promedio;
        const badge = prom >= 70
            ? `<span class="rpt-badge rpt-badge--green">${flo(prom)}</span>`
            : prom >= 51
                ? `<span class="rpt-badge rpt-badge--yellow">${flo(prom)}</span>`
                : `<span class="rpt-badge rpt-badge--red">${flo(prom)}</span>`;
        return `<tr>
            <td>${i + 1}</td>
            <td>${p.nombre}</td>
            <td>${num(p.total_estudiantes)}</td>
            <td>${flo(p.promedio)}</td>
            <td>${badge}</td>
        </tr>`;
    }));
}

/* ── Asistencia ──────────────────────────────────────────────── */
function renderAsistencia(d) {
    txt('asist-pct-pres',    pct(d.pct_presentes));
    txt('asist-pct-faltas',  pct(d.pct_faltas));
    txt('asist-pct-atrasos', pct(d.pct_atrasos));
    txt('asist-sesiones',    num(d.total_sesiones));

    /* Donut global */
    buildDonut('chartAsistDonut', $('chartAsistDonut'),
        ['Presentes', 'Faltas', 'Atrasos', 'Otros'],
        [d.pct_presentes, d.pct_faltas, d.pct_atrasos, d.pct_otros ?? 0],
        [GREEN, RED, YELLOW, BLUE]);

    /* Cursos con mayor tasa de faltas */
    const cfal = (d.cursos || []).slice(0, 8);
    buildBar('chartCursosFaltas', $('chartCursosFaltas'),
        cfal.map(c => c.curso),
        [{ label: '% Faltas', data: cfal.map(c => c.pct_faltas), backgroundColor: RED, borderRadius: 6 }],
        { horizontal: true });

    /* Tabla ranking */
    fillTable('tablaCursosAsist', (d.cursos || []).map(c => `
        <tr>
            <td>${c.curso}</td>
            <td style="color:#f87171">${pct(c.pct_faltas)}</td>
            <td style="color:#facc15">${pct(c.pct_atrasos)}</td>
            <td>${num(c.total_sesiones)}</td>
        </tr>`));
}

/* ── Citaciones ──────────────────────────────────────────────── */
function renderCitaciones(d) {
    txt('cit-total',      num(d.total));
    txt('cit-pct-asistio', pct(d.pct_asistio));
    txt('cit-vencidas',   num(d.vencidas));
    txt('cit-auto',       num(d.automaticas));

    /* Donut estados */
    const est = d.por_estado || {};
    buildDonut('chartCitDonut', $('chartCitDonut'),
        ['Asistió', 'No asistió', 'Atraso', 'Pendiente', 'Anulada'],
        [est.ASISTIO ?? 0, est.NO_ASISTIO ?? 0, est.ATRASO ?? 0, est.PENDIENTE ?? 0, est.ANULADA ?? 0],
        [GREEN, RED, YELLOW, BLUE, PURPLE]);

    /* Cursos */
    const cursos = (d.cursos || []).slice(0, 8);
    buildBar('chartCitCursos', $('chartCitCursos'),
        cursos.map(c => c.curso),
        [{ label: 'Citaciones', data: cursos.map(c => c.total), backgroundColor: BLUE, borderRadius: 6 }],
        { horizontal: true });
}

/* ── Comunicados ─────────────────────────────────────────────── */
function renderComunicados(d) {
    txt('com-total',  num(d.total));
    txt('com-pct',    pct(d.pct_lectura));
    txt('com-nunca',  num(d.tutores_nunca_leen));
    txt('com-vencer', num(d.proximos_vencer));

    /* Donut lectura */
    buildDonut('chartComDonut', $('chartComDonut'),
        ['Leídos', 'No leídos'],
        [d.total_leidos ?? 0, d.total_no_leidos ?? 0],
        [GREEN, RED]);

    /* Stat list */
    statList('comStatList', [
        ['Total comunicados activos',   num(d.total),              ''],
        ['Recepciones totales',         num(d.total_recepciones),  ''],
        ['Leídas',                      num(d.total_leidos),       'rpt-stat-list__val--green'],
        ['No leídas',                   num(d.total_no_leidos),    ''],
        ['Por vencer (≤3 días)',        num(d.proximos_vencer),    ''],
        ['Tutores sin leer nunca',      num(d.tutores_nunca_leen), ''],
    ]);
}

/* ── Profesores ──────────────────────────────────────────────── */
function renderProfesores(d) {
    txt('prof-total',      num(d.total_profesores));
    txt('prof-con-notas',  num(d.con_notas));
    txt('prof-sin-notas',  num(d.sin_notas));
    txt('prof-con-planes', num(d.con_planes_completos));

    fillTable('tablaProfsDetalle', (d.profesores || []).map(p => {
        const badgeNotas  = p.tiene_notas  ? `<span class="rpt-badge rpt-badge--green">Sí</span>`  : `<span class="rpt-badge rpt-badge--red">No</span>`;
        const badgePlanes = p.planes_ok    ? `<span class="rpt-badge rpt-badge--green">Sí</span>`  : `<span class="rpt-badge rpt-badge--yellow">No</span>`;
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
    buildDonut('chartTutoresDonut', $('chartTutoresDonut'),
        ['Con tutor', 'Sin tutor'],
        [d.con_tutor ?? 0, d.sin_tutor ?? 0],
        [GREEN, RED]);

    /* Donut FCM */
    buildDonut('chartFcmDonut', $('chartFcmDonut'),
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

/* ── Autenticación sidebar / logout ──────────────────────────── */
(function initSidebar() {
    const user = JSON.parse(localStorage.getItem('user') || 'null');
    if (user) {
        const nameEl = document.getElementById('profileName');
        const roleEl = document.getElementById('profileRole');
        if (nameEl && user.first_name) nameEl.textContent = `${user.first_name} ${user.last_name || ''}`.trim();
        if (roleEl) roleEl.textContent = 'Director';
    }

    const btnMenu     = document.getElementById('btnMenu');
    const sidebar     = document.querySelector('.sidebar');
    const backdrop    = document.getElementById('sidebarBackdrop');
    if (btnMenu) {
        btnMenu.addEventListener('click', () => { sidebar.classList.toggle('open'); backdrop.classList.toggle('show'); });
        backdrop.addEventListener('click', () => { sidebar.classList.remove('open'); backdrop.classList.remove('show'); });
    }

    const btnLogout = document.getElementById('btnLogout');
    if (btnLogout) {
        btnLogout.addEventListener('click', async () => {
            if (typeof logoutFCM === 'function') await logoutFCM();
            localStorage.clear();
            window.location.replace('/');
        });
    }
})();

/* ── Mes actual por defecto ──────────────────────────────────── */
(function setDefaultMonth() {
    const m = new Date().getMonth() + 1;
    if (selMes) selMes.value = String(m);
})();

/* ── Arranque ────────────────────────────────────────────────── */
btnCargar.addEventListener('click', cargarTodo);
cargarTodo();

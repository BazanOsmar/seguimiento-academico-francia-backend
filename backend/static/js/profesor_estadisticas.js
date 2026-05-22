'use strict';
/* ================================================================
   profesor_estadisticas.js — Panel de estadísticas del profesor
   ================================================================ */

let _estData        = null;
let _estDonutChart  = null;
let _estCursoFiltro = 'todos';
let _estCargado     = false;

// Paleta de colores para el ranking de barras (degradando opacidad)
const _RANK_COLORS = [
    'rgba(59,130,246,1)',
    'rgba(59,130,246,0.82)',
    'rgba(59,130,246,0.66)',
    'rgba(59,130,246,0.52)',
    'rgba(59,130,246,0.40)',
    'rgba(59,130,246,0.30)',
];

// Colores para trimestres
const _TRIM_COLORS = ['#3b82f6', '#818cf8', '#60a5fa'];

// Colores para la dona
const _DONUT_COLORS = {
    asistieron:   '#22c55e',
    no_asistieron:'#ef4444',
    pendiente:    '#f59e0b',
};

// ── Entry point ───────────────────────────────────────────────────
function _initEstadisticasPanel() {
    if (_estCargado) return;
    _estCargado = true;
    _loadChartJs(_cargarEstadisticas);
}

function _loadChartJs(callback) {
    if (window.Chart) { callback(); return; }
    const s = document.createElement('script');
    s.src = 'https://cdn.jsdelivr.net/npm/chart.js@4.4.4/dist/chart.umd.min.js';
    s.onload  = callback;
    s.onerror = () => { console.error('No se pudo cargar Chart.js'); callback(); };
    document.head.appendChild(s);
}

// ── Fetch ─────────────────────────────────────────────────────────
async function _cargarEstadisticas() {
    const spinner = document.getElementById('estSpinner');
    const content = document.getElementById('estContent');
    if (spinner) spinner.style.display = 'flex';
    if (content) content.style.display = 'none';

    const { ok, data } = await fetchAPI('/api/academics/profesor/estadisticas/');

    if (spinner) spinner.style.display = 'none';
    if (content) content.style.display = '';

    if (!ok) {
        if (content) content.innerHTML = '<div class="est-empty">No se pudieron cargar las estadísticas.</div>';
        return;
    }
    _estData = data;
    _renderEstadisticas(data);
}

// ── Render principal ──────────────────────────────────────────────
function _renderEstadisticas(d) {
    _renderResumen(d.resumen);
    _renderCursosBars(d.cursos);
    _buildCursoTabs(d.mis_cursos);
    _renderEstudiantes(d.estudiantes, 'todos');
    _renderDonut(d.resumen);
    _renderTrimestres(d.trimestres);
    _renderTablaPromedios(d.promedio_por_curso);
    _actualizarSubtitulo(d.mis_cursos);
}

// ── Subtitle ──────────────────────────────────────────────────────
function _actualizarSubtitulo(cursos) {
    const el = document.getElementById('estSubtitle');
    if (!el) return;
    const materias = [...new Set((cursos || []).map(c => c.materia).filter(Boolean))];
    const year = new Date().getFullYear();
    el.innerHTML = `<span>Gestión ${year}</span> · ${materias.join(' · ') || 'Sin asignaciones'} · Todos los cursos`;
}

// ── Resumen cards ─────────────────────────────────────────────────
function _renderResumen(r) {
    _setText('estValProm',    r.promedio_general != null ? r.promedio_general.toFixed(1) : '—');
    _setText('estValCit',     r.citaciones_enviadas ?? '—');
    _setText('estValAsist',   r.citaciones_asistieron ?? '—');
    _setText('estValNoAsist', r.citaciones_no_asistieron ?? '—');
}

// ── Barras de cursos ──────────────────────────────────────────────
function _renderCursosBars(cursos) {
    const wrap = document.getElementById('estCursosBars');
    if (!wrap) return;

    const validos = (cursos || []).filter(c => c.promedio != null);
    if (!validos.length) {
        wrap.innerHTML = '<div class="est-empty">Sin datos de notas aún.</div>';
        return;
    }

    const max = Math.max(...validos.map(c => c.promedio));
    wrap.innerHTML = validos.map((c, i) => {
        const pct   = max > 0 ? (c.promedio / max * 100).toFixed(1) : 0;
        const color = _RANK_COLORS[Math.min(i, _RANK_COLORS.length - 1)];
        return `
        <div class="est-bar-row">
            <div class="est-bar-rank">${i + 1}</div>
            <div class="est-bar-label">
                <div class="est-bar-name">${_esc(c.nombre)}</div>
                <div class="est-bar-sub">${_esc(c.materia)}</div>
            </div>
            <div class="est-bar-track">
                <div class="est-bar-fill" style="width:${pct}%;background:${color}"></div>
            </div>
            <div class="est-bar-score">${c.promedio.toFixed(1)}</div>
        </div>`;
    }).join('');
}

// ── Tabs de cursos para estudiantes ───────────────────────────────
function _buildCursoTabs(cursos) {
    const wrap = document.getElementById('estCursoTabs');
    if (!wrap) return;

    const items = [{ id: 'todos', nombre: 'Todos' }, ...(cursos || [])];
    wrap.innerHTML = items.map(c =>
        `<button class="est-tab-btn${c.id === 'todos' ? ' active' : ''}"
                 data-cid="${c.id}">${_esc(c.nombre)}</button>`
    ).join('');

    wrap.querySelectorAll('.est-tab-btn').forEach(btn => {
        btn.addEventListener('click', () => {
            _estCursoFiltro = btn.dataset.cid;
            wrap.querySelectorAll('.est-tab-btn').forEach(b => b.classList.remove('active'));
            btn.classList.add('active');
            _renderEstudiantes(_estData?.estudiantes || [], _estCursoFiltro);
        });
    });
}

// ── Lista de mejores estudiantes ──────────────────────────────────
function _renderEstudiantes(todos, filtro) {
    const wrap = document.getElementById('estStudentsGrid');
    if (!wrap) return;

    const lista = filtro === 'todos'
        ? todos
        : todos.filter(e => String(e.curso_id) === String(filtro));

    if (!lista.length) {
        wrap.innerHTML = '<div class="est-empty" style="grid-column:1/-1">Sin estudiantes para este curso.</div>';
        return;
    }

    wrap.innerHTML = lista.slice(0, 16).map((e, i) => `
        <div class="est-student-row">
            <div class="est-student-num">${i + 1}</div>
            <div class="est-avatar">${_esc(e.iniciales)}</div>
            <div class="est-student-info">
                <div class="est-student-name" title="${_esc(e.nombre)}">${_esc(e.nombre)}</div>
                <div class="est-student-curso">${_esc(e.curso_nombre)}</div>
            </div>
            <div class="est-student-score">${e.promedio != null ? e.promedio.toFixed(1) : '—'}</div>
        </div>`
    ).join('');
}

// ── Dona citaciones ───────────────────────────────────────────────
function _renderDonut(r) {
    const canvas = document.getElementById('estDonutCanvas');
    if (!canvas || !window.Chart) return;

    const total = r.citaciones_enviadas || 0;
    _setText('estDonutNum',   total);

    const asist = r.citaciones_asistieron   || 0;
    const noAs  = r.citaciones_no_asistieron || 0;
    const pend  = r.citaciones_pendiente    || 0;

    if (_estDonutChart) { _estDonutChart.destroy(); _estDonutChart = null; }

    if (total === 0) {
        canvas.parentElement.insertAdjacentHTML('afterend',
            '<div class="est-empty" id="estDonutEmpty">Sin citaciones registradas.</div>');
        return;
    }
    document.getElementById('estDonutEmpty')?.remove();

    _estDonutChart = new Chart(canvas, {
        type: 'doughnut',
        data: {
            labels: ['Asistieron', 'No asistieron', 'Pendiente'],
            datasets: [{
                data: [asist, noAs, pend],
                backgroundColor: [
                    _DONUT_COLORS.asistieron,
                    _DONUT_COLORS.no_asistieron,
                    _DONUT_COLORS.pendiente,
                ],
                borderColor: 'var(--bg-card)',
                borderWidth: 3,
                hoverOffset: 6,
            }],
        },
        options: {
            cutout: '68%',
            plugins: { legend: { display: false }, tooltip: {
                callbacks: {
                    label: ctx => ` ${ctx.label}: ${ctx.parsed}`,
                },
            }},
            animation: { duration: 600 },
        },
    });

    _setText('estPillOk',   asist);
    _setText('estPillFail', noAs);
    _setText('estPillPend', pend);
}

// ── Trimestres ────────────────────────────────────────────────────
function _renderTrimestres(trims) {
    const wrap = document.getElementById('estTrimList');
    if (!wrap) return;

    if (!trims || !trims.length) {
        wrap.innerHTML = '<div class="est-empty">Sin datos de trimestres.</div>';
        return;
    }

    const max = Math.max(...trims.map(t => t.promedio));
    wrap.innerHTML = trims.map((t, i) => {
        const pct   = max > 0 ? (t.promedio / max * 100).toFixed(1) : 0;
        const color = _TRIM_COLORS[i % _TRIM_COLORS.length];
        let delta   = '';
        if (t.delta != null) {
            const cls = t.delta >= 0 ? 'pos' : 'neg';
            const sign = t.delta >= 0 ? '+' : '';
            delta = `<div class="est-trim-delta est-trim-delta--${cls}">${sign}${t.delta.toFixed(1)}</div>`;
        } else {
            delta = '<div class="est-trim-delta est-trim-delta--nil">—</div>';
        }
        return `
        <div class="est-trim-row">
            <div class="est-trim-label">Trimestre ${t.trimestre}</div>
            <div class="est-trim-track">
                <div class="est-trim-fill" style="width:${pct}%;background:${color}"></div>
            </div>
            <div class="est-trim-score">${t.promedio.toFixed(1)}</div>
            ${delta}
        </div>`;
    }).join('');
}

// ── Tabla promedio por curso ───────────────────────────────────────
function _renderTablaPromedios(cursos) {
    const tbody = document.getElementById('estTablaCursos');
    if (!tbody) return;

    const validos = (cursos || []).filter(c => c.promedio != null);
    if (!validos.length) {
        tbody.innerHTML = `<tr><td colspan="5" class="est-empty">Sin datos.</td></tr>`;
        return;
    }

    tbody.innerHTML = validos.map((c, i) => {
        const color = _RANK_COLORS[Math.min(i, _RANK_COLORS.length - 1)];
        const fmt = v => v != null ? v.toFixed(1) : '—';
        return `
        <tr>
            <td>
                <div class="est-td-nombre">
                    <div class="est-td-dot" style="background:${color}"></div>
                    ${_esc(c.nombre)}
                </div>
            </td>
            <td>${fmt(c.t1)}</td>
            <td>${fmt(c.t2)}</td>
            <td>${fmt(c.t3)}</td>
            <td class="est-td-prom">${fmt(c.promedio)}</td>
        </tr>`;
    }).join('');
}

// ── Helpers ───────────────────────────────────────────────────────
function _setText(id, val) {
    const el = document.getElementById(id);
    if (el) el.textContent = val;
}

function _esc(str) {
    if (!str) return '';
    return String(str)
        .replace(/&/g, '&amp;')
        .replace(/</g, '&lt;')
        .replace(/>/g, '&gt;')
        .replace(/"/g, '&quot;');
}

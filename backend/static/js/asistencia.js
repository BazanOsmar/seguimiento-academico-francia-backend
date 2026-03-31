'use strict';

/* ================================================================
   asistencia.js — Pantalla de Asistencia (Director)
   ================================================================
   Flujo independiente por tarjeta:
   - Curso seleccionado       → carga % mensual (tarjeta izquierda)
   - Curso + Fecha listos     → carga registro diario + resumen del día
                                (tabla + tarjeta derecha)
   - Búsqueda de estudiante   → filtro en cliente (sin petición)
   ================================================================ */

// ── Estado ────────────────────────────────────────────────────────
let _cursoId           = null;
let _fecha             = null;
let _allRows           = [];
let _calendarioAbierto = false;
let _calMes            = null;  // mes mostrado en el calendario (independiente del filtro)
let _globalData        = null;  // datos globales cargados al inicio/reset
let _cursosData        = [];    // lista de cursos (para resumen día)
let _resumenDiaAbierto = false;
let _resumenFecha      = null;  // fecha activa en resumen día (YYYY-MM-DD)

// ── Referencias DOM ───────────────────────────────────────────────
const selectCurso    = document.getElementById('selectCurso');
const inputFecha     = document.getElementById('inputFecha');
const btnReset       = document.getElementById('btnReset');
const statsRow       = document.getElementById('statsRow');
const recordCard     = document.getElementById('recordCard') || document.querySelector('.record-card');
const recordHeader   = document.getElementById('recordHeader');
const tableContainer = document.getElementById('tableContainer');

// Calendario
const btnCalendario      = document.getElementById('btnCalendario');
const btnCalClose        = document.getElementById('btnCalClose');
const btnCalPrev         = document.getElementById('btnCalPrev');
const btnCalNext         = document.getElementById('btnCalNext');
const calendarioCard     = document.getElementById('calendarioCard');
const calendarioMesLabel = document.getElementById('calendarioMesLabel');
const calGrid            = document.getElementById('calGrid');

// Resumen Día (sidebar accordion)
const navResumenDia     = document.getElementById('navResumenDia');
const resumenDiaPanel   = document.getElementById('resumenDiaPanel');
const resumenCursosList = document.getElementById('resumenCursosList');
const inputResumenFecha = document.getElementById('inputResumenFecha');

// Stats mensuales
const statPct       = document.getElementById('statPct');
const statBadge     = document.getElementById('statBadge');
const statSub       = document.getElementById('statSub');
const statCardLabel = document.getElementById('statCardLabel');
const resumenCardLabel = document.getElementById('resumenCardLabel');

// Stats diarios
const estadosGrid            = document.getElementById('estadosGrid');
const resumenDiaPlaceholder  = document.getElementById('resumenDiaPlaceholder');
const cntPresente            = document.getElementById('cntPresente');
const cntFalta               = document.getElementById('cntFalta');
const cntAtraso              = document.getElementById('cntAtraso');
const cntLicencia            = document.getElementById('cntLicencia');

// Record header
const recordTitle      = document.getElementById('recordTitle');
const recordCursoBadge = document.getElementById('recordCursoBadge');
const recordSub        = document.getElementById('recordSub');

// ── Nombres de meses en JS (para labels) ──────────────────────────
const _MESES_JS = ['Enero','Febrero','Marzo','Abril','Mayo','Junio',
                   'Julio','Agosto','Septiembre','Octubre','Noviembre','Diciembre'];

function _periodoLabel(mesStr) {
    // "2026-03" → "Marzo 2026"
    const [y, m] = mesStr.split('-').map(Number);
    return `${_MESES_JS[m - 1]} ${y}`;
}

// ── Utilidades ────────────────────────────────────────────────────
const _ESTADO_LABEL = { PRESENTE: 'Presente', FALTA: 'Falta', ATRASO: 'Retraso', LICENCIA: 'Licencia' };

function _estadoBadge(estado) {
    const cls   = estado.toLowerCase();
    const label = _ESTADO_LABEL[estado] || estado;
    return `<span class="estado-badge estado-badge--${cls}"><span class="estado-badge__dot"></span>${label}</span>`;
}

function _dot(estado) {
    return `<span class="dot dot--${estado.toLowerCase()}" title="${_ESTADO_LABEL[estado] || estado}"></span>`;
}

function _formatHora(hora) {
    if (!hora) return '—';
    const [h, m] = hora.split(':').map(Number);
    const suffix = h >= 12 ? 'PM' : 'AM';
    const h12    = h % 12 || 12;
    return `${String(h12).padStart(2, '0')}:${String(m).padStart(2, '0')} ${suffix}`;
}

function _fechaDisplay(iso) {
    if (!iso) return '';
    const [y, mo, d] = iso.split('-');
    return `${d}/${mo}/${y}`;
}

function _todayISO() {
    return new Date().toISOString().split('T')[0];
}

function _getMes() {
    return (_fecha || _todayISO()).substring(0, 7);
}

// ── Cursos ────────────────────────────────────────────────────────
async function loadCursos() {
    const { ok, data } = await fetchAPI('/api/academics/cursos/');
    if (!ok || !data?.length) {
        selectCurso.innerHTML = '<option value="">Sin cursos disponibles</option>';
        return;
    }
    _cursosData = data;
    selectCurso.innerHTML =
        '<option value="">— Seleccionar —</option>' +
        data.map(c =>
            `<option value="${c.id}">${c.nombre || (c.grado + ' ' + c.paralelo)}</option>`
        ).join('');
}

// ── Reset de stats: vuelve a mostrar datos globales ───────────────
function _resetStats() {
    statPct.textContent   = '—';
    statBadge.textContent = '—';
    statBadge.className   = 'stat-badge stat-badge--neutral';
    statSub.textContent   = 'Cargando...';
    // Mostrar datos globales en lugar de guiones
    if (_globalData) {
        _renderGlobalStats();
    } else {
        loadGlobal();
    }
}

// ── Carga y render de estadísticas globales (todos los cursos) ────
async function loadGlobal() {
    const mes = _todayISO().substring(0, 7);
    const { ok, data } = await fetchAPI(`/api/attendance/resumen-global/?mes=${mes}`);
    if (!ok || !data) {
        // Sin datos: mostrar guiones neutros
        statPct.textContent   = '—';
        statBadge.textContent = '—';
        statBadge.className   = 'stat-badge stat-badge--neutral';
        statSub.textContent   = 'Sin datos de asistencia';
        _resetResumenDia();
        return;
    }
    _globalData = data;
    _renderGlobalStats();
}

function _renderGlobalStats() {
    const data = _globalData;
    const mesSufijo = data.es_mes_anterior ? ' (mes anterior)' : '';

    // Tarjeta izquierda — porcentaje global
    const periodo = _periodoLabel(data.mes) + (data.es_mes_anterior ? ' *' : '');
    statCardLabel.textContent = `Asistencia General — ${periodo}`;
    const pct  = data.porcentaje;
    const diff = data.diferencia;
    statPct.textContent = (pct !== null && pct !== undefined) ? `${pct}%` : '0%';
    if (pct === null || pct === undefined) {
        statBadge.textContent = 'Sin datos';
        statBadge.className   = 'stat-badge stat-badge--neutral';
        statSub.textContent   = `Sin registros${mesSufijo ? ' · mes anterior' : ''}`;
    } else {
        if (diff === null || diff === undefined) {
            statBadge.textContent = '—';
            statBadge.className   = 'stat-badge stat-badge--neutral';
        } else if (diff > 0) {
            statBadge.textContent = `↑ +${diff}%`;
            statBadge.className   = 'stat-badge stat-badge--up';
        } else if (diff < 0) {
            statBadge.textContent = `↓ ${diff}%`;
            statBadge.className   = 'stat-badge stat-badge--down';
        } else {
            statBadge.textContent = '= 0%';
            statBadge.className   = 'stat-badge stat-badge--neutral';
        }
        statSub.textContent = `Promedio global · todos los cursos${mesSufijo ? ' · mes anterior' : ''}`;
    }

    // Tarjeta derecha — breakdown global del mes (siempre muestra conteos, aunque sean 0)
    resumenCardLabel.textContent = `Resumen de Estados — ${periodo}`;
    const r = data.resumen_total;
    cntPresente.textContent = r.presente;
    cntFalta.textContent    = r.falta;
    cntAtraso.textContent   = r.atraso;
    cntLicencia.textContent = r.licencia;
    estadosGrid.style.display           = 'grid';
    resumenDiaPlaceholder.style.display = 'none';
}

// ── Carga mensual (solo requiere curso) ───────────────────────────
async function loadMonthly() {
    if (!_cursoId) return;
    statsRow.style.display = 'grid';

    const mes = _getMes();
    const { ok, data } = await fetchAPI(
        `/api/attendance/cursos/${_cursoId}/resumen-mensual/?mes=${mes}`
    );
    if (!ok || !data) return;

    const pct  = data.porcentaje;
    const diff = data.diferencia;
    const mesMostrado = data.mes || mes;   // backend puede haber retrocedido al mes anterior
    const cursoNombre = selectCurso.options[selectCurso.selectedIndex]?.text || '';
    const sufijo = data.es_mes_anterior ? ' *' : '';

    statCardLabel.textContent = `${cursoNombre} — ${_periodoLabel(mesMostrado)}${sufijo}`;

    statPct.textContent = (pct !== null && pct !== undefined) ? `${pct}%` : '0%';
    if (pct === null || pct === undefined) {
        statBadge.textContent = 'Sin datos';
        statBadge.className = 'stat-badge stat-badge--neutral';
        statSub.textContent = 'Sin registros de asistencia';
    } else {
        if (diff === null || diff === undefined) {
            statBadge.textContent = '—';
            statBadge.className = 'stat-badge stat-badge--neutral';
        } else if (diff > 0) {
            statBadge.textContent = `↑ +${diff}%`;
            statBadge.className = 'stat-badge stat-badge--up';
        } else if (diff < 0) {
            statBadge.textContent = `↓ ${diff}%`;
            statBadge.className = 'stat-badge stat-badge--down';
        } else {
            statBadge.textContent = '= 0%';
            statBadge.className = 'stat-badge stat-badge--neutral';
        }
        statSub.textContent = data.es_mes_anterior
            ? 'Promedio de asistencia del curso · mes anterior'
            : 'Promedio de asistencia del curso';
    }

    // Tarjeta derecha — desglose mensual del curso
    const r = data.resumen_total;
    resumenCardLabel.textContent = `Resumen de Estados — ${_periodoLabel(mesMostrado)}${sufijo}`;
    cntPresente.textContent = r.presente;
    cntFalta.textContent    = r.falta;
    cntAtraso.textContent   = r.atraso;
    cntLicencia.textContent = r.licencia;
    estadosGrid.style.display           = 'grid';
    resumenDiaPlaceholder.style.display = 'none';
}

// ── Carga diaria (requiere curso + fecha) ─────────────────────────
async function loadDaily() {
    if (!_cursoId || !_fecha) return;

    _showSkeleton();
    recordHeader.style.display = 'none';
    _resetResumenDia();

    const { ok, data } = await fetchAPI(
        `/api/attendance/cursos/${_cursoId}/asistencia/?fecha=${_fecha}`
    );

    if (!ok || !data) {
        _showNoData();
        return;
    }

    // Tarjeta derecha — conteos del día
    _renderResumenDia(data.resumen);

    // Tarjeta izquierda — % de asistencia del día
    if (data.resumen) {
        const r = data.resumen;
        const total = r.presente + r.falta + r.atraso + r.licencia;
        const pct = total > 0 ? Math.round(r.presente / total * 1000) / 10 : 0;
        const cursoNombre = selectCurso.options[selectCurso.selectedIndex]?.text || '';
        statCardLabel.textContent = `${cursoNombre} — ${_fechaDisplay(_fecha)}`;
        statPct.textContent = `${pct}%`;
        statBadge.textContent = total > 0 ? `${r.presente} / ${total}` : 'Sin sesión';
        statBadge.className   = 'stat-badge stat-badge--neutral';
        statSub.textContent   = 'Asistencia del día';
    }

    // Tabla
    _renderTable(data);
}

// ── Render resumen día (tarjeta derecha) ─────────────────────────
function _resetResumenDia() {
    estadosGrid.style.display = 'none';
    resumenDiaPlaceholder.style.display = 'block';
}

function _renderResumenDia(resumen) {
    if (!resumen) return;
    resumenCardLabel.textContent = `Resumen del Día — ${_fechaDisplay(_fecha)}`;
    cntPresente.textContent = resumen.presente ?? '—';
    cntFalta.textContent    = resumen.falta    ?? '—';
    cntAtraso.textContent   = resumen.atraso   ?? '—';
    cntLicencia.textContent = resumen.licencia ?? '—';
    estadosGrid.style.display = 'grid';
    resumenDiaPlaceholder.style.display = 'none';
}

// ── Render tabla diaria ───────────────────────────────────────────
function _renderTable(d) {
    const fechaDisplay = _fechaDisplay(d.fecha);
    const registrador  = d.registrado_por_nombre || '';
    const tipo         = d.registrado_por_tipo   || '';

    recordTitle.textContent      = `Registro Diario — ${fechaDisplay}`;
    recordCursoBadge.textContent = d.curso_nombre || '';
    recordSub.textContent        = `Registrado por: ${registrador}${tipo ? ' (' + tipo + ')' : ''}`;
    recordHeader.style.display   = 'block';

    const asistencias = d.asistencias || [];
    if (!asistencias.length) {
        _showNoData('Sin estudiantes registrados en este curso.');
        return;
    }

    const filas = asistencias.map(a => {
        const dots = (a.asistencias_recientes || []).map(r => _dot(r.estado)).join('');
        const perfilUrl = `/director/estudiantes/${_cursoId}/${a.estudiante_id}/`;
        return `<tr data-nombre="${(a.nombre_completo || '').toLowerCase()}">
            <td class="col-name"><a href="${perfilUrl}" style="color:var(--text-primary);text-decoration:none;">${(a.nombre_completo || '—').replace(', ', ' ')}</a></td>
            <td>${_estadoBadge(a.estado)}</td>
            <td class="col-hora" style="color:var(--text-secondary)">${_formatHora(a.hora)}</td>
            <td class="col-recientes"><div class="dots-row">${dots || '<span style="color:var(--text-muted);font-size:12px">—</span>'}</div></td>
        </tr>`;
    }).join('');

    tableContainer.innerHTML = `
        <table class="attendance-table">
            <thead>
                <tr>
                    <th>Nombre Estudiante</th>
                    <th>Estado</th>
                    <th class="col-hora">Hora Entrada</th>
                    <th class="col-recientes">Asistencias Recientes</th>
                </tr>
            </thead>
            <tbody id="tbodyAsistencia">${filas}</tbody>
        </table>`;

    _allRows = Array.from(document.querySelectorAll('#tbodyAsistencia tr'));
}

// ── Estados vacíos / skeleton ─────────────────────────────────────
function _showSkeleton() {
    const skeletons = Array(5).fill(0).map(() => `
        <tr>
            <td><div class="skeleton-block" style="width:55%"></div></td>
            <td><div class="skeleton-block" style="width:68px"></div></td>
            <td class="col-hora"><div class="skeleton-block" style="width:58px"></div></td>
            <td class="col-recientes"><div class="skeleton-block" style="width:75px"></div></td>
        </tr>`).join('');
    tableContainer.innerHTML = `
        <table class="attendance-table">
            <thead><tr>
                <th>Nombre Estudiante</th><th>Estado</th>
                <th class="col-hora">Hora Entrada</th>
                <th class="col-recientes">Asistencias Recientes</th>
            </tr></thead>
            <tbody>${skeletons}</tbody>
        </table>`;
    _allRows = [];
}

function _showNoData(msg = 'No hay asistencia registrada para esta fecha.') {
    tableContainer.innerHTML = `
        <div class="empty-state">
            <svg width="44" height="44" viewBox="0 0 24 24" fill="none" stroke="currentColor"
                 stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round">
                <rect x="3" y="4" width="18" height="18" rx="2"/>
                <line x1="16" y1="2" x2="16" y2="6"/>
                <line x1="8"  y1="2" x2="8"  y2="6"/>
                <line x1="3"  y1="10" x2="21" y2="10"/>
                <line x1="9" y1="16" x2="15" y2="16"/>
            </svg>
            <div class="empty-state__title">Sin datos</div>
            <div class="empty-state__sub">${msg}</div>
        </div>`;
    _allRows = [];
}

// ── Calendario mensual ────────────────────────────────────────────
function _getDimTargets() {
    return [statsRow, document.querySelector('.record-card')].filter(Boolean);
}

function _openCalendario() {
    _calendarioAbierto = true;
    // Al abrir, sincronizar con el mes del filtro si no hay mes previo
    if (!_calMes) _calMes = _getMes();
    btnCalendario.classList.add('active');
    calendarioCard.style.display = 'block';
    _getDimTargets().forEach(el => el.classList.add('content--dimmed'));
    _loadCalendario();
}

function _closeCalendario() {
    _calendarioAbierto = false;
    btnCalendario.classList.remove('active');
    calendarioCard.style.display = 'none';
    _getDimTargets().forEach(el => el.classList.remove('content--dimmed'));
}

function _moveMes(delta) {
    const [y, m] = _calMes.split('-').map(Number);
    const d = new Date(y, m - 1 + delta, 1);
    _calMes = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`;
    _loadCalendario();
}

// ── Resumen Día (sidebar accordion) ───────────────────────────────
function _openResumenDia() {
    _resumenDiaAbierto = true;
    navResumenDia.classList.add('open');
    resumenDiaPanel.classList.add('open');
    if (!_resumenFecha) _resumenFecha = _todayISO();
    _loadResumenDia();
}

function _closeResumenDia() {
    _resumenDiaAbierto = false;
    navResumenDia.classList.remove('open');
    resumenDiaPanel.classList.remove('open');
}

async function _loadResumenDia() {
    if (!_resumenFecha) return;
    const labelEl = document.getElementById('resumenDiaFechaLabel');
    if (labelEl) labelEl.textContent = _fechaDisplay(_resumenFecha);
    resumenCursosList.innerHTML = '<div class="resumen-dia-empty">Cargando...</div>';
    const { ok, data } = await fetchAPI(`/api/attendance/estado-diario/?fecha=${_resumenFecha}`);
    if (!ok || !data) {
        resumenCursosList.innerHTML = '<div class="resumen-dia-empty">No se pudieron cargar los datos.</div>';
        return;
    }
    const registrados = new Set((data.sesiones || []).map(s => s.curso_id));
    _renderResumenDiaCursos(registrados);
}

function _renderResumenDiaCursos(registrados) {
    if (!_cursosData.length) {
        resumenCursosList.innerHTML = '<div class="resumen-dia-empty">Sin cursos disponibles.</div>';
        return;
    }
    const html = _cursosData.map(c => {
        const nombre = c.nombre || `${c.grado} ${c.paralelo}`;
        const ok     = registrados.has(c.id);
        const color  = ok ? 'verde' : 'naranja';
        return `<div class="resumen-curso-item resumen-curso-item--${color}">
            <span class="resumen-curso-nombre">${nombre}</span>
            <span class="resumen-curso-status--${color}">${ok ? 'Registrada' : 'Sin registro'}</span>
        </div>`;
    }).join('');
    resumenCursosList.innerHTML = html;
}

async function _loadCalendario() {
    // Skeleton mientras carga
    _showCalSkeleton();

    const { ok, data } = await fetchAPI(`/api/attendance/calendario-mensual/?mes=${_calMes}`);
    if (!ok || !data) {
        calGrid.innerHTML = '<div style="grid-column:1/-1;text-align:center;padding:20px;color:var(--text-muted);font-size:13px">No se pudieron cargar los datos.</div>';
        return;
    }

    // n = mes_nombre, t = total_cursos, d = dias
    calendarioMesLabel.textContent = data.n;
    _renderCalGrid(data);
}

function _showCalSkeleton() {
    calendarioMesLabel.textContent = '...';
    // 35 celdas (5 filas × 7 cols) como esqueleto
    calGrid.innerHTML = Array(35).fill(0).map(() =>
        `<div class="cal-cell"><div class="skeleton-block" style="width:20px;height:12px;margin:0 auto;border-radius:4px"></div></div>`
    ).join('');
}

function _renderCalGrid(data) {
    const [year, month] = data.mes.split('-').map(Number);
    const hoyISO  = new Date().toISOString().split('T')[0];
    const lastDay = new Date(year, month, 0).getDate();
    const total   = data.t;

    // Mapa fecha → sesiones (claves cortas del backend: f, s)
    const diaMap = {};
    for (const d of data.d) diaMap[d.f] = d.s;

    // Desplazamiento inicial (Lun=0 … Dom=6)
    let startDow = new Date(year, month - 1, 1).getDay();
    startDow = startDow === 0 ? 6 : startDow - 1;

    let html = '';
    for (let i = 0; i < startDow; i++) {
        html += '<div class="cal-cell cal-cell--empty"></div>';
    }

    for (let d = 1; d <= lastDay; d++) {
        const dateStr   = `${year}-${String(month).padStart(2,'0')}-${String(d).padStart(2,'0')}`;
        const dow       = new Date(year, month - 1, d).getDay();  // 0=Dom, 6=Sáb
        const isWeekend = dow === 0 || dow === 6;
        const sesiones  = diaMap[dateStr];
        const isToday   = dateStr === hoyISO;
        const isFuture  = dateStr > hoyISO;

        let dotHtml = '';
        let title   = '';

        if (isWeekend) {
            title = 'Sin clases';
        } else if (isFuture) {
            title = '';
        } else if (sesiones !== undefined && sesiones > 0) {
            title = `${sesiones} de ${total} curso${total !== 1 ? 's' : ''} registrado${total !== 1 ? 's' : ''}`;
            dotHtml = sesiones >= total
                ? '<span class="cal-dot cal-dot--completo"></span>'
                : '<span class="cal-dot cal-dot--parcial"></span>';
        } else {
            // Día hábil pasado sin ninguna sesión registrada
            title   = 'Sin asistencia registrada';
            dotHtml = '<span class="cal-dot cal-dot--sin-asistencia"></span>';
        }

        const classes = [
            'cal-cell',
            isToday   ? 'cal-cell--today'   : '',
            isFuture  ? 'cal-cell--future'  : '',
            isWeekend ? 'cal-cell--weekend' : '',
        ].filter(Boolean).join(' ');

        html += `<div class="${classes}" title="${title}">
            <span class="cal-day-num">${d}</span>${dotHtml}
        </div>`;
    }

    calGrid.innerHTML = html;
}

// ── Eventos ───────────────────────────────────────────────────────
btnCalendario.addEventListener('click', () => {
    _calendarioAbierto ? _closeCalendario() : _openCalendario();
});

btnCalClose.addEventListener('click', _closeCalendario);
btnCalPrev.addEventListener('click', () => _moveMes(-1));
btnCalNext.addEventListener('click', () => _moveMes(+1));

if (navResumenDia) navResumenDia.addEventListener('click', () => {
    _resumenDiaAbierto ? _closeResumenDia() : _openResumenDia();
});
if (inputResumenFecha) inputResumenFecha.addEventListener('change', () => {
    _resumenFecha = inputResumenFecha.value || null;
    if (_resumenFecha) _loadResumenDia();
});

// Click fuera del calendario → cerrar
document.addEventListener('click', (e) => {
    if (_calendarioAbierto) {
        if (!calendarioCard.contains(e.target) && !btnCalendario.contains(e.target)) _closeCalendario();
    }
});

selectCurso.addEventListener('change', async () => {
    _cursoId = selectCurso.value ? Number(selectCurso.value) : null;
    if (!_cursoId) {
        // Sin curso → stats globales + cards de cursos
        _resetStats();
        await loadCursosCards();
        return;
    }
    await loadMonthly();
    if (_fecha) {
        await loadDaily();
    } else {
        await loadEstudiantesCards();
    }
});

inputFecha.addEventListener('change', async () => {
    _fecha = inputFecha.value || null;
    if (_cursoId) {
        await loadMonthly();
        if (_fecha) {
            await loadDaily();
        } else {
            await loadEstudiantesCards();
        }
    }
});


btnReset.addEventListener('click', async () => {
    if (_calendarioAbierto) _closeCalendario();
    // Limpiar inputs
    selectCurso.value = '';
    inputFecha._flatpickr ? inputFecha._flatpickr.clear() : (inputFecha.value = '');
    _cursoId = null;
    _fecha   = null;
    _allRows = [];

    // Volver stats a datos globales + cards de cursos
    _resetStats();
    recordHeader.style.display = 'none';
    await loadCursosCards();
});

// ── Cards de cursos y estudiantes ─────────────────────────────────

/**
 * Asigna tier relativo a cada ítem según su ranking en la lista.
 * Top 25% → high, bottom 25% → low, resto → mid.
 * Ítems sin datos → none.
 */
function _asignarTiers(items) {
    const conDatos = items.filter(i => i.porcentaje !== null && i.porcentaje !== undefined);
    conDatos.sort((a, b) => b.porcentaje - a.porcentaje);
    const n = conDatos.length;
    conDatos.forEach((item, idx) => {
        const rank = n === 1 ? 0.5 : idx / (n - 1);   // 0 = mejor, 1 = peor
        item._tier = rank <= 0.25 ? 'high' : rank >= 0.75 ? 'low' : 'mid';
    });
    items.filter(i => i.porcentaje === null || i.porcentaje === undefined)
         .forEach(i => { i._tier = 'none'; });
}

function _renderCard(nombre, pct, stats, tier) {
    const pctTxt = pct !== null && pct !== undefined ? `${pct}%` : '—';
    const barW   = pct !== null && pct !== undefined ? pct : 0;
    return `
        <div class="rc-card rc-card--${tier}">
            <div class="rc-card__name" title="${nombre}">${nombre}</div>
            <div class="rc-card__pct">${pctTxt}</div>
            <div class="rc-card__bar"><div class="rc-card__bar-fill" style="width:${barW}%"></div></div>
            <div class="rc-card__stats">
                <span class="rc-card__stat"><span class="rc-card__stat-dot" style="background:#22c55e"></span>${stats.presente}</span>
                <span class="rc-card__stat"><span class="rc-card__stat-dot" style="background:#ef4444"></span>${stats.falta}</span>
                <span class="rc-card__stat"><span class="rc-card__stat-dot" style="background:#f59e0b"></span>${stats.atraso}</span>
            </div>
        </div>`;
}

function _cardsHTML(items, keyNombre) {
    _asignarTiers(items);
    return items.map(i => _renderCard(i[keyNombre], i.porcentaje, i, i._tier)).join('');
}

async function loadCursosCards() {
    const mes = _getMes();
    tableContainer.innerHTML = '<div style="padding:8px 0"><span class="resumen-cards-title">Cargando...</span></div>';
    const { ok, data } = await fetchAPI(`/api/attendance/resumen-cursos/?mes=${mes}`);
    if (!ok || !data?.cursos?.length) {
        _showNoData('No hay registros de asistencia.');
        return;
    }
    const sufijo = data.es_mes_anterior ? ' <span style="color:var(--text-muted);font-weight:400">· mes anterior</span>' : '';
    tableContainer.innerHTML = `
        <div class="resumen-cards-header">
            <span class="resumen-cards-title">Asistencia por Curso${sufijo}</span>
            <span class="resumen-cards-meta">${_periodoLabel(data.mes)}</span>
        </div>
        <div class="resumen-cards-grid">${_cardsHTML(data.cursos, 'nombre')}</div>`;
    recordHeader.style.display = 'none';
    _allRows = [];
}

async function loadEstudiantesCards() {
    if (!_cursoId) return;
    const mes = _getMes();
    tableContainer.innerHTML = '<div style="padding:8px 0"><span class="resumen-cards-title">Cargando...</span></div>';
    const { ok, data } = await fetchAPI(`/api/attendance/cursos/${_cursoId}/resumen-estudiantes/?mes=${mes}`);
    if (!ok || !data?.estudiantes?.length) {
        _showNoData('No hay registros de asistencia para este curso.');
        return;
    }
    const sufijo = data.es_mes_anterior ? ' <span style="color:var(--text-muted);font-weight:400">· mes anterior</span>' : '';
    const cursoNombre = selectCurso.options[selectCurso.selectedIndex]?.text || '';
    tableContainer.innerHTML = `
        <div class="resumen-cards-header">
            <span class="resumen-cards-title">${cursoNombre} — Estudiantes${sufijo}</span>
            <span class="resumen-cards-meta">${_periodoLabel(data.mes)}</span>
        </div>
        <div class="resumen-cards-grid">${_cardsHTML(data.estudiantes, 'nombre')}</div>`;
    recordHeader.style.display = 'none';
    _allRows = [];
}

// ── Exportar planilla ─────────────────────────────────────────────
(function () {
    const btnExportar  = document.getElementById('btnExportar');
    const backdrop     = document.getElementById('exportBackdrop');
    const exportCurso  = document.getElementById('exportCurso');
    const exportMes    = document.getElementById('exportMes');
    const exportFormato = document.getElementById('exportFormato');
    const btnCancelar  = document.getElementById('exportCancelar');
    const btnGenerar   = document.getElementById('exportGenerar');
    const errEl        = document.getElementById('exportError');

    function _poblarMeses() {
        exportMes.innerHTML = '';
        const hoy = new Date();
        const meses = ['Enero','Febrero','Marzo','Abril','Mayo','Junio',
                       'Julio','Agosto','Septiembre','Octubre','Noviembre','Diciembre'];
        const anio      = hoy.getFullYear();
        const mesActual = hoy.getMonth() + 1;          // 1-12
        // Desde febrero (inicio escolar) hasta el mes actual
        for (let m = 2; m <= mesActual; m++) {
            const val = `${anio}-${String(m).padStart(2, '0')}`;
            const opt = document.createElement('option');
            opt.value = val;
            opt.textContent = `${meses[m - 1]} ${anio}`;
            exportMes.appendChild(opt);
        }
        exportMes.value = `${anio}-${String(mesActual).padStart(2, '0')}`;
    }

    function _mesARango(mesStr) {
        // "YYYY-MM" → { desde: "YYYY-MM-01", hasta: "YYYY-MM-DD" }
        const [y, m] = mesStr.split('-').map(Number);
        const ultimo = new Date(y, m, 0).getDate();
        const pad = n => String(n).padStart(2, '0');
        return {
            desde: `${y}-${pad(m)}-01`,
            hasta: `${y}-${pad(m)}-${pad(ultimo)}`,
        };
    }

    function openExport() {
        exportCurso.innerHTML = selectCurso.innerHTML;
        if (_cursoId) exportCurso.value = String(_cursoId);
        _poblarMeses();
        errEl.style.display = 'none';
        backdrop.classList.add('visible');
    }

    function closeExport() {
        backdrop.classList.remove('visible');
    }

    async function _refrescarToken() {
        const refresh = localStorage.getItem('refresh_token');
        if (!refresh) return null;
        try {
            const res = await fetch('/api/auth/refresh/', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ refresh }),
            });
            if (!res.ok) return null;
            const data = await res.json();
            if (data.access) {
                localStorage.setItem('access_token', data.access);
                return data.access;
            }
        } catch (_) { /* silenciar */ }
        return null;
    }

    async function generarPlanilla() {
        const cursoId  = exportCurso.value;
        const mesVal   = exportMes.value;
        const formato  = exportFormato.value;   // 'pdf' | 'excel'

        errEl.style.display = 'none';

        if (!cursoId) {
            errEl.textContent = 'Selecciona un curso.';
            errEl.style.display = 'block';
            return;
        }
        if (!mesVal) {
            errEl.textContent = 'Selecciona un mes.';
            errEl.style.display = 'block';
            return;
        }

        const { desde, hasta } = _mesARango(mesVal);

        btnGenerar.disabled = true;
        btnGenerar.textContent = 'Verificando...';

        // Verificar que hay datos (reutiliza el endpoint PDF con check=1)
        const checkParams = new URLSearchParams({
            curso_id: cursoId, fecha_desde: desde, fecha_hasta: hasta,
        });
        checkParams.set('check', '1');

        const { ok, data } = await fetchAPI(`/director/asistencia/exportar/?${checkParams}`);

        if (!ok || !data?.tiene_datos) {
            btnGenerar.disabled = false;
            btnGenerar.textContent = 'Generar planilla';
            errEl.textContent = 'No hay registros de asistencia para el mes seleccionado.';
            errEl.style.display = 'block';
            return;
        }

        // Refrescar token justo antes de descargar para evitar expiración
        const tkn = await _refrescarToken() || localStorage.getItem('access_token') || '';

        btnGenerar.disabled = false;
        btnGenerar.textContent = 'Generar planilla';

        if (formato === 'excel') {
            // Descarga directa via <a> para que el navegador dispare el archivo
            const params = new URLSearchParams({
                curso_id: cursoId, fecha_desde: desde, fecha_hasta: hasta, token: tkn,
            });
            const a = document.createElement('a');
            a.href = `/director/asistencia/exportar/excel/?${params}`;
            a.download = '';
            document.body.appendChild(a);
            a.click();
            document.body.removeChild(a);
        } else {
            const params = new URLSearchParams({
                curso_id: cursoId, fecha_desde: desde, fecha_hasta: hasta, token: tkn,
            });
            window.open(`/director/asistencia/exportar/?${params}`, '_blank');
        }

        closeExport();
    }

    btnExportar.addEventListener('click', openExport);
    btnCancelar.addEventListener('click', closeExport);
    backdrop.addEventListener('click', e => { if (e.target === backdrop) closeExport(); });
    btnGenerar.addEventListener('click', () => generarPlanilla());
})();

// ── Inicialización ────────────────────────────────────────────────
(async function init() {
    await Promise.all([loadCursos(), loadGlobal()]);
    await loadCursosCards();
})();

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
let _allRows           = [];
let _globalData        = null;  // datos globales cargados al inicio/reset
let _cursosData        = [];    // lista de cursos (para resumen día)
let _resumenDiaAbierto = false;
let _resumenFecha      = null;  // fecha activa en resumen día (YYYY-MM-DD)
let _resumenCursosMes  = null;  // 'YYYY-MM' — mes activo en la tabla "Asistencia por Curso"
let _globalMes         = null;  // mes cargado en las tarjetas superiores

// ── Referencias DOM ───────────────────────────────────────────────
const statsRow       = document.getElementById('statsRow');
const recordCard     = document.getElementById('recordCard') || document.querySelector('.record-card');
const recordHeader   = document.getElementById('recordHeader');
const tableContainer = document.getElementById('tableContainer');

function _setRecordMode(mode) {
    recordCard?.classList.toggle('record-card--resumen-cursos', mode === 'resumen-cursos' || mode === 'cards');
}

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
    return _resumenCursosMes || _hoyMes();
}

// ── Cursos ────────────────────────────────────────────────────────
async function loadCursos() {
    const { ok, data } = await fetchAPI('/api/academics/cursos/');
    _cursosData = ok && Array.isArray(data) ? data : [];
}

function _cursoNombre(cursoId = _cursoId) {
    const curso = _cursosData.find(c => Number(c.id) === Number(cursoId));
    return curso ? (curso.nombre || `${curso.grado} ${curso.paralelo}`) : '';
}

async function seleccionarCurso(cursoId) {
    _cursoId = Number(cursoId) || null;
    if (!_cursoId) return;

    await loadMonthly();
    await loadEstudiantesCards();
}

// ── Reset de stats: vuelve a mostrar datos globales ───────────────
function _resetStats() {
    statPct.textContent   = '—';
    statBadge.textContent = '—';
    statBadge.className   = 'stat-badge stat-badge--neutral';
    statSub.textContent   = 'Cargando...';
    // Mostrar datos globales en lugar de guiones
    if (_globalData && _globalMes === (_resumenCursosMes || _hoyMes())) {
        _renderGlobalStats();
    } else {
        loadGlobal(_resumenCursosMes || _hoyMes());
    }
}

// ── Carga y render de estadísticas globales (todos los cursos) ────
async function loadGlobal(mes = null) {
    mes = mes || _resumenCursosMes || _hoyMes();
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
    _globalMes = mes;
    _renderGlobalStats();
}

function _renderGlobalStats() {
    const data = _globalData;
    const mesSufijo = data.es_mes_anterior ? ' (mes anterior)' : '';

    // Tarjeta izquierda — porcentaje global
    const periodo = _periodoLabel(data.mes) + (data.es_mes_anterior ? ' *' : '');
    statCardLabel.textContent = `Porcentaje de asistencia general de ${periodo}`;
    const pct  = data.porcentaje;
    const diff = data.diferencia;
    statPct.textContent = (pct !== null && pct !== undefined) ? `${pct}%` : '-';
    if (pct === null || pct === undefined) {
        statBadge.textContent = '-';
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
    resumenCardLabel.textContent = `Resumen de estados de ${periodo}`;
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
    const cursoNombre = _cursoNombre();
    const sufijo = data.es_mes_anterior ? ' *' : '';

    statCardLabel.textContent = `Porcentaje de asistencia de ${cursoNombre} de ${_periodoLabel(mesMostrado)}${sufijo}`;

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
    resumenCardLabel.textContent = `Resumen de estados de ${cursoNombre} de ${_periodoLabel(mesMostrado)}${sufijo}`;
    cntPresente.textContent = r.presente;
    cntFalta.textContent    = r.falta;
    cntAtraso.textContent   = r.atraso;
    cntLicencia.textContent = r.licencia;
    estadosGrid.style.display           = 'grid';
    resumenDiaPlaceholder.style.display = 'none';
}

// ── Carga diaria (requiere curso + fecha) ─────────────────────────
async function loadDaily() {
    return;

    _setRecordMode('daily');
    _showSkeleton();
    recordHeader.style.display = 'none';
    _resetResumenDia();

    const { ok, data } = await fetchAPI(
        `/api/attendance/cursos/${_cursoId}/asistencia/?fecha=`
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
        const cursoNombre = _cursoNombre();
        statCardLabel.textContent = `${cursoNombre}`;
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
    resumenCardLabel.textContent = 'Resumen del Día';
    cntPresente.textContent = resumen.presente ?? '—';
    cntFalta.textContent    = resumen.falta    ?? '—';
    cntAtraso.textContent   = resumen.atraso   ?? '—';
    cntLicencia.textContent = resumen.licencia ?? '—';
    estadosGrid.style.display = 'grid';
    resumenDiaPlaceholder.style.display = 'none';
}

// ── Render tabla diaria ───────────────────────────────────────────
function _renderTable(d) {
    _setRecordMode('daily');
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
    _setRecordMode('daily');
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

// ── Eventos ───────────────────────────────────────────────────────
if (navResumenDia) navResumenDia.addEventListener('click', () => {
    _resumenDiaAbierto ? _closeResumenDia() : _openResumenDia();
});
if (inputResumenFecha) inputResumenFecha.addEventListener('change', () => {
    _resumenFecha = inputResumenFecha.value || null;
    if (_resumenFecha) _loadResumenDia();
});

// ── Cards de cursos y estudiantes ─────────────────────────────────

function _hoyMes() {
    const h = new Date();
    return `${h.getFullYear()}-${String(h.getMonth() + 1).padStart(2, '0')}`;
}

function _mesPrev(mesStr) {
    const [y, m] = mesStr.split('-').map(Number);
    const d = new Date(y, m - 2, 1);
    return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`;
}

function _mesNext(mesStr) {
    const [y, m] = mesStr.split('-').map(Number);
    const d = new Date(y, m, 1);
    return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`;
}

function _renderResumenCursosMesNav(mes) {
    const [y, m] = mes.split('-').map(Number);
    const label = _MESES_JS[m - 1];
    const esActual = mes >= _hoyMes();
    return `
        <div class="cit-mes-nav" id="resumenCursosMesNav">
            <button class="cit-mes-nav__btn" id="resumenCursosMesPrev" aria-label="Mes anterior">&#8249;</button>
            <span class="cit-mes-nav__label">${label}</span>
            <button class="cit-mes-nav__btn" id="resumenCursosMesNext" aria-label="Mes siguiente" ${esActual ? 'disabled' : ''}>&#8250;</button>
        </div>`;
}

function _renderDailyButton() {
    return `
        <button type="button" class="btn-dia-especifico js-dia-especifico">
            <svg width="15" height="15" viewBox="0 0 24 24" fill="none"
                 stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
                <rect x="3" y="4" width="18" height="18" rx="2"/>
                <line x1="16" y1="2" x2="16" y2="6"/>
                <line x1="8"  y1="2" x2="8"  y2="6"/>
                <line x1="3"  y1="10" x2="21" y2="10"/>
            </svg>
            Ver asistencia diaria
        </button>`;
}

function _mostrarAvisoSinDatos(cursoNombre, mes = _resumenCursosMes || _hoyMes()) {
    const mensaje = `No hay datos de asistencia para ${cursoNombre} en ${_periodoLabel(mes)}.`;
    if (typeof showAppToast === 'function') {
        showAppToast('info', 'Sin datos', mensaje);
    }
}

function _renderBackToCursosButton() {
    return `
        <button type="button" class="btn-volver-cursos js-volver-cursos" aria-label="Volver a cursos">
            <svg width="15" height="15" viewBox="0 0 24 24" fill="none"
                 stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round">
                <path d="M19 12H5"/>
                <path d="M12 19l-7-7 7-7"/>
            </svg>
        </button>`;
}

function _tablaResumenCursosHTML(cursos) {
    if (!cursos.length) {
        return '<div class="empty-state" style="padding:24px 0"><div class="empty-state__title">Sin registros</div><div class="empty-state__sub">No hay datos en el mes seleccionado.</div></div>';
    }
    const filas = cursos.map(c => `
        <tr class="rc-tbl__row${Number(c.id) === Number(_cursoId) ? ' rc-tbl__row--active' : ''}" data-curso-id="${c.id}" data-curso-nombre="${c.nombre}" data-total="${c.total || 0}">
            <td class="rc-tbl__curso">${c.nombre}</td>
            <td class="rc-tbl__num rc-tbl__num--ok">${c.presente}</td>
            <td class="rc-tbl__num rc-tbl__num--warn">${c.atraso}</td>
            <td class="rc-tbl__num rc-tbl__num--bad">${c.falta}</td>
            <td class="rc-tbl__num">${c.sin_uniforme || 0}</td>
        </tr>`).join('');
    return `
        <div class="rc-tbl-wrap">
            <table class="rc-tbl">
                <thead>
                    <tr>
                        <th>Curso</th>
                        <th>Nro Asistencias</th>
                        <th>Nro Atrasos</th>
                        <th>Nro Faltas</th>
                        <th>Est. sin uniformes</th>
                    </tr>
                </thead>
                <tbody>${filas}</tbody>
            </table>
        </div>`;
}

function _pctEstado(valor, total) {
    if (!total) return null;
    return Math.round((valor / total) * 1000) / 10;
}

function _pctTexto(valor) {
    return valor !== null && valor !== undefined ? `${valor}%` : '—';
}

function _tablaEstudiantesCursoHTML(estudiantes) {
    const filas = estudiantes.map(e => {
        return `
            <tr>
                <td class="rc-tbl__curso">${e.nombre}</td>
                <td class="rc-tbl__num rc-tbl__num--ok">${_pctTexto(e.porcentaje_asistencia)}</td>
                <td class="rc-tbl__num rc-tbl__num--warn">${_pctTexto(e.porcentaje_atrasos)}</td>
                <td class="rc-tbl__num rc-tbl__num--bad">${_pctTexto(e.porcentaje_faltas)}</td>
                <td class="rc-tbl__num">${e.sin_uniforme || 0}</td>
            </tr>`;
    }).join('');
    return `
        <div class="rc-tbl-wrap">
            <table class="rc-tbl rc-tbl--students">
                <thead>
                    <tr>
                        <th>Nombre</th>
                        <th>% Asistencia</th>
                        <th>% Atrasos</th>
                        <th>% Faltas</th>
                        <th>Veces sin uniforme</th>
                    </tr>
                </thead>
                <tbody>${filas}</tbody>
            </table>
        </div>`;
}

async function loadCursosCards() {
    if (!_resumenCursosMes) _resumenCursosMes = _hoyMes();
    const mes = _resumenCursosMes;
    _setRecordMode('resumen-cursos');
    await loadGlobal(mes);

    tableContainer.innerHTML = `
        <div class="rc-table-toolbar">
            <span class="resumen-cards-title">Asistencia por Curso</span>
            <div class="rc-toolbar-actions">
                ${_renderResumenCursosMesNav(mes)}
                ${_renderDailyButton()}
            </div>
        </div>
        <div style="padding:8px 0;color:var(--text-muted);font-size:.85rem;">Cargando…</div>`;
    _wireResumenCursosMesNav();

    const { ok, data } = await fetchAPI(`/api/attendance/resumen-cursos/?mes=${mes}`);
    if (!ok) {
        _showNoData('Error al cargar los datos.');
        return;
    }
    const cursos = (data?.cursos || []).sort((a, b) => a.nombre.localeCompare(b.nombre));

    tableContainer.innerHTML = `
        <div class="rc-table-toolbar">
            <span class="resumen-cards-title">Asistencia por Curso</span>
            <div class="rc-toolbar-actions">
                ${_renderResumenCursosMesNav(mes)}
                ${_renderDailyButton()}
            </div>
        </div>
        ${_tablaResumenCursosHTML(cursos)}`;
    _wireResumenCursosMesNav();
    _wireResumenCursosRows();
    recordHeader.style.display = 'none';
    _allRows = [];
}

document.addEventListener('click', async e => {
    if (!e.target.closest('.js-volver-cursos')) return;
    _cursoId = null;
    await loadCursosCards();
});

function _wireResumenCursosMesNav(onChange = loadCursosCards) {
    const prev = document.getElementById('resumenCursosMesPrev');
    const next = document.getElementById('resumenCursosMesNext');
    if (prev) prev.onclick = () => { _resumenCursosMes = _mesPrev(_resumenCursosMes); onChange(); };
    if (next) next.onclick = () => {
        if (_resumenCursosMes >= _hoyMes()) return;
        _resumenCursosMes = _mesNext(_resumenCursosMes);
        onChange();
    };
}

function _wireResumenCursosRows() {
    tableContainer.querySelectorAll('[data-curso-id]').forEach(row => {
        row.addEventListener('click', () => {
            if (Number(row.dataset.total || 0) <= 0) {
                _mostrarAvisoSinDatos(row.dataset.cursoNombre || 'este curso');
                return;
            }
            seleccionarCurso(row.dataset.cursoId);
        });
    });
}

async function loadEstudiantesCards() {
    if (!_cursoId) return;
    if (!_resumenCursosMes) _resumenCursosMes = _hoyMes();
    const mes = _resumenCursosMes;
    const cursoNombre = _cursoNombre();
    _setRecordMode('cards');
    tableContainer.innerHTML = `
        <div class="rc-table-toolbar">
            <span class="resumen-cards-title resumen-cards-title--with-back">
                ${_renderBackToCursosButton()}
                Asistencia de ${cursoNombre}
            </span>
            <div class="rc-toolbar-actions">
                ${_renderResumenCursosMesNav(mes)}
                ${_renderDailyButton()}
            </div>
        </div>
        <div style="padding:8px 0;color:var(--text-muted);font-size:.85rem;">Cargando...</div>`;
    _wireResumenCursosMesNav(async () => {
        await loadMonthly();
        await loadEstudiantesCards();
    });

    const { ok, data } = await fetchAPI(`/api/attendance/cursos/${_cursoId}/resumen-estudiantes/?mes=${mes}`);
    const estudiantes = data?.estudiantes || [];
    const sinRegistrosMes = estudiantes.length && estudiantes.every(e => !Number(e.total || 0));
    if (!ok || !estudiantes.length || sinRegistrosMes) {
        const mesLabel = _periodoLabel(data?.mes || mes);
        if (typeof showAppToast === 'function') {
            showAppToast('info', 'Sin datos', `No hay datos de asistencia para ${cursoNombre} en ${mesLabel}.`);
        }
        _cursoId = null;
        await loadCursosCards();
        return;
    }
    tableContainer.innerHTML = `
        <div class="rc-table-toolbar">
            <span class="resumen-cards-title resumen-cards-title--with-back">
                ${_renderBackToCursosButton()}
                Asistencia de ${cursoNombre}
            </span>
            <div class="rc-toolbar-actions">
                ${_renderResumenCursosMesNav(data.mes || mes)}
                ${_renderDailyButton()}
            </div>
        </div>
        ${_tablaEstudiantesCursoHTML(estudiantes)}`;
    _wireResumenCursosMesNav(async () => {
        await loadMonthly();
        await loadEstudiantesCards();
    });
    recordHeader.style.display = 'none';
    _allRows = [];
}

// ── Consulta diaria en modal ──────────────────────────────────────
(function () {
    const pickerBackdrop = document.getElementById('dailyPickerBackdrop');
    const resultsBackdrop = document.getElementById('dailyResultsBackdrop');
    const cursoSelect = document.getElementById('dailyCurso');
    const fechaInput = document.getElementById('dailyFecha');
    const errorEl = document.getElementById('dailyError');
    const btnCancelar = document.getElementById('dailyCancelar');
    const btnAceptar = document.getElementById('dailyAceptar');
    const btnCerrarResults = document.getElementById('dailyResultsCerrar');
    const resultsTitle = document.getElementById('dailyResultsTitle');
    const resultsSub = document.getElementById('dailyResultsSub');
    const resultsBody = document.getElementById('dailyResultsBody');

    if (!pickerBackdrop || !resultsBackdrop) return;

    if (window.flatpickr && fechaInput) {
        flatpickr(fechaInput, {
            locale: flatpickr.l10ns.es,
            dateFormat: 'Y-m-d',
            maxDate: 'today',
            disableMobile: true,
        });
    }

    const cursoDropdown = document.createElement('div');
    cursoDropdown.className = 'daily-course-select';
    cursoSelect.classList.add('daily-native-select');
    cursoSelect.insertAdjacentElement('afterend', cursoDropdown);

    function cerrarCursosDropdown() {
        cursoDropdown.classList.remove('open');
        const btn = cursoDropdown.querySelector('.daily-course-select__button');
        if (btn) btn.setAttribute('aria-expanded', 'false');
    }

    function renderCursosDropdown() {
        const options = Array.from(cursoSelect.options);
        const selected = options.find(opt => opt.value === cursoSelect.value);
        const label = selected?.textContent || 'Seleccionar curso';
        const items = options.map(opt => {
            const active = opt.value === cursoSelect.value ? ' active' : '';
            return `
                <button type="button" class="daily-course-select__option${active}" data-value="${opt.value}">
                    ${opt.textContent}
                </button>`;
        }).join('');

        cursoDropdown.innerHTML = `
            <button type="button" class="daily-course-select__button" aria-expanded="false">
                <span>${label}</span>
                <span class="daily-course-select__chevron">⌄</span>
            </button>
            <div class="daily-course-select__list" role="listbox">
                ${items}
            </div>`;
    }

    function poblarCursos() {
        cursoSelect.innerHTML =
            '<option value="">— Seleccionar curso —</option>' +
            _cursosData.map(c => {
                const nombre = c.nombre || `${c.grado} ${c.paralelo}`;
                return `<option value="${c.id}">${nombre}</option>`;
            }).join('');
        if (_cursoId) cursoSelect.value = String(_cursoId);
        renderCursosDropdown();
    }

    function abrirPicker() {
        poblarCursos();
        errorEl.textContent = '';
        errorEl.style.display = 'none';
        btnAceptar.disabled = false;
        btnAceptar.textContent = 'Aceptar';
        pickerBackdrop.classList.add('visible');
    }

    function cerrarPicker() {
        cerrarCursosDropdown();
        pickerBackdrop.classList.remove('visible');
    }

    function cerrarResults() {
        resultsBackdrop.classList.remove('visible');
    }

    function renderResultados(data) {
        const asistencias = data.asistencias || [];
        const filas = asistencias.map(a => `
            <tr>
                <td class="daily-name">${(a.nombre_completo || '—').replace(', ', ' ')}</td>
                <td>${_estadoBadge(a.estado)}</td>
                <td class="${a.uniforme ? 'daily-uniform-ok' : 'daily-uniform-bad'}">${a.uniforme ? 'Sí' : 'No'}</td>
            </tr>
        `).join('');

        resultsTitle.textContent = data.curso_nombre || 'Asistencia diaria';
        resultsSub.textContent = _fechaDisplay(data.fecha);
        resultsBody.innerHTML = `
            <div class="daily-table-wrap">
                <table class="daily-table">
                    <thead>
                        <tr>
                            <th>Estudiante</th>
                            <th>Estado</th>
                            <th>Uniforme</th>
                        </tr>
                    </thead>
                    <tbody>${filas}</tbody>
                </table>
            </div>`;
    }

    async function aceptar() {
        const cursoId = cursoSelect.value;
        const fecha = fechaInput.value;
        errorEl.textContent = '';
        errorEl.style.display = 'none';

        if (!cursoId || !fecha) {
            errorEl.textContent = 'Selecciona un curso y un día.';
            errorEl.style.display = 'block';
            return;
        }

        btnAceptar.disabled = true;
        btnAceptar.textContent = 'Consultando...';
        const { ok, data } = await fetchAPI(
            `/api/attendance/cursos/${cursoId}/asistencia/?fecha=${fecha}`,
            { suppressToast: true }
        );
        btnAceptar.disabled = false;
        btnAceptar.textContent = 'Aceptar';

        if (!ok || !data) {
            errorEl.textContent = 'No hay registros del día y curso seleccionados.';
            errorEl.style.display = 'block';
            return;
        }

        cerrarPicker();
        renderResultados(data);
        resultsBackdrop.classList.add('visible');
    }

    document.addEventListener('click', e => {
        if (e.target.closest('.js-dia-especifico')) abrirPicker();
        if (!e.target.closest('.daily-course-select')) cerrarCursosDropdown();
    });
    cursoDropdown.addEventListener('click', e => {
        const toggle = e.target.closest('.daily-course-select__button');
        if (toggle) {
            const isOpen = cursoDropdown.classList.toggle('open');
            toggle.setAttribute('aria-expanded', isOpen ? 'true' : 'false');
            return;
        }

        const option = e.target.closest('.daily-course-select__option');
        if (!option) return;
        cursoSelect.value = option.dataset.value;
        cursoSelect.dispatchEvent(new Event('change', { bubbles: true }));
        renderCursosDropdown();
        cerrarCursosDropdown();
    });
    btnCancelar.addEventListener('click', cerrarPicker);
    btnAceptar.addEventListener('click', aceptar);
    btnCerrarResults.addEventListener('click', cerrarResults);
    pickerBackdrop.addEventListener('click', e => { if (e.target === pickerBackdrop) cerrarPicker(); });
    resultsBackdrop.addEventListener('click', e => { if (e.target === resultsBackdrop) cerrarResults(); });
})();

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
        exportCurso.innerHTML =
            '<option value="">— Seleccionar —</option>' +
            _cursosData.map(c => {
                const nombre = c.nombre || `${c.grado} ${c.paralelo}`;
                return `<option value="${c.id}">${nombre}</option>`;
            }).join('');
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

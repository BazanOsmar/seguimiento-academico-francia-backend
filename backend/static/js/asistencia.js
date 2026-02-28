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

// ── Referencias DOM ───────────────────────────────────────────────
const selectCurso    = document.getElementById('selectCurso');
const inputFecha     = document.getElementById('inputFecha');
const inputBuscar    = document.getElementById('inputBuscar');
const btnClear       = document.getElementById('btnClearSearch');
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

// Stats mensuales
const statPct    = document.getElementById('statPct');
const statBadge  = document.getElementById('statBadge');
const statSub    = document.getElementById('statSub');

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
    // Opción vacía inicial + opciones reales; sin auto-selección
    selectCurso.innerHTML =
        '<option value="">— Seleccionar —</option>' +
        data.map(c =>
            `<option value="${c.id}">${c.nombre || (c.grado + ' ' + c.paralelo)}</option>`
        ).join('');
}

// ── Reset de stats a estado inicial (guiones) ─────────────────────
function _resetStats() {
    statPct.textContent   = '—';
    statBadge.textContent = '—';
    statBadge.className   = 'stat-badge stat-badge--neutral';
    statSub.textContent   = 'Selecciona un curso';
    _resetResumenDia();
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
    const cursoNombre = selectCurso.options[selectCurso.selectedIndex]?.text || '';

    if (pct === null || pct === undefined) {
        statPct.textContent = '—';
        statBadge.textContent = '—';
        statBadge.className = 'stat-badge stat-badge--neutral';
    } else {
        statPct.textContent = `${pct}%`;
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
    }
    statSub.textContent = `Promedio de asistencia para ${cursoNombre} en ${data.mes_nombre}`;
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

    // Resumen del día (tarjeta derecha)
    _renderResumenDia(data.resumen);

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
        return `<tr data-nombre="${(a.nombre_completo || '').toLowerCase()}">
            <td class="col-name">${a.nombre_completo || '—'}</td>
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
    _applySearch(inputBuscar.value);
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

// ── Búsqueda en cliente ───────────────────────────────────────────
function _applySearch(query) {
    const q = query.trim().toLowerCase();
    btnClear.style.display = q ? 'block' : 'none';

    let visibles = 0;
    _allRows.forEach(tr => {
        const visible = !q || (tr.dataset.nombre || '').includes(q);
        tr.style.display = visible ? '' : 'none';
        if (visible) visibles++;
    });

    const existing = document.getElementById('_noResultsRow');
    if (existing) existing.remove();

    if (q && visibles === 0 && _allRows.length > 0) {
        const tbody = document.getElementById('tbodyAsistencia');
        if (tbody) {
            const tr = document.createElement('tr');
            tr.id = '_noResultsRow';
            tr.innerHTML = `<td colspan="4" style="text-align:center;padding:28px;color:var(--text-muted)">
                Sin resultados para "<strong>${query.trim()}</strong>"</td>`;
            tbody.appendChild(tr);
        }
    }
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
        const dateStr  = `${year}-${String(month).padStart(2,'0')}-${String(d).padStart(2,'0')}`;
        const sesiones = diaMap[dateStr];           // undefined si no hay sesiones
        const isToday  = dateStr === hoyISO;
        const isFuture = dateStr > hoyISO;

        // Calcular estado en cliente (evita campo redundante en backend)
        let dotHtml = '';
        let title   = 'Sin registro';
        if (sesiones !== undefined) {
            title = `${sesiones} de ${total} curso${total !== 1 ? 's' : ''} registrado${total !== 1 ? 's' : ''}`;
            if (sesiones >= total) {
                dotHtml = '<span class="cal-dot cal-dot--completo"></span>';
            } else {
                dotHtml = '<span class="cal-dot cal-dot--parcial"></span>';
            }
        }

        const classes = [
            'cal-cell',
            isToday  ? 'cal-cell--today'  : '',
            isFuture ? 'cal-cell--future' : '',
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

// Click fuera de la tarjeta → cerrar
document.addEventListener('click', (e) => {
    if (!_calendarioAbierto) return;
    if (calendarioCard.contains(e.target) || btnCalendario.contains(e.target)) return;
    _closeCalendario();
});

selectCurso.addEventListener('change', async () => {
    _cursoId = selectCurso.value ? Number(selectCurso.value) : null;
    // Mensual carga solo con el curso
    await loadMonthly();
    // Diario solo si también hay fecha
    if (_fecha) await loadDaily();
});

inputFecha.addEventListener('change', async () => {
    _fecha = inputFecha.value || null;
    // Al cambiar fecha actualizamos mensual (puede cambiar el mes) y diario
    if (_cursoId) {
        await loadMonthly();
        await loadDaily();
    }
});

inputBuscar.addEventListener('input', () => _applySearch(inputBuscar.value));

btnClear.addEventListener('click', () => {
    inputBuscar.value = '';
    _applySearch('');
});

btnReset.addEventListener('click', () => {
    if (_calendarioAbierto) _closeCalendario();
    // Limpiar inputs
    selectCurso.value = '';
    inputFecha._flatpickr ? inputFecha._flatpickr.clear() : (inputFecha.value = '');
    inputBuscar.value = '';
    _cursoId = null;
    _fecha   = null;
    _allRows = [];
    btnClear.style.display = 'none';

    // Volver stats a guiones
    _resetStats();

    // Volver tabla al estado inicial
    recordHeader.style.display = 'none';
    tableContainer.innerHTML = `
        <div class="empty-state">
            <svg width="44" height="44" viewBox="0 0 24 24" fill="none" stroke="currentColor"
                 stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round">
                <rect x="3" y="4" width="18" height="18" rx="2"/>
                <line x1="16" y1="2" x2="16" y2="6"/>
                <line x1="8"  y1="2" x2="8"  y2="6"/>
                <line x1="3"  y1="10" x2="21" y2="10"/>
            </svg>
            <div class="empty-state__title">Selecciona un curso y fecha</div>
            <div class="empty-state__sub">Se mostrará el registro de asistencia del día</div>
        </div>`;
});

// ── Exportar PDF ──────────────────────────────────────────────────
(function () {
    const btnExportar  = document.getElementById('btnExportar');
    const backdrop     = document.getElementById('exportBackdrop');
    const exportCurso  = document.getElementById('exportCurso');
    const exportDesde  = document.getElementById('exportFechaDesde');
    const exportHasta  = document.getElementById('exportFechaHasta');
    const btnCancelar  = document.getElementById('exportCancelar');
    const btnGenerar   = document.getElementById('exportGenerar');
    const errEl        = document.getElementById('exportError');

    function openExport() {
        // Clonar opciones del selector de cursos principal
        exportCurso.innerHTML = selectCurso.innerHTML;
        if (_cursoId) exportCurso.value = String(_cursoId);

        // Pre-llenar fechas con el filtro activo
        exportDesde.value = _fecha || '';
        exportHasta.value = _fecha || '';

        errEl.style.display = 'none';
        backdrop.classList.add('visible');
        exportDesde.focus();
    }

    function closeExport() {
        backdrop.classList.remove('visible');
    }

    async function generarPDF() {
        const cursoId = exportCurso.value;
        const desde   = exportDesde.value;
        const hasta   = exportHasta.value;

        errEl.style.display = 'none';

        if (!cursoId) {
            errEl.textContent = 'Selecciona un curso.';
            errEl.style.display = 'block';
            return;
        }
        if (!desde) {
            errEl.textContent = 'Indica al menos la fecha de inicio.';
            errEl.style.display = 'block';
            return;
        }
        if (hasta && hasta < desde) {
            errEl.textContent = 'La fecha hasta no puede ser anterior a la fecha desde.';
            errEl.style.display = 'block';
            return;
        }

        const params = new URLSearchParams({ curso_id: cursoId, fecha_desde: desde });
        if (hasta && hasta !== desde) params.set('fecha_hasta', hasta);

        // Pre-verificar que existan registros antes de abrir la pestaña
        btnGenerar.disabled = true;
        btnGenerar.textContent = 'Verificando...';

        const checkParams = new URLSearchParams(params);
        checkParams.set('check', '1');

        const { ok, data } = await fetchAPI(`/director/asistencia/exportar/?${checkParams}`);

        btnGenerar.disabled = false;
        btnGenerar.textContent = 'Generar PDF';

        if (!ok || !data?.tiene_datos) {
            errEl.textContent = 'No hay registros de asistencia para el período seleccionado.';
            errEl.style.display = 'block';
            return;
        }

        window.open(`/director/asistencia/exportar/?${params}`, '_blank');
        closeExport();
    }

    btnExportar.addEventListener('click', openExport);
    btnCancelar.addEventListener('click', closeExport);
    backdrop.addEventListener('click', e => { if (e.target === backdrop) closeExport(); });
    btnGenerar.addEventListener('click', () => generarPDF());
})();

// ── Inicialización ────────────────────────────────────────────────
(async function init() {
    // Mostrar guiones en stats desde el inicio
    _resetStats();
    // Cargar lista de cursos (sin auto-selección)
    await loadCursos();
})();
